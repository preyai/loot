import { useEffect, useState } from 'react'
import { api, useAccount, type CatalogEntry, type CatalogSort, type FilterStats } from '../account'
import { useI18n } from '../i18n-react'

/** Звёзды оценки: показ средней или выбор своей (onRate). */
export function Stars({ value, onRate, label }: { value: number | null; onRate?: (value: number) => void; label: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0
  return (
    <span className={onRate ? 'stars stars--input' : 'stars'} role={onRate ? 'radiogroup' : 'img'} aria-label={label} onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) =>
        onRate ? (
          <button key={n} type="button" className={n <= shown ? 'star on' : 'star'} aria-label={String(n)} onMouseEnter={() => setHover(n)} onClick={() => onRate(n)}>
            ★
          </button>
        ) : (
          <span key={n} className={n <= Math.round(shown) ? 'star on' : 'star'}>
            ★
          </span>
        ),
      )}
    </span>
  )
}

/** Оценка, подписчики и копии одной строкой. */
export function StatsLine({ stats }: { stats: FilterStats }) {
  const { t } = useI18n()
  return (
    <span className="filter-stats">
      <Stars value={stats.rating} label={stats.rating === null ? t('catalog.noRatings') : stats.rating.toFixed(1)} />
      <span className="count">
        {stats.rating === null ? t('catalog.noRatings') : t('catalog.rating', { rating: stats.rating.toFixed(1), n: stats.ratings })}
        {' · '}
        {t('catalog.subscribers', { n: stats.subscribers })}
        {' · '}
        {t('catalog.copies', { n: stats.copies })}
      </span>
    </span>
  )
}

/** Карточка опубликованного фильтра: в каталоге и в подписках. */
export function FilterCard({ entry, onChanged, children }: { entry: CatalogEntry; onChanged: () => void; children?: React.ReactNode }) {
  const { t, locale } = useI18n()
  const { me } = useAccount()
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const code = entry.shareCode!
  const act = async (action: () => Promise<unknown>, message?: string) => {
    setError(null)
    try {
      await action()
      if (message) setDone(message)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <li className="catalog-card">
      <div className="catalog-head">
        <a className="catalog-name" href={`#/shared/${code}`}>
          {entry.name}
        </a>
        <span className="count">{t('catalog.by', { owner: entry.owner, time: new Date(entry.updatedAt).toLocaleDateString(locale) })}</span>
      </div>
      {entry.description && <p className="catalog-description">{entry.description}</p>}
      {entry.stats && <StatsLine stats={entry.stats} />}
      <div className="actions">
        {children}
        {me && !entry.own && (
          <>
            {entry.subscribed ? (
              <button onClick={() => act(() => api.unsubscribe(code))}>{t('shared.unsubscribe')}</button>
            ) : (
              entry.isPublic && (
                <button className="primary" onClick={() => act(() => api.subscribe(code))}>
                  {t('shared.subscribe')}
                </button>
              )
            )}
            <button onClick={() => act(() => api.copy(code), t('shared.saved', { name: entry.name }))}>{t('shared.save')}</button>
          </>
        )}
        <a className="button" href={`#/shared/${code}`}>
          {t('catalog.details')}
        </a>
      </div>
      {done && <p className="note note--ok">{done}</p>}
      {error && <p className="note note--error">{t('account.error', { error })}</p>}
    </li>
  )
}

const SORTS: CatalogSort[] = ['popular', 'rating', 'new']

/** «Фильтры сообщества»: опубликованные фильтры с сортировкой по популярности, оценке и новизне. */
export function CatalogView() {
  const { t } = useI18n()
  const { me } = useAccount()
  const [sort, setSort] = useState<CatalogSort>('popular')
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let stale = false
    // Поиск — с небольшой задержкой, чтобы не спрашивать сервер на каждую букву.
    const timer = setTimeout(() => {
      api.catalog(sort, query).then(
        (list) => !stale && setEntries(list),
        (e: Error) => !stale && setError(e.message),
      )
    }, 250)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [sort, query, version, me])

  return (
    <div>
      <header className="page-header">
        <h1>{t('nav.catalog')}</h1>
        <input className="search" type="search" placeholder={t('catalog.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </header>
      <p className="note">
        {t('catalog.intro')} {!me && <a href="#/filters">{t('shared.signInToSave')}</a>}
      </p>
      <div className="base-tabs catalog-tabs" role="tablist">
        {SORTS.map((id) => (
          <button key={id} role="tab" aria-selected={sort === id} className={sort === id ? 'active' : undefined} onClick={() => setSort(id)}>
            {t(`catalog.sort.${id}`)}
          </button>
        ))}
      </div>
      {error && <p className="note note--error">{t('account.error', { error })}</p>}
      {entries?.length === 0 && <p className="note">{query ? t('catalog.notFound') : t('catalog.empty')}</p>}
      <ul className="catalog">
        {entries?.map((entry) => (
          <FilterCard key={entry.id} entry={entry} onChanged={() => setVersion((v) => v + 1)} />
        ))}
      </ul>
    </div>
  )
}
