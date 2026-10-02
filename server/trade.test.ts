import { describe, expect, it } from 'vitest'
import { describeError, pacing, searchBody } from './trade'

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

describe('searchBody', () => {
  it('ищет обычные не осквернённые предметы категории с лишними гнёздами, по одному лоту на продавца', () => {
    const body = searchBody({ kind: 'sockets3', category: 'armour.chest', title: '' }, 100)
    expect(body.query.filters).toEqual({
      type_filters: { filters: { rarity: { option: 'normal' }, category: { option: 'armour.chest' } } },
      equipment_filters: { filters: { rune_sockets: { min: 3 } } },
      trade_filters: { filters: { price: { min: 100 }, collapse: { option: 'true' } } },
      misc_filters: { filters: { corrupted: { option: 'false' }, mirrored: { option: 'false' } } },
    })
    expect(body.sort).toEqual({ price: 'asc' })
  })

  it('для качества ставит нижнюю границу качества и не трогает гнёзда', () => {
    const { filters } = searchBody({ kind: 'quality', category: 'weapon', title: '' }, 250).query
    expect(filters.type_filters.filters).toEqual({ rarity: { option: 'normal' }, category: { option: 'weapon' }, quality: { min: 21 } })
    expect(filters).not.toHaveProperty('equipment_filters')
    expect(filters.trade_filters.filters.price).toEqual({ min: 250 })
  })
})

describe('describeError', () => {
  it('разворачивает цепочку причин с кодами', () => {
    const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
    expect(describeError(new TypeError('fetch failed', { cause: reset }))).toBe('fetch failed ← read ECONNRESET [ECONNRESET]')
    expect(describeError(new Error('просто ошибка'))).toBe('просто ошибка')
    expect(describeError('строка')).toBe('строка')
  })
})
