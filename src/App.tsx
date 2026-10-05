import { Fragment, useEffect, useMemo, useState } from 'react'
import { useAccount, useActiveFilter } from './account'
import { BasesView } from './components/BasesView'
import { CatalogView } from './components/CatalogView'
import { ExtrasView } from './components/ExtrasView'
import { FiltersView } from './components/FiltersView'
import { GoldView } from './components/GoldView'
import { PreviewView } from './components/PreviewView'
import { downloadFilter, ExportView } from './components/ExportView'
import { SectionView } from './components/SectionView'
import { SharedView } from './components/SharedView'
import { StartView } from './components/StartView'
import { StylesView } from './components/StylesView'
import { WaystonesView } from './components/WaystonesView'
import { CURRENCIES } from './defaults'
import { generateFilter } from './filter'
import { useFocus, useFocusScroll } from './focus'
import { useGameFolder } from './gameFolder'
import { keyOf, LANGUAGE_TITLES, LANGUAGES, translateOr, type Lang } from './i18n'
import { I18nProvider, useI18n } from './i18n-react'
import { SECTIONS } from './sections'
import { useConfig, useMarket, type UpdateConfig } from './store'
import { convertCurrency, perDivine } from './tiering'
import type { Config, Currency } from './types'

const PAGES = ['start', 'filters', 'catalog', 'waystones', 'gold', 'extras', 'bases', 'preview', 'styles', 'export'] as const
type Route = (typeof SECTIONS)[number]['id'] | (typeof PAGES)[number] | 'shared'

/** Код из ссылки «поделиться»: #/shared/<код>. */
const sharedCode = () => /^#\/?shared\/([^?/]+)/.exec(location.hash)?.[1] ?? null

