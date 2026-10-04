import type { Rgba, TierStyle } from './types'

/**
 * Разбор и применение готового текста фильтра к предмету — для предпросмотра.
 * Работаем с тем же текстом, что уходит в файл, поэтому предпросмотр показывает ровно то, что увидит игра.
 * Понимаем условия и действия, которые пишет наш генератор (и типичные для фильтров NeverSink).
 */

export type ItemRarity = 'Normal' | 'Magic' | 'Rare' | 'Unique'
const RARITY_ORDER: ItemRarity[] = ['Normal', 'Magic', 'Rare', 'Unique']

/** Предмет на земле: то, что видит фильтр. */
export interface DroppedItem {
  /** Класс предмета, как его понимает условие Class. */
  itemClass: string
  baseType: string
  rarity: ItemRarity
  itemLevel: number
  quality: number
  sockets: number
  stackSize: number
  /** Только у камней. */
  gemLevel?: number
  /** Только у путевых камней. */
  waystoneTier?: number
  unidentifiedTier: number
  corrupted: boolean
  mirrored: boolean
  enchanted: boolean
  twiceCorrupted: boolean
  /** Число явных свойств (для HasExplicitMod с подсчётом). */
  explicitMods: number
  dropLevel: number
}

export interface FilterBlock {
  action: 'Show' | 'Hide' | 'Minimal'
  /** Комментарий после «Show #» — им подписано правило. */
  comment: string
  /** Номер строки в файле фильтра (с 1). */
  line: number
  conditions: string[]
  actions: string[]
  continues: boolean
}

export function parseFilter(text: string): FilterBlock[] {
  const blocks: FilterBlock[] = []
  let current: FilterBlock | null = null
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const head = /^(Show|Hide|Minimal)\b\s*(?:#\s*(.*))?$/.exec(line)
    if (head) {
      current = { action: head[1] as FilterBlock['action'], comment: head[2] ?? '', line: index + 1, conditions: [], actions: [], continues: false }
      blocks.push(current)
      return
    }
    if (!current) return
    const statement = line.replace(/\s+#.*$/, '')
    if (statement === 'Continue') current.continues = true
    else if (/^(Set|Play|Minimap|Disable|Custom|Enable)/.test(statement)) current.actions.push(statement)
    else current.conditions.push(statement)
  })
  return blocks
}

/** Значения в кавычках или через пробел: «"Gold Ring" "Ruby Ring"» → [Gold Ring, Ruby Ring]. */
function values(text: string): string[] {
  const out: string[] = []
  for (const match of text.matchAll(/"([^"]*)"|(\S+)/g)) out.push(match[1] ?? match[2])
  return out
}

const OPERATOR = /^(==|!=|<=|>=|<|>|=)?\s*/

function compare(actual: number, op: string, expected: number): boolean {
  switch (op) {
    case '<':
      return actual < expected
    case '<=':
      return actual <= expected
    case '>':
      return actual > expected
    case '>=':
      return actual >= expected
    case '!=':
      return actual !== expected
    default:
      return actual === expected
  }
}

const NUMERIC: Record<string, (item: DroppedItem, area: number) => number | undefined> = {
  ItemLevel: (i) => i.itemLevel,
  Quality: (i) => i.quality,
  Sockets: (i) => i.sockets,
  StackSize: (i) => i.stackSize,
  GemLevel: (i) => i.gemLevel,
  WaystoneTier: (i) => i.waystoneTier,
  UnidentifiedItemTier: (i) => i.unidentifiedTier,
  AreaLevel: (_i, area) => area,
  DropLevel: (i) => i.dropLevel,
}

const BOOLEAN: Record<string, (item: DroppedItem) => boolean> = {
  Corrupted: (i) => i.corrupted,
  Mirrored: (i) => i.mirrored,
  AnyEnchantment: (i) => i.enchanted,
  TwiceCorrupted: (i) => i.twiceCorrupted,
  // В предпросмотре все вещи неопознанные: так они и выпадают.
  Identified: () => false,
}

/** Условия, которые понимает предпросмотр; остальные считаются невыполненными. */
export const KNOWN_CONDITIONS = ['BaseType', 'Class', 'Rarity', 'HasExplicitMod', ...Object.keys(BOOLEAN), ...Object.keys(NUMERIC)]

/** Проверка одного условия; неизвестное условие не выполняется (и предмет идёт дальше по фильтру). */
export function matchCondition(condition: string, item: DroppedItem, area: number): boolean {
  const [, name, rest = ''] = /^(\w+)\s*(.*)$/.exec(condition) ?? []
  if (!name) return false
  const op = OPERATOR.exec(rest)?.[1] ?? ''
  const arg = rest.slice(OPERATOR.exec(rest)?.[0].length ?? 0)

  if (name === 'BaseType' || name === 'Class') {
    const actual = name === 'BaseType' ? item.baseType : item.itemClass
    const list = values(arg)
    const hit = op === '==' ? list.includes(actual) : list.some((v) => actual.includes(v))
    return op === '!=' ? !list.includes(actual) : hit
  }
  if (name === 'Rarity') {
    const rank = RARITY_ORDER.indexOf(item.rarity)
    const list = values(arg) as ItemRarity[]
    if (op && op !== '=' && op !== '==') return list.length === 1 && compare(rank, op, RARITY_ORDER.indexOf(list[0]))
    return list.includes(item.rarity)
  }
  if (name === 'HasExplicitMod') {
    // Наш приём «>=N "a" "o" …»: любое свойство содержит гласную, поэтому это просто «не меньше N свойств».
    const count = /^(\d+)/.exec(arg)
    return count ? compare(item.explicitMods, op || '>=', Number(count[1])) : false
  }
  if (name in BOOLEAN) return BOOLEAN[name](item) === (arg.trim() === 'True')
  if (name in NUMERIC) {
    const actual = NUMERIC[name](item, area)
    return actual !== undefined && compare(actual, op, Number(arg))
  }
  return false
}

