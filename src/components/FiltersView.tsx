import { useEffect, useState } from 'react'
import { api, ApiError, applySaved, setActive, shareUrl, snapshotOf, useAccount, useActiveFilter, type FilterSummary } from '../account'
import { useI18n } from '../i18n-react'
import type { UpdateConfig } from '../store'
import type { Config } from '../types'

interface Props {
  config: Config
  update: UpdateConfig
}

/** Вход и регистрация. */
function SignIn() {
  const { t } = useI18n()
  const { login, register } = useAccount()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await (mode === 'login' ? login(name, password) : register(name, password))
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0
      setError(
        status === 401
          ? t('account.wrong')
          : status === 409
            ? t('account.taken')
            : status === 429
              ? t('account.tooMany')
              : t('account.error', { error: err instanceof Error ? err.message : String(err) }),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel account-form">
      <h2>{mode === 'login' ? t('account.signIn') : t('account.register')}</h2>
      <p className="note">{t('account.intro')}</p>
      <form onSubmit={submit}>
        <label className="check">
          {t('account.login')}
          <input value={name} autoComplete="username" onChange={(e) => setName(e.target.value)} />
        </label>
        {mode === 'register' && <p className="note">{t('account.loginHint')}</p>}
        <label className="check">
          {t('account.password')}
          <input
            type="password"
            value={password}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {mode === 'register' && <p className="note">{t('account.passwordHint')}</p>}
        {error && <p className="note note--error">{error}</p>}
        <div className="actions">
          <button className="primary" type="submit" disabled={busy || !name || !password}>
            {mode === 'login' ? t('account.signIn') : t('account.register')}
          </button>
          <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? t('account.noAccount') : t('account.haveAccount')}
          </button>
        </div>
      </form>
    </section>
  )
}

