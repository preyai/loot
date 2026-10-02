import { useMemo, useState } from 'react'
import { TIER_TITLES } from '../defaults'
import type { Section } from '../sections'
import type { UpdateConfig } from '../store'
import { formatPrice, itemDisplay, itemKey, visibilityFor, type Display } from '../tiering'
import {
  TIER_IDS,
  type Config,
  type MarketItem,
  type MarketSnapshot,
  type TierChoice,
  type UniqueInfo,
  type Visibility,
} from '../types'
import { ItemLabel } from './ItemLabel'
import { UniqueCard } from './UniqueCard'
import { VisibilityFields } from './VisibilityFields'

const CHOICES: TierChoice[] = [...TIER_IDS, 'hide']

const GROUPS = [...TIER_IDS, 'stack', 'hide'] as const
type GroupId = (typeof GROUPS)[number]
const GROUP_TITLES: Record<GroupId, string> = { ...TIER_TITLES, stack: 'Только стопками', hide: 'Скрыто' }

interface Row {
  item: MarketItem
  display: Display
}

interface Props {
  section: Section
  snapshot: MarketSnapshot
  config: Config
  update: UpdateConfig
}

export function SectionView({ section, snapshot, config, update }: Props) {
  const [query, setQuery] = useState('')
  const [opened, setOpened] = useState<{ unique: UniqueInfo; base: string } | null>(null)
  const enabled = !config.disabledSections.includes(section.id)
  const ownVisibility = config.sectionVisibility[section.id]

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const map = new Map<GroupId, Row[]>()
    for (const item of snapshot.items) {
      if (item.section !== section.id) continue
      const names = [item.name, ...(item.uniques ?? []).map((u) => u.name)]
      if (needle && !names.some((n) => n.toLowerCase().includes(needle))) continue
      const display = itemDisplay(item, config, snapshot.rates)
      const group = display.kind === 'show' ? display.tier : display.kind
      const list = map.get(group) ?? []
      list.push({ item, display })
      map.set(group, list)
    }
    for (const list of map.values()) list.sort((a, b) => (b.item.divine ?? -1) - (a.item.divine ?? -1))
    return map
  }, [snapshot, section.id, config, query])

  const setTier = (key: string, choice: TierChoice | null) =>
    update((c) => {
      const overrides = { ...c.overrides }
      if (choice === null) delete overrides[key]
      else overrides[key] = choice
      return { ...c, overrides }
    })

  const toggleSection = () =>
    update((c) => ({
      ...c,
      disabledSections: enabled
        ? [...c.disabledSections, section.id]
        : c.disabledSections.filter((id) => id !== section.id),
    }))

  const setVisibility = (value: Visibility | null) =>
    update((c) => {
      const sectionVisibility = { ...c.sectionVisibility }
      if (value) sectionVisibility[section.id] = value
      else delete sectionVisibility[section.id]
      return { ...c, sectionVisibility }
    })

  const failed = snapshot.failed.includes(section.id)

  return (
    <div className={enabled ? 'section' : 'section section--disabled'}>
      <header className="page-header">
        <h1>{section.title}</h1>
        <input
          className="search"
          type="search"
          placeholder="Поиск предмета…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="check">
          <input type="checkbox" checked={enabled} onChange={toggleSection} />
          Включить раздел в фильтр
        </label>
      </header>

      <section className="panel">
        <label className="check">
          <input
            type="checkbox"
            checked={ownVisibility !== undefined}
            onChange={(e) => setVisibility(e.target.checked ? config.visibility : null)}
          />
          Свои настройки показа для этого раздела
        </label>
        <VisibilityFields
          value={visibilityFor(config, section.id)}
          thresholds={config.thresholds}
          currency={config.currency}
          onChange={setVisibility}
          disabled={ownVisibility === undefined}
          unstackable={section.unstackable}
        />
        {ownVisibility === undefined && (
          <p className="note">
            Действуют общие настройки — они меняются на странице <a href="#/styles">«Тиры и стили»</a>.
          </p>
        )}
      </section>

      {section.unique && (
        <p className="note">
          Уники выпадают неопознанными, и фильтр видит только базовый тип, поэтому тир назначается базе — по самому дорогому
          унику на ней. Если у какого-то уника слишком мало лотов, цене нельзя верить: такая база показывается всегда, в тире C.
        </p>
      )}
      {!enabled && <p className="note">Раздел выключен: игра покажет эти предметы как обычно, без правил фильтра.</p>}
      {failed && <p className="note note--error">Не удалось загрузить цены этого раздела. Попробуйте обновить цены.</p>}
      {!failed && groups.size === 0 && <p className="note">{query ? 'Ничего не найдено.' : 'В этой лиге предметов нет.'}</p>}

      {GROUPS.map((group) => {
        const rows = groups.get(group)
        if (!rows) return null
        return (
          <section key={group} className="tier-group" data-tier={group}>
            <h2>
              {GROUP_TITLES[group]}
              <span className="count">{rows.length}</span>
            </h2>
            <ul className="items">
              {rows.map(({ item, display }) => {
                const key = itemKey(item)
                const override = config.overrides[key]
                return (
                  <li key={key} className="item">
                    <img src={item.icon} alt="" loading="lazy" width={32} height={32} />
                    <div>
                      <div className="ground">
                        <ItemLabel name={item.name} style={display.kind === 'hide' ? null : config.tiers[display.tier]} />
                        {display.kind === 'stack' && <span className="stack">от {display.stackSize} шт.</span>}
                      </div>
                      {item.uniques && (
                        <ul className="uniques">
                          {item.uniques.map((u) => (
                            <li key={u.name}>
                              <button title="Свойства, цена и ссылки" onClick={() => setOpened({ unique: u, base: item.name })}>
                                {u.name}
                              </button>{' '}
                              <span>{u.divine === null ? 'мало лотов' : formatPrice(u.divine, snapshot.rates, config.currency)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <span className="price">{formatPrice(item.divine, snapshot.rates, config.currency)}</span>
                    <div className="tier-picker" role="group" aria-label={`Тир для ${item.name}`}>
                      <button
                        className={override === undefined ? 'active' : ''}
                        title="Тир по цене"
                        onClick={() => setTier(key, null)}
                      >
                        Авто
                      </button>
                      {CHOICES.map((c) => (
                        <button
                          key={c}
                          className={override === c ? 'active' : ''}
                          title={c === 'hide' ? 'Скрыть предмет' : TIER_TITLES[c]}
                          onClick={() => setTier(key, c)}
                        >
                          {c === 'hide' ? '✕' : c}
                        </button>
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      {opened && (
        <UniqueCard
          // Новый ключ на каждый уник: диалог открывается заново, а не подменяет содержимое открытого.
          key={`${opened.base}/${opened.unique.name}`}
          unique={opened.unique}
          base={opened.base}
          league={config.league}
          rates={snapshot.rates}
          currency={config.currency}
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  )
}
