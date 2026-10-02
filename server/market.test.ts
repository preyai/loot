import { describe, expect, it } from 'vitest'
import { groupUniques } from './market'

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
    expect(robe.uniques).toEqual([
      { name: 'Temporalis', divine: 7100 },
      { name: 'Cloak of Flame', divine: 0.01 },
    ])
  })

  it('при малом числе лотов цена не учитывается, и цена базы неизвестна', () => {
    const [shank] = groupUniques(
      [line("Winter's Bite", 'Glass Shank', 3_643_979, 2), line('Other', 'Glass Shank', 0.01)],
      'uq-weapons',
    )
    expect(shank.divine).toBeNull()
    expect(shank.uniques).toEqual([
      { name: "Winter's Bite", divine: null },
      { name: 'Other', divine: 0.01 },
    ])
  })

  it('из нескольких строк одного уника берёт самую дорогую', () => {
    const [jewel] = groupUniques([line('Voices', 'Sapphire', 5), line('Voices', 'Sapphire', 960)], 'uq-other')
    expect(jewel.uniques).toEqual([{ name: 'Voices', divine: 960 }])
    expect(jewel.divine).toBe(960)
  })
})
