import type { Lang } from './i18n'

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
  | 'verisium'
  | 'lineage'
  | 'gems'
  | 'tablets'
  | 'uq-weapons'
  | 'uq-armour'
  | 'uq-accessories'
  | 'uq-other'

/** Строка свойства предмета; variant — одно из взаимоисключающих свойств (у предмета будет только одно). */
export interface ModLine {
  text: string
  variant?: true
}

export interface UniqueInfo {
  name: string
  /** Цена в Divine Orb; null — лотов слишком мало, цене нельзя верить. */
  divine: number | null
  icon: string
  /** Сколько лотов на рынке. */
  listings: number
  /** Изменение цены за 7 дней, в процентах; null — нет данных. */
  weekChange: number | null
  /** Строки игровой подсказки: характеристики, требования, даруемые умения, скрытые и явные свойства. */
  properties: string[]
  requirements: string[]
  skills: string[]
  implicits: ModLine[]
  explicits: ModLine[]
  flavour: string
}

export interface MarketItem {
  name: string
  icon: string
  section: SectionId
  /** Цена в Divine Orb; null — на рынке нет данных. */
  divine: number | null
  /** Только в разделах уников: name — базовый тип, здесь — уникальные предметы на этой базе. */
  uniques?: UniqueInfo[]
  /** Откуда цена; нет — poe.ninja. */
  priceSource?: 'poe2scout'
}

export interface MarketSnapshot {
  league: string
  fetchedAt: string
  /** Сколько Exalted / Chaos дают за 1 Divine. */
  rates: { exalted: number; chaos: number }
  /** Откуда цены: poe2scout — обычные предметы и курс, poe.ninja — уники и то, чего нет у poe2scout. Нет — только poe.ninja. */
  sources?: string[]
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
  /** Нижняя граница цены в exalted. */
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

/** Тиры, у которых есть нижняя граница цены; всё дешевле D — тир E. */
export type ThresholdTier = Exclude<TierId, 'E'>

/** Нижняя граница тира в своей валюте: «от 1 div», «от 1 c», «от 5 ex». Курс её не сдвигает. */
export interface Threshold {
  value: number
  currency: Currency
}

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
  /** null — цвет текста не задаётся, игра красит предмет цветом его редкости (так можно только в правилах баз). */
  text: Rgba | null
  border: Rgba | null
  background: Rgba | null
  /** Звук игры по номеру или свой файл (file) — он лежит рядом с фильтром в папке игры. */
  sound: { id: number; volume: number; file?: string } | null
  effect: { color: string; temp: boolean } | null
  icon: { size: 0 | 1 | 2; color: string; shape: string } | null
}

export const RARITIES = ['Normal', 'Magic', 'Rare'] as const
export type Rarity = (typeof RARITIES)[number]

/** Группа правила баз — только для списка на экране (заголовки), на фильтр не влияет. */
export const RULE_GROUPS = [
  'trade',
  'exceptional',
  'chancing',
  'topmods',
  'crafting',
  'rares',
  'jewellery',
  'flasks',
  'jewels',
  'leveling',
  'hide',
  'rest',
  'custom',
] as const
export type RuleGroup = (typeof RULE_GROUPS)[number]

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
  /** До какого уровня области правило действует; 0 — без ограничения. Нужно правилам прокачки. */
  maxAreaLevel: number
  /** Не затрагивать осквернённые и отзеркаленные предметы: их нельзя улучшать. */
  excludeCorrupted: boolean
  /** Только опознанные предметы (Identified True): у них видны свойства. */
  identified: boolean
  /** Свойства по названию — префиксы и суффиксы, как они написаны на предмете (HasExplicitMod). */
  mods: string[]
  /** Сколько из этих свойств должно быть на предмете. */
  minMods: number
  /** Тир, чьим стилем оформляется предмет. */
  tier: TierId
  /** Своё оформление правила; если задано, тир не используется. */
  style?: TierStyle
  /** Группа в списке правил; нет — «Свои правила». */
  group?: RuleGroup
  /** Правило создано опросом трейда и будет заменено следующим опросом. */
  source?: 'trade'
}

