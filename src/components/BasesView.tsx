import { useMemo, useState } from 'react'
import {
  baseIconUrl,
  baseTradeUrl,
  baseWikiUrl,
  BASE_CLASSES,
  BASE_GROUPS,
  describeRule,
  POPULAR_SHARE,
  popularBases,
  popularRule,
  RULE_TEMPLATES,
  type BaseInfo,
} from '../bases'
import { CURRENCIES, TIER_TITLES } from '../defaults'
import { baseOffers, EXCEPTIONAL_KINDS } from '../exceptional'
import { applyPreset, RULE_PRESETS } from '../presets'
import { useExceptionalScan, usePopularity, type UpdateConfig } from '../store'
import {
  RARITIES,
  TIER_IDS,
  type BaseRule,
  type Config,
  type ExceptionalScan,
  type MarketSnapshot,
  type Rarity,
  type TierId,
} from '../types'
import { ExceptionalPanel } from './ExceptionalPanel'
import { ItemLabel } from './ItemLabel'

const RARITY_TITLES: Record<Rarity, string> = { Normal: 'Обычные', Magic: 'Магические', Rare: 'Редкие' }
const DEFENCE_TITLES: Record<string, string> = { a: 'броня', e: 'уклонение', s: 'энергощит' }

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
const percent = (share: number) => `${(share * 100).toFixed(1)}%`
const describe = (base: BaseInfo) =>
  [`ур. ${base.drop}`, ...(base.defence ?? '').split('').map((d) => DEFENCE_TITLES[d])].join(', ')

type Shares = Record<string, number>

/** Сколько иконок баз показывать в свёрнутом правиле; остальные сворачиваются в «+N». */
const SUMMARY_ICONS = 12

