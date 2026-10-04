import { describe, expect, it } from 'vitest'
import { chanceOf, chancingBases, chancingRule, dropSource, topUnique, uniquesByBase } from './chancing'
import { DEFAULT_CONFIG } from './defaults'
import { BASE_CLASSES, baseTradeQuery, baseTradeUrl, describeRule, EMPTY_RULE, GEAR_CLASSES, moveItem, RULE_TEMPLATES, topBases, wikiUrl } from './bases'
import { baseOffers, exceptionalBases, exceptionalRules, withExceptionalRules } from './exceptional'
import { applyPreset, restRules, RULE_PRESETS } from './presets'
import { evaluate, parseFilter } from './filterEval'
import { generateLoot } from './lootSim'
import { baseRuleBlock, extraBlocks, generateFilter, goldBlocks, HIDDEN_LINES, hiddenLines, matchConditions, styleLines, waystoneBlocks } from './filter'
import { DEFAULT_GOLD } from './gold'
import { DEFAULT_WAYSTONES } from './waystones'
import { keyOf, LANGUAGES, translator } from './i18n'
import { EXTRA_GROUPS, extraKey } from './extras'
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

  it('обычная плитка и уникальная на той же базе не задевают друг друга; предмет без цены показывается в тире C', () => {
    const tablet = item('Breach Tablet', 71, 'tablets')
    const uniqueTablet: MarketItem = { ...item('Breach Tablet', 0.001, 'uq-other'), uniques: [{ name: 'Cheap', divine: 0.001 }] as MarketItem['uniques'] }
    const text = generateFilter(snapshot([tablet, uniqueTablet, item('Liquid Verisium', null, 'verisium')]), DEFAULT_CONFIG)
    expect(text).toContain('Show # Tablets / S\n    Rarity <= Rare\n    BaseType == "Breach Tablet"\n')
    expect(text).toContain('# Unique Misc / E\n    Rarity Unique\n    BaseType == "Breach Tablet"\n')
    expect(text).toContain('Show # Verisium / C\n    BaseType == "Liquid Verisium"\n')
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
      'Hide # Unique Armours / hidden / S\n    Rarity Unique\n    BaseType == "Silk Robe"\n',
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
    maxAreaLevel: 0,
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

  it('с базами — по BaseType; любая редкость не задевает уники; Hide — в оформлении тира правила', () => {
    const hide: BaseRule = { ...rule, action: 'hide', bases: ['Gemini Bow'], rarities: [], minItemLevel: 0, minQuality: 20, minSockets: 2 }
    expect(baseRuleBlock(hide, 2, tiers)).toBe(
      ['Hide # Bases / rule 3', '    BaseType == "Gemini Bow"', '    Rarity <= Rare', '    Quality >= 20', '    Sockets >= 2', ...hiddenLines(tiers.C).map((l) => `    ${l}`)].join('\n'),
    )
  })

  it('своё оформление правила важнее тира; скрытое правилом — в этом же оформлении, но тихо', () => {
    const style = { ...tiers.E, fontSize: 30, sound: { id: 9, volume: 150 }, background: { r: 1, g: 2, b: 3, a: 255 } }
    const custom: BaseRule = { ...rule, tier: 'S', style }
    const text = baseRuleBlock(custom, 0, tiers)!
    expect(text).toContain('SetFontSize 30')
    expect(text).toContain('SetBackgroundColor 1 2 3 255')
    expect(text).toContain('PlayAlertSound 9 150')
    // Ни одной строки из стиля тира S, на который правило формально ссылается.
    expect(text).not.toContain('SetFontSize 45')
    expect(text).not.toContain('MinimapIcon 0 Red Star')
    // Скрытое правилом со своим оформлением — под Alt в этом оформлении, но без звука, луча и значка.
    const hidden = baseRuleBlock({ ...custom, action: 'hide' }, 0, tiers)!
    expect(hidden).toContain('SetFontSize 30')
    expect(hidden).toContain('SetBackgroundColor 1 2 3 255')
    expect(hidden).not.toContain('PlayAlertSound')
    expect(hidden.endsWith('DisableDropSound True')).toBe(true)
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
        ...hiddenLines(tiers.C).map((l) => `    ${l}`),
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

  it('уник из особого источника сферой удачи не получить — база берётся по шансящемуся', () => {
    expect(chanceOf('Mageblood')).toBe('yes')
    expect(chanceOf('Temporalis')).toBe('no')
    expect(dropSource('Temporalis')).toContain('Zarokh')
    expect(dropSource('Mageblood')).toBeNull()
    // Уник, которого вики не знает: ни «можно», ни «нельзя».
    expect(chanceOf('Cheap')).toBe('unknown')
    expect(chanceOf('constructor')).toBe('unknown')

    const boss = base('Heavy Belt', [unique('Temporalis', 6900), unique('Headhunter', 36)])
    expect(topUnique(boss)?.name).toBe('Headhunter')
    expect(chancingBases([boss], 100)).toEqual([])
    expect(chancingBases([boss], 10)).toEqual(['Heavy Belt'])
    const bossOnly = base('Utility Belt', [unique('Temporalis', 6900), unique('Cheap', 500)])
    expect(topUnique(bossOnly)).toBeNull()
    expect(chancingBases([bossOnly], 1)).toEqual([])
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
    const withChancing = applyPreset({ ...DEFAULT_CONFIG, baseRules: [trade] }, RULE_PRESETS.find((p) => p.id === 'balanced')!, null, t, rule).baseRules
    expect(withChancing.slice(0, 2).map((r) => r.name)).toEqual(['с трейда', 'Под шансинг: базы уников от 500 ex'])
    const without = applyPreset(DEFAULT_CONFIG, RULE_PRESETS.find((p) => p.id === 'balanced')!, null, t, null).baseRules
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
    const hide = strict.make(shares, t).find((r) => r.name === t('rule.hideRares'))!
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
    const afterPreset = applyPreset({ ...DEFAULT_CONFIG, baseRules: rules }, RULE_PRESETS.find((p) => p.id === 'soft')!, null, t).baseRules
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
    expect(text).not.toContain('Hide # Currency')
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
    // Скрытые разложены по тирам, в которых они показывались бы.
    const hide = text.indexOf('Hide # Currency / hidden / E\n    BaseType == "Scroll of Wisdom"\n')
    expect(stack).toBeGreaterThan(-1)
    expect(hide).toBeGreaterThan(stack)
    expect(text).toContain('Hide # Currency / hidden / S\n    BaseType == "Mirror of Kalandra"\n    SetFontSize 45')
  })

  it('пропускает выключенные разделы и добавляет правило для экипировки', () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      disabledSections: ['currency'],
      gear: { hideLowRarity: true, areaLevel: 70 },
    }
    const text = generateFilter(snapshot([mirror]), config)
    // Предмет выключенного раздела — «как в игре»: блок без оформления, чтобы его не поймала ловушка неизвестной валюты.
    expect(text).toContain('Show # Currency / disabled\n    BaseType == "Mirror of Kalandra"\n    SetFontSize 30\n    SetTextColor 170 158 130 255')
    expect(text.indexOf('Currency / disabled')).toBeLessThan(text.indexOf('Other / unknown / currency'))
    expect(text).toContain('Rarity <= Magic\n    AreaLevel >= 70')
    const noCatcher = generateFilter(snapshot([mirror]), { ...config, disabledExtras: ['unknown'] })
    expect(noCatcher).not.toContain('Mirror of Kalandra')
  })
})

