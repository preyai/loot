import { CURRENCIES, UNIQUE_TIERS } from './defaults'
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
  type ThresholdTier,
  type TierStyle,
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

/**
 * Цена так, как её видно на экране: до 2 знаков после запятой, а меньше единицы — 2 значащие цифры.
 * С порогами сравниваем её, а не точную: poe.ninja округляет цену в divine и курс по отдельности,
 * и Chaos Orb выходит 0.9998 c — на экране «1 c», а в тир «от 1 c» без округления не попал бы.
 */
export function roundPrice(value: number): number {
  if (value >= 100) return Math.round(value)
  if (value >= 10) return Math.round(value * 10) / 10
  if (value >= 1) return Math.round(value * 100) / 100
  return Number(value.toPrecision(2))
}

const THRESHOLD_TIERS: ThresholdTier[] = ['S', 'A', 'B', 'C', 'D']

/** Тир по цене в divine: цена переводится в валюту каждой границы и сравнивается так, как её видно на экране. */
export function tierByValue(divine: number, thresholds: Config['thresholds'], rates: Rates): TierId {
  for (const tier of THRESHOLD_TIERS) {
    const { value, currency } = thresholds[tier]
    if (roundPrice(divine * perDivine(currency, rates)) >= value) return tier
  }
  return 'E'
}

/** Граница тира в выбранной валюте (для подсказок и расчёта стопок). */
export const thresholdIn = (thresholds: Config['thresholds'], tier: ThresholdTier, currency: Currency, rates: Rates) =>
  (thresholds[tier].value / perDivine(thresholds[tier].currency, rates)) * perDivine(currency, rates)

export function autoTier(item: MarketItem, config: Config, rates: Rates): TierId {
  if (item.divine === null) return UNPRICED_TIER
  return tierByValue(item.divine, config.thresholds, rates)
}

/** Оформление тира раздела по умолчанию: у уников своё, как у NeverSink, у остальных — общее со страницы «Тиры и стили». */
export const defaultSectionTierStyle = (config: Config, section: SectionId, tier: TierId): TierStyle =>
  SECTIONS.find((s) => s.id === section)?.unique ? UNIQUE_TIERS[tier] : config.tiers[tier]

/** Оформление тира в разделе: своё для раздела, если задано, иначе по умолчанию. */
export const sectionTierStyle = (config: Config, section: SectionId, tier: TierId): TierStyle =>
  config.sectionTiers[section]?.[tier] ?? defaultSectionTierStyle(config, section, tier)

export function visibilityFor(config: Config, section: SectionId): Visibility {
  return config.sectionVisibility[section] ?? config.visibility
}

/** Сколько должна стоить стопка (в выбранной валюте), чтобы её показали: не меньше мин. цены и нижней границы мин. тира. */
export function cutoffPrice(visibility: Visibility, thresholds: Config['thresholds'], currency: Currency, rates: Rates): number {
  return Math.max(visibility.minPrice, visibility.minTier === 'E' ? 0 : thresholdIn(thresholds, visibility.minTier, currency, rates))
}

export type Display =
  /** custom — у предмета своё оформление (config.itemStyles), оно важнее стиля тира. */
  | { kind: 'show'; tier: TierId; custom?: true }
  /** Показывать только стопки от stackSize штук; tier — стиль по стоимости такой стопки. */
  | { kind: 'stack'; tier: TierId; stackSize: number }
  | { kind: 'hide' }

export function itemDisplay(item: MarketItem, config: Config, rates: Rates): Display {
  const override = config.overrides[itemKey(item)]
  // Своё оформление — значит, предмет нужен: показываем всегда, тир — только для группы на экране.
  if (config.itemStyles[itemKey(item)]) {
    return { kind: 'show', tier: override && override !== 'hide' ? override : autoTier(item, config, rates), custom: true }
  }
  if (override === 'hide') return { kind: 'hide' }
  const tier = override ?? autoTier(item, config, rates)
  // Без цены нельзя судить о ценности — лучше показать лишнее, чем скрыть дорогую новинку.
  if (item.divine === null) return { kind: 'show', tier }

  const visibility = visibilityFor(config, item.section)
  const price = roundPrice(item.divine * perDivine(config.currency, rates))
  // Ручной тир важнее мин. цены: предмет, поднятый вручную, показывается, даже если он дешёвый.
  const passes = rank(tier) <= rank(visibility.minTier) && (override !== undefined || price >= visibility.minPrice)
  if (passes) return { kind: 'show', tier }
  if (!visibility.stacks || price <= 0 || UNSTACKABLE.has(item.section)) return { kind: 'hide' }

  // Не меньше 2: одиночный предмет сюда попал именно потому, что его показывать не нужно.
  const stackSize = Math.max(2, Math.ceil(roundPrice(cutoffPrice(visibility, config.thresholds, config.currency, rates)) / price))
  return { kind: 'stack', tier: tierByValue(stackSize * item.divine, config.thresholds, rates), stackSize }
}

const convertPrice = (value: number, from: Currency, to: Currency, rates: Rates) =>
  Number(((value * perDivine(to, rates)) / perDivine(from, rates)).toPrecision(3))

/** Смена основной валюты: мин. цены пересчитываются по курсу. Границы тиров — в своих валютах и не меняются. */
export function convertCurrency(config: Config, to: Currency, rates: Rates): Config {
  const visibility = (v: Visibility): Visibility => ({ ...v, minPrice: convertPrice(v.minPrice, config.currency, to, rates) })
  return {
    ...config,
    currency: to,
    visibility: visibility(config.visibility),
    sectionVisibility: Object.fromEntries(
      Object.entries(config.sectionVisibility).map(([id, v]) => [id, visibility(v)]),
    ),
  }
}

export function formatPrice(divine: number | null, rates: Rates, currency: Currency, t: T): string {
  if (divine === null) return t('price.none')
  const round = (v: number) => {
    const rounded = roundPrice(v)
    return v >= 100 ? rounded.toFixed(0) : v >= 10 ? rounded.toFixed(1) : v >= 1 ? rounded.toFixed(2) : String(rounded)
  }
  // Дорогое нагляднее в divine, какой бы ни была основная валюта.
  if (divine >= 1) return `${round(divine)} ${CURRENCIES.divine.short}`
  return `${round(divine * perDivine(currency, rates))} ${CURRENCIES[currency].short}`
}
