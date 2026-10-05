import { BASE_CLASSES, classesOf, classNames, EMPTY_RULE, GEAR_CLASSES, POPULAR_SHARE, popularBases, topBases } from './bases'
import { GEAR_STYLES } from './gearStyles'
import { keyOf, type T } from './i18n'
import type { BaseRule, Config, Rarity, Rgba, TierId, TierStyle, Visibility } from './types'

type Draft = Omit<BaseRule, 'id'>

const known = (names: string[]) => names.filter((n) => BASE_CLASSES.some((c) => c.name === n))

// У этих классов обычно два гнезда, у остальных одно — больше бывает только у исключительных вещей.
const TWO_SOCKET_CLASSES = known(['Body Armours', 'Bows', 'Crossbows', 'Quarterstaves', 'Staves', 'Talismans', 'Two Hand Maces'])
const ONE_SOCKET_CLASSES = known([
  'Boots', 'Bucklers', 'Foci', 'Gloves', 'Helmets', 'One Hand Maces', 'Sceptres', 'Shields', 'Spears', 'Wands',
])
const JEWELLERY = classNames('jewellery')
const FLASKS = classNames('flasks')
const JEWELS = classNames('jewels')
/** Все классы справочника баз: последние правила набора должны покрыть каждый. */
const ALL_CLASSES = BASE_CLASSES.map((c) => c.name)
/** С этого уровня области начинаются карты. */
const MAPS = 65

const rgba = (r: number, g: number, b: number, a = 255): Rgba => ({ r, g, b, a })
/**
 * Неприметный вид для «всего остального»: цвет редкости, как в игре, без рамки, звука и луча.
 * Предмет попадает под правило фильтра, но выглядит почти как без фильтра.
 */
const QUIET_TEXT: Record<Rarity, Rgba> = { Normal: rgba(200, 200, 200), Magic: rgba(136, 136, 255), Rare: rgba(255, 255, 119) }
const quiet = (rarity: Rarity): TierStyle => ({
  fontSize: 30,
  text: QUIET_TEXT[rarity],
  border: null,
  background: rgba(0, 0, 0, 200),
  sound: null,
  effect: null,
  icon: null,
})