export function FiltersView({ config, update }: Props) {
  const { t, locale } = useI18n()
  const { me, logout } = useAccount()
  const { active, dirty } = useActiveFilter(config)
  const [filters, setFilters] = useState<FilterSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  // Окна prompt/confirm во встроенных браузерах (например, в VS Code) не работают — всё спрашиваем на странице.
  const [newName, setNewName] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [confirming, setConfirming] = useState<{ id: string; action: 'open' | 'delete' } | null>(null)

  const refresh = () => api.list().then(setFilters, (e: Error) => setError(e.message))
  useEffect(() => {
    if (me) void refresh()
  }, [me])

  // Любое действие с сервером: ошибка — в строку над списком, а не молча.
  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const when = (iso: string) => new Date(iso).toLocaleString(locale)

  const open = (id: string) =>
    run(async () => {
      setConfirming(null)
      const saved = await api.get(id)
      const next = applySaved(config, saved.config)
      update(() => next)
      setActive({ id: saved.id, name: saved.name, saved: snapshotOf(next) })
    })

  const remove = (id: string) =>
    run(async () => {
      setConfirming(null)
      await api.remove(id)
      if (active?.id === id) setActive(null)
    })

  const saveAs = (name: string) =>
    run(async () => {
      const saved = await api.create(name, config)
      setActive({ id: saved.id, name: saved.name, saved: snapshotOf(config) })
      setNewName(null)
    })

  const rename = (id: string, name: string) =>
    run(async () => {
      const saved = await api.update(id, { name })
      if (active?.id === saved.id) setActive({ ...active, name: saved.name })
      setRenaming(null)
    })

  if (me === undefined) return <p className="note">{t('account.loading')}</p>

  return (
    <div>
      <header className="page-header">
        <h1>{t('nav.filters')}</h1>
        {me && (
          <div className="actions">
            <span>{t('account.signedAs', { login: me.login })}</span>
            <button onClick={() => void logout()}>{t('account.signOut')}</button>
          </div>
        )}
      </header>

      {!me ? (
        <SignIn />
      ) : (
        <>
          <section className="panel">
            <h2>{t('filters.current')}</h2>
            <p>
              {active ? <strong>{active.name}</strong> : <span className="count">{t('filters.unsaved')}</span>}
              {active && dirty && <span className="count"> · {t('filters.changed')}</span>}
            </p>
            <div className="actions">
              {active && newName === null && (
                <button
                  className="primary"
                  disabled={!dirty}
                  onClick={() =>
                    run(async () => {
                      const saved = await api.update(active.id, { config })
                      setActive({ id: saved.id, name: saved.name, saved: snapshotOf(config) })
                    })
                  }
                >
                  {t('filters.save')}
                </button>
              )}
              {newName === null && (
                <button className={active ? undefined : 'primary'} onClick={() => setNewName(active?.name ?? config.filterName)}>
                  {t('filters.saveAs')}
                </button>
              )}
            </div>
            {newName !== null && (
              <form
                className="name-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (newName.trim()) void saveAs(newName.trim())
                }}
              >
                <label className="check">
                  {t('filters.namePrompt')}
                  <input autoFocus value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} />
                </label>
                <button className="primary" type="submit" disabled={!newName.trim()}>
                  {t('filters.save')}
                </button>
                <button type="button" onClick={() => setNewName(null)}>
                  {t('filters.cancel')}
                </button>
              </form>
            )}
            {error && <p className="note note--error">{t('account.error', { error })}</p>}
          </section>

          <section className="panel">
            <h2>{t('filters.list')}</h2>
            {filters?.length === 0 && <p className="note">{t('filters.empty')}</p>}
            <ul className="saved-filters">
              {filters?.map((filter) => (
                <li key={filter.id} className={active?.id === filter.id ? 'active' : undefined}>
                  <div className="saved-filter-head">
                    {renaming?.id === filter.id ? (
                      <form
                        className="name-form"
                        onSubmit={(e) => {
                          e.preventDefault()
                          const name = renaming.name.trim()
                          if (!name || name === filter.name) setRenaming(null)
                          else void rename(filter.id, name)
                        }}
                      >
                        <input
                          autoFocus
                          value={renaming.name}
                          maxLength={60}
                          onChange={(e) => setRenaming({ id: filter.id, name: e.target.value })}
                        />
                        <button className="primary" type="submit">
                          {t('filters.save')}
                        </button>
                        <button type="button" onClick={() => setRenaming(null)}>
                          {t('filters.cancel')}
                        </button>
                      </form>
                    ) : (
                      <strong>{filter.name}</strong>
                    )}
                    {active?.id === filter.id && <span className="badge">{t('filters.active')}</span>}
                    <span className="count">{t('filters.updated', { time: when(filter.updatedAt) })}</span>
                  </div>
                  {confirming?.id === filter.id ? (
                    <div className="actions confirm-row">
                      <span>
                        {confirming.action === 'open'
                          ? t('filters.openConfirm', { name: filter.name })
                          : t('filters.deleteConfirm', { name: filter.name })}
                      </span>
                      <button
                        className={confirming.action === 'delete' ? 'danger' : 'primary'}
                        onClick={() => (confirming.action === 'open' ? open(filter.id) : remove(filter.id))}
                      >
                        {t('filters.yes')}
                      </button>
                      <button onClick={() => setConfirming(null)}>{t('filters.cancel')}</button>
                    </div>
                  ) : (
                    <div className="actions">
                      <button
                        onClick={() =>
                          // Несохранённые изменения пропадут — сначала спросить.
                          active && dirty ? setConfirming({ id: filter.id, action: 'open' }) : void open(filter.id)
                        }
                      >
                        {t('filters.open')}
                      </button>
                      <button onClick={() => setRenaming({ id: filter.id, name: filter.name })}>{t('filters.rename')}</button>
                      {filter.shareCode ? (
                        <button onClick={() => run(() => api.unshare(filter.id))}>{t('filters.unshare')}</button>
                      ) : (
                        <button onClick={() => run(() => api.share(filter.id))}>{t('filters.share')}</button>
                      )}
                      <button className="danger" onClick={() => setConfirming({ id: filter.id, action: 'delete' })}>
                        {t('filters.delete')}
                      </button>
                    </div>
                  )}
                  {filter.shareCode && (
                    <div className="share-link">
                      <span className="count">{t('filters.link')}</span>
                      <input readOnly value={shareUrl(filter.shareCode)} onFocus={(e) => e.currentTarget.select()} />
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(shareUrl(filter.shareCode!))
                          setCopied(filter.id)
                          setTimeout(() => setCopied(null), 2000)
                        }}
                      >
                        {copied === filter.id ? t('export.copied') : t('export.copy')}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
