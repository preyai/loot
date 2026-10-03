import type { ExtraChoice } from './types'

/**
 * Правила для предметов, которых нет на рынке poe.ninja: флаконы, талисманы, самоцветы, реликвии,
 * камни умений, ключи и испытания, редкие базы. Условия — по разделам фильтра NeverSink.
 * Подпись правила — в словаре: «extra.<группа>.<правило>», группы — «extraGroup.<группа>».
 */
export interface ExtraRule {
  id: string
  /** Блоки фильтра с одинаковым оформлением; каждый — набор условий. */
  blocks: string[][]
  /** Тир по умолчанию или скрытие. */
  tier: ExtraChoice
  /** Английское название предмета для образца плашки; без него на плашке — подпись правила. */
  sample?: string
}

export interface ExtraGroup {
  id: string
  rules: ExtraRule[]
}

const NORMAL_MAGIC = 'Rarity Normal Magic'
const NOT_CORRUPTED = ['Corrupted False', 'Mirrored False']
const MAPS = 'AreaLevel >= 65'
const CAMPAIGN = 'AreaLevel <= 64'
const FLASKS = 'Class == "Life Flasks" "Mana Flasks"'
const ULTIMATE_FLASKS = 'BaseType == "Ultimate Life Flask" "Ultimate Mana Flask"'
const CHARMS = 'Class == "Charms"'
const TOP_CHARMS =
  'BaseType == "Amethyst Charm" "Antidote Charm" "Dousing Charm" "Golden Charm" "Grounding Charm" "Stone Charm" "Thawing Charm"'
const JEWELS = 'Class == "Jewels"'
const GEMS = 'Class == "Skill Gems" "Support Gems"'
// Почти любое свойство содержит гласную, поэтому «N свойств с гласной» — это просто N+ свойств. Приём NeverSink.
const mods = (n: number) => `HasExplicitMod >=${n} "a" "o" "e" "u" "i" "y"`
const levels = (from: number | null, to: number | null) => [
  ...(from !== null ? [`ItemLevel >= ${from}`] : []),
  ...(to !== null ? [`ItemLevel <= ${to}`] : []),
]

// Флаконы прокачки: размер и уровень области, до которого он ещё актуален.
const LEVELING_FLASKS: [string, number][] = [
  ['Medium', 9],
  ['Greater', 15],
  ['Grand', 22],
  ['Giant', 29],
  ['Colossal', 39],
  ['Gargantuan', 49],
  ['Transcendent', 59],
  ['Ultimate', 65],
]
// Устаревшие флаконы: размеры и уровень области, с которого они уже не нужны.
const OUTDATED_FLASKS: [string, number][] = [
  ['"Lesser" "Medium"', 15],
  ['"Grand" "Greater"', 30],
  ['"Colossal" "Giant"', 42],
  ['"Gargantuan"', 52],
  ['"Transcendent"', 62],
]

