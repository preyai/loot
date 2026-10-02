import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './defaults'
import { baseTradeQuery, baseTradeUrl, baseWikiUrl, describeRule, EMPTY_RULE, topBases } from './bases'
import { baseOffers, exceptionalBases, exceptionalRules, withExceptionalRules } from './exceptional'
import { applyPreset, RULE_PRESETS } from './presets'
import { baseRuleBlock, generateFilter, matchConditions } from './filter'
import { convertCurrency, formatPrice, itemDisplay } from './tiering'
import type { BaseRule, Config, ExceptionalScan, MarketItem, MarketSnapshot } from './types'

const item = (name: string, divine: number | null, section: MarketItem['section'] = 'currency'): MarketItem => ({
  name,
  icon: '',
  section,
  divine,
})

// 1 div = 100 ex = 10 chaos
const rates = { exalted: 100, chaos: 10 }

const snapshot = (items: MarketItem[]): MarketSnapshot => ({
  league: 'Test',
  fetchedAt: '2026-10-02T00:00:00.000Z',
  rates,
  items,
  failed: [],
})

const mirror = item('Mirror of Kalandra', 10) // 1000 ex → S
const jeweller = item("Jeweller's Orb", 0.03) // 3 ex → C
const scroll = item('Scroll of Wisdom', 0.001) // 0.1 ex → E

describe('matchConditions', () => {
  it('склеивает соседние уровни неогранённых камней в диапазоны', () => {
    const items = [18, 20, 19, 5].map((l) => item(`Uncut Skill Gem (Level ${l})`, 1, 'gems'))
    expect(matchConditions(items)).toEqual([
      ['BaseType == "Uncut Skill Gem"', 'ItemLevel == 5'],
      ['BaseType == "Uncut Skill Gem"', 'ItemLevel >= 18', 'ItemLevel <= 20'],
    ])
  })
})

describe('itemDisplay', () => {
  it('по умолчанию показывает всё', () => {
    expect(itemDisplay(scroll, DEFAULT_CONFIG, rates)).toEqual({ kind: 'show', tier: 'E' })
  })

  it('ниже мин. тира — только стопка на сумму не меньше границы тира', () => {
    const config: Config = { ...DEFAULT_CONFIG, visibility: { minTier: 'C', minPrice: 0, stacks: true } }
    expect(itemDisplay(jeweller, config, rates)).toEqual({ kind: 'show', tier: 'C' })
    // Граница C — 2 ex, свиток стоит 0.1 ex → нужно 20 штук, и такая стопка сама тянет на C.
    expect(itemDisplay(scroll, config, rates)).toEqual({ kind: 'stack', tier: 'C', stackSize: 20 })
  })

  it('дешевле мин. цены — стопка на сумму не меньше мин. цены', () => {
    const config: Config = { ...DEFAULT_CONFIG, visibility: { minTier: 'E', minPrice: 12, stacks: true } }
    // 3 ex за штуку → 4 штуки = 12 ex → тир B (от 10 ex)
    expect(itemDisplay(jeweller, config, rates)).toEqual({ kind: 'stack', tier: 'B', stackSize: 4 })
    expect(itemDisplay(mirror, config, rates)).toEqual({ kind: 'show', tier: 'S' })
  })

  it('без стопок дешёвое просто скрывается', () => {
    const config: Config = { ...DEFAULT_CONFIG, visibility: { minTier: 'E', minPrice: 12, stacks: false } }
    expect(itemDisplay(jeweller, config, rates)).toEqual({ kind: 'hide' })
  })

  it('настройки раздела важнее общих, ручной тир важнее мин. цены', () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      visibility: { minTier: 'S', minPrice: 0, stacks: false },
      sectionVisibility: { currency: { minTier: 'B', minPrice: 50, stacks: false } },
      overrides: { 'Scroll of Wisdom': 'A', 'Mirror of Kalandra': 'hide' },
    }
    expect(itemDisplay(scroll, config, rates)).toEqual({ kind: 'show', tier: 'A' })
    expect(itemDisplay(mirror, config, rates)).toEqual({ kind: 'hide' })
    expect(itemDisplay(item('Fragment', 1, 'fragments'), config, rates)).toEqual({ kind: 'hide' })
  })

  it('камни не складываются, поэтому вместо стопок скрываются', () => {
    const config: Config = { ...DEFAULT_CONFIG, visibility: { minTier: 'C', minPrice: 0, stacks: true } }
    expect(itemDisplay(item('Uncut Skill Gem (Level 3)', 0.001, 'gems'), config, rates)).toEqual({ kind: 'hide' })
  })

  it('предмет без цены показывается всегда', () => {
    const config: Config = { ...DEFAULT_CONFIG, visibility: { minTier: 'S', minPrice: 1000, stacks: false } }
    expect(itemDisplay(item('New Thing', null), config, rates)).toEqual({ kind: 'show', tier: 'C' })
  })
})

