import { BASE_CLASSES, GEAR_CLASSES, ruleStyle } from './bases'
import { SECTIONS } from './sections'
import { itemDisplay, itemKey, sectionTierStyle } from './tiering'
import { isUnhideable } from './unhideable'
import { EXTRA_GROUPS, extraKey } from './extras'
import { GOLD_PILES, LEVELING_GOLD } from './gold'
import { MAX_WAYSTONE_TIER, UPGRADE_AREA_LEVEL, UPGRADE_BORDER, WAYSTONE_BANDS } from './waystones'
import {
  RARITIES,
  TIER_IDS,
  type BaseRule,
  type Config,
  type GoldConfig,
  type HiddenStyle,
  type MarketItem,
  type MarketSnapshot,
  type Rgba,
  type TierId,
  type TierStyle,
  type WaystoneConfig,
} from './types'

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
  if (style.sound) {
    lines.push(
      style.sound.file
        ? `CustomAlertSound "${style.sound.file}" ${style.sound.volume}`
        : `PlayAlertSound ${style.sound.id} ${style.sound.volume}`,
    )
  }
  if (style.effect) lines.push(`PlayEffect ${style.effect.color}${style.effect.temp ? ' Temp' : ''}`)
  if (style.icon) lines.push(`MinimapIcon ${style.icon.size} ${style.icon.color} ${style.icon.shape}`)
  return lines
}

/**
 * Оформление скрытого предмета по умолчанию — его видно, если держать Alt. Как у NeverSink: мелкий шрифт,
 * прозрачные рамка и фон, без звука падения; цвет текста остаётся цветом редкости.
 */
export const DEFAULT_HIDDEN_STYLE: HiddenStyle = { fontSize: 18, text: null, border: null, background: null }

/** Строки оформления скрытого: прозрачная рамка и фон пишутся явно, иначе игра взяла бы свои. */
export function hiddenLines(style: HiddenStyle): string[] {
  return [
    `SetFontSize ${style.fontSize}`,
    ...(style.text ? [`SetTextColor ${color(style.text)}`] : []),
    `SetBorderColor ${style.border ? color(style.border) : '0 0 0 0'}`,
    `SetBackgroundColor ${style.background ? color(style.background) : '20 20 0 0'}`,
    'DisableDropSound True',
  ]
}

export const HIDDEN_LINES = hiddenLines(DEFAULT_HIDDEN_STYLE)

function block(action: 'Show' | 'Hide', comment: string, lines: string[]): string {
  // У каждого Hide — своё оформление: без него предмет под Alt выглядел бы как без фильтра.
  const all = action === 'Hide' ? [...lines, ...HIDDEN_LINES] : lines
  return [`${action} # ${comment}`, ...all.map((l) => INDENT + l)].join('\n')
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
  if (rule.maxAreaLevel > 0) lines.push(`AreaLevel <= ${rule.maxAreaLevel}`)
  const show = rule.action === 'show'
  // Название правила в комментарий не идёт: оно может быть не на латинице.
  return block(show ? 'Show' : 'Hide', `Bases / rule ${index + 1}`, show ? [...lines, ...styleLines(ruleStyle(rule, tiers))] : lines)
}

/**
 * Золото по образцу NeverSink: кучи от крупных к мелким, на прокачке — пороги поменьше,
 * в конце — всё остальное золото, приглушённо или скрыто.
 */
export function goldBlocks(gold: GoldConfig): string[] {
  if (!gold.enabled) return []
  const base = 'BaseType == "Gold"'
  const out = GOLD_PILES.map((pile) =>
    block('Show', `Gold / ${pile} pile`, [`StackSize >= ${gold.sizes[pile]}`, base, ...styleLines(gold.styles[pile])]),
  )
  if (gold.leveling) {
    for (const { pile, size, maxAreaLevel } of LEVELING_GOLD) {
      // Порог прокачки не выше обычного — иначе блок ничего не добавит.
      if (size >= gold.sizes[pile]) continue
      out.push(
        block('Show', `Gold / ${pile} pile while levelling`, [
          `StackSize >= ${size}`,
          base,
          `AreaLevel <= ${maxAreaLevel}`,
          ...styleLines(gold.styles[pile]),
        ]),
      )
    }
  }
  out.push(gold.hideSmall ? block('Hide', 'Gold / small piles', [base]) : block('Show', 'Gold / small piles', [base, ...styleLines(gold.styles.small)]))
  return out
}

