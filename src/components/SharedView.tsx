import { useEffect, useState } from 'react'
import { api, applySaved, setActive, useAccount, type SharedFilter } from '../account'
import { useI18n } from '../i18n-react'
import type { UpdateConfig } from '../store'
import type { Config } from '../types'

interface Props {
  code: string
  config: Config
  update: UpdateConfig
}

/** Фильтр по ссылке «поделиться»: посмотреть, открыть в редакторе, сохранить себе. */
export function SharedView({ code, config, update }: Props) {
  const { t, locale } = useI18n()
  const { me } = useAccount()
  const [shared, setShared] = useState<SharedFilter | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    setShared(null)
    setError(null)
    api.shared(code).then(setShared, () => setError(t('shared.notFound')))
  }, [code, t])

  if (error) return <p className="note note--error">{error}</p>
  if (!shared) return <p className="note">{t('account.loading')}</p>

  return (
    <div>
      <header className="page-header">
        <h1>{t('shared.title')}</h1>
      </header>
      <section className="panel">
        <h2>{shared.name}</h2>
        <p className="note">{t('shared.by', { owner: shared.owner, time: new Date(shared.updatedAt).toLocaleString(locale) })}</p>
        <p className="note">{t('shared.note')}</p>
        <div className="actions">
          <button
            className="primary"
            onClick={() => {
              if (!confirm(t('shared.openConfirm', { name: shared.name }))) return
              update((current) => applySaved(current, shared.config))
              // Открытая копия чужого фильтра не связана с сохранёнными: «Сохранить» её не перезапишет.
              setActive(null)
              location.hash = '#/currency'
            }}
          >
            {t('shared.open')}
          </button>
          <button
            disabled={!me}
            title={me ? undefined : t('shared.signInToSave')}
            onClick={async () => {
              try {
                const copy = applySaved(config, shared.config)
                const saved = await api.create(shared.name, copy)
                setDone(t('shared.saved', { name: saved.name }))
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            {t('shared.save')}
          </button>
          {!me && <a href="#/filters">{t('shared.signInToSave')}</a>}
        </div>
        {done && <p className="note note--ok">{done}</p>}
      </section>
    </div>
  )
}
