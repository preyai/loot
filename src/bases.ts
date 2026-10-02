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

const classNames = (...groups: BaseGroup[]) => BASE_CLASSES.filter((c) => groups.includes(c.group)).map((c) => c.name)

/** Оружие и броня — то, что скрывает правило «обычные и магические предметы». */
export const GEAR_CLASSES = classNames('weapon', 'armour')

/** Старшие базы класса: в пределах этого числа уровней выпадения от лучшей. */
const TOP_BASE_WINDOW = 5

export function topBases(classes: string[]): string[] {
  return BASE_CLASSES.filter((c) => classes.includes(c.name)).flatMap((c) => {
    const best = Math.max(...c.bases.map((b) => b.drop))
    return c.bases.filter((b) => b.drop >= best - TOP_BASE_WINDOW).map((b) => b.name)
  })
}

const EMPTY_RULE: Omit<BaseRule, 'id' | 'name'> = {
  enabled: true,
  action: 'show',
  classes: [],
  bases: [],
  rarities: [...RARITIES],
  minItemLevel: 0,
  minQuality: 0,
  minSockets: 0,
  tier: 'C',
}

/** Белые базы оцениваются и подсвечиваются с этого уровня предмета: ниже него не выпадают лучшие свойства. */
export const BASE_PRICE_ILVL = 82

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