function BaseIcon({ name, large }: { name: string; large?: boolean }) {
  const url = baseIconUrl(name)
  const className = large ? 'base-icon base-icon--large' : 'base-icon'
  // Пустое место того же размера держит сетку ровной, когда иконки нет или она не загрузилась.
  if (!url) return <span className={className} />
  return (
    <img
      className={className}
      src={url}
      alt=""
      title={name}
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

  return (
    <div className="base-picker">
      <div className="actions">
        <input
          type="search"
          placeholder="Поиск базы…"
          aria-label="Поиск базы"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="check">
          Уровень выпадения от
          <input type="number" min={1} max={100} value={minDrop} onChange={(e) => setMinDrop(Number(e.target.value))} />
        </label>
        <button onClick={() => onChange(classes.flatMap((c) => c.bases.filter((b) => b.drop >= minDrop).map((b) => b.name)))}>
          Выбрать такие
        </button>
        <label className="check">
          Популярность от
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
          Выбрать популярные
        </button>
        <button disabled={rule.bases.length === 0} onClick={() => onChange([])}>
          Очистить
        </button>
      </div>
      {classes.map((c) => {
        const bases = needle ? c.bases.filter((b) => b.name.toLowerCase().includes(needle)) : c.bases
        if (bases.length === 0) return null
        return (
          <fieldset key={c.name}>
            <legend>{c.name}</legend>
            {bases.map((b) => (
              <label key={b.name} className="base-card">
                <input type="checkbox" checked={rule.bases.includes(b.name)} onChange={() => onChange(toggle(rule.bases, b.name))} />
                <BaseIcon name={b.name} large />
                <span className="base-card-name">{b.name}</span>
                <span className="count">{describe(b)}</span>
                {shares?.[b.name] !== undefined && <span className="share">носят {percent(shares[b.name])}</span>}
                {scan &&
                  offers?.get(b.name)?.map((offer) => (
                    <span key={offer.kind} className="base-card-price" title="Обычные предметы на трейде, по одному лоту на продавца">
                      {EXCEPTIONAL_KINDS[offer.kind].title}: от {scan.minExalted} {CURRENCIES.exalted.short}
                      <span className="count"> · продавцов: {offer.sellers}</span>
                    </span>
                  ))}
                {/* Ссылка внутри label не переключает галочку: браузер отдаёт клик самой ссылке. */}
                <span className="base-card-links">
                  <a href={baseWikiUrl(b.name)} target="_blank" rel="noreferrer">
                    poe2db
                  </a>
                  {league && (
                    <a href={baseTradeUrl(b.name, league)} target="_blank" rel="noreferrer">
                      трейд
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
          aria-label={`Правило «${rule.name}» включено`}
          title="Включено"
          checked={rule.enabled}
          onChange={(e) => set('enabled', e.target.checked)}
        />
        {open ? (
          <input
            className="rule-name"
            type="text"
            aria-label="Название правила"
            value={rule.name}
            onChange={(e) => set('name', e.target.value)}
          />
        ) : (
          <div className="rule-summary">
            <strong>
              {rule.name} {rule.source === 'trade' && <span className="badge">с трейда</span>}
            </strong>
            <span className="count">{describeRule(rule)}</span>
            {rule.bases.length > 0 && (
              <div className="base-icons">
                {rule.bases.slice(0, SUMMARY_ICONS).map((name) => (
                  <BaseIcon key={name} name={name} />
                ))}
                {rule.bases.length > SUMMARY_ICONS && <span className="count">+{rule.bases.length - SUMMARY_ICONS}</span>}
              </div>
            )}
          </div>
        )}
        {!open &&
          (rule.action === 'show' ? (
            <div className="ground">
              <ItemLabel name={`Тир ${rule.tier}`} style={config.tiers[rule.tier]} />
            </div>
          ) : (
            <span className="badge">скрывать</span>
          ))}
        <div className="actions">
          <button aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Свернуть' : 'Изменить'}
          </button>
          <button disabled={index === 0} title="Выше — главнее" onClick={() => onMove(-1)}>
            ↑
          </button>
          <button disabled={index === total - 1} title="Ниже" onClick={() => onMove(1)}>
            ↓
          </button>
          <button onClick={() => confirm(`Удалить правило «${rule.name}»?`) && onDelete()}>Удалить</button>
        </div>
      </header>

      {open && (
        <>
          <div className="rule-row">
            <select aria-label="Действие" value={rule.action} onChange={(e) => set('action', e.target.value as BaseRule['action'])}>
              <option value="show">Показывать</option>
              <option value="hide">Скрывать</option>
            </select>
            {rule.action === 'show' && (
              <>
                <label className="check">
                  в стиле тира
                  <select value={rule.tier} onChange={(e) => set('tier', e.target.value as TierId)}>
                    {TIER_IDS.map((t) => (
                      <option key={t} value={t}>
                        {TIER_TITLES[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="ground">
                  <ItemLabel name={rule.bases[0] ?? 'Предмет'} style={config.tiers[rule.tier]} />
                </div>
              </>
            )}
          </div>

          <div className="rule-row">
            {RARITIES.map((r) => (
              <label key={r} className="check">
                <input type="checkbox" checked={rule.rarities.includes(r)} onChange={() => set('rarities', toggle(rule.rarities, r))} />
                {RARITY_TITLES[r]}
              </label>
            ))}
            {minField('minItemLevel', 'Ур. предмета от', 100)}
            {minField('minQuality', 'Качество от', 30)}
            {minField('minSockets', 'Гнёзд от', 6)}
          </div>

          <div className="rule-row">
            {minField(
              'minUnidentifiedTier',
              'Ступень свойств от',
              5,
              'У неопознанной вещи: гарантированная минимальная ступень свойств. 0 — не проверять.',
            )}
            {minField('minAreaLevel', 'С уровня области', 100, 'Правило действует только в областях этого уровня и выше. 0 — везде.')}
            <label className="check" title="Осквернённые и отзеркаленные предметы нельзя улучшать">
              <input type="checkbox" checked={rule.excludeCorrupted} onChange={(e) => set('excludeCorrupted', e.target.checked)} />
              Кроме осквернённых и отзеркаленных
            </label>
          </div>

          {BASE_GROUPS.map((group) => {
            const names = BASE_CLASSES.filter((c) => c.group === group.id).map((c) => c.name)
            const allSelected = names.every((n) => rule.classes.includes(n))
            return (
              <div key={group.id} className="rule-row chips">
                <button
                  className="chip-group"
                  title={allSelected ? 'Снять все' : 'Выбрать все'}
                  onClick={() =>
                    setClasses(allSelected ? rule.classes.filter((c) => !names.includes(c)) : [...new Set([...rule.classes, ...names])])
                  }
                >
                  {group.title}
                </button>
                {names.map((name) => (
                  <button
                    key={name}
                    className="chip"
                    aria-pressed={rule.classes.includes(name)}
                    onClick={() => setClasses(toggle(rule.classes, name))}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )
          })}

          {rule.classes.length === 0 ? (
            <p className="note note--error">Не выбран ни один класс — правило в фильтр не попадёт.</p>
          ) : (
            <details open={pickerOpen} onToggle={(e) => setPickerOpen(e.currentTarget.open)}>
              <summary>
                {rule.bases.length === 0 ? 'Базы: любые из выбранных классов' : `Базы: выбрано ${rule.bases.length}`}
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
  const popularity = usePopularity(config.league)
  const shares = popularity.data?.shares ?? null
  const exceptional = useExceptionalScan(config.league)
  const context: BaseContext = { shares, scan: exceptional.scan, league: config.league }
  const setRules = (change: (rules: BaseRule[]) => BaseRule[]) => update((c) => ({ ...c, baseRules: change(c.baseRules) }))

  const choosePreset = (preset: (typeof RULE_PRESETS)[number]) => {
    // Правила из опроса трейда набор не трогает — они остаются первыми.
    const count = config.baseRules.filter((r) => r.source !== 'trade').length
    if (count > 0 && !confirm(`Набор «${preset.title}» заменит текущие правила (${count}). Продолжить?`)) return
    update((c) => applyPreset(c, preset, shares))
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
        <h1>Правила баз</h1>
      </header>
      <p className="note">
        Правила для обычных, магических и редких предметов экипировки. Игра применяет первое подошедшее правило, поэтому
        порядок важен: чем выше правило, тем оно главнее. Уникальные предметы настраиваются в своих разделах и этими правилами
        не затрагиваются.
      </p>

      <section className="panel">
        <h2>Готовые наборы</h2>
        <p className="note">
          Набор заменяет все правила ниже. Потом любое правило можно поправить, выключить или удалить.
          {!shares && !popularity.loading && ' Популярность баз не загрузилась — вместо популярных баз будут взяты старшие базы каждого класса.'}
        </p>
        <div className="presets">
          {RULE_PRESETS.map((preset) => (
            <article key={preset.id} className="preset">
              <h3>{preset.title}</h3>
              <p>{preset.summary}</p>
              <ul>
                {preset.details.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <button className="primary" disabled={popularity.loading} onClick={() => choosePreset(preset)}>
                Применить
              </button>
            </article>
          ))}
        </div>
        <p className="note">
          Списки популярных баз фиксируются в момент применения; чтобы обновить их, примените набор заново.
        </p>
      </section>

      <ExceptionalPanel config={config} update={update} rates={rates} scan={exceptional.scan} loading={exceptional.loading} />

      <section className="panel">
        <h2>Добавить отдельное правило</h2>
        <div className="actions">
          <button
            disabled={!shares}
            onClick={() => shares && setRules((rules) => [...rules, { ...popularRule(shares), id: crypto.randomUUID() }])}
          >
            Популярные базы, ур. предмета 82+
          </button>
          {RULE_TEMPLATES.map((template) => (
            <button key={template.title} onClick={() => setRules((rules) => [...rules, { ...template.make(), id: crypto.randomUUID() }])}>
              {template.title}
            </button>
          ))}
        </div>
        <p className="note">
          {popularity.loading && 'Загрузка популярности баз с poe.ninja…'}
          {popularity.error && <span className="note--error">Популярность баз недоступна: {popularity.error}</span>}
          {popularity.data &&
            `Популярность баз — по ${popularity.data.characters.toLocaleString('ru-RU')} персонажам из рейтинга poe.ninja: доля тех, ` +
              `у кого редкий предмет слота сделан на этой базе. Популярной считается база с долей от ${POPULAR_SHARE * 100}%.`}
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
        <h2>Остальная экипировка</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={config.gear.hideLowRarity}
            onChange={(e) => update((c) => ({ ...c, gear: { ...c.gear, hideLowRarity: e.target.checked } }))}
          />
          Скрывать обычные и магические оружие и броню начиная с уровня области
          <input
            type="number"
            min={1}
            max={100}
            aria-label="Уровень области"
            disabled={!config.gear.hideLowRarity}
            value={config.gear.areaLevel}
            onChange={(e) => update((c) => ({ ...c, gear: { ...c.gear, areaLevel: Number(e.target.value) } }))}
          />
        </label>
        <p className="note">
          Срабатывает после правил выше: то, что они показывают, остаётся видимым. Кольца, амулеты, пояса и все редкие и
          уникальные предметы не скрываются.
        </p>
      </section>
    </div>
  )
}
