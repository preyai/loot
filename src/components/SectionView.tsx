import { useMemo, useState } from 'react'
import { REST_STYLES } from '../filter'
import { keyOf } from '../i18n'
import { useI18n } from '../i18n-react'
import type { Section } from '../sections'
import type { UpdateConfig } from '../store'
import { autoTier, defaultSectionTierStyle, formatPrice, itemDisplay, itemKey, maxStack, sectionTierStyle, visibilityFor, type Display } from '../tiering'
import {
  TIER_IDS,
  type Config,
  type MarketItem,
  type MarketSnapshot,
  type TierChoice,
  type TierId,
  type TierStyle,
  type UniqueInfo,
  type Visibility,
} from '../types'
import { isUnhideable } from '../unhideable'
import { ItemLabel } from './ItemLabel'
import { StyleFields } from './StyleFields'
import { StyleRow } from './StyleRow'
import { EnglishName } from './ItemName'
import { UniqueCard } from './UniqueCard'
import { VisibilityFields } from './VisibilityFields'

const CHOICES: TierChoice[] = [...TIER_IDS, 'hide']

// Предметы со своим оформлением — отдельной группой сверху: их настраивали вручную, и искать их проще в одном месте.
const GROUPS = ['custom', ...TIER_IDS, 'stack', 'hide'] as const
type GroupId = (typeof GROUPS)[number]

