import { describe, expect, it } from 'vitest'
import { SECTIONS } from '../src/sections'
import { catalogItems, groupBases, groupUniques, plainText } from './market'

const line = (name: string, baseType: string, primaryValue: number, listingCount = 100) => ({
  name,
  baseType,
  icon: `${name}.png`,
  primaryValue,
  listingCount,
})

describe('groupUniques', () => {
  it('собирает уники по базе, цена базы — по самому дорогому', () => {
    const [robe, ...rest] = groupUniques(
      [line('Cloak of Flame', 'Silk Robe', 0.01), line('Temporalis', 'Silk Robe', 7100)],
      'uq-armour',
    )
    expect(rest).toEqual([])
    expect(robe).toMatchObject({ name: 'Silk Robe', section: 'uq-armour', divine: 7100 })
    expect(robe.uniques).toMatchObject([
      { name: 'Temporalis', divine: 7100, listings: 100, icon: 'Temporalis.png' },
      { name: 'Cloak of Flame', divine: 0.01 },
    ])
  })

  it('при малом числе лотов цена не учитывается, и цена базы неизвестна', () => {
    const [shank] = groupUniques(
      [line("Winter's Bite", 'Glass Shank', 3_643_979, 2), line('Other', 'Glass Shank', 0.01)],
      'uq-weapons',
    )
    expect(shank.divine).toBeNull()
    expect(shank.uniques).toMatchObject([
      { name: "Winter's Bite", divine: null, listings: 2 },
      { name: 'Other', divine: 0.01 },
    ])
  })

  it('сохраняет свойства уника без разметки poe.ninja и помечает варианты', () => {
    const [belt] = groupUniques(
      [
        {
          ...line('Mageblood', 'Utility Belt', 337),
          flavourText: 'Rivers of power.\r\nNow yours.',
          sparkLine: { totalChange: -12.5 },
          propertyModifiers: [{ text: '[Critical|Critical Hit] Chance: 15%' }],
          requirementModifiers: [{ text: 'Level: 55' }],
          implicitModifiers: [{ text: 'Has (2-3) [Charm] Slots', optional: true }],
          explicitModifiers: [{ text: 'All [MagesLegacy|Mage\'s Legacies] have (25-50)% increased effect', optional: false }],
        },
      ],
      'uq-accessories',
    )
    expect(belt.uniques![0]).toEqual({
      name: 'Mageblood',
      divine: 337,
      icon: 'Mageblood.png',
      listings: 100,
      weekChange: -12.5,
      properties: ['Critical Hit Chance: 15%'],
      requirements: ['Level: 55'],
      skills: [],
      implicits: [{ text: 'Has (2-3) Charm Slots', variant: true }],
      explicits: [{ text: "All Mage's Legacies have (25-50)% increased effect" }],
      flavour: 'Rivers of power.\nNow yours.',
    })
  })

  it('plainText убирает оба вида скобок', () => {
    expect(plainText('Adds (8-10) to (15-18) [Cold|Cold] Damage, no [Physical]')).toBe('Adds (8-10) to (15-18) Cold Damage, no Physical')
  })

  it('из нескольких строк одного уника берёт самую дорогую', () => {
    const [jewel] = groupUniques([line('Voices', 'Sapphire', 5), line('Voices', 'Sapphire', 960)], 'uq-other')
    expect(jewel.uniques).toMatchObject([{ name: 'Voices', divine: 960 }])
    expect(jewel.uniques).toHaveLength(1)
    expect(jewel.divine).toBe(960)
  })
})

describe('groupBases', () => {
  it('цена базы — по самому дорогому варианту редкости с надёжной ценой', () => {
    const tablets = groupBases(
      [
        line('Temple Tablet', 'Temple Tablet', 0.87),
        line('Temple Tablet', 'Temple Tablet', 0.62),
        line('Temple Tablet', 'Temple Tablet', 50, 2),
        line('Rare One', 'Overseer Tablet', 3, 1),
      ],
      'tablets',
    )
    expect(tablets).toEqual([
      { name: 'Temple Tablet', icon: 'Temple Tablet.png', section: 'tablets', divine: 0.87 },
      { name: 'Overseer Tablet', icon: 'Rare One.png', section: 'tablets', divine: null },
    ])
  })
})

describe('catalogItems', () => {
  const catalog = {
    fetchedAt: '',
    groups: {
      Runes: [
        { name: 'Stone Rune', icon: 'stone.png' },
        { name: 'Iron Rune', icon: 'iron.png' },
      ],
      Waystones: [{ name: 'Waystone (Tier 1)', icon: '' }],
    },
  }
  const section = (id: string) => SECTIONS.find((s) => s.id === id)!

  it('добавляет без цены только то, чего ещё нет, и не повторяет предмет в другом разделе', () => {
    const seen = new Set(['Iron Rune'])
    expect(catalogItems(catalog, section('runes'), seen)).toEqual([{ name: 'Stone Rune', icon: 'stone.png', section: 'runes', divine: null }])
    expect(catalogItems(catalog, section('runes'), seen)).toEqual([])
    expect(catalogItems(catalog, section('waystones'), seen)).toMatchObject([{ name: 'Waystone (Tier 1)', section: 'waystones' }])
    // Раздел без групп справочника и группа, которой в справочнике нет.
    expect(catalogItems(catalog, section('idols'), seen)).toEqual([])
    expect(catalogItems(catalog, section('currency'), seen)).toEqual([])
  })
})
