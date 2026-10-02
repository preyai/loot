import catalog from './data/bases.json'
import { RARITIES, type BaseRule } from './types'

export type BaseGroup = 'weapon' | 'armour' | 'jewellery'

export interface BaseInfo {
  name: string
  /** Уровень, с которого база начинает выпадать. */
  drop: number
  /** Защита базы: a — броня, e — уклонение, s — энергощит. */
  defence?: string
}

export interface BaseClass {
  /** Имя класса, как его понимает условие Class в фильтре. */
  name: string
  group: BaseGroup
  bases: BaseInfo[]
}

/** Справочник собирается скриптом scripts/update-bases.mjs. */
export const BASE_CLASSES = catalog as BaseClass[]

export const BASE_GROUPS: { id: BaseGroup; title: string }[] = [
  { id: 'weapon', title: 'Оружие' },
  { id: 'armour', title: 'Броня' },
  { id: 'jewellery', title: 'Бижутерия' },
]

export const classNames = (...groups: BaseGroup[]) => BASE_CLASSES.filter((c) => groups.includes(c.group)).map((c) => c.name)

/** Оружие и броня — то, что скрывает правило «обычные и магические предметы». */
export const GEAR_CLASSES = classNames('weapon', 'armour')

/** Классы, к которым относятся перечисленные базы. */
export function classesOf(bases: string[]): string[] {
  const wanted = new Set(bases)
  return BASE_CLASSES.filter((c) => c.bases.some((b) => wanted.has(b.name))).map((c) => c.name)
}

/** Старшие базы класса: в пределах этого числа уровней выпадения от лучшей. */
const TOP_BASE_WINDOW = 5

export function topBases(classes: string[]): string[] {
  return BASE_CLASSES.filter((c) => classes.includes(c.name)).flatMap((c) => {
    const best = Math.max(...c.bases.map((b) => b.drop))
    return c.bases.filter((b) => b.drop >= best - TOP_BASE_WINDOW).map((b) => b.name)
  })
}

export const EMPTY_RULE: Omit<BaseRule, 'id' | 'name'> = {
  enabled: true,
  action: 'show',
  classes: [],
  bases: [],
  rarities: [...RARITIES],
  minItemLevel: 0,
  minQuality: 0,
  minSockets: 0,
  minUnidentifiedTier: 0,
  minAreaLevel: 0,
  excludeCorrupted: false,
  tier: 'C',
}

const RARITY_WORDS = { Normal: 'обычные', Magic: 'магические', Rare: 'редкие' } as const

/** Правило одной строкой, как его прочёл бы человек. */
export function describeRule(rule: BaseRule): string {
  const all = rule.rarities.length === 0 || rule.rarities.length === RARITIES.length
  const scope = rule.bases.length
    ? `баз: ${rule.bases.length}`
    : rule.classes.length === 0
      ? 'классы не выбраны'
      : rule.classes.length <= 3
        ? rule.classes.join(', ')
        : `классов: ${rule.classes.length}`
  return [
    all ? 'любая редкость' : rule.rarities.map((r) => RARITY_WORDS[r]).join(' и '),
    scope,
    rule.minItemLevel > 0 && `ур. предмета ${rule.minItemLevel}+`,
    rule.minQuality > 0 && `качество ${rule.minQuality}%+`,
    rule.minSockets > 0 && `гнёзд ${rule.minSockets}+`,
    rule.minUnidentifiedTier > 0 && `ступень свойств ${rule.minUnidentifiedTier}+`,
    rule.excludeCorrupted && 'не осквернённые',
    rule.minAreaLevel > 0 && `с уровня области ${rule.minAreaLevel}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** С какой доли персонажей база считается популярной. */
export const POPULAR_SHARE = 0.03

export function popularBases(classes: string[], shares: Record<string, number>, minShare: number): string[] {
  return BASE_CLASSES.filter((c) => classes.includes(c.name)).flatMap((c) =>
    c.bases.filter((b) => (shares[b.name] ?? 0) >= minShare).map((b) => b.name),
  )
}

export function popularRule(shares: Record<string, number>): Omit<BaseRule, 'id'> {
  const classes = BASE_CLASSES.filter((c) => c.bases.some((b) => (shares[b.name] ?? 0) >= POPULAR_SHARE)).map((c) => c.name)
  return {
    ...EMPTY_RULE,
    name: 'Популярные базы, ур. предмета 82+',
    classes,
    bases: popularBases(classes, shares, POPULAR_SHARE),
    rarities: ['Normal', 'Magic'],
    minItemLevel: 82,
  }
}

export const RULE_TEMPLATES: { title: string; make: () => Omit<BaseRule, 'id'> }[] = [
  {
    title: 'Топовые базы, ур. предмета 82+',
    make: () => ({
      ...EMPTY_RULE,
      name: 'Топовые базы, ур. предмета 82+',
      classes: GEAR_CLASSES,
      bases: topBases(GEAR_CLASSES),
      rarities: ['Normal', 'Magic'],
      minItemLevel: 82,
    }),
  },
  {
    title: 'Качество 20%+',
    make: () => ({ ...EMPTY_RULE, name: 'Качество 20%+', classes: GEAR_CLASSES, minQuality: 20 }),
  },
  {
    title: 'Гнёзда: 2+',
    make: () => ({ ...EMPTY_RULE, name: 'Гнёзда: 2+', classes: GEAR_CLASSES, minSockets: 2, tier: 'D' }),
  },
  {
    title: 'Редкая бижутерия',
    make: () => ({ ...EMPTY_RULE, name: 'Редкая бижутерия', classes: classNames('jewellery'), rarities: ['Rare'] }),
  },
  { title: 'Пустое правило', make: () => ({ ...EMPTY_RULE, name: 'Новое правило' }) },
]
