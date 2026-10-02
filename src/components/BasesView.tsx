import { useMemo, useState } from 'react'
import {
  baseIconUrl,
  baseTradeUrl,
  BASE_CLASSES,
  BASE_GROUPS,
  describeRule,
  POPULAR_SHARE,
  popularBases,
  popularRule,
  RULE_TEMPLATES,
  wikiUrl,
  type BaseInfo,
} from '../bases'
import { CURRENCIES } from '../defaults'
import { baseOffers } from '../exceptional'
import { keyOf, translateOr, type T } from '../i18n'
import { useI18n } from '../i18n-react'
import { applyPreset, RULE_PRESETS, type RulePreset } from '../presets'
import { useExceptionalScan, usePopularity, type UpdateConfig } from '../store'
import { RARITIES, TIER_IDS, type BaseRule, type Config, type ExceptionalScan, type MarketSnapshot, type TierId } from '../types'
import { ExceptionalPanel } from './ExceptionalPanel'
import { ItemLabel } from './ItemLabel'
import { EnglishName } from './ItemName'

const toggle = <V,>(list: V[], value: V) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
const percent = (share: number) => `${(share * 100).toFixed(1)}%`
const describe = (base: BaseInfo, t: T) =>
  [t('rules.dropLevel', { n: base.drop }), ...(base.defence ?? '').split('').map((d) => t(keyOf('defence', d)))].join(', ')
/** Название класса на языке интерфейса; у нового класса, которого ещё нет в словаре, — имя из игры. */
const classTitle = (t: T, name: string) => translateOr(t, 'class', name, name)

type Shares = Record<string, number>

/** Сколько иконок баз показывать в свёрнутом правиле; остальные сворачиваются в «+N». */
const SUMMARY_ICONS = 12

function BaseIcon({ name, large }: { name: string; large?: boolean }) {
  const title = useI18n().name(name)
  const url = baseIconUrl(name)
  const className = large ? 'base-icon base-icon--large' : 'base-icon'
  // Пустое место того же размера держит сетку ровной, когда иконки нет или она не загрузилась.
  if (!url) return <span className={className} />
  return (
    <img
      className={className}
      src={url}
      alt=""
      title={title}
      loading="lazy"
      onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
    />
  )
}

/** Данные о базах со стороны: популярность, опрос трейда и лига для ссылок. */
interface BaseContext {
  shares: Shares | null
  scan: ExceptionalScan | null
  league: string | null
}

