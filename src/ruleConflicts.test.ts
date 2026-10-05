import { describe, expect, it } from 'vitest'
import { EMPTY_RULE } from './bases'
import { covers, ruleConflicts } from './ruleConflicts'
import type { BaseRule } from './types'

let n = 0
const rule = (fields: Partial<BaseRule>): BaseRule => ({ ...EMPTY_RULE, id: String(n++), name: 'r', classes: ['Boots'], ...fields })

describe('конфликты правил баз', () => {
  it('правило, накрытое правилом выше, не сработает никогда', () => {
    const wide = rule({ classes: ['Boots', 'Gloves'], minItemLevel: 75 })
    const narrow = rule({ rarities: ['Rare'], minItemLevel: 82 })
    expect(covers(wide, narrow)).toBe(true)
    expect(ruleConflicts([wide, narrow]).get(1)).toEqual({ kind: 'shadowed', by: 0 })
    // В обратном порядке узкое — исключение из широкого, и это нормально.
    expect(ruleConflicts([narrow, wide]).size).toBe(0)
  })

  it('более строгое условие выше — не накрывает', () => {
    const strict = rule({ minQuality: 20 })
    const loose = rule({})
    expect(covers(strict, loose)).toBe(false)
    // «Кроме осквернённых», «только опознанные», свойства и уровни области сужают правило.
    expect(covers(rule({ excludeCorrupted: true }), loose)).toBe(false)
    expect(covers(rule({ identified: true }), loose)).toBe(false)
    expect(covers(rule({ mods: ["Hellion's"] }), loose)).toBe(false)
    expect(covers(rule({ minAreaLevel: 65 }), rule({ minAreaLevel: 70 }))).toBe(true)
    expect(covers(rule({ maxAreaLevel: 64 }), loose)).toBe(false)
    expect(covers(rule({ mods: ['a', 'b'] }), rule({ mods: ['a'] }))).toBe(true)
  })

  it('скрытие выше показа для тех же вещей — предупреждение', () => {
    const hide = rule({ action: 'hide', rarities: ['Normal', 'Magic'], classes: ['Boots', 'Gloves'], minAreaLevel: 65 })
    // Накрыто целиком (тоже с уровня 65) — «не сработает», это важнее.
    const show = rule({ rarities: ['Magic'], minSockets: 2, minAreaLevel: 65 })
    expect(ruleConflicts([hide, show]).get(1)).toEqual({ kind: 'shadowed', by: 0 })
    // Частично (до уровня 65 скрытие ещё не действует) — «часть скрыта».
    const leveling = rule({ rarities: ['Magic'], minSockets: 2 })
    expect(ruleConflicts([hide, leveling]).get(1)).toEqual({ kind: 'hiddenBy', by: 0 })
    // Разные классы — не пересекаются.
    expect(ruleConflicts([hide, rule({ classes: ['Rings'] })]).size).toBe(0)
  })

  it('выключенные правила не мешают и не проверяются', () => {
    const off = rule({ enabled: false })
    expect(ruleConflicts([off, rule({})]).size).toBe(0)
    expect(ruleConflicts([rule({}), rule({ enabled: false })]).size).toBe(0)
  })
})

describe('готовые наборы', () => {
  it('не дают предупреждений: «всё остальное» после скрытия — обычный порядок', async () => {
    const { DEFAULT_CONFIG } = await import('./defaults')
    const { translator } = await import('./i18n')
    const { applyPreset, RULE_PRESETS } = await import('./presets')
    const t = translator('ru')
    for (const preset of RULE_PRESETS) {
      const rules = applyPreset(DEFAULT_CONFIG, preset, null, t).baseRules
      expect([...ruleConflicts(rules)].map(([i, c]) => `${preset.id}: ${rules[i].name} ${c.kind}`)).toEqual([])
    }
  })
})

describe('группы правил', () => {
  it('у каждого правила готовых наборов есть группа, а набор читается блоками', async () => {
    const { DEFAULT_CONFIG } = await import('./defaults')
    const { translator } = await import('./i18n')
    const { applyPreset, RULE_PRESETS } = await import('./presets')
    const t = translator('ru')
    for (const preset of RULE_PRESETS) {
      const rules = applyPreset(DEFAULT_CONFIG, preset, null, t).baseRules
      expect(rules.filter((r) => !r.group).map((r) => r.name)).toEqual([])
    }
    const balanced = applyPreset(DEFAULT_CONFIG, RULE_PRESETS.find((p) => p.id === 'balanced')!, null, t).baseRules
    // Подряд идущие одинаковые группы — один заголовок.
    const heads = balanced.map((r) => r.group).filter((g, i, all) => i === 0 || all[i - 1] !== g)
    expect(heads[0]).toBe('exceptional')
    expect(heads.at(-1)).toBe('rest')
  })
})
