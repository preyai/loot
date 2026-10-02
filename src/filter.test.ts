import { describe, expect, it } from 'vitest'
import { chancingBases, chancingRule, topUnique, uniquesByBase } from './chancing'
import { DEFAULT_CONFIG } from './defaults'
import { baseTradeQuery, baseTradeUrl, describeRule, EMPTY_RULE, moveItem, topBases, wikiUrl } from './bases'
import { baseOffers, exceptionalBases, exceptionalRules, withExceptionalRules } from './exceptional'
import { applyPreset, RULE_PRESETS } from './presets'
import { baseRuleBlock, generateFilter, matchConditions, styleLines } from './filter'
import { translator } from './i18n'
import { convertCurrency, formatPrice, itemDisplay } from './tiering'
import type { BaseRule, Config, ExceptionalScan, MarketItem, MarketSnapshot } from './types'

// Названия правил и подписи проверяются на русском; английский словарь — в i18n.test.ts.
const t = translator('ru')

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
      ['BaseType "Uncut Skill Gem"', 'GemLevel 5'],
      ['BaseType "Uncut Skill Gem"', 'GemLevel >= 18', 'GemLevel <= 20'],
    ])
  })

  it('у прочих предметов уровень в названии — часть базового типа, его нельзя отрезать', () => {
    // «Thaumaturgic Flux» без уровня игра не знает и отказывается загружать фильтр.
    const items = [item('Thaumaturgic Flux (Level 15)', 1, 'expedition'), item('Blazing Flux', 1, 'expedition')]
    expect(matchConditions(items)).toEqual([['BaseType == "Thaumaturgic Flux (Level 15)" "Blazing Flux"']])
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
    expect(formatPrice(0.03, rates, 'exalted', t)).toBe('3.00 ex')
    expect(formatPrice(0.03, rates, 'chaos', t)).toBe('0.3 c')
    expect(formatPrice(0.03, rates, 'divine', t)).toBe('0.03 div')
    expect(formatPrice(10, rates, 'chaos', t)).toBe('10.0 div')
    expect(formatPrice(null, rates, 'chaos', t)).toBe('нет цены')
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
        '    SetFontSize 42',
        '    SetTextColor 0 0 0 255',
        '    SetBorderColor 0 0 0 255',
        '    SetBackgroundColor 245 139 87 255',
        '    PlayAlertSound 2 300',
        '    PlayEffect White',
        '    MinimapIcon 1 Yellow Circle',
      ].join('\n'),
    )
  })

  it('с базами — по BaseType; любая редкость не задевает уники; Hide без стиля', () => {
    const hide: BaseRule = { ...rule, action: 'hide', bases: ['Gemini Bow'], rarities: [], minItemLevel: 0, minQuality: 20, minSockets: 2 }
    expect(baseRuleBlock(hide, 2, tiers)).toBe(
      ['Hide # Bases / rule 3', '    BaseType == "Gemini Bow"', '    Rarity <= Rare', '    Quality >= 20', '    Sockets >= 2'].join('\n'),
    )
  })

  it('своё оформление правила важнее тира; у правила скрытия оно не пишется', () => {
    const style = { ...tiers.E, fontSize: 30, sound: { id: 9, volume: 150 }, background: { r: 1, g: 2, b: 3, a: 255 } }
    const custom: BaseRule = { ...rule, tier: 'S', style }
    const text = baseRuleBlock(custom, 0, tiers)!
    expect(text).toContain('SetFontSize 30')
    expect(text).toContain('SetBackgroundColor 1 2 3 255')
    expect(text).toContain('PlayAlertSound 9 150')
    // Ни одной строки из стиля тира S, на который правило формально ссылается.
    expect(text).not.toContain('SetFontSize 45')
    expect(text).not.toContain('MinimapIcon 0 Red Star')
    expect(baseRuleBlock({ ...custom, action: 'hide' }, 0, tiers)).not.toContain('SetFontSize')
    expect(describeRule(custom, t)).toContain('своё оформление')
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
    expect(describeRule(rule, t)).toBe('обычные и магические · Луки · ур. предмета 82+')
    expect(describeRule(rule, translator('en'))).toBe('normal and magic · Bows · item level 82+')
    expect(describeRule({ ...rule, rarities: [], bases: ['A', 'B'], minItemLevel: 0, minSockets: 3, excludeCorrupted: true }, t)).toBe(
      'любая редкость · баз: 2 · гнёзд 3+ · не осквернённые',
    )
  })

  it('топовые базы — в пределах пяти уровней выпадения от лучшей в классе', () => {
    const bows = topBases(['Bows'])
    expect(bows).toContain('Fanatic Bow')
    expect(bows).not.toContain('Crude Bow')
  })
})

