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

export interface MarketItem {
  name: string
  icon: string
  section: SectionId
  /** Цена в Divine Orb; null — на рынке нет данных. */
  divine: number | null
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

export interface League {
  name: string
  hardcore: boolean
}

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
  /** Минимальная цена в Exalted Orb; 0 — без ограничения. */
  minPrice: number
  /** Показывать то, что не прошло, стопками на сумму не меньше stackPrice. */
  stacks: boolean
  /** Минимальная стоимость стопки в Exalted Orb. */
  stackPrice: number
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

export interface Config {
  league: string | null
  /** Нижняя граница тира в Exalted Orb; всё, что дешевле D, попадает в E. */
  thresholds: Record<Exclude<TierId, 'E'>, number>
  tiers: Record<TierId, TierStyle>
  /** Ручной выбор тира по имени предмета. */
  overrides: Record<string, TierChoice>
  disabledSections: SectionId[]
  visibility: Visibility
  /** Разделы со своими настройками показа вместо общих. */
  sectionVisibility: Partial<Record<SectionId, Visibility>>
  gear: { hideLowRarity: boolean; areaLevel: number }
}