export interface Appearance {
  /** null — предмет скрыт. */
  visible: boolean
  style: TierStyle
  /** Блок, решивший судьбу предмета; null — ни один не подошёл, игра показывает как обычно. */
  block: FilterBlock | null
}

const rgb = (r: number, g: number, b: number, a = 255): Rgba => ({ r, g, b, a })

/** Вид по умолчанию, как в игре без фильтра: цвет текста зависит от редкости и рода предмета. */
export function defaultStyle(item: DroppedItem): TierStyle {
  const text =
    item.itemClass === 'Stackable Currency' || item.baseType === 'Gold'
      ? rgb(170, 158, 130)
      : /Gems?$/.test(item.itemClass)
        ? rgb(27, 162, 155)
        : { Normal: rgb(200, 200, 200), Magic: rgb(136, 136, 255), Rare: rgb(255, 255, 119), Unique: rgb(175, 96, 37) }[item.rarity]
  return { fontSize: 32, text, border: null, background: rgb(0, 0, 0, 240), sound: null, effect: null, icon: null }
}

function color(args: string[]): Rgba {
  const [r, g, b, a = 255] = args.map(Number)
  return rgb(r, g, b, a)
}

/** Действия блока поверх уже набранного вида (с Continue блоки складываются). */
function applyActions(style: TierStyle, actions: string[]): TierStyle {
  const next = { ...style }
  for (const action of actions) {
    const [name, ...args] = action.split(/\s+/)
    if (name === 'SetFontSize') next.fontSize = Number(args[0])
    else if (name === 'SetTextColor') next.text = color(args)
    else if (name === 'SetBorderColor') next.border = color(args)
    else if (name === 'SetBackgroundColor') next.background = color(args)
    else if (name === 'PlayAlertSound') next.sound = { id: Number(args[0]), volume: Number(args[1] ?? 300) }
    else if (name === 'PlayEffect') next.effect = args[0] === 'None' ? null : { color: args[0], temp: args[1] === 'Temp' }
    else if (name === 'MinimapIcon') next.icon = Number(args[0]) < 0 ? null : { size: Number(args[0]) as 0 | 1 | 2, color: args[1], shape: args[2] }
  }
  return next
}

/** Как фильтр покажет предмет: первый подошедший блок без Continue решает, блоки с Continue только добавляют оформление. */
export function evaluate(blocks: FilterBlock[], item: DroppedItem, area: number): Appearance {
  let style = defaultStyle(item)
  let last: FilterBlock | null = null
  for (const block of blocks) {
    if (!block.conditions.every((condition) => matchCondition(condition, item, area))) continue
    style = applyActions(style, block.actions)
    last = block
    if (!block.continues) return { visible: block.action !== 'Hide', style, block }
  }
  // Последний подошедший блок с Continue тоже решает, показывать ли предмет.
  return { visible: last ? last.action !== 'Hide' : true, style, block: last }
}

/** Роль блока для предмета: решает, добавляет оформление, подходит, но решение уже принято выше, или почти подошёл. */
export type BlockRole = 'decisive' | 'decorator' | 'unreached' | 'near'

export interface TraceEntry {
  block: FilterBlock
  role: BlockRole
  /** Невыполненные условия — только у «почти подошедших». */
  failed: string[]
}

/** Условия, которые говорят «про этот предмет»: если они выполнены, а другие нет — блок «почти подошёл». */
const IDENTITY = /^(BaseType|Class)\b/

/**
 * Все блоки, которые касаются предмета: оформление с Continue, решающий блок, подходящие блоки ниже решающего
 * (до них игра не дойдёт) и блоки для того же предмета, где не выполнено какое-то другое условие.
 */
export function trace(blocks: FilterBlock[], item: DroppedItem, area: number): TraceEntry[] {
  const out: TraceEntry[] = []
  let decided = false
  for (const block of blocks) {
    const failed = block.conditions.filter((condition) => !matchCondition(condition, item, area))
    if (failed.length === 0) {
      out.push({ block, role: decided ? 'unreached' : block.continues ? 'decorator' : 'decisive', failed })
      if (!block.continues) decided = true
      continue
    }
    // «Почти»: предмет назван в блоке по имени или классу, и не выполнено что-то кроме этого.
    const identity = block.conditions.filter((condition) => IDENTITY.test(condition))
    if (identity.length > 0 && failed.every((condition) => !IDENTITY.test(condition))) out.push({ block, role: 'near', failed })
  }
  return out
}
