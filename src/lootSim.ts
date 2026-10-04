import { BASE_CLASSES } from './bases'
import type { DroppedItem, ItemRarity } from './filterEval'
import type { MarketItem, SectionId } from './types'

/**
 * Случайный лут для предпросмотра фильтра. Это не модель выпадения игры: доли и разбросы подобраны так,
 * чтобы на экране было всего понемногу и было видно, как фильтр обходится с каждым родом предметов.
 */

export interface SimulatedItem extends DroppedItem {
  id: number
  /** Английское название для подписи (на экране — перевод). */
  label: string
}

export type Random = () => number

const pick = <T,>(list: T[], random: Random): T => list[Math.floor(random() * list.length)]
const between = (min: number, max: number, random: Random) => min + Math.floor(random() * (max - min + 1))
const chance = (p: number, random: Random) => random() < p

function weighted<T>(list: T[], weight: (item: T) => number, random: Random): T {
  const total = list.reduce((sum, item) => sum + weight(item), 0)
  let roll = random() * total
  for (const item of list) {
    roll -= weight(item)
    if (roll <= 0) return item
  }
  return list[list.length - 1]
}

/** Класс предмета рынка, как его видит условие Class в фильтре. */
const SECTION_CLASS: Partial<Record<SectionId, string>> = {
  fragments: 'Map Fragments',
  runes: 'Augment',
  soulcores: 'Augment',
  idols: 'Augment',
  lineage: 'Support Gems',
  gems: 'Uncut Skill Gems',
  tablets: 'Tablet',
}

const BASE_CLASS = new Map(BASE_CLASSES.flatMap((c) => c.bases.map((b) => [b.name, { itemClass: c.name, drop: b.drop }] as const)))

const blank = (fields: Partial<DroppedItem> & Pick<DroppedItem, 'itemClass' | 'baseType'>): DroppedItem => ({
  rarity: 'Normal',
  itemLevel: 1,
  quality: 0,
  sockets: 0,
  stackSize: 1,
  unidentifiedTier: 0,
  corrupted: false,
  mirrored: false,
  enchanted: false,
  twiceCorrupted: false,
  explicitMods: 0,
  dropLevel: 1,
  ...fields,
})

function gearRarity(random: Random): ItemRarity {
  const roll = random()
  return roll < 0.5 ? 'Normal' : roll < 0.88 ? 'Magic' : 'Rare'
}

const MODS: Record<ItemRarity, [number, number]> = { Normal: [0, 0], Magic: [1, 2], Rare: [3, 6], Unique: [3, 6] }

type Drop = DroppedItem & { label: string }
type Base = { c: (typeof BASE_CLASSES)[number]; b: (typeof BASE_CLASSES)[number]['bases'][number] }

function gearDrop({ c, b }: Base, area: number, random: Random): Drop {
  const rarity = gearRarity(random)
  const corrupted = chance(0.03, random)
  return {
    ...blank({ itemClass: c.name, baseType: b.name, dropLevel: b.drop }),
    label: b.name,
    rarity,
    itemLevel: Math.max(1, Math.min(86, area + between(-2, 3, random))),
    quality: chance(rarity === 'Rare' ? 0.05 : 0.12, random) ? between(1, 20, random) : 0,
    sockets: chance(0.08, random) ? (chance(0.15, random) ? between(2, 3, random) : 1) : 0,
    unidentifiedTier: rarity === 'Rare' ? weighted([1, 2, 3, 4, 5], (t) => [40, 30, 18, 9, 3][t - 1], random) : 0,
    corrupted,
    enchanted: corrupted && chance(0.3, random),
    explicitMods: between(...MODS[rarity], random),
  }
}

function marketDrop(item: MarketItem, random: Random): Drop {
  const price = item.divine ?? 0.05
  const gem = /^(Uncut \w+ Gem) \(Level (\d+)\)$/.exec(item.name)
  const itemClass = item.name.startsWith('Omen') ? 'Omen' : (SECTION_CLASS[item.section] ?? 'Stackable Currency')
  const stackable = itemClass === 'Stackable Currency' || itemClass === 'Omen'
  return {
    ...blank({ itemClass, baseType: gem ? gem[1] : item.name }),
    label: item.name,
    gemLevel: gem ? Number(gem[2]) : undefined,
    rarity: item.section === 'tablets' ? gearRarity(random) : 'Normal',
    stackSize: stackable && price < 0.02 ? between(1, 12, random) : stackable && price < 0.2 ? between(1, 3, random) : 1,
  }
}

function uniqueDrop(item: MarketItem, random: Random): Drop {
  const base = BASE_CLASS.get(item.name)
  return {
    ...blank({ itemClass: base?.itemClass ?? 'Unique', baseType: item.name, dropLevel: base?.drop ?? 1 }),
    label: item.name,
    rarity: 'Unique',
    explicitMods: between(3, 6, random),
  }
}

const waystoneName = (tier: number) => `Waystone (Tier ${tier})`

function waystoneDrop(tier: number, area: number, random: Random): Drop {
  const rarity = weighted<ItemRarity>(['Normal', 'Magic', 'Rare'], (r) => ({ Normal: 4, Magic: 3, Rare: 3, Unique: 0 })[r], random)
  const corrupted = chance(0.1, random)
  return {
    ...blank({ itemClass: 'Waystones', baseType: waystoneName(tier) }),
    label: waystoneName(tier),
    rarity,
    waystoneTier: tier,
    itemLevel: area,
    corrupted,
    enchanted: chance(0.03, random),
    explicitMods: corrupted && chance(0.3, random) ? between(7, 8, random) : between(...MODS[rarity], random),
  }
}