function readRoute(): Route {
  if (sharedCode()) return 'shared'
  // После «?» — переход к строке страницы (focus.ts), к маршруту он не относится.
  const id = location.hash.replace(/^#\/?/, '').split('?')[0]
  // Без адреса — стартовая страница: новичку сначала три шага, а не раздел рынка.
  if (!id) return 'start'
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
  return (
    <I18nProvider lang={config.language}>
      <Shell config={config} update={update} />
    </I18nProvider>
  )
}

function Shell({ config, update }: { config: Config; update: UpdateConfig }) {
  const { t, locale, name } = useI18n()
  const market = useMarket(config.league, (league) => update((c) => ({ ...c, league })))
  const route = useRoute()
  const gameFolder = useGameFolder()
  const { me } = useAccount()
  const { active, dirty } = useActiveFilter(config)
  useFocusScroll(useFocus(), route)
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
            <div className="brand-title">{t('app.brand')}</div>
            <div className="brand-sub">Path of Exile 2</div>
          </div>
        </div>
        <nav>
          <a href="#/start" className={route === 'start' ? 'active nav-start' : 'nav-start'}>
            {t('nav.start')}
          </a>
          {SECTIONS.map((s, i) => (
            <Fragment key={s.id}>
              {i === 0 && <div className="nav-group">{t('nav.market')}</div>}
              {s.unique && !SECTIONS[i - 1]?.unique && <div className="nav-group">{t('nav.uniques')}</div>}
              <a
                href={`#/${s.id}`}
                className={[route === s.id && 'active', config.disabledSections.includes(s.id) && 'off']
                  .filter(Boolean)
                  .join(' ')}
              >
                {/* Под заголовком своей группы раздел называется коротко: «Оружие», а не «Уники: оружие». */}
                {translateOr(t, 'sectionShort', s.id, t(keyOf('section', s.id)))}
                <span className="count">{counts.get(s.id) ?? '—'}</span>
              </a>
            </Fragment>
          ))}
          <div className="nav-group">{t('nav.other')}</div>
          <a href="#/waystones" className={[route === 'waystones' && 'active', !config.waystones.enabled && 'off'].filter(Boolean).join(' ')}>
            {t('nav.waystones')}
          </a>
          <a href="#/gold" className={[route === 'gold' && 'active', !config.gold.enabled && 'off'].filter(Boolean).join(' ')}>
            {t('nav.gold')}
          </a>
          <a href="#/extras" className={route === 'extras' ? 'active' : ''}>
            {t('nav.extras')}
          </a>
          <div className="nav-group">{t('nav.gear')}</div>
          <a href="#/bases" className={route === 'bases' ? 'active' : ''}>
            {t('nav.bases')}
            <span className="count">{config.baseRules.filter((r) => r.enabled).length}</span>
          </a>
          <div className="nav-group">{t('nav.filter')}</div>
          <a href="#/filters" className={route === 'filters' ? 'active' : ''}>
            {t('nav.filters')}
            {active && <span className="count">{dirty ? `${active.name} •` : active.name}</span>}
          </a>
          <a href="#/catalog" className={route === 'catalog' ? 'active' : ''}>
            {t('nav.catalog')}
          </a>
          <a href="#/preview" className={route === 'preview' ? 'active' : ''}>
            {t('nav.preview')}
          </a>
          <a href="#/styles" className={route === 'styles' ? 'active' : ''}>
            {t('nav.styles')}
          </a>
          <a href="#/export" className={route === 'export' ? 'active' : ''}>
            {t('nav.export')}
          </a>
        </nav>
        <p className="disclaimer">{t('app.disclaimer')}</p>
      </aside>

      <div className="content">
        <div className="topbar">
          <label>
            {t('top.league')}
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
            {t('top.currency')}
            <select
              value={config.currency}
              disabled={!snapshot}
              title={t('top.currencyHint')}
              onChange={(e) => snapshot && update((c) => convertCurrency(c, e.target.value as Currency, snapshot.rates))}
            >
              {(Object.keys(CURRENCIES) as Currency[]).map((id) => (
                // Без курса пересчитать пороги в эту валюту нельзя.
                <option key={id} value={id} disabled={!snapshot || !(perDivine(id, snapshot.rates) > 0)}>
                  {name(CURRENCIES[id].title)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('top.language')}
            <select value={config.language} onChange={(e) => update((c) => ({ ...c, language: e.target.value as Lang }))}>
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_TITLES[lang]}
                </option>
              ))}
            </select>
          </label>
          <a className="account-chip" href="#/filters" title={t('nav.filters')}>
            {me ? me.login : me === null ? t('account.signIn') : '…'}
          </a>
          <span className="status">
            {market.loading
              ? t('top.loading')
              : snapshot && t('top.pricesAt', { source: (snapshot.sources ?? ['poe.ninja']).join(' + '), time: new Date(snapshot.fetchedAt).toLocaleString(locale) })}
          </span>
          {/* Папка игры выбрана — сохраняем прямо туда, иначе скачиваем файл. */}
          {gameFolder.supported && gameFolder.folder ? (
            <button
              className="primary"
              disabled={!snapshot}
              title={gameFolder.status?.kind === 'saved' ? t('export.saved', { file: gameFolder.status.file, time: gameFolder.status.at.toLocaleTimeString(locale) }) : undefined}
              onClick={() => snapshot && gameFolder.save(generateFilter(snapshot, config), config.filterName)}
            >
              {gameFolder.status?.kind === 'saved' ? `✓ ${t('export.save')}` : t('export.save')}
            </button>
          ) : (
            <button className="primary" disabled={!snapshot} onClick={() => snapshot && downloadFilter(generateFilter(snapshot, config), config.filterName)}>
              {t('top.download')}
            </button>
          )}
        </div>

        <main>
          {market.error && (
            <p className="note note--error">
              {t('error.load', { error: market.error })} <button onClick={market.retry}>{t('action.retry')}</button>
            </p>
          )}
          {!snapshot && market.loading && <p className="note">{t('top.loading')}</p>}
          {route === 'start' && <StartView config={config} update={update} snapshot={snapshot} gameFolder={gameFolder} />}
          {route === 'filters' && <FiltersView config={config} update={update} />}
          {route === 'shared' && <SharedView code={sharedCode()!} update={update} />}
          {route === 'catalog' && <CatalogView />}
          {route === 'waystones' && <WaystonesView config={config} update={update} />}
          {route === 'gold' && <GoldView config={config} update={update} />}
          {route === 'extras' && <ExtrasView config={config} update={update} />}
          {route === 'bases' && <BasesView config={config} update={update} snapshot={snapshot} />}
          {route === 'styles' && <StylesView config={config} update={update} snapshot={snapshot} />}
          {snapshot && route === 'export' && <ExportView snapshot={snapshot} config={config} update={update} gameFolder={gameFolder} />}
          {snapshot && route === 'preview' && <PreviewView snapshot={snapshot} config={config} />}
          {snapshot && section && <SectionView key={section.id} section={section} snapshot={snapshot} config={config} update={update} />}
        </main>
      </div>
    </div>
  )
}
