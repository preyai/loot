import { describe, expect, it } from 'vitest'
import { scoutPrice, type ScoutPrices } from './scout'

const scout: ScoutPrices = {
  rates: { exalted: 719.4, chaos: 10.38 },
  prices: new Map([
    ['Chaos Orb', { divine: 0.09636, volume: 2_600_000 }],
    ['Rare Rune', { divine: 2, volume: 1 }],
  ]),
}

describe('цена с poe2scout', () => {
  it('берётся, если по предмету достаточно сделок', () => {
    expect(scoutPrice(scout, 'Chaos Orb', 0.09821)).toBe(0.09636)
  })

  it('при паре сделок остаётся цена poe.ninja, а без неё — берём хоть такую', () => {
    expect(scoutPrice(scout, 'Rare Rune', 1.5)).toBeNull()
    expect(scoutPrice(scout, 'Rare Rune', null)).toBe(2)
  })

  it('предмета нет на poe2scout — цены оттуда нет', () => {
    expect(scoutPrice(scout, 'Unknown', 1)).toBeNull()
  })
})
