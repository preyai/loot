import { useEffect, useState } from 'react'
import { api, applySaved, setActive, useAccount, type SharedFilter } from '../account'
import { useI18n } from '../i18n-react'
import type { UpdateConfig } from '../store'
import { Stars, StatsLine } from './CatalogView'

interface Props {
  code: string
  update: UpdateConfig
}

/** Фильтр по ссылке «поделиться»: посмотреть, открыть в редакторе, скопировать себе, оценить и подписаться. */
export function SharedView({ code, update }: Props) {
  const { t, locale } = useI18n()
  const { me } = useAccount()
  const [shared, setShared] = useState<SharedFilter | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    setNotFound(false)
    api.shared(code).then(setShared, () => setNotFound(true))
    // me: после входа появляются оценка и подписка зрителя.
  }, [code, version, me])

  const act = async (action: () => Promise<unknown>, message?: string) => {
    setError(null)
    try {
      await action()
      if (message) setDone(message)
      setVersion((v) => v + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (notFound) return <p className="note note--error">{t('shared.notFound')}</p>
  if (!shared || shared.shareCode !== code) return <p className="note">{t('account.loading')}</p>
  const canInteract = me && !shared.own

  return (
    <div>
      <header className="page-header">
        <h1>{t('shared.title')}</h1>
        {shared.isPublic && <a href="#/catalog">← {t('nav.catalog')}</a>}
      </header>
      <section className="panel">
        <h2>{shared.name}</h2>
        <p className="note">{t('shared.by', { owner: shared.owner, time: new Date(shared.updatedAt).toLocaleString(locale) })}</p>
        {shared.description && <p className="catalog-description">{shared.description}</p>}
        {shared.isPublic && shared.stats && <StatsLine stats={shared.stats} />}
        {shared.isPublic && canInteract && (
          <p className="my-rating">
            {t('shared.rate')}{' '}
            <Stars value={shared.myRating ?? null} label={t('shared.rate')} onRate={(value) => act(() => api.rate(code, value))} />
          </p>
        )}
        {shared.own && <p className="note">{t('shared.own')}</p>}
        <p className="note">{t('shared.note')}</p>
        {confirming && (
          <div className="actions confirm-row">
            <span>{t('shared.openConfirm', { name: shared.name })}</span>
            <button
              className="primary"
              onClick={() => {
                update((current) => applySaved(current, shared.config))
                // Открытая копия чужого фильтра не связана с сохранёнными: «Сохранить» её не перезапишет.
                setActive(null)
                location.hash = '#/start'
              }}
            >
              {t('filters.yes')}
            </button>
            <button onClick={() => setConfirming(false)}>{t('filters.cancel')}</button>
          </div>
        )}
        <div className="actions">
          <button className="primary" disabled={confirming} onClick={() => setConfirming(true)}>
            {t('shared.open')}
          </button>
          {canInteract && shared.isPublic && (
            shared.subscribed ? (
              <button onClick={() => act(() => api.unsubscribe(code))}>{t('shared.unsubscribe')}</button>
            ) : (
              <button onClick={() => act(() => api.subscribe(code), t('shared.subscribedNote'))}>{t('shared.subscribe')}</button>
            )
          )}
          {canInteract && <button onClick={() => act(() => api.copy(code), t('shared.saved', { name: shared.name }))}>{t('shared.save')}</button>}
          {!me && <a href="#/filters">{t('shared.signInToSave')}</a>}
        </div>
        {done && <p className="note note--ok">{done}</p>}
        {error && <p className="note note--error">{t('account.error', { error })}</p>}
      </section>
    </div>
  )
}