describe('основная валюта', () => {
  it('пороги трактуются в выбранной валюте', () => {
    // 3 ex = 0.3 chaos = 0.03 div
    const inChaos: Config = { ...DEFAULT_CONFIG, currency: 'chaos', thresholds: { S: 50, A: 5, B: 1, C: 0.2, D: 0.05 } }
    expect(itemDisplay(jeweller, inChaos, rates)).toEqual({ kind: 'show', tier: 'C' })
    const inDivine: Config = { ...DEFAULT_CONFIG, currency: 'divine', thresholds: { S: 5, A: 0.5, B: 0.1, C: 0.02, D: 0.005 } }
    expect(itemDisplay(jeweller, inDivine, rates)).toEqual({ kind: 'show', tier: 'C' })
    expect(itemDisplay(mirror, inDivine, rates)).toEqual({ kind: 'show', tier: 'S' })
  })

  it('смена валюты пересчитывает пороги и мин. цены, не меняя результат', () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      visibility: { minTier: 'E', minPrice: 12, stacks: true },
      sectionVisibility: { ritual: { minTier: 'A', minPrice: 40, stacks: false } },
    }
    const inDivine = convertCurrency(config, 'divine', rates)
    expect(inDivine.currency).toBe('divine')
    expect(inDivine.thresholds).toEqual({ S: 5, A: 0.5, B: 0.1, C: 0.02, D: 0.005 })
    expect(inDivine.visibility.minPrice).toBe(0.12)
    expect(inDivine.sectionVisibility.ritual?.minPrice).toBe(0.4)
    for (const it of [mirror, jeweller, scroll]) {
      expect(itemDisplay(it, inDivine, rates)).toEqual(itemDisplay(it, config, rates))
    }
    expect(convertCurrency(inDivine, 'exalted', rates).thresholds).toEqual(DEFAULT_CONFIG.thresholds)
  })

  it('цена показывается в основной валюте, дорогое — в divine', () => {
    expect(formatPrice(0.03, rates, 'exalted')).toBe('3.00 ex')
    expect(formatPrice(0.03, rates, 'chaos')).toBe('0.3 c')
    expect(formatPrice(0.03, rates, 'divine')).toBe('0.03 div')
    expect(formatPrice(10, rates, 'chaos')).toBe('10.0 div')
    expect(formatPrice(null, rates, 'chaos')).toBe('нет цены')
  })
})

describe('уники', () => {
  const robe: MarketItem = {
    ...item('Silk Robe', 71, 'uq-armour'),
    // Генератору фильтра от уников нужны только имя и цена.
    uniques: [
      { name: 'Temporalis', divine: 71 },
      { name: 'Cloak of Flame', divine: 0.001 },
    ] as MarketItem['uniques'],
  }

  it('правило для базы ограничено редкостью Unique', () => {
    const text = generateFilter(snapshot([robe]), DEFAULT_CONFIG)
    expect(text).toContain('Show # Unique Armours / S\n    Rarity Unique\n    BaseType == "Silk Robe"\n    SetFontSize 45')
  })

  it('ручной тир базы уника не пересекается с одноимённым обычным предметом', () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      visibility: { minTier: 'C', minPrice: 0, stacks: true },
      overrides: { 'unique:Silk Robe': 'hide', 'Scroll of Wisdom': 'S' },
    }
    expect(itemDisplay(robe, config, rates)).toEqual({ kind: 'hide' })
    expect(itemDisplay(item('Silk Robe', 71), config, rates)).toEqual({ kind: 'show', tier: 'S' })
    // Уники не складываются: дешёвая база скрывается, а не показывается стопкой.
    expect(itemDisplay({ ...robe, name: 'Plain Hat', divine: 0.001 }, config, rates)).toEqual({ kind: 'hide' })
    expect(generateFilter(snapshot([robe]), config)).toContain(
      'Hide # Unique Armours / hidden\n    Rarity Unique\n    BaseType == "Silk Robe"\n',
    )
  })
})