describe('перетаскивание правил', () => {
  const list = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
  const order = (items: { id: string }[]) => items.map((item) => item.id).join('')

  it('ставит правило перед целью или после неё, в какую бы сторону его ни тащили', () => {
    expect(order(moveItem(list, 'a', 'c', false))).toBe('bacd')
    expect(order(moveItem(list, 'a', 'c', true))).toBe('bcad')
    expect(order(moveItem(list, 'd', 'b', false))).toBe('adbc')
    expect(order(moveItem(list, 'd', 'a', false))).toBe('dabc')
    expect(order(moveItem(list, 'a', 'd', true))).toBe('bcda')
  })

  it('бросок на себя или на неизвестное правило ничего не меняет', () => {
    expect(moveItem(list, 'b', 'b', true)).toBe(list)
    expect(moveItem(list, 'b', 'x', true)).toBe(list)
    expect(moveItem(list, 'x', 'b', true)).toBe(list)
  })
})

describe('шансинг', () => {
  const unique = (name: string, divine: number | null) => ({ name, divine }) as NonNullable<MarketItem['uniques']>[number]
  const base = (name: string, uniques: ReturnType<typeof unique>[]): MarketItem => ({ ...item(name, null, 'uq-accessories'), uniques })
  const belt = base('Utility Belt', [unique('Ingenuity', 0.007), unique('Mageblood', 337)])
  const heavy = base('Heavy Belt', [unique('Headhunter', 36)])
  const ring = base('Ruby Ring', [unique('Cheap', 0.01)])
  const unreliable = base('Gold Ring', [unique('Rare One', null)])
  // База, существующая только под уник: в справочнике экипировки её нет, белой она не выпадает.
  const uniqueOnly = base('Runemastered Silk Robe', [unique('Temporalis', 6900)])
  const all = [ring, heavy, belt, unreliable, uniqueOnly, item('Divine Orb', 1)]

  it('берёт базы из справочника с уником не дешевле порога, дорогие — первыми', () => {
    expect(chancingBases(all, 1)).toEqual(['Utility Belt', 'Heavy Belt'])
    expect(chancingBases(all, 100)).toEqual(['Utility Belt'])
    expect(chancingBases(all, 1000)).toEqual([])
  })

  it('уник без надёжной цены базу под шансинг не делает', () => {
    expect(topUnique(unreliable)).toBeNull()
    expect(topUnique(belt)?.name).toBe('Mageblood')
    expect(uniquesByBase(all).get('Heavy Belt')?.name).toBe('Headhunter')
    expect(uniquesByBase(all).has('Gold Ring')).toBe(false)
  })

  it('правило — для обычных неосквернённых предметов на этих базах', () => {
    const rule = chancingRule(['Utility Belt', 'Heavy Belt'], '500 ex', t)
    expect(rule).toMatchObject({ name: 'Под шансинг: базы уников от 500 ex', classes: ['Belts'], rarities: ['Normal'], excludeCorrupted: true })
    expect(baseRuleBlock({ ...rule, id: '1' }, 0, DEFAULT_CONFIG.tiers)).toContain(
      'BaseType == "Utility Belt" "Heavy Belt"\n    Rarity Normal\n    Corrupted False\n    Mirrored False',
    )
  })

  it('в наборе правило под шансинг идёт сразу после правил с трейда, а без баз его нет', () => {
    const trade: BaseRule = { ...EMPTY_RULE, id: 'trade', name: 'с трейда', source: 'trade' }
    const rule = chancingRule(['Utility Belt'], '500 ex', t)
    const withChancing = applyPreset({ ...DEFAULT_CONFIG, baseRules: [trade] }, RULE_PRESETS[1], null, t, rule).baseRules
    expect(withChancing.slice(0, 2).map((r) => r.name)).toEqual(['с трейда', 'Под шансинг: базы уников от 500 ex'])
    const without = applyPreset(DEFAULT_CONFIG, RULE_PRESETS[1], null, t, null).baseRules
    expect(without.some((r) => r.name.startsWith('Под шансинг'))).toBe(false)
  })
})

