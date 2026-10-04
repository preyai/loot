import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './defaults'
import { generateFilter, REST_STYLES } from './filter'
import { defaultStyle, evaluate, KNOWN_CONDITIONS, matchCondition, parseFilter, trace, type DroppedItem } from './filterEval'
import { generateLoot } from './lootSim'
import type { Config, MarketItem, MarketSnapshot } from './types'

const market = (name: string, divine: number | null, section: MarketItem['section'] = 'currency'): MarketItem => ({
  name,
  icon: '',
  section,
  divine,
})

const snapshot = (items: MarketItem[]): MarketSnapshot => ({
  league: 'Test',
  fetchedAt: '2026-10-04T00:00:00.000Z',
  rates: { exalted: 100, chaos: 10 },
  items,
  failed: [],
})

const drop = (fields: Partial<DroppedItem> & Pick<DroppedItem, 'itemClass' | 'baseType'>): DroppedItem => ({
  rarity: 'Normal',
  itemLevel: 80,
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

/** Детерминированный генератор случайных чисел для тестов. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31
    return seed / 2 ** 31
  }
}

const currency = (name: string, stackSize = 1) => drop({ itemClass: 'Stackable Currency', baseType: name, stackSize })

describe('разбор фильтра', () => {
  it('блоки, условия, оформление и Continue', () => {
    const blocks = parseFilter(`# комментарий
Show # Gold / huge
    StackSize >= 5000
    BaseType == "Gold"
    SetFontSize 40
    Continue

Hide # rest
    Class == "Boots"
`)
    expect(blocks).toMatchObject([
      { action: 'Show', comment: 'Gold / huge', line: 2, conditions: ['StackSize >= 5000', 'BaseType == "Gold"'], actions: ['SetFontSize 40'], continues: true },
      { action: 'Hide', comment: 'rest', conditions: ['Class == "Boots"'], continues: false },
    ])
  })

  it('предпросмотр понимает все условия, которые пишет наш генератор', () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      visibility: { minTier: 'C', minPrice: 0, stacks: true },
      gear: { hideLowRarity: true, areaLevel: 70 },
      waystones: { ...DEFAULT_CONFIG.waystones, minTier: 5 },
      baseRules: [
        {
          id: '1',
          name: 'x',
          enabled: true,
          action: 'show',
          classes: ['Bows'],
          bases: [],
          rarities: ['Rare'],
          minItemLevel: 82,
          minQuality: 10,
          minSockets: 2,
          minUnidentifiedTier: 3,
          minAreaLevel: 65,
          maxAreaLevel: 80,
          excludeCorrupted: true,
          tier: 'B',
        },
      ],
    }
    const items = [market('Divine Orb', 1), market('Scroll of Wisdom', 0.0001), market('Uncut Skill Gem (Level 20)', 1, 'gems')]
    const names = new Set(parseFilter(generateFilter(snapshot(items), config)).flatMap((b) => b.conditions.map((c) => c.split(/\s/)[0])))
    expect([...names].filter((name) => !KNOWN_CONDITIONS.includes(name))).toEqual([])
  })
})

describe('условия', () => {
  const boots = drop({ itemClass: 'Boots', baseType: 'Stacked Sabatons', rarity: 'Rare', itemLevel: 82, explicitMods: 5 })

  it('BaseType и Class: «==» — точное имя, без него — часть имени', () => {
    expect(matchCondition('BaseType == "Stacked Sabatons" "Other"', boots, 70)).toBe(true)
    expect(matchCondition('BaseType == "Sabatons"', boots, 70)).toBe(false)
    expect(matchCondition('BaseType "Sabatons"', boots, 70)).toBe(true)
    expect(matchCondition('Class == "Boots" "Gloves"', boots, 70)).toBe(true)
  })

  it('редкость: список и сравнение', () => {
    expect(matchCondition('Rarity <= Rare', boots, 70)).toBe(true)
    expect(matchCondition('Rarity <= Rare', { ...boots, rarity: 'Unique' }, 70)).toBe(false)
    expect(matchCondition('Rarity Normal Magic', boots, 70)).toBe(false)
    expect(matchCondition('Rarity Magic Rare Unique', boots, 70)).toBe(true)
  })

  it('числа, уровень области, флаги и число свойств', () => {
    expect(matchCondition('ItemLevel >= 82', boots, 70)).toBe(true)
    expect(matchCondition('ItemLevel 81', boots, 70)).toBe(false)
    expect(matchCondition('AreaLevel <= 64', boots, 70)).toBe(false)
    expect(matchCondition('Corrupted False', boots, 70)).toBe(true)
    expect(matchCondition('HasExplicitMod >=5 "a" "o" "e" "u" "i" "y"', boots, 70)).toBe(true)
    expect(matchCondition('HasExplicitMod >=7 "a" "o" "e" "u" "i" "y"', boots, 70)).toBe(false)
    expect(matchCondition('SomethingNew 1', boots, 70)).toBe(false)
  })
})

describe('вид предмета', () => {
  const filter = parseFilter(generateFilter(snapshot([market('Divine Orb', 1), market('Scroll of Wisdom', 0.0001)]), DEFAULT_CONFIG))

  it('дорогая валюта — стиль своего тира и подпись правила', () => {
    const look = evaluate(filter, currency('Divine Orb'), 70)
    expect(look.visible).toBe(true)
    expect(look.block?.comment).toBe('Currency / A')
    expect(look.style.fontSize).toBe(DEFAULT_CONFIG.tiers.A.fontSize)
    expect(look.style.sound).toEqual(DEFAULT_CONFIG.tiers.A.sound)
  })

  it('золото — по размеру кучи', () => {
    expect(evaluate(filter, drop({ itemClass: 'Gold', baseType: 'Gold', stackSize: 6000 }), 70).block?.comment).toBe('Gold / huge pile')
    expect(evaluate(filter, drop({ itemClass: 'Gold', baseType: 'Gold', stackSize: 10 }), 70).block?.comment).toBe('Gold / small piles')
  })

  it('скрытый предмет и предмет без правила', () => {
    const hiding = parseFilter(
      generateFilter(snapshot([market('Scroll of Wisdom', 0.0001)]), { ...DEFAULT_CONFIG, visibility: { minTier: 'C', minPrice: 0, stacks: false } }),
    )
    expect(evaluate(hiding, currency('Scroll of Wisdom'), 70).visible).toBe(false)
    // Ни одного своего правила — предмет попадает в последний слой «всё остальное», а не остаётся «как в игре».
    const nothing = drop({ itemClass: 'Body Armours', baseType: 'Vile Robe', rarity: 'Magic' })
    const look = evaluate(hiding, nothing, 70)
    expect(look.block?.comment).toBe('Rest / magic')
    expect(look.style).toEqual(REST_STYLES.magic)
    // Без фильтра вообще — вид игры по умолчанию.
    expect(evaluate([], nothing, 70)).toEqual({ visible: true, style: defaultStyle(nothing), block: null })
  })

  it('всё выключено — у любого предмета всё равно есть правило фильтра', () => {
    const items = [market('Divine Orb', 1), market('Scroll of Wisdom', 0.0001), { ...market('Utility Belt', 300, 'uq-accessories'), uniques: [] }]
    const config: Config = {
      ...DEFAULT_CONFIG,
      disabledSections: ['currency', 'uq-accessories'],
      waystones: { ...DEFAULT_CONFIG.waystones, enabled: false },
      gold: { ...DEFAULT_CONFIG.gold, enabled: false },
      disabledExtras: ['quest', 'trials', 'relics', 'gems', 'unknown'],
      baseRules: [],
    }
    const blocks = parseFilter(generateFilter(snapshot(items), config))
    for (const area of [5, 70, 83]) {
      const orphans = generateLoot(items, area, 300, seeded(area)).filter((loot) => evaluate(blocks, loot, area).block === null)
      expect(orphans.map((o) => o.label), `уровень области ${area}`).toEqual([])
    }
    // Особые классы — тоже в последнем слое: камни и предметы, которых нет ни в одном справочнике.
    expect(evaluate(blocks, drop({ itemClass: 'Skill Gems', baseType: 'Fireball' }), 70).block?.comment).toBe('Rest / gems')
    expect(evaluate(blocks, drop({ itemClass: 'Something New', baseType: 'Odd Thing' }), 70).block?.comment).toBe('Rest / everything else')
  })

  it('с Continue оформление складывается, решает последний подошедший блок', () => {
    const blocks = parseFilter(`Show # deco
    Class == "Waystones"
    SetFontSize 42
    SetBorderColor 0 0 0 255
    Continue

Show # tier
    WaystoneTier 15
    PlayAlertSound 5 300
`)
    const look = evaluate(blocks, drop({ itemClass: 'Waystones', baseType: 'Waystone (Tier 15)', waystoneTier: 15 }), 79)
    expect(look.block?.comment).toBe('tier')
    expect(look.style).toMatchObject({ fontSize: 42, border: { r: 0, g: 0, b: 0, a: 255 }, sound: { id: 5, volume: 300 } })
  })
})

describe('генератор лута', () => {
  const items = [market('Divine Orb', 1), market('Scroll of Wisdom', 0.0001), { ...market('Utility Belt', 300, 'uq-accessories'), uniques: [] }]

  it('выдаёт заданное число предметов, и фильтр справляется с каждым', () => {
    const filter = parseFilter(generateFilter(snapshot(items), DEFAULT_CONFIG))
    const loot = generateLoot(items, 80, 300, seeded(1))
    expect(loot).toHaveLength(300)
    for (const item of loot) expect(() => evaluate(filter, item, 80)).not.toThrow()
    expect(new Set(loot.map((i) => i.itemClass)).size).toBeGreaterThan(10)
    expect(loot.some((i) => i.itemClass === 'Waystones')).toBe(true)
  })

  it('только предметы с названием: подходит любое имя, в том числе уника на базе', () => {
    const keys = [market('Twilight Reliquary Key', 2, 'fragments'), market("Olroth's Reliquary Key", 5, 'fragments'), ...items]
    const loot = generateLoot(keys, 80, 50, seeded(3), (name) => name.includes('Reliquary Key'))
    expect(loot).toHaveLength(50)
    expect(new Set(loot.map((i) => i.label))).toEqual(new Set(['Twilight Reliquary Key', "Olroth's Reliquary Key"]))
    expect(loot.every((i) => i.itemClass === 'Vault Keys')).toBe(true)
    const withUniques = [{ ...market('Utility Belt', 300, 'uq-accessories'), uniques: [{ name: 'Mageblood' }] as MarketItem['uniques'] }]
    expect(generateLoot(withUniques, 80, 5, seeded(4), (name) => name === 'Mageblood').every((i) => i.rarity === 'Unique')).toBe(true)
    expect(generateLoot(keys, 80, 10, seeded(5), () => false)).toEqual([])
  })

  it('путевые камни — только в картах, базы — не старше уровня области', () => {
    const loot = generateLoot(items, 10, 300, seeded(2))
    expect(loot.some((i) => i.itemClass === 'Waystones')).toBe(false)
    expect(loot.filter((i) => i.rarity !== 'Unique').every((i) => i.dropLevel <= 10)).toBe(true)
  })
})

describe('правила, действующие на предмет', () => {
  it('оформление, решающий блок, недостижимые ниже и почти подошедшие', () => {
    const blocks = parseFilter(`Show # deco
    Class == "Stackable Currency"
    SetFontSize 40
    Continue

Show # stacks
    BaseType == "Scroll of Wisdom"
    StackSize >= 20

Show # single
    BaseType == "Scroll of Wisdom"

Hide # later
    Class == "Stackable Currency"

Show # other
    BaseType == "Divine Orb"
`)
    const entries = trace(blocks, currency('Scroll of Wisdom', 3), 70)
    expect(entries.map((e) => [e.block.comment, e.role, e.failed])).toEqual([
      ['deco', 'decorator', []],
      ['stacks', 'near', ['StackSize >= 20']],
      ['single', 'decisive', []],
      ['later', 'unreached', []],
    ])
  })
})

describe('предметы, которые игра не даёт скрыть', () => {
  it('ключ реликвария: в фильтре вместо Hide — неприметный Show, предпросмотр его показывает', () => {
    const key = market('Twilight Reliquary Key', 0.001, 'fragments')
    const config: Config = { ...DEFAULT_CONFIG, visibility: { minTier: 'A', minPrice: 0, stacks: false } }
    const text = generateFilter(snapshot([key, market('Scroll of Wisdom', 0.0001)]), config)
    expect(text).toContain('Show # Fragments / hidden, but the game always shows it\n    BaseType == "Twilight Reliquary Key"\n    SetFontSize 30')
    expect(text).not.toMatch(/Hide # Fragments \/ hidden\n    BaseType == "Twilight Reliquary Key"/)
    const loot = generateLoot([key], 70, 3, seeded(9), (name) => name.includes('Reliquary'))
    expect(loot.every((i) => i.itemClass === 'Vault Keys')).toBe(true)
    expect(evaluate(parseFilter(text), loot[0], 70)).toMatchObject({ visible: true, block: { action: 'Show' } })
  })

  it('Hide на ключ реликвария или реликвию предпросмотр не выполняет — как игра', () => {
    const blocks = parseFilter('Hide # all\n    BaseType "Reliquary Key" "Relic"\n    SetFontSize 20\n')
    const key = evaluate(blocks, drop({ itemClass: 'Vault Keys', baseType: 'Twilight Reliquary Key' }), 70)
    expect(key).toMatchObject({ visible: true, forcedVisible: true })
    expect(key.style.fontSize).toBe(20)
    expect(evaluate(blocks, drop({ itemClass: 'Relics', baseType: 'Vase Relic' }), 70).visible).toBe(true)
    expect(evaluate(parseFilter('Hide # all\n    Class "Boots"\n'), drop({ itemClass: 'Boots', baseType: 'X' }), 70).visible).toBe(false)
  })

  it('реликвии в прочих предметах: «скрывать» превращается в неприметный показ', () => {
    const text = generateFilter(snapshot([]), { ...DEFAULT_CONFIG, extras: { 'relics.any': 'hide' } })
    expect(text).toContain('Show # Other / relics / any (cannot be hidden)')
    expect(text).not.toContain('Hide # Other / relics')
  })
})