describe('правила баз', () => {
  const rule: BaseRule = {
    id: '1',
    name: 'Топовые луки',
    enabled: true,
    action: 'show',
    classes: ['Bows'],
    bases: [],
    rarities: ['Normal', 'Magic'],
    minItemLevel: 82,
    minQuality: 0,
    minSockets: 0,
    minUnidentifiedTier: 0,
    minAreaLevel: 0,
    excludeCorrupted: false,
    tier: 'C',
  }
  const { tiers } = DEFAULT_CONFIG

  it('без выбранных баз правило работает по классу', () => {
    expect(baseRuleBlock(rule, 0, tiers)).toBe(
      [
        'Show # Bases / rule 1',
        '    Class == "Bows"',
        '    Rarity Normal Magic',
        '    ItemLevel >= 82',
        '    SetFontSize 36',
        '    SetTextColor 245 220 70 255',
        '    SetBorderColor 245 220 70 255',
        '    SetBackgroundColor 40 30 0 235',
        '    PlayEffect Yellow Temp',
        '    MinimapIcon 2 Yellow Circle',
      ].join('\n'),
    )
  })

  it('с базами — по BaseType; любая редкость не задевает уники; Hide без стиля', () => {
    const hide: BaseRule = { ...rule, action: 'hide', bases: ['Gemini Bow'], rarities: [], minItemLevel: 0, minQuality: 20, minSockets: 2 }
    expect(baseRuleBlock(hide, 2, tiers)).toBe(
      ['Hide # Bases / rule 3', '    BaseType == "Gemini Bow"', '    Rarity <= Rare', '    Quality >= 20', '    Sockets >= 2'].join('\n'),
    )
  })

  it('выключенное правило и правило без классов пропускаются', () => {
    expect(baseRuleBlock({ ...rule, enabled: false }, 0, tiers)).toBeNull()
    expect(baseRuleBlock({ ...rule, classes: [] }, 0, tiers)).toBeNull()
  })

  it('правила идут по порядку и раньше общего скрытия экипировки', () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      baseRules: [rule, { ...rule, id: '2', classes: ['Rings'] }],
      gear: { hideLowRarity: true, areaLevel: 70 },
    }
    const text = generateFilter(snapshot([]), config)
    const positions = ['Bases / rule 1', 'Bases / rule 2', 'Gear / normal and magic'].map((s) => text.indexOf(s))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(positions[0]).toBeGreaterThan(-1)
  })

  it('ступень свойств, запрет осквернённых и уровень области попадают в условия', () => {
    const strict: BaseRule = { ...rule, action: 'hide', rarities: ['Rare'], minItemLevel: 0, minUnidentifiedTier: 3, minAreaLevel: 75, excludeCorrupted: true }
    expect(baseRuleBlock(strict, 0, tiers)).toBe(
      [
        'Hide # Bases / rule 1',
        '    Class == "Bows"',
        '    Rarity Rare',
        '    UnidentifiedItemTier >= 3',
        '    Corrupted False',
        '    Mirrored False',
        '    AreaLevel >= 75',
      ].join('\n'),
    )
  })

  it('описание правила читается одной строкой', () => {
    expect(describeRule(rule)).toBe('обычные и магические · Bows · ур. предмета 82+')
    expect(describeRule({ ...rule, rarities: [], bases: ['A', 'B'], minItemLevel: 0, minSockets: 3, excludeCorrupted: true })).toBe(
      'любая редкость · баз: 2 · гнёзд 3+ · не осквернённые',
    )
  })

  it('топовые базы — в пределах пяти уровней выпадения от лучшей в классе', () => {
    const bows = topBases(['Bows'])
    expect(bows).toContain('Fanatic Bow')
    expect(bows).not.toContain('Crude Bow')
  })
})

