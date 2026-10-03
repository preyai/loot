import { BASE_CLASSES, classesOf, classNames, EMPTY_RULE, GEAR_CLASSES, POPULAR_SHARE, popularBases, topBases } from './bases'
import type { T } from './i18n'
import type { BaseRule, Config, TierId } from './types'

type Draft = Omit<BaseRule, 'id'>

const known = (names: string[]) => names.filter((n) => BASE_CLASSES.some((c) => c.name === n))

// У этих классов обычно два гнезда, у остальных одно — больше бывает только у исключительных вещей.
const TWO_SOCKET_CLASSES = known(['Body Armours', 'Bows', 'Crossbows', 'Quarterstaves', 'Staves', 'Talismans', 'Two Hand Maces'])
const ONE_SOCKET_CLASSES = known([
  'Boots', 'Bucklers', 'Foci', 'Gloves', 'Helmets', 'One Hand Maces', 'Sceptres', 'Shields', 'Spears', 'Wands',
])
const JEWELLERY = classNames('jewellery')

/** Кирпичики, из которых собраны наборы. Слои повторяют устройство фильтра NeverSink. */
function blocks(shares: Record<string, number> | null, t: T) {
  // Популярность с poe.ninja могла не загрузиться — тогда «хорошими» считаем старшие базы каждого класса.
  const good = shares ? popularBases(GEAR_CLASSES, shares, POPULAR_SHARE) : topBases(GEAR_CLASSES)
  const onGood = { classes: classesOf(good), bases: good }
  const rule = (name: string, fields: Partial<Draft>): Draft => ({ ...EMPTY_RULE, name, ...fields })

  return {
    sockets3: rule(t('rule.sockets3'), { classes: TWO_SOCKET_CLASSES, minSockets: 3, excludeCorrupted: true, tier: 'A' }),
    sockets2: rule(t('rule.sockets2'), { classes: ONE_SOCKET_CLASSES, minSockets: 2, excludeCorrupted: true, tier: 'B' }),
    quality27: rule(t('rule.quality27'), { ...onGood, minQuality: 27, excludeCorrupted: true, tier: 'A' }),
    quality21: rule(t('rule.quality21'), { classes: GEAR_CLASSES, minQuality: 21, excludeCorrupted: true, tier: 'C' }),
    quality21Good: rule(t('rule.quality21Good'), { ...onGood, minQuality: 21, excludeCorrupted: true, tier: 'C' }),
    rareTier: (min: number, tier: TierId) =>
      rule(t('rule.rareTier', { n: min }), { ...onGood, rarities: ['Rare'], minUnidentifiedTier: min, tier }),
    rareJewellery: (min: number, tier: TierId) =>
      rule(min ? t('rule.rareJewelleryTier', { n: min }) : t('rule.rareJewellery'), {
        classes: JEWELLERY,
        rarities: ['Rare'],
        minUnidentifiedTier: min,
        tier,
      }),
    crafting: (tier: TierId) =>
      rule(t('rule.crafting'), { ...onGood, rarities: ['Normal', 'Magic'], minItemLevel: 82, excludeCorrupted: true, tier }),
    rare82: rule(t('rule.rare82'), { ...onGood, rarities: ['Rare'], minItemLevel: 82, tier: 'D' }),
    hideRares: rule(t('rule.hideRares'), { action: 'hide', classes: GEAR_CLASSES, rarities: ['Rare'], minAreaLevel: 75 }),
  }
}

/** Последний уровень области кампании: с 65-го начинаются карты. */
const CAMPAIGN_END = 64
const FLASKS_AND_CHARMS = known(['Life Flasks', 'Mana Flasks', 'Charms'])