describe('путевые камни', () => {
  const text = (change: Partial<typeof DEFAULT_WAYSTONES> = {}) => waystoneBlocks({ ...DEFAULT_WAYSTONES, ...change }).join('\n\n')

  it('по умолчанию — как NeverSink: особые камни первыми, затем группы тиров, без скрытия', () => {
    const all = text()
    expect(all.indexOf('HasExplicitMod >=7')).toBeLessThan(all.indexOf('AnyEnchantment True'))
    expect(all.indexOf('AnyEnchantment True')).toBeLessThan(all.indexOf('WaystoneTier >= 16'))
    expect(all).toContain('Show # Waystones / T16\n    Class == "Waystones"\n    WaystoneTier >= 16\n')
    expect(all).toContain('Show # Waystones / T12-14\n    Class == "Waystones"\n    WaystoneTier >= 12\n    WaystoneTier <= 14\n')
    expect(all).toContain('    MinimapIcon 0 Purple Square')
    expect(all).not.toContain('Hide')
  })

  it('камень выше области получает красную рамку вместо рамки группы', () => {
    const all = text()
    expect(all).toContain('Show # Waystones / T1 above area level\n    Class == "Waystones"\n    WaystoneTier 1\n    AreaLevel < 65\n')
    expect(all).toContain('WaystoneTier 14\n    AreaLevel < 78\n    SetFontSize 40\n    SetTextColor 0 0 0 255\n    SetBorderColor 220 50 0 255')
    expect(text({ upgradeBorder: false })).not.toContain('AreaLevel')
  })

  it('порог тира обрезает группы и скрывает камни ниже, кроме уникальных', () => {
    const all = text({ minTier: 14, enchanted: null, corrupted: null })
    expect(all).toContain('Show # Waystones / T14\n    Class == "Waystones"\n    WaystoneTier 14\n')
    expect(all).not.toContain('WaystoneTier 13')
    expect(all).not.toContain('AnyEnchantment')
    // Ниже порога — скрыты, под Alt — в оформлении своей группы тиров.
    expect(all).toContain('Hide # Waystones / below T14 / T12-13\n    Class == "Waystones"\n    WaystoneTier >= 12\n    WaystoneTier <= 13\n    Rarity <= Rare\n    SetFontSize 40')
    expect(all).toContain('Hide # Waystones / below T14 / T1-6\n    Class == "Waystones"\n    WaystoneTier >= 1\n    WaystoneTier <= 6\n')
    expect(all.endsWith('DisableDropSound True')).toBe(true)
  })

  it('выключенные правила в фильтр не попадают', () => {
    expect(waystoneBlocks({ ...DEFAULT_WAYSTONES, enabled: false })).toEqual([])
    expect(generateFilter(snapshot([]), DEFAULT_CONFIG)).toContain('Class == "Waystones"')
  })
})