export const EXTRA_GROUPS: ExtraGroup[] = [
  {
    id: 'exotic',
    rules: [
      {
        id: 'super',
        tier: 'A',
        sample: 'Heartwood Shortbow',
        blocks: [
          [
            'Rarity Normal Magic Rare',
            'BaseType == "Aberrant Sledge" "Abyssal Signet" "Ancient Gauntlets" "Ancient Leggings" "Ancient Mail" "Ancient Visor" "Diamond" "Glacial Fortress" "Heartwood Shortbow" "Ornate Ringmail" "Pearlescent Amulet" "Perching Staff" "Primal Markings" "Reflecting Staff" "Runic Fork" "Sacrificial Regalia" "Tenebrous Crown" "Time-Lost Diamond" "Twisted Wand" "Two-Stone Ring" "Venerable Defender" "Veridical Chain" "Warding Quarterstaff"',
          ],
        ],
      },
      {
        id: 'kalandra',
        tier: 'B',
        sample: 'Dusk Ring',
        blocks: [
          [
            'Rarity Normal Magic Rare',
            'BaseType == "Dusk Amulet" "Dusk Ring" "Gloam Amulet" "Gloam Ring" "Penumbra Amulet" "Penumbra Ring" "Tenebrous Amulet" "Tenebrous Ring"',
          ],
        ],
      },
      {
        id: 'crafting',
        tier: 'C',
        sample: 'Grasping Ring',
        blocks: [
          ['Rarity Normal Magic Rare', 'BaseType == "Absent Amulet" "Grasping Mail" "Refined Breach Ring"'],
          [
            'Rarity Normal Magic Rare',
            'BaseType == "Biostatic Ring" "Corona Amulet" "Distorted Amulet" "Forking Belt" "Grasping Ring" "Invoking Belt" "Kinetic Ring" "Lament Amulet" "Mnemonic Ring" "Oneiric Ring" "Portent Amulet" "Sinew Belt" "Stalking Belt" "Twisted Amulet" "Vitalic Ring"',
          ],
        ],
      },
      { id: 'breach82', tier: 'C', sample: 'Breach Ring', blocks: [['ItemLevel >= 82', NORMAL_MAGIC, 'BaseType == "Breach Ring"']] },
      { id: 'breach', tier: 'D', sample: 'Breach Ring', blocks: [[NORMAL_MAGIC, 'BaseType == "Breach Ring"']] },
      { id: 'fishing', tier: 'B', blocks: [['Rarity Normal Magic Rare', 'Class == "Fishing Rods"']] },
    ],
  },
  {
    id: 'keys',
    rules: [
      { id: 'vault', tier: 'S', blocks: [['Class == "Vault Keys"']] },
      { id: 'pinnacle', tier: 'A', blocks: [['Class == "Pinnacle Keys"']] },
      { id: 'logbook', tier: 'A', sample: 'Expedition Logbook', blocks: [['Class == "Expedition Logbook"']] },
      { id: 'quest', tier: 'C', sample: 'Gold Key', blocks: [['Class == "Quest Items" "Instance Local Items"'], ['BaseType == "Bronze Key" "Gold Key" "Silver Key"']] },
    ],
  },
  {
    id: 'trials',
    rules: [
      { id: 'ultimatumReward', tier: 'A', sample: 'Inscribed Ultimatum', blocks: [['Rarity Magic Rare Unique', 'BaseType == "Inscribed Ultimatum"']] },
      {
        id: 'trialBarya',
        tier: 'C',
        sample: 'Test of Will Barya',
        blocks: [['BaseType == "Test of Cunning Barya" "Test of Strength Barya" "Test of Time Barya" "Test of Will Barya"']],
      },
      { id: 'barya80', tier: 'C', sample: 'Djinn Barya', blocks: [[...levels(80, null), 'BaseType == "Djinn Barya"']] },
      { id: 'barya60', tier: 'D', sample: 'Djinn Barya', blocks: [[...levels(60, 79), 'BaseType == "Djinn Barya"']] },
      { id: 'baryaLow', tier: 'E', sample: 'Djinn Barya', blocks: [[...levels(null, 59), 'BaseType == "Djinn Barya"']] },
      { id: 'ultimatum80', tier: 'C', sample: 'Inscribed Ultimatum', blocks: [[...levels(80, null), 'BaseType == "Inscribed Ultimatum"']] },
      { id: 'ultimatum75', tier: 'D', sample: 'Inscribed Ultimatum', blocks: [[...levels(75, 79), 'BaseType == "Inscribed Ultimatum"']] },
      { id: 'ultimatumLow', tier: 'E', sample: 'Inscribed Ultimatum', blocks: [[...levels(null, 74), 'BaseType == "Inscribed Ultimatum"']] },
    ],
  },
  {
    id: 'jewels',
    rules: [
      {
        id: 'timeLost',
        tier: 'A',
        sample: 'Time-Lost Ruby',
        blocks: [[JEWELS, 'Rarity <= Rare', 'BaseType == "Time-Lost Diamond" "Time-Lost Emerald" "Time-Lost Ruby" "Time-Lost Sapphire"']],
      },
      { id: 'corruptedEnchanted', tier: 'A', sample: 'Ruby', blocks: [[JEWELS, 'Rarity <= Rare', 'Corrupted True', 'AnyEnchantment True']] },
      { id: 'corrupted5', tier: 'A', sample: 'Ruby', blocks: [[JEWELS, 'Rarity <= Rare', 'Corrupted True', mods(5)]] },
      { id: 'rare', tier: 'B', sample: 'Emerald', blocks: [[JEWELS, 'Rarity Rare']] },
      { id: 'magic', tier: 'D', sample: 'Sapphire', blocks: [[JEWELS, NORMAL_MAGIC]] },
    ],
  },
  {
    id: 'relics',
    rules: [
      {
        id: 'any',
        tier: 'D',
        sample: 'Vase Relic',
        blocks: [
          [NORMAL_MAGIC, 'BaseType == "Amphora Relic" "Coffer Relic" "Incense Relic" "Seal Relic" "Tapestry Relic" "Urn Relic" "Vase Relic"'],
        ],
      },
    ],
  },
  {
    id: 'gems',
    rules: [
      { id: 'twiceTop', tier: 'S', blocks: [[GEMS, 'TwiceCorrupted True', 'Quality > 20', 'GemLevel > 20']] },
      { id: 'twice', tier: 'A', blocks: [[GEMS, 'TwiceCorrupted True']] },
      { id: 'any', tier: 'D', blocks: [[GEMS]] },
    ],
  },
  {
    id: 'flasks',
    rules: [
      {
        id: 'ultimateQuality',
        tier: 'B',
        sample: 'Ultimate Life Flask',
        blocks: [[ULTIMATE_FLASKS, NORMAL_MAGIC, 'ItemLevel >= 83', 'Quality > 10', ...NOT_CORRUPTED, MAPS]],
      },
      { id: 'ultimate', tier: 'C', sample: 'Ultimate Mana Flask', blocks: [[ULTIMATE_FLASKS, NORMAL_MAGIC, 'ItemLevel >= 83', ...NOT_CORRUPTED, MAPS]] },
      {
        id: 'outdated',
        tier: 'hide',
        sample: 'Lesser Life Flask',
        blocks: OUTDATED_FLASKS.map(([sizes, area]) => [FLASKS, 'Quality 0', `BaseType ${sizes}`, `AreaLevel >= ${area}`]),
      },
      {
        id: 'leveling',
        tier: 'D',
        sample: 'Grand Life Flask',
        blocks: LEVELING_FLASKS.map(([size, area]) => [FLASKS, `BaseType "${size}"`, `AreaLevel <= ${area}`]),
      },
      { id: 'endgameRest', tier: 'hide', sample: 'Gargantuan Life Flask', blocks: [[FLASKS, NORMAL_MAGIC, MAPS]] },
    ],
  },
  {
    id: 'charms',
    rules: [
      { id: 'quality', tier: 'A', sample: 'Golden Charm', blocks: [[CHARMS, NORMAL_MAGIC, 'ItemLevel >= 82', 'Quality >= 18', ...NOT_CORRUPTED, MAPS]] },
      { id: 'top', tier: 'B', sample: 'Stone Charm', blocks: [[CHARMS, TOP_CHARMS, NORMAL_MAGIC, 'ItemLevel >= 83', ...NOT_CORRUPTED, MAPS]] },
      { id: 'high', tier: 'C', sample: 'Ruby Charm', blocks: [[CHARMS, NORMAL_MAGIC, 'ItemLevel >= 83', ...NOT_CORRUPTED, MAPS]] },
      { id: 'withQuality', tier: 'D', sample: 'Silver Charm', blocks: [[CHARMS, NORMAL_MAGIC, 'Quality > 0', ...NOT_CORRUPTED, MAPS]] },
      { id: 'endgameRest', tier: 'E', sample: 'Ruby Charm', blocks: [[CHARMS, NORMAL_MAGIC, MAPS]] },
      { id: 'levelingTop', tier: 'D', sample: 'Stone Charm', blocks: [[CHARMS, TOP_CHARMS, NORMAL_MAGIC, CAMPAIGN]] },
      { id: 'levelingRest', tier: 'E', sample: 'Ruby Charm', blocks: [[CHARMS, NORMAL_MAGIC, CAMPAIGN]] },
    ],
  },
  {
    // Последней: ловит валюту и прочее, чего нет ни в одном разделе (новинки лиги), — поэтому громко.
    id: 'unknown',
    rules: [{ id: 'currency', tier: 'B', blocks: [['Class == "Stackable Currency" "Incubators" "Omen" "Augment"']] }],
  },
]

export const extraKey = (group: ExtraGroup, rule: ExtraRule) => `${group.id}.${rule.id}`