/** Группа тиров путевых камней с общим оформлением: t16 — тир 16, t12 — тиры 12–14 и т. д. */
export type WaystoneBandId = 't16' | 't15' | 't12' | 't7' | 't1'

export interface WaystoneConfig {
  /** Выключено — игра показывает камни как обычно. */
  enabled: boolean
  /** Обычные, магические и редкие камни ниже этого тира скрываются; 1 — показывать все. */
  minTier: number
  styles: Record<WaystoneBandId, TierStyle>
  /** Особые камни — выделяются на любом тире; null — без отдельного выделения. */
  enchanted: TierStyle | null
  /** Осквернённые с 7+ свойствами. */
  corrupted: TierStyle | null
  /** Красная рамка у камня, тир которого выше текущей области. */
  upgradeBorder: boolean
}

/** Кучи золота: huge, large, medium — от своего размера; small — всё, что меньше средней. */
export type GoldPileId = 'huge' | 'large' | 'medium'

export interface GoldConfig {
  /** Выключено — игра показывает золото как обычно. */
  enabled: boolean
  /** С какого размера кучи она считается крупной и т. д. */
  sizes: Record<GoldPileId, number>
  styles: Record<GoldPileId | 'small', TierStyle>
  /** На прокачке выделять кучи поменьше (пороги NeverSink по уровню области). */
  leveling: boolean
  /** Скрывать кучи меньше средней. */
  hideSmall: boolean
}

/** Выбор для правила прочих предметов: тир, скрытие или «без правила». */
export type ExtraChoice = TierId | 'hide' | 'off'

export interface Config {
  /** Название фильтра — имя файла и строка в списке фильтров игры. */
  filterName: string
  /** Язык интерфейса и названий предметов. В файле фильтра имена всегда английские. */
  language: Lang
  league: string | null
  currency: Currency
  /** Нижняя граница тира в основной валюте; всё, что дешевле D, попадает в E. */
  thresholds: Record<ThresholdTier, Threshold>
  tiers: Record<TierId, TierStyle>
  /** Ручной выбор тира по ключу предмета (itemKey). */
  overrides: Record<string, TierChoice>
  /** Своё оформление предмета раздела рынка по ключу (itemKey): важнее тира, предмет всегда показывается. */
  itemStyles: Record<string, TierStyle>
  /** Ручной размер стопки предмета рынка (ключ — как у overrides): показывать только стопками от стольких штук. */
  itemStacks: Record<string, number>
  disabledSections: SectionId[]
  /** Применяются по порядку: первое подошедшее правило побеждает. */
  baseRules: BaseRule[]
  visibility: Visibility
  /** Разделы со своими настройками показа вместо общих. */
  sectionVisibility: Partial<Record<SectionId, Visibility>>
  /** Разделы со своими границами тиров вместо общих (например, уники). */
  sectionThresholds: Partial<Record<SectionId, Record<ThresholdTier, Threshold>>>
  /** Строгость, выбранная на стартовой странице; меняется и вручную — тогда это просто последний выбор. */
  level?: 'leveling' | 'soft' | 'balanced' | 'strict'
  /** Своё оформление тиров в разделе рынка; тиров, которых здесь нет, — общее оформление (tiers). */
  sectionTiers: Partial<Record<SectionId, Partial<Record<TierId, TierStyle>>>>
  /** plainHidden — скрытые правилами баз вещи под Alt без оформления правила: мелко и прозрачно, как у NeverSink. */
  gear: { hideLowRarity: boolean; areaLevel: number; plainHidden: boolean }
  waystones: WaystoneConfig
  gold: GoldConfig
  /** Прочие предметы: выбор по ключу «группа.правило», только отличия от значений по умолчанию. */
  extras: Record<string, ExtraChoice>
  /** Группы прочих предметов, выключенные целиком. */
  disabledExtras: string[]
}