describe('золото', () => {
  const text = (change: Partial<typeof DEFAULT_GOLD> = {}) => goldBlocks({ ...DEFAULT_GOLD, ...change }).join('\n\n')

  it('кучи от крупных к мелким, затем пороги прокачки, в конце — мелкое золото', () => {
    const all = text()
    expect(all.startsWith('Show # Gold / huge pile\n    StackSize >= 5000\n    BaseType == "Gold"\n    SetFontSize 40')).toBe(true)
    expect(all.indexOf('StackSize >= 2000')).toBeLessThan(all.indexOf('StackSize >= 650'))
    expect(all).toContain('StackSize >= 500\n    BaseType == "Gold"\n    AreaLevel <= 24\n')
    expect(all).toContain('StackSize >= 100\n    BaseType == "Gold"\n    AreaLevel <= 16\n')
    expect(all.endsWith('Show # Gold / small piles\n    BaseType == "Gold"\n    SetFontSize 32\n    SetTextColor 180 180 180 255\n    SetBorderColor 0 0 0 255\n    SetBackgroundColor 20 20 0 180')).toBe(true)
  })

  it('без прокачки и со скрытием мелкого; порог прокачки выше обычного не пишется', () => {
    const all = text({ leveling: false, hideSmall: true })
    expect(all).not.toContain('AreaLevel')
    expect(all.endsWith('Hide # Gold / small piles\n    BaseType == "Gold"\n    SetFontSize 32\n    SetTextColor 180 180 180 255\n    SetBorderColor 0 0 0 255\n    SetBackgroundColor 20 20 0 180\n    DisableDropSound True')).toBe(true)
    expect(text({ sizes: { huge: 5000, large: 800, medium: 200 } })).not.toContain('StackSize >= 1000')
    expect(text({ sizes: { huge: 5000, large: 800, medium: 200 } })).not.toContain('StackSize >= 250\n')
  })

  it('золото идёт в фильтре первым, а выключенное не пишется', () => {
    const filter = generateFilter(snapshot([item('Divine Orb', 1)]), DEFAULT_CONFIG)
    expect(filter.indexOf('BaseType == "Gold"')).toBeLessThan(filter.indexOf('Divine Orb'))
    expect(goldBlocks({ ...DEFAULT_GOLD, enabled: false })).toEqual([])
  })
})