function goldDrop(area: number, random: Random): Drop {
  const stack = Math.max(1, Math.round((20 + area * area * 0.3) * (0.3 + random() * 2.7)))
  return { ...blank({ itemClass: 'Gold', baseType: 'Gold' }), label: 'Gold', stackSize: stack }
}

const RELICS = ['Amphora Relic', 'Coffer Relic', 'Incense Relic', 'Seal Relic', 'Tapestry Relic', 'Urn Relic', 'Vase Relic']
const TRIAL_KEYS = ['Djinn Barya', 'Inscribed Ultimatum']

const relicDrop = (name: string, area: number, random: Random): Drop => ({
  ...blank({ itemClass: 'Relics', baseType: name }),
  label: name,
  rarity: chance(0.5, random) ? 'Magic' : 'Normal',
  itemLevel: area,
})

const trialKeyDrop = (name: string, area: number, random: Random): Drop => ({
  ...blank({ itemClass: 'Map Fragments', baseType: name }),
  label: name,
  itemLevel: Math.max(1, area + between(-3, 3, random)),
  rarity: name === 'Inscribed Ultimatum' && chance(0.2, random) ? 'Magic' : 'Normal',
})

/** Доли родов лута: в картах добавляются путевые камни и плитки. */
function kinds(area: number): [string, number][] {
  const maps = area >= 65
  return [
    ['gold', 20],
    ['gear', maps ? 40 : 50],
    ['market', 22],
    ['unique', 3],
    ['waystone', maps ? 6 : 0],
    ['trial', 3],
  ]
}

/** Шаблон предмета для поиска: английские названия, по которым его можно найти, и как его создать. */
export interface LootTemplate {
  /** Первое — название предмета; дальше — другие имена (у базы уника — сами уники). */
  names: string[]
  make: (random: Random) => Drop
}

const ALL_BASES: Base[] = BASE_CLASSES.flatMap((c) => c.bases.map((b) => ({ c, b })))

/** Всё, что умеет создавать генератор, — для лута «только с таким названием». */
export function lootTemplates(snapshotItems: MarketItem[], area: number): LootTemplate[] {
  return [
    { names: ['Gold'], make: (r) => goldDrop(area, r) },
    ...snapshotItems.filter((i) => !i.uniques).map((item) => ({ names: [item.name], make: (r: Random) => marketDrop(item, r) })),
    ...snapshotItems
      .filter((i) => i.uniques)
      .map((item) => ({ names: [item.name, ...(item.uniques ?? []).map((u) => u.name)], make: (r: Random) => uniqueDrop(item, r) })),
    ...ALL_BASES.map((base) => ({ names: [base.b.name], make: (r: Random) => gearDrop(base, area, r) })),
    ...Array.from({ length: 16 }, (_, i) => ({ names: [waystoneName(i + 1)], make: (r: Random) => waystoneDrop(i + 1, area, r) })),
    ...RELICS.map((name) => ({ names: [name], make: (r: Random) => relicDrop(name, area, r) })),
    ...TRIAL_KEYS.map((name) => ({ names: [name], make: (r: Random) => trialKeyDrop(name, area, r) })),
  ]
}

/**
 * Случайный лут. С match — только предметы, у которых подходит хоть одно название
 * (поиск по имени: «ключ реликвария» — одни ключи); каждый подходящий вариант равновероятен.
 */
export function generateLoot(
  snapshotItems: MarketItem[],
  area: number,
  count: number,
  random: Random = Math.random,
  match?: (name: string) => boolean,
): SimulatedItem[] {
  if (match) {
    const pool = lootTemplates(snapshotItems, area).filter((template) => template.names.some(match))
    if (pool.length === 0) return []
    return Array.from({ length: count }, (_, id) => ({ ...pick(pool, random).make(random), id }))
  }

  const marketItems = snapshotItems.filter((i) => !i.uniques)
  const uniqueItems = snapshotItems.filter((i) => i.uniques)
  // Базы, которые уже выпадают на этом уровне области.
  const bases = ALL_BASES.filter(({ b }) => b.drop <= Math.max(area, 1))
  // Дешёвое падает чаще дорогого; у предметов без цены — средний шанс.
  const byPrice = (i: MarketItem) => 1 / Math.sqrt(Math.max(i.divine ?? 0.05, 0.0005))
  const table = kinds(area).filter(
    ([kind, weight]) => weight > 0 && (kind !== 'market' || marketItems.length) && (kind !== 'unique' || uniqueItems.length),
  )

  return Array.from({ length: count }, (_, id) => {
    const [kind] = weighted(table, ([, w]) => w, random)
    const item =
      kind === 'gold'
        ? goldDrop(area, random)
        : kind === 'market'
          ? marketDrop(weighted(marketItems, byPrice, random), random)
          : kind === 'unique'
            ? uniqueDrop(weighted(uniqueItems, byPrice, random), random)
            : kind === 'waystone'
              ? waystoneDrop(Math.max(1, Math.min(16, area - 64 + between(-2, 2, random))), area, random)
              : kind === 'trial'
                ? chance(1 / 3, random)
                  ? relicDrop(pick(RELICS, random), area, random)
                  : trialKeyDrop(pick(TRIAL_KEYS, random), area, random)
                : gearDrop(pick(bases.length ? bases : ALL_BASES, random), area, random)
    return { ...item, id }
  })
}
