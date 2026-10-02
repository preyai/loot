import { SECTIONS } from './sections'
import { TIER_IDS, type Config, type MarketItem, type MarketSnapshot, type SectionId, type TierId, type Visibility } from './types'

type Rates = MarketSnapshot['rates']

/** Тир для предметов без рыночной цены: показываем, но без фанфар. */
const UNPRICED_TIER: TierId = 'C'

const UNSTACKABLE = new Set(SECTIONS.filter((s) => s.unstackable).map((s) => s.id))

const rank = (tier: TierId) => TIER_IDS.indexOf(tier)

export function tierByValue(exalted: number, thresholds: Config['thresholds']): TierId {
  if (exalted >= thresholds.S) return 'S'
  if (exalted >= thresholds.A) return 'A'
  if (exalted >= thresholds.B) return 'B'
  if (exalted >= thresholds.C) return 'C'
  if (exalted >= thresholds.D) return 'D'
  return 'E'
}

export function autoTier(item: MarketItem, config: Config, rates: Rates): TierId {
  if (item.divine === null) return UNPRICED_TIER
  return tierByValue(item.divine * rates.exalted, config.thresholds)
}

export function visibilityFor(config: Config, section: SectionId): Visibility {
  return config.sectionVisibility[section] ?? config.visibility
}

export type Display =
  | { kind: 'show'; tier: TierId }
  /** Показывать только стопки от stackSize штук; tier — стиль по стоимости такой стопки. */
  | { kind: 'stack'; tier: TierId; stackSize: number }
  | { kind: 'hide' }

export function itemDisplay(item: MarketItem, config: Config, rates: Rates): Display {
  const override = config.overrides[item.name]
  if (override === 'hide') return { kind: 'hide' }
  const tier = override ?? autoTier(item, config, rates)
  // Без цены нельзя судить о ценности — лучше показать лишнее, чем скрыть дорогую новинку.
  if (item.divine === null) return { kind: 'show', tier }

  const visibility = visibilityFor(config, item.section)
  const price = item.divine * rates.exalted
  // Ручной тир важнее мин. цены: предмет, поднятый вручную, показывается, даже если он дешёвый.
  const passes = rank(tier) <= rank(visibility.minTier) && (override !== undefined || price >= visibility.minPrice)
  if (passes) return { kind: 'show', tier }
  if (!visibility.stacks || price <= 0 || UNSTACKABLE.has(item.section)) return { kind: 'hide' }

  // Не меньше 2: одиночный предмет сюда попал именно потому, что его показывать не нужно.
  const stackSize = Math.max(2, Math.ceil(visibility.stackPrice / price))
  return { kind: 'stack', tier: tierByValue(stackSize * price, config.thresholds), stackSize }
}

export function formatPrice(divine: number | null, rates: Rates): string {
  if (divine === null) return 'нет цены'
  const round = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2))
  return divine >= 1 ? `${round(divine)} div` : `${round(divine * rates.exalted)} ex`
}
