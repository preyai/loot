import { BASE_CLASSES, classesOf, EMPTY_RULE } from './bases'
import drops from './data/unique-drops.json'
import type { T } from './i18n'
import type { BaseRule, MarketItem, UniqueInfo } from './types'

/**
 * С какой цены уника его база считается целью для шансинга, в Divine Orb.
 * Порог высокий намеренно: шанс получить уник мал, и ради дешёвого сфера удачи не окупается.
 */
export const CHANCING_MIN_DIVINE = 10

const CATALOG = new Set(BASE_CLASSES.flatMap((c) => c.bases.map((b) => b.name)))
const KNOWN = new Set(drops.known)
const RESTRICTED: Record<string, string> = drops.restricted

/** Можно ли получить уник сферой удачи. unknown — вики такого уника не знает (например, он только вышел). */
export type Chance = 'yes' | 'no' | 'unknown'

/**
 * Сфера удачи даёт только уники, выпадающие обычным образом: добытые с босса, из испытания
 * или особым способом ею не получить. Данные — из вики (npm run update-uniques).
 */
export function chanceOf(unique: string): Chance {
  if (Object.hasOwn(RESTRICTED, unique)) return 'no'
  return KNOWN.has(unique) ? 'yes' : 'unknown'
}

/** Откуда берётся уник, который не шансится (текст вики, на английском); null — ограничений нет. */
export const dropSource = (unique: string): string | null => (Object.hasOwn(RESTRICTED, unique) ? RESTRICTED[unique] : null)

/**
 * Самый дорогой уник базы, который можно получить сферой удачи; null — таких нет.
 * Нужна надёжная цена, а уник без данных о выпадении в расчёт не идёт: поднимать базу впустую хуже, чем пропустить.
 */
export function topUnique(item: MarketItem): UniqueInfo | null {
  const priced = (item.uniques ?? []).filter((u) => u.divine !== null && chanceOf(u.name) === 'yes')
  return priced.length ? priced.reduce((best, u) => (u.divine! > best.divine! ? u : best)) : null
}

/**
 * Базы под шансинг: обычные предметы, из которых сфера удачи может сделать дорогой уник.
 * Берутся базы из справочника экипировки, у которых есть шансящийся уник не дешевле порога; дорогие — первыми.
 * Базы, существующие только под уники, и самоцветы сюда не попадают: в справочнике их нет.
 */
export function chancingBases(items: MarketItem[], minDivine: number): string[] {
  return items
    .map((item) => ({ name: item.name, top: topUnique(item) }))
    .filter(({ name, top }) => top !== null && top.divine! >= minDivine && CATALOG.has(name))
    .sort((a, b) => b.top!.divine! - a.top!.divine!)
    .map(({ name }) => name)
}

/** Цель шансинга каждой базы — чтобы показать на карточке базы, ради чего её стоит поднимать. */
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