describe('готовые наборы', () => {
  const shares = { 'Obliterator Bow': 0.58, 'Vile Robe': 0.35, 'Crude Bow': 0.001 }

  it('каждый набор даёт правила, которые все попадают в фильтр', () => {
    for (const preset of RULE_PRESETS) {
      const config = applyPreset({ ...DEFAULT_CONFIG, baseRules: [{ ...EMPTY_RULE, id: 'old', name: 'старое' }] }, preset, shares)
      expect(config.baseRules.length).toBeGreaterThan(4)
      expect(config.baseRules.some((r) => r.id === 'old')).toBe(false)
      expect(new Set(config.baseRules.map((r) => r.id)).size).toBe(config.baseRules.length)
      expect(config.gear.hideLowRarity).toBe(preset.hideLowRarity)
      config.baseRules.forEach((r, i) => expect(baseRuleBlock(r, i, config.tiers), r.name).not.toBeNull())
    }
  })

  it('«популярные базы» — это базы с долей от 3%, а без данных о популярности — старшие базы', () => {
    const balanced = RULE_PRESETS.find((p) => p.id === 'balanced')!
    const popular = balanced.make(shares).find((r) => r.name.startsWith('Заготовки'))!
    expect(popular.bases).toEqual(['Obliterator Bow', 'Vile Robe'])
    expect(popular.classes).toEqual(['Bows', 'Body Armours'])
    const fallback = balanced.make(null).find((r) => r.name.startsWith('Заготовки'))!
    expect(fallback.bases).toContain('Fanatic Bow')
  })

  it('строгий набор скрывает прочие редкие только с высокого уровня области', () => {
    const strict = RULE_PRESETS.find((p) => p.id === 'strict')!
    const hide = strict.make(shares).at(-1)!
    expect(hide.action).toBe('hide')
    expect(hide.minAreaLevel).toBe(75)
    expect(hide.rarities).toEqual(['Rare'])
  })
})

describe('исключительные вещи с трейда', () => {
  const scan: ExceptionalScan = {
    league: 'Test',
    at: '2026-10-02T00:00:00.000Z',
    minExalted: 100,
    groups: [
      { kind: 'sockets3', title: 'Body Armours', total: 263, sampled: 40, bases: { 'Vile Robe': 5, 'Death Mail': 1, 'Не база': 9 } },
      { kind: 'sockets3', title: 'Bows', total: 12, sampled: 12, bases: { 'Obliterator Bow': 2, 'Death Mail': 1 } },
      { kind: 'sockets2', title: 'Gloves', total: 3, sampled: 3, bases: { 'Sirenscale Gloves': 1 } },
      { kind: 'quality', title: 'Armour', total: 80, sampled: 40, bases: { 'Vile Robe': 3 } },
    ],
  }

  it('в правило идут базы от двух продавцов, известные справочнику; продавцы суммируются по запросам', () => {
    expect(exceptionalBases(scan)).toEqual({
      sockets3: ['Death Mail', 'Obliterator Bow', 'Vile Robe'],
      sockets2: [],
      quality: ['Vile Robe'],
    })
  })

  it('по базе видно, в каких видах её продают и сколько продавцов — включая одиночные лоты', () => {
    const offers = baseOffers(scan)
    expect(offers.get('Vile Robe')).toEqual([
      { kind: 'sockets3', sellers: 5 },
      { kind: 'quality', sellers: 3 },
    ])
    expect(offers.get('Death Mail')).toEqual([{ kind: 'sockets3', sellers: 2 }])
    expect(offers.get('Sirenscale Gloves')).toEqual([{ kind: 'sockets2', sellers: 1 }])
    expect(offers.has('Crude Bow')).toBe(false)
  })

  it('ссылки на базу: страница poe2db и поиск на трейде в выбранной лиге', () => {
    expect(baseWikiUrl("Adherent's Raiment")).toBe("https://poe2db.tw/ru/Adherent's_Raiment")
    const plain: BaseRule = { ...EMPTY_RULE, id: '1', name: '' }
    const url = new URL(baseTradeUrl('Vile Robe', 'Forbidden Rites', plain))
    expect(url.pathname).toBe('/trade2/search/poe2/Forbidden%20Rites')
    expect(JSON.parse(url.searchParams.get('q')!)).toEqual(baseTradeQuery('Vile Robe', plain))
  })

  it('поиск на трейде повторяет условия правила', () => {
    const plain: BaseRule = { ...EMPTY_RULE, id: '1', name: '' }
    // Без условий — только база и «не уникальный».
    expect(baseTradeQuery('Vile Robe', plain)).toEqual({
      query: {
        type: 'Vile Robe',
        status: { option: 'securable' },
        filters: { type_filters: { filters: { rarity: { option: 'nonunique' } } } },
      },
      sort: { price: 'asc' },
    })
    const strict: BaseRule = {
      ...plain,
      rarities: ['Normal'],
      minItemLevel: 82,
      minQuality: 21,
      minSockets: 3,
      minUnidentifiedTier: 4,
      minAreaLevel: 75,
      excludeCorrupted: true,
    }
    expect(baseTradeQuery('Vile Robe', strict).query.filters).toEqual({
      type_filters: { filters: { rarity: { option: 'normal' }, ilvl: { min: 82 }, quality: { min: 21 } } },
      equipment_filters: { filters: { rune_sockets: { min: 3 } } },
      misc_filters: { filters: { unidentified_tier: { min: 4 }, corrupted: { option: 'false' }, mirrored: { option: 'false' } } },
    })
    // Две редкости трейд одним запросом не ищет — берём «любую, кроме уникальной».
    const filters = baseTradeQuery('Vile Robe', { ...plain, rarities: ['Normal', 'Magic'] }).query.filters
    expect(filters.type_filters.filters).toEqual({ rarity: { option: 'nonunique' } })
  })

  it('на каждый вид с базами — правило для обычных не осквернённых предметов', () => {
    const rules = exceptionalRules(scan, '100 ex', 'A')
    expect(rules.map((r) => r.name)).toEqual(['Исключительные от 100 ex: 3+ гнезда', 'Исключительные от 100 ex: качество 21%+'])
    expect(rules[0]).toMatchObject({ source: 'trade', rarities: ['Normal'], minSockets: 3, minQuality: 0, excludeCorrupted: true, tier: 'A' })
    expect(rules[0].classes).toEqual(['Bows', 'Body Armours'])
    expect(rules[1]).toMatchObject({ minSockets: 0, minQuality: 21, bases: ['Vile Robe'] })
    expect(baseRuleBlock({ ...rules[0], id: '1' }, 0, DEFAULT_CONFIG.tiers)).toContain(
      'BaseType == "Death Mail" "Obliterator Bow" "Vile Robe"\n    Rarity Normal\n    Sockets >= 3\n    Corrupted False',
    )
  })

  it('новый опрос заменяет прежние правила с трейда и не трогает ручные; наборы их сохраняют', () => {
    const manual: BaseRule = { ...EMPTY_RULE, id: 'manual', name: 'ручное' }
    const old: BaseRule = { ...EMPTY_RULE, id: 'old', name: 'старое с трейда', source: 'trade' }
    const rules = withExceptionalRules([manual, old], exceptionalRules(scan, '100 ex', 'A'))
    expect(rules.map((r) => r.name)).toEqual([
      'Исключительные от 100 ex: 3+ гнезда',
      'Исключительные от 100 ex: качество 21%+',
      'ручное',
    ])
    const afterPreset = applyPreset({ ...DEFAULT_CONFIG, baseRules: rules }, RULE_PRESETS[0], null).baseRules
    expect(afterPreset.slice(0, 2).every((r) => r.source === 'trade')).toBe(true)
    expect(afterPreset.some((r) => r.id === 'manual')).toBe(false)
  })
})

