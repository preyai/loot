import { GEAR_CLASSES } from './defaults'
import { SECTIONS } from './sections'
import { itemDisplay } from './tiering'
import { TIER_IDS, type Config, type MarketItem, type MarketSnapshot, type Rgba, type TierId, type TierStyle } from './types'

const INDENT = '    '
const quote = (names: string[]) => names.map((n) => `"${n}"`).join(' ')
const color = (c: Rgba) => `${c.r} ${c.g} ${c.b} ${c.a}`

/**
 * Условия блоков для набора предметов. Неогранённые камни на рынке идут как
 * «Uncut Skill Gem (Level 20)», а в игре это один BaseType с разным ItemLevel,
 * поэтому соседние уровни склеиваются в диапазоны.
 */
export function matchConditions(items: MarketItem[]): string[][] {
  const plain: string[] = []
  const levels = new Map<string, number[]>()
  for (const { name } of items) {
    const leveled = /^(.+) \(Level (\d+)\)$/.exec(name)
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
      const range = i === j ? [`ItemLevel == ${list[i]}`] : [`ItemLevel >= ${list[i]}`, `ItemLevel <= ${list[j]}`]
      groups.push([`BaseType == ${quote([base])}`, ...range])
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

    for (const tier of TIER_IDS) {
      for (const conditions of matchConditions(shown.get(tier) ?? [])) {
        out.push(block('Show', `${section.label} / ${tier}`, [...conditions, ...styleLines(config.tiers[tier])]))
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
            ...conditions,
            `StackSize >= ${stackSize}`,
            ...styleLines(config.tiers[tier]),
          ]),
        )
      }
    }

    for (const conditions of matchConditions(hidden)) {
      out.push(block('Hide', `${section.label} / hidden`, conditions))
    }
  }

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