/** Прочие предметы: правила групп по порядку, с выбранным тиром или скрытием. */
export function extraBlocks(config: Config): string[] {
  const out: string[] = []
  for (const group of EXTRA_GROUPS) {
    if (config.disabledExtras.includes(group.id)) continue
    for (const rule of group.rules) {
      const choice = config.extras[extraKey(group, rule)] ?? rule.tier
      if (choice === 'off') continue
      for (const conditions of rule.blocks) {
        out.push(
          choice === 'hide'
            ? // Скрыть нельзя (игра всё равно покажет) — тогда хотя бы неприметно и явно.
              rule.unhideable
              ? block('Show', `Other / ${group.id} / ${rule.id} (cannot be hidden)`, [...conditions, ...styleLines(REST_STYLES.other)])
              : block('Hide', `Other / ${group.id} / ${rule.id}`, conditions)
            : block('Show', `Other / ${group.id} / ${rule.id}`, [...conditions, ...styleLines(config.tiers[choice])]),
        )
      }
    }
  }
  return out
}

const rgb = (r: number, g: number, b: number, a = 255): Rgba => ({ r, g, b, a })

/** Неприметное оформление для «всего остального»: цвет как у игры по умолчанию, без рамки, звука, луча и значка. */
const quiet = (text: Rgba): TierStyle => ({
  fontSize: 30,
  text,
  border: null,
  background: rgb(0, 0, 0, 200),
  sound: null,
  effect: null,
  icon: null,
})

/** Цвета «всего остального» — как у игры по умолчанию для такой вещи. */
export const REST_STYLES = {
  unique: quiet(rgb(175, 96, 37)),
  rare: quiet(rgb(255, 255, 119)),
  magic: quiet(rgb(136, 136, 255)),
  gems: quiet(rgb(27, 162, 155)),
  normal: quiet(rgb(200, 200, 200)),
  other: quiet(rgb(170, 158, 130)),
}

/**
 * Последний слой фильтра: всё, что не поймали правила выше, получает явное неприметное оформление.
 * Так ни один предмет не остаётся «как в игре по умолчанию», что бы ни было выключено в настройках.
 * Последний блок — без условий: под него подходит любой предмет.
 */
export function restBlocks(): string[] {
  const allBases = `Class == ${quote(BASE_CLASSES.map((c) => c.name))}`
  return [
    block('Show', 'Rest / unique', ['Rarity Unique', ...styleLines(REST_STYLES.unique)]),
    block('Show', 'Rest / rare', ['Rarity Rare', ...styleLines(REST_STYLES.rare)]),
    block('Show', 'Rest / magic', ['Rarity Magic', ...styleLines(REST_STYLES.magic)]),
    // Без «==»: «Skill Gems», «Support Gems», «Uncut Skill Gems» и другие классы камней.
    block('Show', 'Rest / gems', ['Class "Gems"', ...styleLines(REST_STYLES.gems)]),
    block('Show', 'Rest / normal gear', [allBases, ...styleLines(REST_STYLES.normal)]),
    block('Show', 'Rest / everything else', styleLines(REST_STYLES.other)),
  ]
}

/** Ловушка неизвестной валюты включена — тогда предметам выключенных разделов нужен свой блок. */
const catchesUnknown = (config: Config) =>
  !config.disabledExtras.includes('unknown') && (config.extras['unknown.currency'] ?? 'B') !== 'off'

const tierRange = (from: number, to: number) =>
  // Верхняя группа — без верхней границы, как у NeverSink: на случай, если в игре появятся тиры выше 16.
  to === MAX_WAYSTONE_TIER ? [`WaystoneTier >= ${from}`] : from === to ? [`WaystoneTier ${from}`] : [`WaystoneTier >= ${from}`, `WaystoneTier <= ${to}`]

/**
 * Путевые камни по образцу NeverSink: сначала особые камни, затем группы тиров (каждая — со своим
 * оформлением и, если нужно, вариантом с красной рамкой для камня выше текущей области), в конце — скрытие низких тиров.
 */