describe('прочие предметы', () => {
  it('по умолчанию: тиры из NeverSink, ловушка неизвестного — последней', () => {
    const all = extraBlocks(DEFAULT_CONFIG).join('\n\n')
    expect(all).toContain('Show # Other / quest / items\n    Class == "Quest Items" "Instance Local Items"\n')
    expect(all).toContain('Show # Other / trials / barya80\n    ItemLevel >= 80\n    BaseType == "Djinn Barya"\n')
    expect(all).toContain('Show # Other / gems / twiceTop\n    Class == "Skill Gems" "Support Gems"\n    TwiceCorrupted True\n')
    expect(all).not.toContain('Hide')
    expect(all.trimEnd().split('\n\n').at(-1)).toMatch(/^Show # Other \/ unknown \/ currency\n    Class == "Stackable Currency"/)
  })

  it('выбор пользователя: другой тир, скрытие, без правила, выключенная группа', () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      extras: { 'relics.any': 'S', 'trials.barya60': 'hide', 'trials.baryaLow': 'off' },
      disabledExtras: ['quest'],
    }
    const all = extraBlocks(config).join('\n\n')
    expect(all).toContain('Show # Other / relics / any\n    Rarity Normal Magic\n    BaseType == "Amphora Relic"')
    expect(all).toMatch(/relics \/ any[^#]*SetFontSize 45/)
    expect(all).toContain('Hide # Other / trials / barya60\n    ItemLevel >= 60\n    ItemLevel <= 79\n    BaseType == "Djinn Barya"')
    expect(all).not.toContain('baryaLow')
    expect(all).not.toContain('Other / quest')
  })

  it('у каждого правила есть подпись на всех языках', () => {
    for (const group of EXTRA_GROUPS) {
      for (const lang of LANGUAGES) {
        expect(translator(lang)(keyOf('extraGroup', group.id)), `${lang}: ${group.id}`).toEqual(expect.any(String))
        for (const rule of group.rules) {
          expect(translator(lang)(keyOf('extra', extraKey(group, rule))), `${lang}: ${rule.id}`).toEqual(expect.any(String))
        }
      }
    }
  })
})

describe('флаконы, обереги и самоцветы — в правилах баз', () => {
  it('классы есть в справочнике баз, в отдельной группе, и не попадают в скрытие экипировки', () => {
    const group = (id: string) => BASE_CLASSES.filter((c) => c.group === id).map((c) => c.name).sort()
    expect(group('flasks')).toEqual(['Charms', 'Life Flasks', 'Mana Flasks'])
    expect(group('jewels')).toEqual(['Jewels'])
    expect(GEAR_CLASSES).not.toContain('Charms')
  })

  it('шаблон флаконов — высшие флаконы 83+, без осквернённых', () => {
    const template = RULE_TEMPLATES.find((r) => r.title === 'template.flasks')!
    const text = baseRuleBlock({ ...template.make(t), id: '1' }, 0, DEFAULT_CONFIG.tiers)!
    expect(text).toContain('BaseType == "Ultimate Life Flask" "Ultimate Mana Flask"\n    Rarity Normal Magic\n    ItemLevel >= 83\n    Corrupted False')
  })
})

describe('набор «Прокачка»', () => {
  const leveling = RULE_PRESETS.find((p) => p.id === 'leveling')!
  const rules = leveling.make(null, t).map((rule, i) => ({ ...rule, id: String(i) }))

  it('правила прокачки — только для кампании; набор ничего не скрывает', () => {
    const levelingOnly = rules.filter((r) => r.name.startsWith('Прокачка:'))
    expect(levelingOnly.length).toBeGreaterThan(5)
    for (const rule of levelingOnly) {
      expect(rule.maxAreaLevel, rule.name).toBeGreaterThan(0)
      expect(rule.maxAreaLevel, rule.name).toBeLessThanOrEqual(64)
    }
    expect(rules.every((r) => r.action === 'show')).toBe(true)
    expect(leveling.hideLowRarity).toBe(false)
  })

  it('в фильтре — условие верхней границы уровня области', () => {
    const boots = rules.find((r) => r.name === 'Прокачка: магические сапоги')!
    expect(baseRuleBlock(boots, 0, DEFAULT_CONFIG.tiers)).toContain('Class == "Boots"\n    Rarity Magic\n    AreaLevel <= 32')
    expect(describeRule(boots, t)).toContain('до уровня области 32')
    const flasks = rules.find((r) => r.name === 'Прокачка: флаконы и обереги')!
    expect(flasks.classes.sort()).toEqual(['Charms', 'Life Flasks', 'Mana Flasks'])
  })
})

describe('наборы покрывают все предметы', () => {
  /** Детерминированный генератор случайных чисел. */
  const seeded = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31
    return seed / 2 ** 31
  }
  const items: MarketItem[] = [
    item('Divine Orb', 1),
    item('Scroll of Wisdom', 0.0001),
    { ...item('Utility Belt', 300, 'uq-accessories'), uniques: [{ name: 'Mageblood', divine: 300 }] as MarketItem['uniques'] },
  ]

  it.each(RULE_PRESETS.map((p) => p.id))('%s: у любого выпавшего предмета есть правило на любом уровне области', (id) => {
    const preset = RULE_PRESETS.find((p) => p.id === id)!
    const config = applyPreset(DEFAULT_CONFIG, preset, null, t)
    const blocks = parseFilter(generateFilter(snapshot(items), config))
    for (const area of [2, 30, 64, 65, 75, 83]) {
      const uncovered = generateLoot(items, area, 400, seeded(area))
        .map((loot) => ({ loot, look: evaluate(blocks, loot, area) }))
        .filter(({ look }) => look.block === null)
        .map(({ loot }) => `${loot.label} (${loot.rarity}, ${loot.itemClass})`)
      expect(uncovered, `уровень области ${area}`).toEqual([])
    }
  })

  it('«всё остальное» идёт последним и выглядит неприметно, в цвете редкости', () => {
    for (const preset of RULE_PRESETS) {
      const rules = preset.make(null, t)
      expect(rules.slice(-3).map((r) => r.name), preset.id).toEqual(restRules(t).map((r) => r.name))
    }
    const [rare, magic, normal] = restRules(t)
    expect(rare.style?.text).toEqual({ r: 255, g: 255, b: 119, a: 255 })
    expect(magic.style?.sound).toBeNull()
    expect(baseRuleBlock({ ...normal, id: '1' }, 0, DEFAULT_CONFIG.tiers)).toContain('Rarity Normal\n    SetFontSize 30\n    SetTextColor 200 200 200 255')
  })
})

