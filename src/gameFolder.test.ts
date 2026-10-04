import { describe, expect, it } from 'vitest'
import { filterFileName } from './gameFolder'

describe('имя файла фильтра', () => {
  it('из названия: запрещённые в Windows символы убираются, пустое — имя по умолчанию', () => {
    expect(filterFileName('Мой фильтр')).toBe('Мой фильтр.filter')
    expect(filterFileName('  a/b:c*?"<>|  ')).toBe('abc.filter')
    expect(filterFileName('')).toBe('LootEditor.filter')
    expect(filterFileName('???')).toBe('LootEditor.filter')
    expect(filterFileName('x'.repeat(100))).toBe(`${'x'.repeat(60)}.filter`)
  })
})