/** Правила для кампании — по разделу «Leveling» фильтра NeverSink. В картах они не действуют. */
function levelingRules(t: T): Draft[] {
  const rule = (name: string, fields: Partial<Draft>): Draft => ({ ...EMPTY_RULE, name, maxAreaLevel: CAMPAIGN_END, ...fields })
  const everything = [...GEAR_CLASSES, ...JEWELLERY]
  return [
    rule(t('rule.levelingRareJewellery'), { classes: JEWELLERY, rarities: ['Rare'], tier: 'B' }),
    rule(t('rule.levelingRareTier', { n: 4 }), { classes: GEAR_CLASSES, rarities: ['Rare'], minUnidentifiedTier: 4, tier: 'B' }),
    rule(t('rule.levelingRareTier', { n: 3 }), { classes: GEAR_CLASSES, rarities: ['Rare'], minUnidentifiedTier: 3, tier: 'C' }),
    rule(t('rule.levelingRare'), { classes: GEAR_CLASSES, rarities: ['Rare'], tier: 'D' }),
    // Скорость передвижения на ранних сапогах — главное, что ищут в начале кампании.
    rule(t('rule.levelingBoots'), { classes: known(['Boots']), rarities: ['Magic'], maxAreaLevel: 32, tier: 'C' }),
    rule(t('rule.levelingJewellery'), { classes: JEWELLERY, rarities: ['Normal', 'Magic'], tier: 'D' }),
    rule(t('rule.levelingFlasks'), { classes: FLASKS_AND_CHARMS, rarities: ['Normal', 'Magic'], tier: 'D' }),
    rule(t('rule.levelingQuality'), { classes: everything, rarities: ['Normal', 'Magic'], minQuality: 1, tier: 'E' }),
    rule(t('rule.levelingSockets'), { classes: everything, rarities: ['Normal', 'Magic'], minSockets: 1, tier: 'E' }),
  ]
}

export type PresetId = 'leveling' | 'soft' | 'balanced' | 'strict'

/** Заголовок, описание и список «что входит» набора — в словаре: «preset.<id>.title / summary / details». */
export interface RulePreset {
  id: PresetId
  /** Скрывать ли обычные и магические оружие и броню, не попавшие под правила. */
  hideLowRarity: boolean
  /** Названия правил создаются на языке интерфейса в момент применения набора. */
  make: (shares: Record<string, number> | null, t: T) => Draft[]
}

export const RULE_PRESETS: RulePreset[] = [
  {
    id: 'leveling',
    hideLowRarity: false,
    make: (_shares, t) => levelingRules(t),
  },
  {
    id: 'soft',
    hideLowRarity: false,
    make: (shares, t) => {
      const b = blocks(shares, t)
      return [
        b.sockets3,
        b.sockets2,
        b.quality27,
        b.quality21,
        b.rareTier(4, 'B'),
        b.rareTier(3, 'C'),
        b.rareTier(2, 'D'),
        b.rareJewellery(0, 'C'),
        b.crafting('C'),
        b.rare82,
      ]
    },
  },
  {
    id: 'balanced',
    hideLowRarity: true,
    make: (shares, t) => {
      const b = blocks(shares, t)
      return [
        b.sockets3,
        b.sockets2,
        b.quality27,
        b.quality21,
        b.rareTier(4, 'B'),
        b.rareTier(3, 'C'),
        b.rareJewellery(0, 'C'),
        b.crafting('D'),
        b.rare82,
      ]
    },
  },
  {
    id: 'strict',
    hideLowRarity: true,
    make: (shares, t) => {
      const b = blocks(shares, t)
      return [b.sockets3, b.sockets2, b.quality27, b.quality21Good, b.rareTier(4, 'B'), b.rareTier(3, 'C'), b.rareJewellery(3, 'C'), b.hideRares]
    },
  },
]

/**
 * Заменяет правила баз набором; уровень области для скрытия остаётся тем, что выбрал пользователь.
 * Правила, созданные опросом трейда, сохраняются и остаются первыми.
 * Правило под шансинг (если для него нашлись базы) входит в каждый набор и идёт перед остальными:
 * от набора оно не зависит, а белая база под дорогой уник важнее общих правил.
 */
export function applyPreset(
  config: Config,
  preset: RulePreset,
  shares: Record<string, number> | null,
  t: T,
  chancing: Draft | null = null,
): Config {
  const rules = [...(chancing ? [chancing] : []), ...preset.make(shares, t)]
  return {
    ...config,
    baseRules: [
      ...config.baseRules.filter((rule) => rule.source === 'trade'),
      ...rules.map((rule) => ({ ...rule, id: crypto.randomUUID() })),
    ],
    gear: { ...config.gear, hideLowRarity: preset.hideLowRarity },
  }
}
