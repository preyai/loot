import { BASE_CLASSES, classesOf, EMPTY_RULE } from './bases'
import { keyOf, type T } from './i18n'
import type { BaseRule, ExceptionalKind, ExceptionalScan, TierId } from './types'

/** Один запрос к трейду: что именно считаем исключительным и в какой категории ищем. */
export interface ExceptionalQuery {
  kind: ExceptionalKind
  /** Категория в API трейда. */
  category: string
  /** Подпись для журнала сервера. */
  title: string
}

// У этих классов обычно два гнезда, у остальных одно — больше бывает только у исключительных вещей.
const TWO_SOCKET: [string, string][] = [
  ['armour.chest', 'Body Armours'],
  ['weapon.bow', 'Bows'],
  ['weapon.crossbow', 'Crossbows'],
  ['weapon.warstaff', 'Quarterstaves'],
  ['weapon.staff', 'Staves'],
  ['weapon.talisman', 'Talismans'],
  ['weapon.twomace', 'Two Hand Maces'],
]
const ONE_SOCKET: [string, string][] = [
  ['armour.boots', 'Boots'],
  ['armour.buckler', 'Bucklers'],
  ['armour.focus', 'Foci'],
  ['armour.gloves', 'Gloves'],
  ['armour.helmet', 'Helmets'],
  ['weapon.onemace', 'One Hand Maces'],
  ['weapon.sceptre', 'Sceptres'],
  ['armour.shield', 'Shields'],
  ['weapon.spear', 'Spears'],
  ['weapon.wand', 'Wands'],
]

/** Что ищем в каждом виде исключительности. Подписи — в словаре: «exceptional.<вид>». */
export const EXCEPTIONAL_KINDS: Record<ExceptionalKind, { sockets: number; quality: number }> = {
  sockets3: { sockets: 3, quality: 0 },
  sockets2: { sockets: 2, quality: 0 },
  quality: { sockets: 0, quality: 21 },
}

export const EXCEPTIONAL_QUERIES: ExceptionalQuery[] = [
  ...TWO_SOCKET.map(([category, title]): ExceptionalQuery => ({ kind: 'sockets3', category, title: `${title}: 3+ sockets` })),
  ...ONE_SOCKET.map(([category, title]): ExceptionalQuery => ({ kind: 'sockets2', category, title: `${title}: 2+ sockets` })),
  { kind: 'quality', category: 'armour', title: 'Armour: quality 21%+' },
  { kind: 'quality', category: 'weapon', title: 'Weapons: quality 21%+' },
]

/** База попадает в правило, если её продают хотя бы столько разных продавцов: одиночный лот может быть чьей-то фантазией. */
export const MIN_SELLERS = 2

const KNOWN_BASES = new Set(BASE_CLASSES.flatMap((c) => c.bases.map((b) => b.name)))

/** Сколько продавцов выставили базу в каждом виде исключительности (один вид может идти несколькими запросами). */
function sellersByKind(scan: ExceptionalScan): Record<ExceptionalKind, Map<string, number>> {
  const result: Record<ExceptionalKind, Map<string, number>> = { sockets3: new Map(), sockets2: new Map(), quality: new Map() }
  for (const group of scan.groups) {
    const sellers = result[group.kind]
    for (const [base, count] of Object.entries(group.bases)) sellers.set(base, (sellers.get(base) ?? 0) + count)
  }
  return result
}

/** Базы каждого вида исключительности, подтверждённые достаточным числом продавцов. */
export function exceptionalBases(scan: ExceptionalScan): Record<ExceptionalKind, string[]> {
  const sellers = sellersByKind(scan)
  const pick = (kind: ExceptionalKind) =>
    [...sellers[kind]]
      .filter(([base, count]) => count >= MIN_SELLERS && KNOWN_BASES.has(base))
      .map(([base]) => base)
      .sort()
  return { sockets3: pick('sockets3'), sockets2: pick('sockets2'), quality: pick('quality') }
}

export interface BaseOffer {
  kind: ExceptionalKind
  sellers: number
}

/** Что опрос трейда знает о каждой базе: в каком виде её продают не дешевле порога и сколько продавцов. */
export function baseOffers(scan: ExceptionalScan): Map<string, BaseOffer[]> {
  const result = new Map<string, BaseOffer[]>()
  const sellers = sellersByKind(scan)
  for (const kind of Object.keys(sellers) as ExceptionalKind[]) {
    for (const [base, count] of sellers[kind]) {
      const offers = result.get(base) ?? []
      offers.push({ kind, sellers: count })
      result.set(base, offers)
    }
  }
  return result
}

/** Правила по результатам опроса: по одному на вид исключительности, для которого нашлись базы. */
export function exceptionalRules(scan: ExceptionalScan, priceLabel: string, tier: TierId, t: T): Omit<BaseRule, 'id'>[] {
  const bases = exceptionalBases(scan)
  return (Object.keys(bases) as ExceptionalKind[])
    .filter((kind) => bases[kind].length > 0)
    .map((kind) => ({
      ...EMPTY_RULE,
      name: t('rule.exceptional', { price: priceLabel, kind: t(keyOf('exceptional', kind)) }),
      source: 'trade' as const,
      classes: classesOf(bases[kind]),
      bases: bases[kind],
      // Опрос ищет только обычные предметы: у магических и редких цену задают свойства, а не база.
      rarities: ['Normal' as const],
      minSockets: EXCEPTIONAL_KINDS[kind].sockets,
      minQuality: EXCEPTIONAL_KINDS[kind].quality,
      excludeCorrupted: true,
      tier,
    }))
}

/** Правила из опроса заменяют прежние такие же и встают первыми; ручные правила остаются на месте. */
export function withExceptionalRules(rules: BaseRule[], generated: Omit<BaseRule, 'id'>[]): BaseRule[] {
  return [...generated.map((rule) => ({ ...rule, id: crypto.randomUUID() })), ...rules.filter((r) => r.source !== 'trade')]
}