export function waystoneBlocks(w: WaystoneConfig): string[] {
  if (!w.enabled) return []
  const waystones = 'Class == "Waystones"'
  const out: string[] = []
  if (w.corrupted) {
    // Любое свойство содержит гласную, поэтому «7 свойств с одной из гласных» — это просто 7+ свойств. Приём NeverSink.
    out.push(
      block('Show', 'Waystones / corrupted, 7+ mods', [
        waystones,
        'Corrupted True',
        'HasExplicitMod >=7 "a" "o" "e" "u" "i" "y"',
        ...styleLines(w.corrupted),
      ]),
    )
  }
  if (w.enchanted) out.push(block('Show', 'Waystones / enchanted', [waystones, 'AnyEnchantment True', ...styleLines(w.enchanted)]))

  for (const band of WAYSTONE_BANDS) {
    const from = Math.max(band.from, w.minTier)
    if (from > band.to) continue
    const style = w.styles[band.id]
    if (w.upgradeBorder) {
      for (let tier = from; tier <= band.to; tier++) {
        out.push(
          block('Show', `Waystones / T${tier} above area level`, [
            waystones,
            `WaystoneTier ${tier}`,
            `AreaLevel < ${UPGRADE_AREA_LEVEL[tier - 1]}`,
            ...styleLines({ ...style, border: UPGRADE_BORDER }),
          ]),
        )
      }
    }
    out.push(block('Show', `Waystones / T${from}${band.to > from ? '-' + band.to : ''}`, [waystones, ...tierRange(from, band.to), ...styleLines(style)]))
  }

  if (w.minTier > 1) {
    out.push(block('Hide', `Waystones / below T${w.minTier}`, [waystones, `WaystoneTier < ${w.minTier}`, 'Rarity <= Rare']))
  }
  return out
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
    // Золото — первым, как у NeverSink: у него свой базовый тип, и ничто ниже его не задевает.
    ...goldBlocks(config.gold),
  ]

  for (const section of SECTIONS) {
    if (config.disabledSections.includes(section.id)) {
      // Выключенный раздел — неприметно, как «всё остальное». Без этого блока его предметы
      // поймала бы ловушка неизвестной валюты и выделила как новинку.
      if (!section.unique && catchesUnknown(config)) {
        const items = snapshot.items.filter((item) => item.section === section.id)
        for (const conditions of matchConditions(items)) {
          out.push(block('Show', `${section.label} / disabled`, [...conditions, ...styleLines(REST_STYLES.other)]))
        }
      }
      continue
    }

    const shown = new Map<TierId, MarketItem[]>()
    const stacks = new Map<string, { tier: TierId; stackSize: number; items: MarketItem[] }>()
    const hidden: MarketItem[] = []
    const custom: MarketItem[] = []
    for (const item of snapshot.items) {
      if (item.section !== section.id) continue
      const display = itemDisplay(item, config, snapshot.rates)
      if (display.kind === 'show' && display.custom) {
        custom.push(item)
        continue
      }
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
    // И наоборот: правило для обычной плитки не должно задеть уникальную на той же базе.
    const rarity = section.unique ? ['Rarity Unique'] : section.bases ? ['Rarity <= Rare'] : []

    // Своё оформление предмета — отдельным блоком перед тирами раздела.
    for (const item of custom) {
      for (const conditions of matchConditions([item])) {
        out.push(block('Show', `${section.label} / custom style`, [...rarity, ...conditions, ...styleLines(config.itemStyles[itemKey(item)])]))
      }
    }

    for (const tier of TIER_IDS) {
      for (const conditions of matchConditions(shown.get(tier) ?? [])) {
        out.push(block('Show', `${section.label} / ${tier}`, [...rarity, ...conditions, ...styleLines(sectionTierStyle(config, section.id, tier))]))
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
            ...styleLines(sectionTierStyle(config, section.id, tier)),
          ]),
        )
      }
    }

    // Ключи реликвария и реликвии игра скрыть не даёт: вместо бесполезного Hide — неприметный Show.
    const shownAnyway = hidden.filter((item) => isUnhideable(item.name))
    for (const conditions of matchConditions(shownAnyway)) {
      const style = section.unique ? REST_STYLES.unique : REST_STYLES.other
      out.push(block('Show', `${section.label} / hidden, but the game always shows it`, [...rarity, ...conditions, ...styleLines(style)]))
    }
    for (const conditions of matchConditions(hidden.filter((item) => !isUnhideable(item.name)))) {
      out.push(block('Hide', `${section.label} / hidden`, [...rarity, ...conditions]))
    }
  }

  out.push(...waystoneBlocks(config.waystones))
  out.push(...extraBlocks(config))

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

  out.push(...restBlocks())
  // Своё оформление скрытых — вместо стандартного во всех блоках Hide (блоки пишет одна функция block):
  // у раздела рынка со своим оформлением скрытых — его, у остальных — общее.
  const standard = HIDDEN_LINES.map((l) => INDENT + l).join('\n')
  const lines = (style: HiddenStyle) => hiddenLines(style).map((l) => INDENT + l).join('\n')
  const general = lines(config.hiddenStyle)
  const bySection = SECTIONS.filter((s) => config.sectionHidden[s.id]).map((s) => [`Hide # ${s.label} / `, lines(config.sectionHidden[s.id]!)] as const)
  const blocks = out.map((text) => {
    if (!text.startsWith('Hide')) return text
    const own = bySection.find(([prefix]) => text.startsWith(prefix))
    return text.replace(standard, own ? own[1] : general)
  })
  return blocks.join('\n\n') + '\n'
}