/** Кирпичики, из которых собраны наборы. Слои повторяют устройство фильтра NeverSink. */
function blocks(shares: Record<string, number> | null, t: T) {
  // Популярность с poe.ninja могла не загрузиться — тогда «хорошими» считаем старшие базы каждого класса.
  const good = shares ? popularBases(GEAR_CLASSES, shares, POPULAR_SHARE) : topBases(GEAR_CLASSES)
  const onGood = { classes: classesOf(good), bases: good }
  const rule = (name: string, fields: Partial<Draft>): Draft => ({ ...EMPTY_RULE, name, ...fields })

  return {
    // У каждого правила — своё оформление по стилям NeverSink для экипировки (gearStyles.ts):
    // так вещи на земле не путаются с валютой того же тира.
    sockets3: rule(t('rule.sockets3'), { classes: TWO_SOCKET_CLASSES, minSockets: 3, excludeCorrupted: true, tier: 'A', style: GEAR_STYLES.exceptionalTop }),
    sockets2: rule(t('rule.sockets2'), { classes: ONE_SOCKET_CLASSES, minSockets: 2, excludeCorrupted: true, tier: 'B', style: GEAR_STYLES.exceptional }),
    quality27: rule(t('rule.quality27'), { ...onGood, minQuality: 27, excludeCorrupted: true, tier: 'A', style: GEAR_STYLES.exceptionalTop }),
    quality21: rule(t('rule.quality21'), { classes: GEAR_CLASSES, minQuality: 21, excludeCorrupted: true, tier: 'C', style: GEAR_STYLES.exceptional }),
    quality21Good: rule(t('rule.quality21Good'), { ...onGood, minQuality: 21, excludeCorrupted: true, tier: 'C', style: GEAR_STYLES.exceptional }),
    rareTier: (min: number, tier: TierId) =>
      rule(t('rule.rareTier', { n: min }), {
        ...onGood,
        rarities: ['Rare'],
        minUnidentifiedTier: min,
        tier,
        style: min >= 4 ? GEAR_STYLES.exceptional : min === 3 ? GEAR_STYLES.notable : GEAR_STYLES.rare,
      }),
    rareJewellery: (min: number, tier: TierId) =>
      rule(min ? t('rule.rareJewelleryTier', { n: min }) : t('rule.rareJewellery'), {
        classes: JEWELLERY,
        rarities: ['Rare'],
        minUnidentifiedTier: min,
        tier,
        style: min ? GEAR_STYLES.jewelleryTiered : GEAR_STYLES.jewellery,
      }),
    crafting: (tier: TierId) =>
      rule(t('rule.crafting'), {
        ...onGood,
        rarities: ['Normal', 'Magic'],
        minItemLevel: 82,
        excludeCorrupted: true,
        tier,
        style: GEAR_STYLES.crafting,
      }),
    rare82: rule(t('rule.rare82'), { ...onGood, rarities: ['Rare'], minItemLevel: 82, tier: 'D', style: GEAR_STYLES.rare }),
    // У правил скрытия оформление видно только под Alt — неприметное, в цвете редкости.
    hideRares: rule(t('rule.hideRares'), { action: 'hide', classes: GEAR_CLASSES, rarities: ['Rare'], minAreaLevel: 75, style: GEAR_STYLES.hiddenRare }),
    // Флаконы, обереги и самоцветы — как в NeverSink для карт.
    flasks: rule(t('template.flasks'), {
      classes: known(['Life Flasks', 'Mana Flasks']),
      bases: ['Ultimate Life Flask', 'Ultimate Mana Flask'],
      rarities: ['Normal', 'Magic'],
      minItemLevel: 83,
      excludeCorrupted: true,
      tier: 'C',
      style: GEAR_STYLES.flasks,
    }),
    charms: rule(t('template.charms'), {
      classes: known(['Charms']),
      rarities: ['Normal', 'Magic'],
      minItemLevel: 83,
      excludeCorrupted: true,
      tier: 'C',
      style: GEAR_STYLES.flasks,
    }),
    jewelsRare: rule(t('template.jewels'), { classes: JEWELS, rarities: ['Rare'], tier: 'B', style: GEAR_STYLES.jewelsRare }),
    jewelsMagic: rule(t('rule.jewelsMagic'), { classes: JEWELS, rarities: ['Normal', 'Magic'], tier: 'D', style: GEAR_STYLES.jewelsMagic }),
    // Скрытие в картах — правилами, а не галочкой «Остальная экипировка»: та стоит в фильтре после правил баз
    // и не сработала бы из-за последних правил набора, которые показывают всё оставшееся.
    hideNormalMagic: rule(t('rule.hideNormalMagic'), {
      action: 'hide',
      classes: GEAR_CLASSES,
      rarities: ['Normal', 'Magic'],
      minAreaLevel: MAPS,
      style: GEAR_STYLES.hiddenNormal,
    }),
    hideFlasks: rule(t('rule.hideFlasks'), { action: 'hide', classes: FLASKS, rarities: ['Normal', 'Magic'], minAreaLevel: MAPS, style: GEAR_STYLES.hiddenNormal }),
    hideJewellery: rule(t('rule.hideJewellery'), {
      action: 'hide',
      classes: JEWELLERY,
      rarities: ['Normal', 'Magic'],
      minAreaLevel: MAPS,
      style: GEAR_STYLES.hiddenNormal,
    }),
  }
}

/**
 * Последние правила каждого набора: всё, что не попало под правила выше, показывается неприметно
 * в цвете своей редкости. Так у любой вещи из справочника баз есть правило, и ничего не остаётся «как в игре».
 */
export function restRules(t: T): Draft[] {
  const rule = (name: string, rarity: Rarity): Draft => ({
    ...EMPTY_RULE,
    name,
    classes: ALL_CLASSES,
    rarities: [rarity],
    style: quiet(rarity),
  })
  return [rule(t('rule.restRare'), 'Rare'), rule(t('rule.restMagic'), 'Magic'), rule(t('rule.restNormal'), 'Normal')]
}

/** Последний уровень области кампании: с 65-го начинаются карты. */
const CAMPAIGN_END = 64
const FLASKS_AND_CHARMS = known(['Life Flasks', 'Mana Flasks', 'Charms'])

