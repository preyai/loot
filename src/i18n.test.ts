import { describe, expect, it } from 'vitest'
import { BASE_CLASSES, describeRule, EMPTY_RULE, RULE_TEMPLATES } from './bases'
import { keyOf, LANGUAGES, translateOr, translator, type Key } from './i18n'
import { RULE_PRESETS } from './presets'
import { SECTIONS } from './sections'
import { formatPrice } from './tiering'
import { TIER_IDS } from './types'
import names from './data/names-ru.json'

const ru = translator('ru')
const en = translator('en')

describe('словари', () => {
  it('подставляет параметры, а неизвестные оставляет как есть', () => {
    expect(ru('items.stackFrom', { n: 20 })).toBe('от 20 шт.')
    expect(en('items.stackFrom', { n: 20 })).toBe('20+ stack')
    expect(ru('rules.offer', { kind: 'x' })).toBe('x: от {price}')
  })

  it('для каждого раздела, тира, класса баз, набора и шаблона есть надпись на обоих языках', () => {
    const keys: Key[] = [
      ...SECTIONS.map((s) => keyOf('section', s.id)),
      ...TIER_IDS.map((tier) => keyOf('tier', tier)),
      ...BASE_CLASSES.map((c) => keyOf('class', c.name)),
      ...RULE_PRESETS.flatMap((p) => ['title', 'summary', 'details'].map((part) => keyOf('preset', `${p.id}.${part}`))),
      ...RULE_TEMPLATES.map((template) => template.title),
    ]
    for (const lang of LANGUAGES) {
      // Несуществующий ключ дал бы undefined: типы ловят опечатки, но не ключи, собранные из данных.
      for (const key of keys) expect(translator(lang)(key), `${lang}: ${key}`).toEqual(expect.any(String))
    }
  })

  it('у наборов одинаковое число пунктов описания на обоих языках', () => {
    for (const preset of RULE_PRESETS) {
      const key = keyOf('preset', `${preset.id}.details`)
      expect(en(key).split('|').length, preset.id).toBe(ru(key).split('|').length)
    }
  })

  it('translateOr отдаёт запасной текст для ключа, которого нет в словаре', () => {
    expect(translateOr(ru, 'class', 'Bows', 'Bows')).toBe('Луки')
    expect(translateOr(ru, 'class', 'Chakrams', 'Chakrams')).toBe('Chakrams')
    expect(translateOr(en, 'sectionShort', 'currency', 'Currency')).toBe('Currency')
  })

  it('подписи, собранные в коде, переводятся целиком', () => {
    expect(formatPrice(null, { exalted: 100, chaos: 10 }, 'exalted', en)).toBe('no price')
    const rule = { ...EMPTY_RULE, id: '1', name: '', classes: ['Bows'], rarities: ['Rare' as const], minSockets: 2, excludeCorrupted: true }
    expect(describeRule(rule, en)).toBe('rare · Bows · sockets 2+ · not corrupted')
    expect(RULE_PRESETS[0].make(null, en)[0].name).toBe('Exceptional: 3+ sockets (body armours, two-handed weapons)')
  })
})

describe('русские названия предметов', () => {
  it('есть у каждой базы из справочника', () => {
    const bases = names.bases as Record<string, string>
    const missing = BASE_CLASSES.flatMap((c) => c.bases).filter((b) => !bases[b.name])
    expect(missing.map((b) => b.name)).toEqual([])
  })

  it('сопоставлены правильно: проверка на названиях, сверенных вручную', () => {
    // Список баз на трейде отсортирован по-разному в разных языках; эти пары ловят съехавшее сопоставление.
    expect((names.bases as Record<string, string>)['Obliterator Bow']).toBe('Лук изничтожителя')
    expect((names.bases as Record<string, string>)['Artillery Bow']).toBe('Артиллерийский лук')
    expect((names.items as Record<string, string>)['Divine Orb']).toBe('Божественная сфера')
    expect((names.uniques as Record<string, string>)['Headhunter']).toBe('Охотник за головами')
  })
})
