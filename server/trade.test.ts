import { describe, expect, it } from 'vitest'
import { listingDivine, median, pacing } from './trade'

describe('pacing', () => {
  const SEARCH_RULES = '5:10:60,15:60:300,30:300:1800,600:21600:3600'

  it('темп задаёт самое строгое короткое окно, с запасом 10%', () => {
    // 30 запросов за 300 с → 10 с на запрос
    expect(pacing(SEARCH_RULES, '1:10:0,1:60:0,1:300:0,108:21600:0')).toEqual({ spacingMs: 11_000, pauseMs: 0, exhausted: null })
  })

  it('исчерпанное короткое окно и активный штраф дают паузу', () => {
    expect(pacing(SEARCH_RULES, '5:10:0,6:60:0,6:300:0,108:21600:0').pauseMs).toBe(10_000)
    expect(pacing(SEARCH_RULES, '1:10:60,1:60:0,1:300:0,108:21600:0').pauseMs).toBe(60_000)
  })

  it('исчерпанный длинный лимит останавливает обновление, а не ставит на паузу', () => {
    const p = pacing(SEARCH_RULES, '1:10:0,1:60:0,1:300:0,600:21600:0')
    expect(p.exhausted).toContain('600 запросов за 6 ч')
    expect(p.pauseMs).toBe(0)
  })

  it('без заголовков ничего не меняет', () => {
    expect(pacing(null, null)).toEqual({ spacingMs: 0, pauseMs: 0, exhausted: null })
  })
})

describe('цена лота', () => {
  const rates = { exalted: 700, chaos: 10 }

  it('переводит exalted и chaos в divine, прочие валюты пропускает', () => {
    expect(listingDivine({ amount: 2, currency: 'divine' }, rates)).toBe(2)
    expect(listingDivine({ amount: 350, currency: 'exalted' }, rates)).toBe(0.5)
    expect(listingDivine({ amount: 3, currency: 'chaos' }, rates)).toBe(0.3)
    expect(listingDivine({ amount: 5, currency: 'vaal' }, rates)).toBeNull()
    expect(listingDivine(undefined, rates)).toBeNull()
  })

  it('медиана', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})