/** Правила для кампании — по разделу «Leveling» фильтра NeverSink. В картах они не действуют. */
function levelingRules(t: T): Draft[] {
  const rule = (name: string, fields: Partial<Draft>): Draft => ({ ...EMPTY_RULE, name, maxAreaLevel: CAMPAIGN_END, ...fields })
  const everything = [...GEAR_CLASSES, ...JEWELLERY]
  return [
    rule(t('rule.levelingRareJewellery'), { classes: JEWELLERY, rarities: ['Rare'], tier: 'B', style: GEAR_STYLES.jewellery }),
    rule(t('rule.levelingRareTier', { n: 4 }), {
      classes: GEAR_CLASSES,
      rarities: ['Rare'],
      minUnidentifiedTier: 4,
      tier: 'B',
      style: GEAR_STYLES.exceptional,
    }),
    rule(t('rule.levelingRareTier', { n: 3 }), { classes: GEAR_CLASSES, rarities: ['Rare'], minUnidentifiedTier: 3, tier: 'C', style: GEAR_STYLES.notable }),
    rule(t('rule.levelingRare'), { classes: GEAR_CLASSES, rarities: ['Rare'], tier: 'D', style: GEAR_STYLES.rare }),
    // Скорость передвижения на ранних сапогах — главное, что ищут в начале кампании.
    rule(t('rule.levelingBoots'), { classes: known(['Boots']), rarities: ['Magic'], maxAreaLevel: 32, tier: 'C', style: GEAR_STYLES.magicPick }),
    rule(t('rule.levelingJewellery'), { classes: JEWELLERY, rarities: ['Normal', 'Magic'], tier: 'D', style: GEAR_STYLES.jewelleryPick }),
    rule(t('rule.levelingFlasks'), { classes: FLASKS_AND_CHARMS, rarities: ['Normal', 'Magic'], tier: 'D', style: GEAR_STYLES.flasksLeveling }),
    rule(t('rule.levelingQuality'), { classes: everything, rarities: ['Normal', 'Magic'], minQuality: 1, tier: 'E', style: GEAR_STYLES.salvage }),
    rule(t('rule.levelingSockets'), { classes: everything, rarities: ['Normal', 'Magic'], minSockets: 1, tier: 'E', style: GEAR_STYLES.salvage }),
    ...restRules(t),
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
        b.flasks,
        b.charms,
        b.jewelsRare,
        b.jewelsMagic,
        ...restRules(t),
      ]
    },
  },
  {
    id: 'balanced',
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
        b.rareJewellery(0, 'C'),
        b.crafting('D'),
        b.rare82,
        b.flasks,
        b.charms,
        b.jewelsRare,
        b.jewelsMagic,
        b.hideNormalMagic,
        b.hideFlasks,
        ...restRules(t),
      ]
    },
  },
  {
    id: 'strict',
    hideLowRarity: false,
    make: (shares, t) => {
      const b = blocks(shares, t)
      return [
        b.sockets3,
        b.sockets2,
        b.quality27,
        b.quality21Good,
        b.rareTier(4, 'B'),
        b.rareTier(3, 'C'),
        b.rareJewellery(3, 'C'),
        b.hideRares,
        b.flasks,
        b.charms,
        b.jewelsRare,
        b.jewelsMagic,
        b.hideNormalMagic,
        b.hideFlasks,
        b.hideJewellery,
        ...restRules(t),
      ]
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

/**
 * Показ на рынке для строгости со стартовой страницы. Мягкие наборы показывают всё; сбалансированный скрывает
 * мусор (тир E), строгий — и мелочь (D). Скрытое дешёвое показывается стопками на сумму от границы тира.
 */
export const MARKET_LEVELS: Record<PresetId, Visibility> = {
  leveling: { minTier: 'E', minPrice: 0, stacks: true },
  soft: { minTier: 'E', minPrice: 0, stacks: true },
  balanced: { minTier: 'D', minPrice: 0, stacks: true },
  strict: { minTier: 'C', minPrice: 0, stacks: true },
}

/** Строгость целиком: набор правил баз и общий показ на рынке. Свои настройки разделов остаются. */
export function applyLevel(
  config: Config,
  preset: RulePreset,
  shares: Record<string, number> | null,
  t: T,
  chancing: Draft | null = null,
): Config {
  return { ...applyPreset(config, preset, shares, t, chancing), visibility: MARKET_LEVELS[preset.id], level: preset.id }
}

/**
 * Свойства под рекомбинатор, как в фильтре NeverSink (раздел «Identified Mods: Recombinator Mods»):
 * опознанные неосквернённые вещи с топовым свойством для своего класса. Названия свойств — английские, как в игре.
 */
export const RECOMBINATOR_MODS: { classes: string[]; mods: string[] }[] = [
  { classes: ['Boots'], mods: ["Hellion's"] },
  { classes: ['Amulets'], mods: ["Countess'", 'of the Sharpshooter'] },
  { classes: ['Staves', 'Wands'], mods: ['Runic', 'of the Wizard', 'of Inferno', 'of Frostbite', 'of Thunder', 'of Armageddon', 'of Grief'] },
  { classes: ['Sceptres'], mods: ["King's", 'of the Slavedriver', 'Empowering'] },
  { classes: ['Bows', 'Crossbows'], mods: ['of Many', 'Merciless', 'of the Sniper'] },
  { classes: ['Spears'], mods: ['Merciless', 'Flaring', "Amazon's", 'of the Sniper'] },
  { classes: ['Quarterstaves', 'Talismans', 'Two Hand Maces'], mods: ['Merciless', 'of War'] },
]

export function recombinatorRules(t: T): Draft[] {
  return RECOMBINATOR_MODS.map(({ classes, mods }) => ({
    ...EMPTY_RULE,
    name: t('template.recombinatorRule', { classes: classes.map((c) => t(keyOf('class', c))).join(', ') }),
    classes,
    identified: true,
    excludeCorrupted: true,
    mods,
    tier: 'B',
    style: GEAR_STYLES.recombinator,
  }))
}