describe('generateFilter', () => {
  it('раскладывает предметы по тирам согласно порогам в exalted', () => {
    const text = generateFilter(snapshot([mirror, jeweller, scroll]), DEFAULT_CONFIG)
    expect(text).toContain('Show # Currency / S\n    BaseType == "Mirror of Kalandra"\n    SetFontSize 45')
    expect(text).toContain('Show # Currency / C\n    BaseType == "Jeweller\'s Orb"')
    expect(text).toContain('Show # Currency / E\n    BaseType == "Scroll of Wisdom"')
    expect(text).toContain('PlayAlertSound 6 300')
    expect(text).toContain('MinimapIcon 0 Red Star')
    expect(text).not.toContain('Hide')
  })

  it('блок стопок идёт перед Hide для тех же предметов', () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      visibility: { minTier: 'C', minPrice: 0, stacks: true },
      overrides: { 'Mirror of Kalandra': 'hide' },
    }
    const text = generateFilter(snapshot([mirror, jeweller, scroll]), config)
    const stack = text.indexOf(
      'Show # Currency / C / stacks of 20+\n    BaseType == "Scroll of Wisdom"\n    StackSize >= 20\n    SetFontSize 36',
    )
    const hide = text.indexOf('Hide # Currency / hidden\n    BaseType == "Mirror of Kalandra" "Scroll of Wisdom"\n')
    expect(stack).toBeGreaterThan(-1)
    expect(hide).toBeGreaterThan(stack)
  })

  it('пропускает выключенные разделы и добавляет правило для экипировки', () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      disabledSections: ['currency'],
      gear: { hideLowRarity: true, areaLevel: 70 },
    }
    const text = generateFilter(snapshot([mirror]), config)
    expect(text).not.toContain('Mirror of Kalandra')
    expect(text).toContain('Rarity <= Magic\n    AreaLevel >= 70')
  })
})