describe('готовые наборы', () => {
  const shares = { 'Obliterator Bow': 0.58, 'Vile Robe': 0.35, 'Crude Bow': 0.001 }

  it('каждый набор даёт правила, которые все попадают в фильтр', () => {
    for (const preset of RULE_PRESETS) {
      const config = applyPreset({ ...DEFAULT_CONFIG, baseRules: [{ ...EMPTY_RULE, id: 'old', name: 'старое' }] }, preset, shares, t)
      expect(config.baseRules.length).toBeGreaterThan(4)
      expect(config.baseRules.some((r) => r.id === 'old')).toBe(false)
      expect(new Set(config.baseRules.map((r) => r.id)).size).toBe(config.baseRules.length)
      expect(config.gear.hideLowRarity).toBe(preset.hideLowRarity)
      config.baseRules.forEach((r, i) => expect(baseRuleBlock(r, i, config.tiers), r.name).not.toBeNull())
    }
  })

  it('«популярные базы» — это базы с долей от 3%, а без данных о популярности — старшие базы', () => {
    const balanced = RULE_PRESETS.find((p) => p.id === 'balanced')!
    const popular = balanced.make(shares, t).find((r) => r.name.startsWith('Заготовки'))!
    expect(popular.bases).toEqual(['Obliterator Bow', 'Vile Robe'])
    expect(popular.classes).toEqual(['Bows', 'Body Armours'])
    const fallback = balanced.make(null, t).find((r) => r.name.startsWith('Заготовки'))!
    expect(fallback.bases).toContain('Fanatic Bow')
  })

  it('строгий набор скрывает прочие редкие только с высокого уровня области', () => {
    const strict = RULE_PRESETS.find((p) => p.id === 'strict')!
    const hide = strict.make(shares, t).at(-1)!
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
    expect(wikiUrl("Adherent's Raiment", 'ru')).toBe("https://poe2db.tw/ru/Adherent's_Raiment")
    expect(wikiUrl('Vile Robe', 'en')).toBe('https://poe2db.tw/us/Vile_Robe')
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
    const rules = exceptionalRules(scan, '100 ex', 'A', t)
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
    const rules = withExceptionalRules([manual, old], exceptionalRules(scan, '100 ex', 'A', t))
    expect(rules.map((r) => r.name)).toEqual([
      'Исключительные от 100 ex: 3+ гнезда',
      'Исключительные от 100 ex: качество 21%+',
      'ручное',
    ])
    const afterPreset = applyPreset({ ...DEFAULT_CONFIG, baseRules: rules }, RULE_PRESETS[0], null, t).baseRules
    expect(afterPreset.slice(0, 2).every((r) => r.source === 'trade')).toBe(true)
    expect(afterPreset.some((r) => r.id === 'manual')).toBe(false)
  })
})

describe('оформление тиров по умолчанию', () => {
  it('тир без фона и звука не пишет эти строки в фильтр', () => {
    // Тир E у NeverSink — только цвет текста и рамки, временный луч и серая метка.
    expect(styleLines(DEFAULT_CONFIG.tiers.E)).toEqual([
      'SetFontSize 40',
      'SetTextColor 240 207 132 255',
      'SetBorderColor 240 207 132 255',
      'PlayEffect White Temp',
      'MinimapIcon 2 Grey Circle',
    ])
  })

  it('высший тир — красный текст на белом, самый заметный звук и звезда на карте', () => {
    expect(styleLines(DEFAULT_CONFIG.tiers.S)).toEqual([
      'SetFontSize 45',
      'SetTextColor 255 0 0 255',
      'SetBorderColor 255 0 0 255',
      'SetBackgroundColor 255 255 255 255',
      'PlayAlertSound 6 300',
      'PlayEffect Red',
      'MinimapIcon 0 Red Star',
    ])
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
      'Show # Currency / C / stacks of 20+\n    BaseType == "Scroll of Wisdom"\n    StackSize >= 20\n    SetFontSize 42',
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
