import { CURRENCIES } from './defaults'
import type { T } from './i18n'
import { SECTIONS } from './sections'
import {
  TIER_IDS,
  type Config,
  type Currency,
  type MarketItem,
  type MarketSnapshot,
  type SectionId,
  type TierId,
  type Visibility,
} from './types'

type Rates = MarketSnapshot['rates']

/** Тир для предметов без рыночной цены: показываем, но без фанфар. */
const UNPRICED_TIER: TierId = 'C'

const UNSTACKABLE = new Set(SECTIONS.filter((s) => s.unstackable).map((s) => s.id))

/** Ключ для ручного выбора тира: базы уников не должны совпасть с одноимённым обычным предметом. */
export const itemKey = (item: MarketItem) => (item.uniques ? `unique:${item.name}` : item.name)

const rank = (tier: TierId) => TIER_IDS.indexOf(tier)

/** Сколько единиц валюты дают за 1 Divine. */
export function perDivine(currency: Currency, rates: Rates): number {
  return currency === 'divine' ? 1 : rates[currency]
}

export function tierByValue(value: number, thresholds: Config['thresholds']): TierId {
  if (value >= thresholds.S) return 'S'
  if (value >= thresholds.A) return 'A'
  if (value >= thresholds.B) return 'B'
  if (value >= thresholds.C) return 'C'
  if (value >= thresholds.D) return 'D'
  return 'E'
}

export function autoTier(item: MarketItem, config: Config, rates: Rates): TierId {
  if (item.divine === null) return UNPRICED_TIER
  return tierByValue(item.divine * perDivine(config.currency, rates), config.thresholds)
}

export function visibilityFor(config: Config, section: SectionId): Visibility {
  return config.sectionVisibility[section] ?? config.visibility
}

/** Сколько должна стоить стопка, чтобы её показали: не меньше мин. цены и нижней границы мин. тира. */
export function cutoffPrice(visibility: Visibility, thresholds: Config['thresholds']): number {
  return Math.max(visibility.minPrice, visibility.minTier === 'E' ? 0 : thresholds[visibility.minTier])
}

export type Display =
  | { kind: 'show'; tier: TierId }
  /** Показывать только стопки от stackSize штук; tier — стиль по стоимости такой стопки. */
  | { kind: 'stack'; tier: TierId; stackSize: number }
  | { kind: 'hide' }

export function itemDisplay(item: MarketItem, config: Config, rates: Rates): Display {
  const override = config.overrides[itemKey(item)]
  if (override === 'hide') return { kind: 'hide' }
  const tier = override ?? autoTier(item, config, rates)
  // Без цены нельзя судить о ценности — лучше показать лишнее, чем скрыть дорогую новинку.
  if (item.divine === null) return { kind: 'show', tier }

  const visibility = visibilityFor(config, item.section)
  const price = item.divine * perDivine(config.currency, rates)
  // Ручной тир важнее мин. цены: предмет, поднятый вручную, показывается, даже если он дешёвый.
  const passes = rank(tier) <= rank(visibility.minTier) && (override !== undefined || price >= visibility.minPrice)
  if (passes) return { kind: 'show', tier }
  if (!visibility.stacks || price <= 0 || UNSTACKABLE.has(item.section)) return { kind: 'hide' }

  // Не меньше 2: одиночный предмет сюда попал именно потому, что его показывать не нужно.
  const stackSize = Math.max(2, Math.ceil(cutoffPrice(visibility, config.thresholds) / price))
  return { kind: 'stack', tier: tierByValue(stackSize * price, config.thresholds), stackSize }
}

const convertPrice = (value: number, from: Currency, to: Currency, rates: Rates) =>
  Number(((value * perDivine(to, rates)) / perDivine(from, rates)).toPrecision(3))

export function convertThresholds(
  thresholds: Config['thresholds'],
  from: Currency,
  to: Currency,
  rates: Rates,
): Config['thresholds'] {
  const convert = (v: number) => convertPrice(v, from, to, rates)
  return { S: convert(thresholds.S), A: convert(thresholds.A), B: convert(thresholds.B), C: convert(thresholds.C), D: convert(thresholds.D) }
}

/** Смена основной валюты: пороги и мин. цены пересчитываются по курсу, чтобы тиры остались теми же. */
export function convertCurrency(config: Config, to: Currency, rates: Rates): Config {
  const visibility = (v: Visibility): Visibility => ({ ...v, minPrice: convertPrice(v.minPrice, config.currency, to, rates) })
  return {
    ...config,
    currency: to,
    thresholds: convertThresholds(config.thresholds, config.currency, to, rates),
    visibility: visibility(config.visibility),
    sectionVisibility: Object.fromEntries(
      Object.entries(config.sectionVisibility).map(([id, v]) => [id, visibility(v)]),
    ),
  }
}

export function formatPrice(divine: number | null, rates: Rates, currency: Currency, t: T): string {
  if (divine === null) return t('price.none')
  const round = (v: number) =>
    v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : String(Number(v.toPrecision(2)))
  // Дорогое нагляднее в divine, какой бы ни была основная валюта.
  if (divine >= 1) return `${round(divine)} ${CURRENCIES.divine.short}`
  return `${round(divine * perDivine(currency, rates))} ${CURRENCIES[currency].short}`
}
