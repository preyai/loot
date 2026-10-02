import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './defaults'
import { generateFilter, matchConditions } from './filter'
import { convertCurrency, formatPrice, itemDisplay } from './tiering'
import type { Config, MarketItem, MarketSnapshot } from './types'

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
