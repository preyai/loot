import { BASE_CLASSES, classesOf, EMPTY_RULE } from './bases'
import type { T } from './i18n'
import type { BaseRule, MarketItem, UniqueInfo } from './types'

/**
 * С какой цены уника его база считается целью для шансинга, в Divine Orb.
 * Порог высокий намеренно: шанс получить уник мал, и ради дешёвого сфера удачи не окупается.
 */
export const CHANCING_MIN_DIVINE = 10

const CATALOG = new Set(BASE_CLASSES.flatMap((c) => c.bases.map((b) => b.name)))

/** Самый дорогой уник базы с надёжной ценой; null — таких нет. */
export function topUnique(item: MarketItem): UniqueInfo | null {
  const priced = (item.uniques ?? []).filter((u) => u.divine !== null)
  return priced.length ? priced.reduce((best, u) => (u.divine! > best.divine! ? u : best)) : null
}

/**
 * Базы под шансинг: обычные предметы, из которых сфера удачи может сделать дорогой уник.
 * Берутся базы из справочника экипировки, у которых есть уник не дешевле порога; дорогие — первыми.
 * Базы, существующие только под уники, и самоцветы сюда не попадают: в справочнике их нет.
 */
export function chancingBases(items: MarketItem[], minDivine: number): string[] {
  return items
    .map((item) => ({ name: item.name, top: topUnique(item) }))
    .filter(({ name, top }) => top !== null && top.divine! >= minDivine && CATALOG.has(name))
    .sort((a, b) => b.top!.divine! - a.top!.divine!)
    .map(({ name }) => name)
}

/** Уники каждой базы — чтобы показать на карточке базы, ради чего её стоит поднимать. */
export function uniquesByBase(items: MarketItem[]): Map<string, UniqueInfo> {
  const result = new Map<string, UniqueInfo>()
  for (const item of items) {
    const top = topUnique(item)
    if (top) result.set(item.name, top)
  }
  return result
}

export function chancingRule(bases: string[], priceLabel: string, t: T): Omit<BaseRule, 'id'> {
  return {
    ...EMPTY_RULE,
    name: t('rule.chancing', { price: priceLabel }),
    classes: classesOf(bases),
    bases,
    // Сфера удачи действует только на обычные неосквернённые предметы.
    rarities: ['Normal'],
    excludeCorrupted: true,
    tier: 'B',
  }
}