describe('оформление скрытого (под Alt)', () => {
  it('у каждого Hide — оформление тира, в котором предмет показывался бы, но без звука, луча и значка', () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      visibility: { minTier: 'A', minPrice: 0, stacks: false },
      gear: { hideLowRarity: true, areaLevel: 70 },
      gold: { ...DEFAULT_CONFIG.gold, hideSmall: true },
      waystones: { ...DEFAULT_CONFIG.waystones, minTier: 5 },
    }
    const blocks = generateFilter(snapshot([item('Scroll of Wisdom', 0.0001)]), config).split('\n\n').filter((b) => b.startsWith('Hide'))
    expect(blocks.length).toBeGreaterThan(3)
    for (const text of blocks) {
      const head = text.split('\n')[0]
      expect(text.endsWith('DisableDropSound True'), head).toBe(true)
      expect(text, head).not.toMatch(/PlayAlertSound|PlayEffect|MinimapIcon/)
    }
    const find = (prefix: string) => blocks.find((b) => b.startsWith(prefix))!
    // Свиток был бы в тире E — под Alt его оформление.
    expect(find('Hide # Currency / hidden / E')).toContain('SetFontSize 40\n    SetTextColor 240 207 132 255')
    // У скрытия обычных и магических вещей тира нет — оформление NeverSink.
    expect(find('Hide # Gear / normal and magic').endsWith(HIDDEN_LINES.map((l) => '    ' + l).join('\n'))).toBe(true)
  })
})

