import { BASE_CLASSES, classesOf, classNames, EMPTY_RULE, GEAR_CLASSES, POPULAR_SHARE, popularBases, topBases } from './bases'
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
function blocks(shares: Record<string, number> | null) {
  // Популярность с poe.ninja могла не загрузиться — тогда «хорошими» считаем старшие базы каждого класса.
  const good = shares ? popularBases(GEAR_CLASSES, shares, POPULAR_SHARE) : topBases(GEAR_CLASSES)
  const onGood = { classes: classesOf(good), bases: good }
  const rule = (name: string, fields: Partial<Draft>): Draft => ({ ...EMPTY_RULE, name, ...fields })

  return {
    sockets3: rule('Исключительные: 3+ гнезда (нагрудники, двуручное оружие)', {
      classes: TWO_SOCKET_CLASSES,
      minSockets: 3,
      excludeCorrupted: true,
      tier: 'A',
    }),
    sockets2: rule('Исключительные: 2+ гнезда (остальная экипировка)', {
      classes: ONE_SOCKET_CLASSES,
      minSockets: 2,
      excludeCorrupted: true,
      tier: 'B',
    }),
    quality27: rule('Качество 27%+ на популярных базах', { ...onGood, minQuality: 27, excludeCorrupted: true, tier: 'A' }),
    quality21: rule('Качество 21%+', { classes: GEAR_CLASSES, minQuality: 21, excludeCorrupted: true, tier: 'C' }),
    quality21Good: rule('Качество 21%+ на популярных базах', { ...onGood, minQuality: 21, excludeCorrupted: true, tier: 'C' }),
    rareTier: (min: number, tier: TierId) =>
      rule(`Редкие со ступенью свойств ${min}+ на популярных базах`, {
        ...onGood,
        rarities: ['Rare'],
        minUnidentifiedTier: min,
        tier,
      }),
    rareJewellery: (min: number, tier: TierId) =>
      rule(min ? `Редкая бижутерия со ступенью свойств ${min}+` : 'Редкая бижутерия', {
        classes: JEWELLERY,
        rarities: ['Rare'],
        minUnidentifiedTier: min,
        tier,
      }),
    crafting: (tier: TierId) =>
      rule('Заготовки: популярные базы, ур. предмета 82+', {
        ...onGood,
        rarities: ['Normal', 'Magic'],
        minItemLevel: 82,
        excludeCorrupted: true,
        tier,
      }),
    rare82: rule('Редкие на популярных базах, ур. предмета 82+', { ...onGood, rarities: ['Rare'], minItemLevel: 82, tier: 'D' }),
    hideRares: rule('Скрывать остальные редкие оружие и броню', {
      action: 'hide',
      classes: GEAR_CLASSES,
      rarities: ['Rare'],
      minAreaLevel: 75,
    }),
  }
}

export interface RulePreset {
  id: string
  title: string
  summary: string
  /** Что набор показывает и скрывает — для карточки набора. */
  details: string[]
  /** Скрывать ли обычные и магические оружие и броню, не попавшие под правила. */
  hideLowRarity: boolean
  make: (shares: Record<string, number> | null) => Draft[]
}

export const RULE_PRESETS: RulePreset[] = [
  {
    id: 'soft',
    title: 'Мягкий',
    summary: 'Для начала карт: подсвечивает ценное, ничего не скрывает.',
    details: [
      'Исключительные вещи: лишние гнёзда, качество 21%+',
      'Редкие со ступенью свойств 2+ на популярных базах',
      'Вся редкая бижутерия',
      'Белые и синие заготовки ур. 82+ на популярных базах',
    ],
    hideLowRarity: false,
    make: (shares) => {
      const b = blocks(shares)
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
    title: 'Сбалансированный',
    summary: 'Основной вариант: ценное подсвечено, белый и синий мусор скрыт.',
    details: [
      'Исключительные вещи: лишние гнёзда, качество 21%+',
      'Редкие со ступенью свойств 3+ на популярных базах',
      'Вся редкая бижутерия',
      'Заготовки ур. 82+ на популярных базах',
      'Скрыты прочие обычные и магические оружие и броня',
    ],
    hideLowRarity: true,
    make: (shares) => {
      const b = blocks(shares)
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
    title: 'Строгий',
    summary: 'Для быстрой зачистки: только то, ради чего стоит остановиться.',
    details: [
      'Исключительные вещи: лишние гнёзда, качество 27%+ и 21%+ на популярных базах',
      'Редкие со ступенью свойств 3+ на популярных базах',
      'Редкая бижутерия со ступенью свойств 3+',
      'Скрыты прочие редкие оружие и броня (с уровня области 75)',
      'Скрыты прочие обычные и магические оружие и броня',
    ],
    hideLowRarity: true,
    make: (shares) => {
      const b = blocks(shares)
      return [
        b.sockets3,
        b.sockets2,
        b.quality27,
        b.quality21Good,
        b.rareTier(4, 'B'),
        b.rareTier(3, 'C'),
        b.rareJewellery(3, 'C'),
        b.hideRares,
      ]
    },
  },
]

/** Заменяет правила баз набором; уровень области для скрытия остаётся тем, что выбрал пользователь. */
export function applyPreset(config: Config, preset: RulePreset, shares: Record<string, number> | null): Config {
  return {
    ...config,
    baseRules: preset.make(shares).map((rule) => ({ ...rule, id: crypto.randomUUID() })),
    gear: { ...config.gear, hideLowRarity: preset.hideLowRarity },
  }
}
