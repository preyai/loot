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

function gear(area: number, random: Random): DroppedItem & { label: string } {
  // Базы, которые уже выпадают на этом уровне области.
  const bases = BASE_CLASSES.flatMap((c) => c.bases.filter((b) => b.drop <= Math.max(area, 1)).map((b) => ({ c, b })))
  const { c, b } = pick(bases.length ? bases : BASE_CLASSES.flatMap((c) => c.bases.map((b) => ({ c, b }))), random)
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

function market(items: MarketItem[], random: Random): DroppedItem & { label: string } {
  // Дешёвое падает чаще дорогого; у предметов без цены — средний шанс.
  const item = weighted(items, (i) => 1 / Math.sqrt(Math.max(i.divine ?? 0.05, 0.0005)), random)
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

function unique(items: MarketItem[], random: Random): DroppedItem & { label: string } {
  const item = weighted(items, (i) => 1 / Math.sqrt(Math.max(i.divine ?? 0.05, 0.0005)), random)
  const base = BASE_CLASS.get(item.name)
  return {
    ...blank({ itemClass: base?.itemClass ?? 'Unique', baseType: item.name, dropLevel: base?.drop ?? 1 }),
    label: item.name,
    rarity: 'Unique',
    explicitMods: between(3, 6, random),
  }
}

function waystone(area: number, random: Random): DroppedItem & { label: string } {
  const tier = Math.max(1, Math.min(16, area - 64 + between(-2, 2, random)))
  const rarity = weighted<ItemRarity>(['Normal', 'Magic', 'Rare'], (r) => ({ Normal: 4, Magic: 3, Rare: 3, Unique: 0 })[r], random)
  const corrupted = chance(0.1, random)
  return {
    ...blank({ itemClass: 'Waystones', baseType: `Waystone (Tier ${tier})` }),
    label: `Waystone (Tier ${tier})`,
    rarity,
    waystoneTier: tier,
    itemLevel: area,
    corrupted,
    enchanted: chance(0.03, random),
    explicitMods: corrupted && chance(0.3, random) ? between(7, 8, random) : between(...MODS[rarity], random),
  }
}

function gold(area: number, random: Random): DroppedItem & { label: string } {
  const stack = Math.max(1, Math.round((20 + area * area * 0.3) * (0.3 + random() * 2.7)))
  return { ...blank({ itemClass: 'Gold', baseType: 'Gold' }), label: 'Gold', stackSize: stack }
}

const RELICS = ['Amphora Relic', 'Coffer Relic', 'Incense Relic', 'Seal Relic', 'Tapestry Relic', 'Urn Relic', 'Vase Relic']

function trial(area: number, random: Random): DroppedItem & { label: string } {
  const kind = pick(['Djinn Barya', 'Inscribed Ultimatum', 'relic'], random)
  if (kind === 'relic') {
    const name = pick(RELICS, random)
    return { ...blank({ itemClass: 'Relics', baseType: name }), label: name, rarity: chance(0.5, random) ? 'Magic' : 'Normal', itemLevel: area }
  }
  return {
    ...blank({ itemClass: 'Map Fragments', baseType: kind }),
    label: kind,
    itemLevel: Math.max(1, area + between(-3, 3, random)),
    rarity: kind === 'Inscribed Ultimatum' && chance(0.2, random) ? 'Magic' : 'Normal',
  }
}

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

export function generateLoot(snapshotItems: MarketItem[], area: number, count: number, random: Random = Math.random): SimulatedItem[] {
  const marketItems = snapshotItems.filter((i) => !i.uniques)
  const uniqueItems = snapshotItems.filter((i) => i.uniques)
  const table = kinds(area).filter(([kind, weight]) => weight > 0 && (kind !== 'market' || marketItems.length) && (kind !== 'unique' || uniqueItems.length))
  return Array.from({ length: count }, (_, id) => {
    const [kind] = weighted(table, ([, w]) => w, random)
    const item =
      kind === 'gold'
        ? gold(area, random)
        : kind === 'market'
          ? market(marketItems, random)
          : kind === 'unique'
            ? unique(uniqueItems, random)
            : kind === 'waystone'
              ? waystone(area, random)
              : kind === 'trial'
                ? trial(area, random)
                : gear(area, random)
    return { ...item, id }
  })
}
