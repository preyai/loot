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
              {active && (
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
              <button
                onClick={() => {
                  const name = prompt(t('filters.namePrompt'), active?.name ?? config.filterName)
                  if (name?.trim()) {
                    void run(async () => {
                      const saved = await api.create(name.trim(), config)
                      setActive({ id: saved.id, name: saved.name, saved: snapshotOf(config) })
                    })
                  }
                }}
              >
                {t('filters.saveAs')}
              </button>
            </div>
          </section>

          <section className="panel">
            <h2>{t('filters.list')}</h2>
            {error && <p className="note note--error">{t('account.error', { error })}</p>}
            {filters?.length === 0 && <p className="note">{t('filters.empty')}</p>}
            <ul className="saved-filters">
              {filters?.map((filter) => (
                <li key={filter.id} className={active?.id === filter.id ? 'active' : undefined}>
                  <div className="saved-filter-head">
                    <strong>{filter.name}</strong>
                    {active?.id === filter.id && <span className="badge">{t('filters.active')}</span>}
                    <span className="count">{t('filters.updated', { time: when(filter.updatedAt) })}</span>
                  </div>
                  <div className="actions">
                    <button
                      onClick={() => {
                        if (active && dirty && !confirm(t('filters.openConfirm', { name: filter.name }))) return
                        void run(async () => {
                          const saved = await api.get(filter.id)
                          const next = applySaved(config, saved.config)
                          update(() => next)
                          setActive({ id: saved.id, name: saved.name, saved: snapshotOf(next) })
                        })
                      }}
                    >
                      {t('filters.open')}
                    </button>
                    <button
                      onClick={() => {
                        const name = prompt(t('filters.namePrompt'), filter.name)
                        if (name?.trim() && name.trim() !== filter.name) {
                          void run(async () => {
                            const saved = await api.update(filter.id, { name: name.trim() })
                            if (active?.id === saved.id) setActive({ ...active, name: saved.name })
                          })
                        }
                      }}
                    >
                      {t('filters.rename')}
                    </button>
                    {filter.shareCode ? (
                      <button onClick={() => run(() => api.unshare(filter.id))}>{t('filters.unshare')}</button>
                    ) : (
                      <button onClick={() => run(() => api.share(filter.id))}>{t('filters.share')}</button>
                    )}
                    <button
                      className="danger"
                      onClick={() =>
                        confirm(t('filters.deleteConfirm', { name: filter.name })) &&
                        run(async () => {
                          await api.remove(filter.id)
                          if (active?.id === filter.id) setActive(null)
                        })
                      }
                    >
                      {t('filters.delete')}
                    </button>
                  </div>
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
