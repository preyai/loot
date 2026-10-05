import { BASE_CLASSES } from './bases'
import { RARITIES, type BaseRule } from './types'

/**
 * Конфликты правил баз. Игра берёт первое подошедшее правило, поэтому:
 * — правило, всё «поле» которого уже накрыто правилом выше, не сработает никогда;
 * — правило показа, часть вещей которого раньше скрывает правило скрытия, покажет не всё.
 * Проверка консервативная: «никогда не сработает» — только когда это точно так по условиям правил.
 */
export type RuleConflict =
  /** Всё, что ловит правило, раньше ловит правило by (индекс в списке). */
  | { kind: 'shadowed'; by: number }
  /** Часть вещей правила показа раньше скрывает правило by. */
  | { kind: 'hiddenBy'; by: number }

/** Базы, которые затрагивает правило: выбранные или все базы его классов. */
export function ruleBases(rule: BaseRule): Set<string> {
  if (rule.bases.length) return new Set(rule.bases)
  return new Set(BASE_CLASSES.filter((c) => rule.classes.includes(c.name)).flatMap((c) => c.bases.map((b) => b.name)))
}

const rarities = (rule: BaseRule) => new Set(rule.rarities.length ? rule.rarities : RARITIES)
const subset = <T>(a: Set<T>, b: Set<T>) => [...a].every((x) => b.has(x))
const intersects = <T>(a: Set<T>, b: Set<T>) => [...a].some((x) => b.has(x))
/** Диапазон уровней области правила; 0 сверху — без ограничения. */
const area = (rule: BaseRule) => [rule.minAreaLevel, rule.maxAreaLevel || Infinity] as const

/** Правило outer ловит всё, что ловит inner (и, возможно, больше). */
export function covers(outer: BaseRule, inner: BaseRule): boolean {
  if (!subset(ruleBases(inner), ruleBases(outer))) return false
  if (!subset(rarities(inner), rarities(outer))) return false
  // Нижние границы: у внешнего не строже.
  if (outer.minItemLevel > inner.minItemLevel) return false
  if (outer.minQuality > inner.minQuality) return false
  if (outer.minSockets > inner.minSockets) return false
  if (outer.minUnidentifiedTier > inner.minUnidentifiedTier) return false
  const [outerFrom, outerTo] = area(outer)
  const [innerFrom, innerTo] = area(inner)
  if (outerFrom > innerFrom || outerTo < innerTo) return false
  // Ограничения-исключения: если внешнее их ставит, у внутреннего они тоже должны быть.
  if (outer.excludeCorrupted && !inner.excludeCorrupted) return false
  if (outer.identified && !inner.identified) return false
  if (outer.mods.length) {
    // Внутреннее требует не меньше свойств, и все они из списка внешнего — значит, и условие внешнего выполнено.
    if (!inner.mods.length || !inner.mods.every((m) => outer.mods.includes(m)) || inner.minMods < outer.minMods) return false
  }
  return true
}

/** Есть ли вещи, которые подходят под оба правила. */
export function overlaps(a: BaseRule, b: BaseRule): boolean {
  if (!intersects(ruleBases(a), ruleBases(b)) || !intersects(rarities(a), rarities(b))) return false
  const [aFrom, aTo] = area(a)
  const [bFrom, bTo] = area(b)
  return aFrom <= bTo && bFrom <= aTo
}

/**
 * Правило показа — исключение из правила скрытия: у него есть условие строже (уровень, качество, гнёзда, ступень
 * свойств, свойства, выбранные базы). Такое правило должно стоять выше скрытия. «Всё остальное» без особых условий
 * ниже скрытия — обычный порядок, о нём не предупреждаем.
 */
function isException(show: BaseRule, hide: BaseRule): boolean {
  return (
    show.minItemLevel > hide.minItemLevel ||
    show.minQuality > hide.minQuality ||
    show.minSockets > hide.minSockets ||
    show.minUnidentifiedTier > hide.minUnidentifiedTier ||
    show.mods.length > 0 ||
    (show.identified && !hide.identified) ||
    (show.bases.length > 0 && hide.bases.length === 0)
  )
}

/** Конфликт каждого включённого правила с правилами выше; ключ — индекс правила в списке. */
export function ruleConflicts(rules: BaseRule[]): Map<number, RuleConflict> {
  const result = new Map<number, RuleConflict>()
  const active = (rule: BaseRule) => rule.enabled && rule.classes.length > 0
  rules.forEach((rule, i) => {
    if (!active(rule)) return
    for (let j = 0; j < i; j++) {
      if (!active(rules[j])) continue
      if (covers(rules[j], rule)) {
        result.set(i, { kind: 'shadowed', by: j })
        return
      }
    }
    if (rule.action !== 'show') return
    const hider = rules.findIndex(
      (other, j) => j < i && active(other) && other.action === 'hide' && overlaps(other, rule) && isException(rule, other),
    )
    if (hider >= 0) result.set(i, { kind: 'hiddenBy', by: hider })
  })
  return result
}
