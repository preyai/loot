export type SectionId =
  | 'currency'
  | 'fragments'
  | 'ritual'
  | 'delirium'
  | 'abyss'
  | 'breach'
  | 'expedition'
  | 'essences'
  | 'runes'
  | 'soulcores'
  | 'idols'
  | 'lineage'
  | 'gems'
  | 'uq-weapons'
  | 'uq-armour'
  | 'uq-accessories'
  | 'uq-other'

export interface UniqueInfo {
  name: string
  /** Цена в Divine Orb; null — лотов слишком мало, цене нельзя верить. */
  divine: number | null
}

export interface MarketItem {
  name: string
  icon: string
  section: SectionId
  /** Цена в Divine Orb; null — на рынке нет данных. */
  divine: number | null
  /** Только в разделах уников: name — базовый тип, здесь — уникальные предметы на этой базе. */
  uniques?: UniqueInfo[]
}

export interface MarketSnapshot {
  league: string
  fetchedAt: string
  /** Сколько Exalted / Chaos дают за 1 Divine. */
  rates: { exalted: number; chaos: number }
  items: MarketItem[]
  /** Разделы, которые не удалось загрузить. */
  failed: SectionId[]
}

/** Какие базы носят персонажи из рейтинга poe.ninja. */
export interface BasePopularity {
  league: string
  fetchedAt: string
  /** Сколько персонажей в выборке. */
  characters: number
  /** База → доля персонажей с редким предметом этого слота, у которых он на этой базе (0–1). */
  shares: Record<string, number>
}

/** Состояние фонового опроса трейда. */
export interface TradeJob {
  running: boolean
  league: string | null
  done: number
  total: number
  /** Запрос, который выполняется сейчас. */
  current: string | null
  /** Трейд временно ограничил запросы: опрос ждёт до этого времени и продолжит сам. */
  waitingUntil: string | null
  error: string | null
  finishedAt: string | null
}

/** Чем предмет исключителен: лишними гнёздами (сверх обычных двух или одного) или качеством. */
export type ExceptionalKind = 'sockets3' | 'sockets2' | 'quality'

export interface ExceptionalGroup {
  kind: ExceptionalKind
  title: string
  /** Сколько всего лотов нашёл трейд. */
  total: number
  /** Сколько из них разобрано по базам. */
  sampled: number
  /** База → число продавцов среди разобранных лотов. */
  bases: Record<string, number>
}

/** Результат опроса трейда: какие исключительные обычные предметы продают не дешевле порога. */
export interface ExceptionalScan {
  league: string
  at: string
  /** Порог цены, как его задал пользователь. */
  minPrice: number
  currency: Currency
  /** Тот же порог в exalted — в таком виде он ушёл на трейд. */
  minExalted: number
  groups: ExceptionalGroup[]
}

export interface League {
  name: string
  hardcore: boolean
}

/** Валюта, в которой задаются пороги и показываются цены. */
export type Currency = 'exalted' | 'chaos' | 'divine'

export const TIER_IDS = ['S', 'A', 'B', 'C', 'D', 'E'] as const
export type TierId = (typeof TIER_IDS)[number]
export type TierChoice = TierId | 'hide'

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

export interface Visibility {
  /** Тиры ниже этого не показываются. */
  minTier: TierId
  /** Минимальная цена в основной валюте; 0 — без ограничения. */
  minPrice: number
  /** Показывать то, что не прошло, стопками на сумму не меньше порога. */
  stacks: boolean
}

export interface TierStyle {
  fontSize: number
  text: Rgba
  border: Rgba | null
  background: Rgba | null
  sound: { id: number; volume: number } | null
  effect: { color: string; temp: boolean } | null
  icon: { size: 0 | 1 | 2; color: string; shape: string } | null
}

export const RARITIES = ['Normal', 'Magic', 'Rare'] as const
export type Rarity = (typeof RARITIES)[number]

/** Правило для неуникальной экипировки: что показать или скрыть и по каким признакам. */
export interface BaseRule {
  id: string
  name: string
  enabled: boolean
  action: 'show' | 'hide'
  /** Классы предметов; правило без классов в фильтр не попадает. */
  classes: string[]
  /** Конкретные базы из выбранных классов; пусто — любые. */
  bases: string[]
  /** Пусто — любая редкость, кроме уникальной. */
  rarities: Rarity[]
  /** Минимальные значения; 0 — без ограничения. */
  minItemLevel: number
  minQuality: number
  minSockets: number
  /** Гарантированная ступень свойств неопознанной вещи (UnidentifiedItemTier). */
  minUnidentifiedTier: number
  /** С какого уровня области правило действует; нужно правилам скрытия, чтобы не мешать прокачке. */
  minAreaLevel: number
  /** Не затрагивать осквернённые и отзеркаленные предметы: их нельзя улучшать. */
  excludeCorrupted: boolean
  /** Тир, чьим стилем оформляется предмет. */
  tier: TierId
  /** Правило создано опросом трейда и будет заменено следующим опросом. */
  source?: 'trade'
}

export interface Config {
  league: string | null
  currency: Currency
  /** Нижняя граница тира в основной валюте; всё, что дешевле D, попадает в E. */
  thresholds: Record<Exclude<TierId, 'E'>, number>
  tiers: Record<TierId, TierStyle>
  /** Ручной выбор тира по ключу предмета (itemKey). */
  overrides: Record<string, TierChoice>
  disabledSections: SectionId[]
  /** Применяются по порядку: первое подошедшее правило побеждает. */
  baseRules: BaseRule[]
  visibility: Visibility
  /** Разделы со своими настройками показа вместо общих. */
  sectionVisibility: Partial<Record<SectionId, Visibility>>
  gear: { hideLowRarity: boolean; areaLevel: number }
  /** Опрос трейда на исключительные вещи: нижняя граница цены в основной валюте. */
  exceptional: { minPrice: number }
}