function BasePicker({ rule, context, onChange }: { rule: BaseRule; context: BaseContext; onChange: (bases: string[]) => void }) {
  const { t, lang, name } = useI18n()
  const { shares, scan, league } = context
  const offers = useMemo(() => (scan ? baseOffers(scan) : null), [scan])
  const [query, setQuery] = useState('')
  const [minDrop, setMinDrop] = useState(65)
  const [minShare, setMinShare] = useState(POPULAR_SHARE * 100)
  const classes = useMemo(
    () =>
      BASE_CLASSES.filter((c) => rule.classes.includes(c.name)).map((c) => ({
        ...c,
        // Популярные — наверх; у остальных сохраняется порядок справочника (по уровню выпадения).
        bases: shares ? [...c.bases].sort((a, b) => (shares[b.name] ?? 0) - (shares[a.name] ?? 0)) : c.bases,
      })),
    [rule.classes, shares],
  )
  const needle = query.trim().toLowerCase()
  const matches = (base: BaseInfo) => base.name.toLowerCase().includes(needle) || name(base.name).toLowerCase().includes(needle)

  // Пустой список в правиле значит «любая база выбранных классов» — на экране это все карточки отмеченными.
  const all = useMemo(() => classes.flatMap((c) => c.bases.map((b) => b.name)), [classes])
  const selected = useMemo(() => new Set(rule.bases.length ? rule.bases : all), [rule.bases, all])
  const toggleBase = (base: string) => {
    const next = all.filter((b) => (b === base ? !selected.has(b) : selected.has(b)))
    // Правило без единой базы ничего бы не находило, поэтому последнюю снять нельзя.
    if (next.length === 0) return
    onChange(next.length === all.length ? [] : next)
  }

  return (
    <div className="base-picker">
      <div className="actions">
        <input
          type="search"
          placeholder={t('rules.searchBase')}
          aria-label={t('rules.searchBase')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="check">
          {t('rules.minDrop')}
          <input type="number" min={1} max={100} value={minDrop} onChange={(e) => setMinDrop(Number(e.target.value))} />
        </label>
        <button onClick={() => onChange(classes.flatMap((c) => c.bases.filter((b) => b.drop >= minDrop).map((b) => b.name)))}>
          {t('rules.pickByDrop')}
        </button>
        <label className="check">
          {t('rules.minShare')}
          <input
            type="number"
            min={0}
            max={100}
            step="any"
            disabled={!shares}
            value={minShare}
            onChange={(e) => setMinShare(Number(e.target.value))}
          />
          %
        </label>
        <button disabled={!shares} onClick={() => shares && onChange(popularBases(rule.classes, shares, minShare / 100))}>
          {t('rules.pickPopular')}
        </button>
        <button disabled={rule.bases.length === 0} onClick={() => onChange([])}>
          {t('rules.allBases')}
        </button>
      </div>
      {classes.map((c) => {
        const bases = needle ? c.bases.filter(matches) : c.bases
        if (bases.length === 0) return null
        return (
          <fieldset key={c.name}>
            <legend>{classTitle(t, c.name)}</legend>
            {bases.map((b) => (
              <label key={b.name} className="base-card">
                <input type="checkbox" checked={selected.has(b.name)} onChange={() => toggleBase(b.name)} />
                <BaseIcon name={b.name} large />
                <span className="base-card-name">{name(b.name)}</span>
                <EnglishName name={b.name} />
                <span className="count">{describe(b, t)}</span>
                {shares?.[b.name] !== undefined && <span className="share">{t('rules.worn', { share: percent(shares[b.name]) })}</span>}
                {scan &&
                  offers?.get(b.name)?.map((offer) => (
                    <span key={offer.kind} className="base-card-price" title={t('rules.offerHint')}>
                      {t('rules.offer', {
                        kind: t(keyOf('exceptional', offer.kind)),
                        price: `${scan.minExalted} ${CURRENCIES.exalted.short}`,
                      })}
                      <span className="count">{t('rules.sellers', { n: offer.sellers })}</span>
                    </span>
                  ))}
                {/* Ссылка внутри label не переключает галочку: браузер отдаёт клик самой ссылке. */}
                <span className="base-card-links">
                  <a href={wikiUrl(b.name, lang)} target="_blank" rel="noreferrer">
                    poe2db
                  </a>
                  {league && (
                    <a href={baseTradeUrl(b.name, league, rule)} target="_blank" rel="noreferrer" title={t('rules.tradeHint')}>
                      {t('rules.trade')}
                    </a>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
        )
      })}
    </div>
  )
}

interface CardProps {
  rule: BaseRule
  index: number
  total: number
  config: Config
  context: BaseContext
  onChange: (rule: BaseRule) => void
  onMove: (delta: number) => void
  onDelete: () => void
}

function RuleCard({ rule, index, total, config, context, onChange, onMove, onDelete }: CardProps) {
  const { t, name } = useI18n()
  // Свёрнутое правило читается одной строкой; пустое сразу открыто — его всё равно надо заполнять.
  const [open, setOpen] = useState(rule.classes.length === 0)
  // Список баз длинный — рисуем его, только пока он раскрыт.
  const [pickerOpen, setPickerOpen] = useState(false)
  const set = <K extends keyof BaseRule>(key: K, value: BaseRule[K]) => onChange({ ...rule, [key]: value })

  const setClasses = (classes: string[]) => {
    // Базы снятых классов не должны остаться в правиле незаметно для пользователя.
    const allowed = new Set(BASE_CLASSES.filter((c) => classes.includes(c.name)).flatMap((c) => c.bases.map((b) => b.name)))
    onChange({ ...rule, classes, bases: rule.bases.filter((b) => allowed.has(b)) })
  }

  // Что правило охватывает на деле: названные базы либо все базы выбранных классов, популярные — первыми.
  const covered = useMemo(() => {
    if (rule.bases.length) return rule.bases
    const all = BASE_CLASSES.filter((c) => rule.classes.includes(c.name)).flatMap((c) => c.bases.map((b) => b.name))
    const shares = context.shares
    return shares ? all.sort((a, b) => (shares[b] ?? 0) - (shares[a] ?? 0)) : all
  }, [rule.bases, rule.classes, context.shares])

  const minField = (
    key: 'minItemLevel' | 'minQuality' | 'minSockets' | 'minUnidentifiedTier' | 'minAreaLevel',
    label: string,
    max: number,
    hint?: string,
  ) => (
    <label className="check" title={hint}>
      {label}
      <input
        type="number"
        min={0}
        max={max}
        value={rule[key]}
        onChange={(e) => set(key, Math.max(0, Math.round(Number(e.target.value))))}
      />
    </label>
  )

  return (
    <section className={rule.enabled ? 'panel rule' : 'panel rule rule--off'}>
      <header>
        <span className="count">№ {index + 1}</span>
        <input
          type="checkbox"
          aria-label={t('rules.enabledFor', { name: rule.name })}
          title={t('rules.enabled')}
          checked={rule.enabled}
          onChange={(e) => set('enabled', e.target.checked)}
        />
        {open ? (
          <input
            className="rule-name"
            type="text"
            aria-label={t('rules.name')}
            value={rule.name}
            onChange={(e) => set('name', e.target.value)}
          />
        ) : (
          <div className="rule-summary">
            <strong>
              {rule.name} {rule.source === 'trade' && <span className="badge">{t('rules.fromTrade')}</span>}
            </strong>
            <span className="count">{describeRule(rule, t)}</span>
            {covered.length > 0 && (
              <div className="base-icons">
                {covered.slice(0, SUMMARY_ICONS).map((base) => (
                  <BaseIcon key={base} name={base} />
                ))}
                {covered.length > SUMMARY_ICONS && <span className="count">+{covered.length - SUMMARY_ICONS}</span>}
              </div>
            )}
          </div>
        )}
        {!open &&
          (rule.action === 'show' ? (
            <div className="ground">
              <ItemLabel name={t('tier.label', { tier: rule.tier })} style={config.tiers[rule.tier]} />
            </div>
          ) : (
            <span className="badge">{t('rules.hideBadge')}</span>
          ))}
        <div className="actions">
          <button aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? t('rules.collapse') : t('rules.edit')}
          </button>
          <button disabled={index === 0} title={t('rules.up')} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button disabled={index === total - 1} title={t('rules.down')} onClick={() => onMove(1)}>
            ↓
          </button>
          <button onClick={() => confirm(t('rules.deleteConfirm', { name: rule.name })) && onDelete()}>{t('rules.delete')}</button>
        </div>
      </header>

      {open && (
        <>
          <div className="rule-row">
            <select aria-label={t('rules.action')} value={rule.action} onChange={(e) => set('action', e.target.value as BaseRule['action'])}>
              <option value="show">{t('rules.show')}</option>
              <option value="hide">{t('rules.hide')}</option>
            </select>
            {rule.action === 'show' && (
              <>
                <label className="check">
                  {t('rules.inTier')}
                  <select value={rule.tier} onChange={(e) => set('tier', e.target.value as TierId)}>
                    {TIER_IDS.map((tier) => (
                      <option key={tier} value={tier}>
                        {t(keyOf('tier', tier))}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="ground">
                  <ItemLabel name={covered[0] ? name(covered[0]) : t('rules.sampleItem')} style={config.tiers[rule.tier]} />
                </div>
              </>
            )}
          </div>

          <div className="rule-row">
            {RARITIES.map((r) => (
              <label key={r} className="check">
                <input type="checkbox" checked={rule.rarities.includes(r)} onChange={() => set('rarities', toggle(rule.rarities, r))} />
                {t(keyOf('rarity', r))}
              </label>
            ))}
            {minField('minItemLevel', t('rules.minItemLevel'), 100)}
            {minField('minQuality', t('rules.minQuality'), 30)}
            {minField('minSockets', t('rules.minSockets'), 6)}
          </div>

          <div className="rule-row">
            {minField('minUnidentifiedTier', t('rules.minUnidentified'), 5, t('rules.minUnidentifiedHint'))}
            {minField('minAreaLevel', t('rules.minArea'), 100, t('rules.minAreaHint'))}
            <label className="check" title={t('rules.excludeCorruptedHint')}>
              <input type="checkbox" checked={rule.excludeCorrupted} onChange={(e) => set('excludeCorrupted', e.target.checked)} />
              {t('rules.excludeCorrupted')}
            </label>
          </div>

          {BASE_GROUPS.map((group) => {
            const names = BASE_CLASSES.filter((c) => c.group === group).map((c) => c.name)
            const allSelected = names.every((n) => rule.classes.includes(n))
            return (
              <div key={group} className="rule-row chips">
                <button
                  className="chip-group"
                  title={allSelected ? t('rules.clearAll') : t('rules.selectAll')}
                  onClick={() =>
                    setClasses(allSelected ? rule.classes.filter((c) => !names.includes(c)) : [...new Set([...rule.classes, ...names])])
                  }
                >
                  {t(keyOf('baseGroup', group))}
                </button>
                {names.map((className) => (
                  <button
                    key={className}
                    className="chip"
                    aria-pressed={rule.classes.includes(className)}
                    onClick={() => setClasses(toggle(rule.classes, className))}
                  >
                    {classTitle(t, className)}
                  </button>
                ))}
              </div>
            )
          })}

          {rule.classes.length === 0 ? (
            <p className="note note--error">{t('rules.noClasses')}</p>
          ) : (
            <details open={pickerOpen} onToggle={(e) => setPickerOpen(e.currentTarget.open)}>
              <summary>
                {rule.bases.length === 0
                  ? t('rules.basesAny', { n: covered.length })
                  : t('rules.basesChosen', { n: rule.bases.length, total: BASE_CLASSES.filter((c) => rule.classes.includes(c.name)).reduce((n, c) => n + c.bases.length, 0) })}
              </summary>
              {pickerOpen && <BasePicker rule={rule} context={context} onChange={(bases) => set('bases', bases)} />}
            </details>
          )}
        </>
      )}
    </section>
  )
}

interface Props {
  config: Config
  update: UpdateConfig
  /** null, пока цены не загружены. */
  rates: MarketSnapshot['rates'] | null
}

export function BasesView({ config, update, rates }: Props) {
  const { t, locale } = useI18n()
  const popularity = usePopularity(config.league)
  const shares = popularity.data?.shares ?? null
  const exceptional = useExceptionalScan(config.league)
  const context: BaseContext = { shares, scan: exceptional.scan, league: config.league }
  const setRules = (change: (rules: BaseRule[]) => BaseRule[]) => update((c) => ({ ...c, baseRules: change(c.baseRules) }))
  const addRule = (rule: Omit<BaseRule, 'id'>) => setRules((rules) => [...rules, { ...rule, id: crypto.randomUUID() }])

  const choosePreset = (preset: RulePreset) => {
    // Правила из опроса трейда набор не трогает — они остаются первыми.
    const count = config.baseRules.filter((r) => r.source !== 'trade').length
    const title = t(keyOf('preset', `${preset.id}.title`))
    if (count > 0 && !confirm(t('rules.presetConfirm', { title, n: count }))) return
    update((c) => applyPreset(c, preset, shares, t))
  }

  const move = (index: number, delta: number) =>
    setRules((rules) => {
      const next = [...rules]
      ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
      return next
    })

  return (
    <div>
      <header className="page-header">
        <h1>{t('nav.bases')}</h1>
      </header>
      <p className="note">{t('rules.note')}</p>

      <section className="panel">
        <h2>{t('rules.presets')}</h2>
        <p className="note">
          {t('rules.presetsNote')}
          {!shares && !popularity.loading && ` ${t('rules.noPopularity')}`}
        </p>
        <div className="presets">
          {RULE_PRESETS.map((preset) => (
            <article key={preset.id} className="preset">
              <h3>{t(keyOf('preset', `${preset.id}.title`))}</h3>
              <p>{t(keyOf('preset', `${preset.id}.summary`))}</p>
              <ul>
                {/* Пункты «что входит» записаны в словаре одной строкой через «|». */}
                {t(keyOf('preset', `${preset.id}.details`))
                  .split('|')
                  .map((line) => (
                    <li key={line}>{line}</li>
                  ))}
              </ul>
              <button className="primary" disabled={popularity.loading} onClick={() => choosePreset(preset)}>
                {t('rules.apply')}
              </button>
            </article>
          ))}
        </div>
        <p className="note">{t('rules.presetsFrozen')}</p>
      </section>

      <ExceptionalPanel config={config} update={update} rates={rates} scan={exceptional.scan} loading={exceptional.loading} />

      <section className="panel">
        <h2>{t('rules.add')}</h2>
        <div className="actions">
          <button disabled={!shares} onClick={() => shares && addRule(popularRule(shares, t))}>
            {t('template.popular')}
          </button>
          {RULE_TEMPLATES.map((template) => (
            <button key={template.title} onClick={() => addRule(template.make(t))}>
              {t(template.title)}
            </button>
          ))}
        </div>
        <p className="note">
          {popularity.loading && t('rules.popularityLoading')}
          {popularity.error && <span className="note--error">{t('rules.popularityError', { error: popularity.error })}</span>}
          {popularity.data &&
            t('rules.popularityNote', { n: popularity.data.characters.toLocaleString(locale), share: POPULAR_SHARE * 100 })}
        </p>
      </section>

      {config.baseRules.map((rule, index) => (
        <RuleCard
          key={rule.id}
          rule={rule}
          index={index}
          total={config.baseRules.length}
          config={config}
          context={context}
          onChange={(next) => setRules((rules) => rules.map((r) => (r.id === next.id ? next : r)))}
          onMove={(delta) => move(index, delta)}
          onDelete={() => setRules((rules) => rules.filter((r) => r.id !== rule.id))}
        />
      ))}

      <section className="panel">
        <h2>{t('rules.rest')}</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={config.gear.hideLowRarity}
            onChange={(e) => update((c) => ({ ...c, gear: { ...c.gear, hideLowRarity: e.target.checked } }))}
          />
          {t('rules.restHide')}
          <input
            type="number"
            min={1}
            max={100}
            aria-label={t('rules.areaLevel')}
            disabled={!config.gear.hideLowRarity}
            value={config.gear.areaLevel}
            onChange={(e) => update((c) => ({ ...c, gear: { ...c.gear, areaLevel: Number(e.target.value) } }))}
          />
        </label>
        <p className="note">{t('rules.restNote')}</p>
      </section>
    </div>
  )
}