describe('своё оформление предмета раздела', () => {
  it('отдельный блок перед тирами, предмет показывается даже при «скрыть» и низкой цене', () => {
    const style = { ...DEFAULT_CONFIG.tiers.E, fontSize: 44, sound: { id: 3, volume: 200 } }
    const config: Config = {
      ...DEFAULT_CONFIG,
      visibility: { minTier: 'A', minPrice: 0, stacks: false },
      itemStyles: { 'Scroll of Wisdom': style },
      overrides: { 'Scroll of Wisdom': 'hide' },
    }
    const scroll = item('Scroll of Wisdom', 0.0001)
    expect(itemDisplay(scroll, config, rates)).toMatchObject({ kind: 'show', custom: true })
    const text = generateFilter(snapshot([scroll, mirror]), config)
    expect(text).toContain('Show # Currency / custom style\n    BaseType == "Scroll of Wisdom"\n    SetFontSize 44')
    expect(text).toContain('PlayAlertSound 3 200')
    expect(text.indexOf('Currency / custom style')).toBeLessThan(text.indexOf('Currency / S'))
    expect(text).not.toMatch(/Hide # Currency \/ hidden\n    BaseType == "Scroll of Wisdom"/)
  })

  it('у уника — с условием Rarity Unique', () => {
    const robe: MarketItem = { ...item('Silk Robe', 71, 'uq-armour'), uniques: [{ name: 'Temporalis', divine: 71 }] as MarketItem['uniques'] }
    const config: Config = { ...DEFAULT_CONFIG, itemStyles: { 'unique:Silk Robe': DEFAULT_CONFIG.tiers.C } }
    expect(generateFilter(snapshot([robe]), config)).toContain('Show # Unique Armours / custom style\n    Rarity Unique\n    BaseType == "Silk Robe"')
  })
})

describe('своё оформление тиров раздела', () => {
  it('в блоках тиров и стопок раздела — его оформление, в других разделах — общее', () => {
    const own = { ...DEFAULT_CONFIG.tiers.S, fontSize: 33, background: { r: 9, g: 8, b: 7, a: 255 } }
    const config: Config = {
      ...DEFAULT_CONFIG,
      sectionTiers: { currency: { S: own } },
    }
    const text = generateFilter(snapshot([mirror, item('Breach Splinter', 10, 'breach')]), config)
    expect(text).toContain('Show # Currency / S\n    BaseType == "Mirror of Kalandra"\n    SetFontSize 33')
    expect(text).toContain('SetBackgroundColor 9 8 7 255')
    expect(text).toContain('Show # Breach / S\n    BaseType == "Breach Splinter"\n    SetFontSize 45')
  })
})

describe('оформление правил наборов', () => {
  it('у каждого правила каждого набора — своё оформление, не тир валюты', () => {
    for (const preset of RULE_PRESETS) {
      for (const rule of preset.make(null, t)) {
        expect(rule.style, preset.id + ': ' + rule.name).toBeDefined()
        expect(Object.values(DEFAULT_CONFIG.tiers), rule.name).not.toContainEqual(rule.style)
      }
    }
  })

  it('исключительные — как у NeverSink: красное с оранжевым лучом и бирюзовое с синим', () => {
    const balanced = RULE_PRESETS.find((p) => p.id === 'balanced')!.make(null, t)
    const sockets3 = baseRuleBlock({ ...balanced.find((r) => r.name === t('rule.sockets3'))!, id: '1' }, 0, DEFAULT_CONFIG.tiers)!
    expect(sockets3).toContain('SetTextColor 240 0 0 255\n    SetBorderColor 240 0 0 255\n    SetBackgroundColor 70 0 20 255')
    expect(sockets3).toContain('PlayEffect Orange\n    MinimapIcon 0 Orange Pentagon')
    const sockets2 = baseRuleBlock({ ...balanced.find((r) => r.name === t('rule.sockets2'))!, id: '2' }, 1, DEFAULT_CONFIG.tiers)!
    expect(sockets2).toContain('SetTextColor 0 240 190 255')
    expect(chancingRule(['Utility Belt'], '10 div', t).style?.text).toEqual({ r: 125, g: 255, b: 89, a: 255 })
  })
})
