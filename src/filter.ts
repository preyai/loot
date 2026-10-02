import { GEAR_CLASSES, ruleStyle } from './bases'
import { SECTIONS } from './sections'
import { itemDisplay } from './tiering'
import { RARITIES, TIER_IDS, type BaseRule, type Config, type MarketItem, type MarketSnapshot, type Rgba, type TierId, type TierStyle } from './types'

const INDENT = '    '
const quote = (names: string[]) => names.map((n) => `"${n}"`).join(' ')
const color = (c: Rgba) => `${c.r} ${c.g} ${c.b} ${c.a}`

/**
 * Условия блоков для набора предметов. Неогранённые камни на рынке идут как
 * «Uncut Skill Gem (Level 20)», а в фильтре это тип камня и условие GemLevel,
 * поэтому соседние уровни склеиваются в диапазоны.
 */
export function matchConditions(items: MarketItem[]): string[][] {
  const plain: string[] = []
  const levels = new Map<string, number[]>()
  for (const { name } of items) {
    // Только камни. У прочих предметов с уровнем в названии («Thaumaturgic Flux (Level 15)»)
    // каждое такое название — отдельный базовый тип, и сокращённого имени игра не знает.
    const leveled = /^(Uncut \w+ Gem) \(Level (\d+)\)$/.exec(name)
    if (!leveled) {
      plain.push(name)
      continue
    }
    const list = levels.get(leveled[1]) ?? []
    list.push(Number(leveled[2]))
    levels.set(leveled[1], list)
  }

  const groups: string[][] = []
  if (plain.length) groups.push([`BaseType == ${quote(plain)}`])
  for (const [base, list] of levels) {
    list.sort((a, b) => a - b)
    for (let i = 0; i < list.length; ) {
      let j = i
      while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++
      const range = i === j ? [`GemLevel ${list[i]}`] : [`GemLevel >= ${list[i]}`, `GemLevel <= ${list[j]}`]
      // Без «==»: совпадение по части имени находит камень, как бы игра ни записала его базовый тип —
      // «Uncut Skill Gem» или «Uncut Skill Gem (Level 20)». Так же сделано в фильтре NeverSink.
      groups.push([`BaseType ${quote([base])}`, ...range])
      i = j + 1
    }
  }
  return groups
}

export function styleLines(style: TierStyle): string[] {
  const lines = [`SetFontSize ${style.fontSize}`, `SetTextColor ${color(style.text)}`]
  if (style.border) lines.push(`SetBorderColor ${color(style.border)}`)
  if (style.background) lines.push(`SetBackgroundColor ${color(style.background)}`)
  if (style.sound) lines.push(`PlayAlertSound ${style.sound.id} ${style.sound.volume}`)
  if (style.effect) lines.push(`PlayEffect ${style.effect.color}${style.effect.temp ? ' Temp' : ''}`)
  if (style.icon) lines.push(`MinimapIcon ${style.icon.size} ${style.icon.color} ${style.icon.shape}`)
  return lines
}

function block(action: 'Show' | 'Hide', comment: string, lines: string[]): string {
  return [`${action} # ${comment}`, ...lines.map((l) => INDENT + l)].join('\n')
}

/** Блок фильтра для правила баз; null — правило выключено или ничего не выбирает. */
export function baseRuleBlock(rule: BaseRule, index: number, tiers: Config['tiers']): string | null {
  if (!rule.enabled || rule.classes.length === 0) return null
  const all = rule.rarities.length === 0 || rule.rarities.length === RARITIES.length
  const lines = [
    rule.bases.length ? `BaseType == ${quote(rule.bases)}` : `Class == ${quote(rule.classes)}`,
    // Даже «любая редкость» не должна задевать уники: у них свои разделы.
    all ? 'Rarity <= Rare' : `Rarity ${rule.rarities.join(' ')}`,
  ]
  if (rule.minItemLevel > 0) lines.push(`ItemLevel >= ${rule.minItemLevel}`)
  if (rule.minQuality > 0) lines.push(`Quality >= ${rule.minQuality}`)
  if (rule.minSockets > 0) lines.push(`Sockets >= ${rule.minSockets}`)
  if (rule.minUnidentifiedTier > 0) lines.push(`UnidentifiedItemTier >= ${rule.minUnidentifiedTier}`)
  if (rule.excludeCorrupted) lines.push('Corrupted False', 'Mirrored False')
  if (rule.minAreaLevel > 0) lines.push(`AreaLevel >= ${rule.minAreaLevel}`)
  const show = rule.action === 'show'
  // Название правила в комментарий не идёт: оно может быть не на латинице.
  return block(show ? 'Show' : 'Hide', `Bases / rule ${index + 1}`, show ? [...lines, ...styleLines(ruleStyle(rule, tiers))] : lines)
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

export function generateFilter(snapshot: MarketSnapshot, config: Config): string {
  const out: string[] = [
    '#' + '='.repeat(70),
    '# Loot Filter Editor',
    `# League: ${snapshot.league} | prices: poe.ninja, ${snapshot.fetchedAt}`,
    '#' + '='.repeat(70),
  ]

  for (const section of SECTIONS) {
    if (config.disabledSections.includes(section.id)) continue

    const shown = new Map<TierId, MarketItem[]>()
    const stacks = new Map<string, { tier: TierId; stackSize: number; items: MarketItem[] }>()
    const hidden: MarketItem[] = []
    for (const item of snapshot.items) {
      if (item.section !== section.id) continue
      const display = itemDisplay(item, config, snapshot.rates)
      if (display.kind === 'show') {
        push(shown, display.tier, item)
        continue
      }
      hidden.push(item)
      if (display.kind === 'stack') {
        const key = `${display.tier}:${display.stackSize}`
        const group = stacks.get(key) ?? { tier: display.tier, stackSize: display.stackSize, items: [] }
        group.items.push(item)
        stacks.set(key, group)
      }
    }

    // Без этого условия правило для базы уника задело бы и обычные предметы на той же базе.
    const rarity = section.unique ? ['Rarity Unique'] : []

    for (const tier of TIER_IDS) {
      for (const conditions of matchConditions(shown.get(tier) ?? [])) {
        out.push(block('Show', `${section.label} / ${tier}`, [...rarity, ...conditions, ...styleLines(config.tiers[tier])]))
      }
    }

    // Игра берёт первый подошедший блок, поэтому стопки должны идти раньше Hide для тех же предметов.
    const stackGroups = [...stacks.values()].sort(
      (a, b) => TIER_IDS.indexOf(a.tier) - TIER_IDS.indexOf(b.tier) || a.stackSize - b.stackSize,
    )
    for (const { tier, stackSize, items } of stackGroups) {
      for (const conditions of matchConditions(items)) {
        out.push(
          block('Show', `${section.label} / ${tier} / stacks of ${stackSize}+`, [
            ...rarity,
            ...conditions,
            `StackSize >= ${stackSize}`,
            ...styleLines(config.tiers[tier]),
          ]),
        )
      }
    }

    for (const conditions of matchConditions(hidden)) {
      out.push(block('Hide', `${section.label} / hidden`, [...rarity, ...conditions]))
    }
  }

  config.baseRules.forEach((rule, index) => {
    const text = baseRuleBlock(rule, index, config.tiers)
    if (text) out.push(text)
  })

  if (config.gear.hideLowRarity) {
    out.push(
      block('Hide', 'Gear / normal and magic', [
        `Class == ${quote(GEAR_CLASSES)}`,
        'Rarity <= Magic',
        `AreaLevel >= ${config.gear.areaLevel}`,
      ]),
    )
  }

  return out.join('\n\n') + '\n'
}
