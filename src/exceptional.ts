import { BASE_CLASSES, classesOf, EMPTY_RULE } from './bases'
import type { BaseRule, ExceptionalKind, ExceptionalScan, TierId } from './types'

/** Один запрос к трейду: что именно считаем исключительным и в какой категории ищем. */
export interface ExceptionalQuery {
  kind: ExceptionalKind
  /** Категория в API трейда. */
  category: string
  /** Подпись для хода опроса. */
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

export const EXCEPTIONAL_KINDS: Record<ExceptionalKind, { title: string; sockets: number; quality: number }> = {
  sockets3: { title: '3+ гнезда', sockets: 3, quality: 0 },
  sockets2: { title: '2+ гнезда', sockets: 2, quality: 0 },
  quality: { title: 'качество 21%+', sockets: 0, quality: 21 },
}

export const EXCEPTIONAL_QUERIES: ExceptionalQuery[] = [
  ...TWO_SOCKET.map(([category, title]): ExceptionalQuery => ({ kind: 'sockets3', category, title: `${title}: 3+ гнезда` })),
  ...ONE_SOCKET.map(([category, title]): ExceptionalQuery => ({ kind: 'sockets2', category, title: `${title}: 2+ гнезда` })),
  { kind: 'quality', category: 'armour', title: 'Броня: качество 21%+' },
  { kind: 'quality', category: 'weapon', title: 'Оружие: качество 21%+' },
]

/** База попадает в правило, если её продают хотя бы столько разных продавцов: одиночный лот может быть чьей-то фантазией. */
export const MIN_SELLERS = 2

const KNOWN_BASES = new Set(BASE_CLASSES.flatMap((c) => c.bases.map((b) => b.name)))

/** Базы каждого вида исключительности, подтверждённые достаточным числом продавцов. */
export function exceptionalBases(scan: ExceptionalScan): Record<ExceptionalKind, string[]> {
  const result: Record<ExceptionalKind, string[]> = { sockets3: [], sockets2: [], quality: [] }
  for (const kind of Object.keys(result) as ExceptionalKind[]) {
    const sellers = new Map<string, number>()
    for (const group of scan.groups) {
      if (group.kind !== kind) continue
      for (const [base, count] of Object.entries(group.bases)) sellers.set(base, (sellers.get(base) ?? 0) + count)
    }
    result[kind] = [...sellers]
      .filter(([base, count]) => count >= MIN_SELLERS && KNOWN_BASES.has(base))
      .map(([base]) => base)
      .sort()
  }
  return result
}

/** Правила по результатам опроса: по одному на вид исключительности, для которого нашлись базы. */
export function exceptionalRules(scan: ExceptionalScan, priceLabel: string, tier: TierId): Omit<BaseRule, 'id'>[] {
  const bases = exceptionalBases(scan)
  return (Object.keys(bases) as ExceptionalKind[])
    .filter((kind) => bases[kind].length > 0)
    .map((kind) => ({
      ...EMPTY_RULE,
      name: `Исключительные от ${priceLabel}: ${EXCEPTIONAL_KINDS[kind].title}`,
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
