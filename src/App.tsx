import { Fragment, useEffect, useMemo, useState } from 'react'
import { BasesView } from './components/BasesView'
import { downloadFilter, ExportView } from './components/ExportView'
import { SectionView } from './components/SectionView'
import { StylesView } from './components/StylesView'
import { CURRENCIES } from './defaults'
import { generateFilter } from './filter'
import { SECTIONS } from './sections'
import { useConfig, useMarket } from './store'
import { convertCurrency, perDivine } from './tiering'
import type { Currency } from './types'

const PAGES = ['bases', 'styles', 'export'] as const
type Route = (typeof SECTIONS)[number]['id'] | (typeof PAGES)[number]

function readRoute(): Route {
  const id = location.hash.replace(/^#\/?/, '')
  const known = SECTIONS.some((s) => s.id === id) || (PAGES as readonly string[]).includes(id)
  return known ? (id as Route) : SECTIONS[0].id
}

function useRoute(): Route {
  const [route, setRoute] = useState(readRoute)
  useEffect(() => {
    const onChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function App() {
  const [config, update] = useConfig()
  const market = useMarket(config.league, (league) => update((c) => ({ ...c, league })))
  const route = useRoute()
  const { snapshot } = market

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of snapshot?.items ?? []) map.set(item.section, (map.get(item.section) ?? 0) + 1)
    return map
  }, [snapshot])

  const section = SECTIONS.find((s) => s.id === route)

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          {/* Знак: гранёный камень в ромбовидной оправе. */}
          <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
            <path d="M17 1.5 32.5 17 17 32.5 1.5 17Z" fill="#1a130b" stroke="#c9a45c" strokeWidth="1.2" />
            <path d="M17 7 27 17 17 27 7 17Z" fill="#7a1e16" stroke="#f1d892" strokeWidth="0.8" />
            <path d="M17 7 21 17 17 27 13 17Z" fill="#c2392b" opacity="0.85" />
            <path d="M7 17h20" stroke="#f1d892" strokeWidth="0.6" opacity="0.7" />
          </svg>
          <div>
            <div className="brand-title">Лутфильтр</div>
            <div className="brand-sub">Path of Exile 2</div>
          </div>
        </div>
        <nav>
          {SECTIONS.map((s, i) => (
            <Fragment key={s.id}>
              {i === 0 && <div className="nav-group">Рынок</div>}
              {s.unique && !SECTIONS[i - 1]?.unique && <div className="nav-group">Уникальные</div>}
              <a
                href={`#/${s.id}`}
                className={[route === s.id && 'active', config.disabledSections.includes(s.id) && 'off']
                  .filter(Boolean)
                  .join(' ')}
              >
                {s.short ?? s.title}
                <span className="count">{counts.get(s.id) ?? '—'}</span>
              </a>
            </Fragment>
          ))}
          <div className="nav-group">Экипировка</div>
          <a href="#/bases" className={route === 'bases' ? 'active' : ''}>
            Правила баз
            <span className="count">{config.baseRules.filter((r) => r.enabled).length}</span>
          </a>
          <div className="nav-group">Фильтр</div>
          <a href="#/styles" className={route === 'styles' ? 'active' : ''}>
            Тиры и стили
          </a>
          <a href="#/export" className={route === 'export' ? 'active' : ''}>
            Экспорт
          </a>
        </nav>
      </aside>

      <div className="content">
        <div className="topbar">
          <label>
            Лига
            <select
              value={config.league ?? ''}
              disabled={market.leagues.length === 0}
              onChange={(e) => update((c) => ({ ...c, league: e.target.value }))}
            >
              {/* Сохранённая лига могла закончиться и пропасть из списка. */}
              {config.league && !market.leagues.some((l) => l.name === config.league) && <option>{config.league}</option>}
              {market.leagues.map((l) => (
                <option key={l.name}>{l.name}</option>
              ))}
            </select>
          </label>
          <label>
            Валюта
            <select
              value={config.currency}
              disabled={!snapshot}
              title="Пороги и минимальные цены пересчитаются по текущему курсу"
              onChange={(e) => snapshot && update((c) => convertCurrency(c, e.target.value as Currency, snapshot.rates))}
            >
              {(Object.keys(CURRENCIES) as Currency[]).map((id) => (
                // Без курса пересчитать пороги в эту валюту нельзя.
                <option key={id} value={id} disabled={!snapshot || !(perDivine(id, snapshot.rates) > 0)}>
                  {CURRENCIES[id].title}
                </option>
              ))}
            </select>
          </label>
          <span className="status">
            {market.loading
              ? 'Загрузка цен…'
              : snapshot && `Цены poe.ninja от ${new Date(snapshot.fetchedAt).toLocaleString('ru-RU')}`}
          </span>
          <button className="primary" disabled={!snapshot} onClick={() => snapshot && downloadFilter(generateFilter(snapshot, config))}>
            Скачать .filter
          </button>
        </div>

        <main>
          {market.error && (
            <p className="note note--error">
              Не удалось загрузить данные: {market.error}{' '}
              <button onClick={market.retry}>Повторить</button>
            </p>
          )}
          {!snapshot && market.loading && <p className="note">Загрузка цен…</p>}
          {route === 'bases' && <BasesView config={config} update={update} rates={snapshot?.rates ?? null} />}
          {route === 'styles' && (
            <StylesView config={config} update={update} rates={snapshot?.rates ?? null} />
          )}
          {snapshot && route === 'export' && <ExportView snapshot={snapshot} config={config} />}
          {snapshot && section && <SectionView key={section.id} section={section} snapshot={snapshot} config={config} update={update} />}
        </main>
      </div>
    </div>
  )
}