/** Значок стопки: монеты одна на другой. */
function StackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <ellipse cx="7" cy="10.5" rx="5" ry="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <ellipse cx="7" cy="7" rx="5" ry="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <ellipse cx="7" cy="3.5" rx="5" ry="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/** Корзина на кнопке «скрыть предмет»: крестик читался как «закрыть», а не как «выбросить из показа». */
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.6 6.8v4M9.4 6.8v4" />
    </svg>
  )
}

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
  const { t, name } = useI18n()
  const [query, setQuery] = useState('')
  const [opened, setOpened] = useState<{ unique: UniqueInfo; base: string } | null>(null)
  // Строка, у которой раскрыты поля своего оформления.
  const [editing, setEditing] = useState<string | null>(null)
  const [stacking, setStacking] = useState<string | null>(null)
  const enabled = !config.disabledSections.includes(section.id)
  const ownVisibility = config.sectionVisibility[section.id]

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const map = new Map<GroupId, Row[]>()
    for (const item of snapshot.items) {
      if (item.section !== section.id) continue
      // Ищем и по названию на языке интерфейса, и по английскому: в фильтре и на трейде предмет зовут по-английски.
      const names = [item.name, ...(item.uniques ?? []).map((u) => u.name)].flatMap((n) => [n, name(n)])
      if (needle && !names.some((n) => n.toLowerCase().includes(needle))) continue
      const display = itemDisplay(item, config, snapshot.rates)
      const group = display.kind !== 'hide' && display.custom ? 'custom' : display.kind === 'show' ? display.tier : display.kind
      const list = map.get(group) ?? []
      list.push({ item, display })
      map.set(group, list)
    }
    for (const list of map.values()) list.sort((a, b) => (b.item.divine ?? -1) - (a.item.divine ?? -1))
    return map
  }, [snapshot, section.id, config, query, name])

  const setTier = (key: string, choice: TierChoice | null) =>
    update((c) => {
      const overrides = { ...c.overrides }
      if (choice === null) delete overrides[key]
      else overrides[key] = choice
      // Выбор тира или скрытия заменяет своё оформление: у предмета либо тир, либо своё.
      const { [key]: _own, ...itemStyles } = c.itemStyles
      return { ...c, overrides, itemStyles }
    })
  const setSectionTier = (tier: TierId, style: TierStyle | null) =>
    update((c) => {
      const { [tier]: _old, ...rest } = c.sectionTiers[section.id] ?? {}
      const tiers = style ? { ...rest, [tier]: style } : rest
      const { [section.id]: _section, ...others } = c.sectionTiers
      return { ...c, sectionTiers: Object.keys(tiers).length ? { ...others, [section.id]: tiers } : others }
    })
  /** К строке предмета после того, как он сменил группу (кадр спустя — когда список уже перерисован). */
  const scrollToItem = (key: string) =>
    requestAnimationFrame(() => document.querySelector(`[data-focus="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'start' }))
  const setItemStack = (key: string, size: number | null) =>
    update((c) => {
      const { [key]: _old, ...itemStacks } = c.itemStacks
      return { ...c, itemStacks: size ? { ...itemStacks, [key]: size } : itemStacks }
    })
  const setItemStyle = (key: string, style: TierStyle | null) =>
    update((c) => {
      const { [key]: _old, ...itemStyles } = c.itemStyles
      return { ...c, itemStyles: style ? { ...itemStyles, [key]: style } : itemStyles }
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
  // Свои настройки раздела: блок раскрыт, только если что-то изменено, — иначе предметы видны сразу.
  const ownTiers = TIER_IDS.filter((tier) => config.sectionTiers[section.id]?.[tier])
  const customized = ownVisibility !== undefined || ownTiers.length > 0
  const settingsSummary = customized
    ? [ownVisibility !== undefined && t('items.settingsOwnVisibility'), ownTiers.length > 0 && t('items.settingsOwnTiers', { tiers: ownTiers.join(', ') })]
        .filter(Boolean)
        .join(' · ')
    : t(section.unique ? 'items.settingsGlobalUnique' : 'items.settingsGlobal')
  const groupTitle = (group: GroupId) =>
    group === 'stack' || group === 'hide' || group === 'custom' ? t(keyOf('group', group)) : t(keyOf('tier', group))

  return (
    <div className={enabled ? 'section' : 'section section--disabled'}>
      <header className="page-header">
        <h1>{t(keyOf('section', section.id))}</h1>
        <input
          className="search"
          type="search"
          placeholder={t('items.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="check">
          <input type="checkbox" checked={enabled} onChange={toggleSection} />
          {t('items.enable')}
        </label>
      </header>

      {/* key: при переходе в другой раздел блок снова свёрнут или раскрыт по его настройкам. */}
      <details key={section.id} className="panel section-settings" open={customized || undefined}>
        <summary>
          <span className="section-settings-title">{t('items.settings')}</span>
          <span className={customized ? 'section-settings-state is-own' : 'section-settings-state'}>{settingsSummary}</span>
        </summary>
        <label className="check">
          <input
            type="checkbox"
            checked={ownVisibility !== undefined}
            onChange={(e) => setVisibility(e.target.checked ? config.visibility : null)}
          />
          {t('items.ownVisibility')}
        </label>
        <VisibilityFields
          value={visibilityFor(config, section.id)}
          thresholds={config.thresholds}
          currency={config.currency}
          rates={snapshot?.rates ?? null}
          onChange={setVisibility}
          disabled={ownVisibility === undefined}
          unstackable={section.unstackable}
        />
        {ownVisibility === undefined && (
          <p className="note">
            {t('items.globalNote')} <a href="#/styles">«{t('nav.styles')}»</a>.
          </p>
        )}

        <h3 className="section-tiers-title">{t('items.ownTiers')}</h3>
        <p className="note">{t(section.unique ? 'items.ownTiersNoteUnique' : 'items.ownTiersNote')}</p>
        {TIER_IDS.map((tier) => {
          const own = config.sectionTiers[section.id]?.[tier]
          return (
            <StyleRow
              key={tier}
              id={`section-${section.id}-${tier}`}
              title={t(keyOf('tier', tier))}
              sample={t('tier.label', { tier })}
              style={sectionTierStyle(config, section.id, tier)}
              onChange={(style) => setSectionTier(tier, style)}
              locked={!own}
            >
              <label className="check">
                <input
                  type="checkbox"
                  checked={own !== undefined}
                  // Своё оформление начинается с копии общего — так понятно, от чего отталкиваться.
                  onChange={(e) => setSectionTier(tier, e.target.checked ? structuredClone(defaultSectionTierStyle(config, section.id, tier)) : null)}
                />
                {t('items.ownTier')}
              </label>
            </StyleRow>
          )
        })}
      </details>

      {section.unique && <p className="note">{t('items.uniqueNote')}</p>}
      {section.bases && <p className="note">{t('items.basesNote')}</p>}
      {!enabled && <p className="note">{t('items.disabled')}</p>}
      {failed && <p className="note note--error">{t('items.failed')}</p>}
      {!failed && groups.size === 0 && <p className="note">{query ? t('items.notFound') : t('items.empty')}</p>}

      {GROUPS.map((group) => {
        const rows = groups.get(group)
        if (!rows) return null
        return (
          <section key={group} className="tier-group" data-tier={group}>
            <h2>
              {groupTitle(group)}
              <span className="count">{rows.length}</span>
            </h2>
            <ul className="items">
              {rows.map(({ item, display }) => {
                const key = itemKey(item)
                const override = config.overrides[key]
                const own = config.itemStyles[key]
                return (
                  <li key={key} className="item" data-focus={key}>
                    {/* Без иконки или с недоступной — пустое место того же размера вместо значка «битой картинки». */}
                    {item.icon ? (
                      <img
                        src={item.icon}
                        alt=""
                        loading="lazy"
                        width={32}
                        height={32}
                        onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                      />
                    ) : (
                      <span />
                    )}
                    <div>
                      <div className={display.kind === 'hide' && !own && !isUnhideable(item.name) ? 'ground ground--hidden' : 'ground'}>
                        {/* «Скрытый» предмет, который игра всё равно покажет, — так, как он и будет выглядеть. */}
                        <ItemLabel
                          name={name(item.name)}
                          style={
                            own ??
                            (display.kind !== 'hide'
                              ? sectionTierStyle(config, section.id, display.tier)
                              : isUnhideable(item.name)
                                ? section.unique
                                  ? REST_STYLES.unique
                                  : REST_STYLES.other
                                : // Скрытый — так, как игра покажет его под Alt: в оформлении тира, в котором он был бы.
                                  sectionTierStyle(config, section.id, override && override !== 'hide' ? override : autoTier(item, config, snapshot.rates)))
                          }
                        />
                        {display.kind === 'stack' && <span className="stack">{t('items.stackFrom', { n: display.stackSize })}</span>}
                        <EnglishName name={item.name} />
                        {/* Пометка нужна только «скрытому» предмету: объясняет, почему он всё равно виден. */}
                        {display.kind === 'hide' && isUnhideable(item.name) && (
                          <span className="count unhideable" title={t('preview.unhideable')}>
                            {t('items.unhideable')}
                          </span>
                        )}
                      </div>
                      {item.uniques && (
                        <ul className="uniques">
                          {item.uniques.map((u) => (
                            <li key={u.name}>
                              <button title={t('items.uniqueHint')} onClick={() => setOpened({ unique: u, base: item.name })}>
                                {name(u.name)}
                              </button>{' '}
                              <span>{u.divine === null ? t('items.fewListings') : formatPrice(u.divine, snapshot.rates, config.currency, t)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <span className="price" title={item.priceSource ?? 'poe.ninja'}>
                      {formatPrice(item.divine, snapshot.rates, config.currency, t)}
                    </span>
                    <div className="tier-picker" role="group" aria-label={t('items.tierFor', { name: name(item.name) })}>
                      <button
                        className={override === undefined && !own ? 'active' : ''}
                        title={t('items.autoHint')}
                        onClick={() => setTier(key, null)}
                      >
                        {t('items.auto')}
                      </button>
                      {CHOICES.map((c) => (
                        <button
                          key={c}
                          className={override === c && !own ? 'active' : ''}
                          title={c === 'hide' ? t('items.hide') : t(keyOf('tier', c))}
                          onClick={() => setTier(key, c)}
                        >
                          {c === 'hide' ? <TrashIcon /> : c}
                        </button>
                      ))}
                      <button
                        className={config.itemStacks[key] ? 'active' : ''}
                        disabled={maxStack(item.name) < 2}
                        title={maxStack(item.name) < 2 ? t('items.stackUnstackable') : t('items.stackManual')}
                        aria-expanded={stacking === key}
                        onClick={() => setStacking(stacking === key ? null : key)}
                      >
                        <StackIcon />
                      </button>
                      <button
                        className={own ? 'active' : ''}
                        title={t('items.customStyle')}
                        aria-expanded={editing === key}
                        onClick={() => {
                          // Первое нажатие — копия текущего вида предмета, чтобы править, а не собирать с нуля.
                          if (!own) {
                            setItemStyle(key, structuredClone(sectionTierStyle(config, section.id, display.kind === 'hide' ? 'E' : display.tier)))
                            // Предмет переезжает в группу «Своё оформление» наверху — прокручиваем к нему, чтобы не потерять.
                            scrollToItem(key)
                          }
                          setEditing(editing === key ? null : key)
                        }}
                      >
                        ✎
                      </button>
                    </div>
                    {stacking === key && (
                      <div className="item-stack">
                        <label className="check">
                          {t('items.stackManual')}
                          <input
                            type="number"
                            min={2}
                            max={maxStack(item.name)}
                            placeholder={display.kind === 'stack' ? String(display.stackSize) : ''}
                            value={config.itemStacks[key] ?? ''}
                            onChange={(e) => {
                              const n = Math.round(Number(e.target.value))
                              setItemStack(key, e.target.value && n >= 2 ? Math.min(n, maxStack(item.name)) : null)
                            }}
                          />
                          {t('items.stackUnit')}
                        </label>
                        <span className="note">{t('items.stackMax', { n: maxStack(item.name) })}</span>
                        {config.itemStacks[key] !== undefined && <button onClick={() => setItemStack(key, null)}>{t('items.stackReset')}</button>}
                      </div>
                    )}
                    {editing === key && own && (
                      <div className="rule-style item-style">
                        <StyleFields id={`item-${key}`} style={own} onChange={(style) => setItemStyle(key, style)} />
                        <div className="actions">
                          <button
                            onClick={() => {
                              setItemStyle(key, null)
                              setEditing(null)
                              scrollToItem(key)
                            }}
                          >
                            {t('items.customReset')}
                          </button>
                        </div>
                      </div>
                    )}
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
