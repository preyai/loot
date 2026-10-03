import catalog from './data/bases.json'
import { keyOf, type Lang, type T } from './i18n'
import { RARITIES, type BaseRule, type TierId, type TierStyle } from './types'

export type BaseGroup = 'weapon' | 'armour' | 'jewellery'

export interface BaseInfo {
  name: string
  /** Уровень, с которого база начинает выпадать. */
  drop: number
  /** Защита базы: a — броня, e — уклонение, s — энергощит. */
  defence?: string
  /** Путь к иконке в игровых файлах, без «Art/2DItems/» и расширения. */
  icon?: string
}

export interface BaseClass {
  /** Имя класса, как его понимает условие Class в фильтре. */
  name: string
  group: BaseGroup
  bases: BaseInfo[]
}

/** Справочник собирается скриптом scripts/update-bases.mjs. */
export const BASE_CLASSES = catalog as BaseClass[]

const BASE_BY_NAME = new Map(BASE_CLASSES.flatMap((c) => c.bases.map((b) => [b.name, b] as const)))

/** Иконки лежат там же, откуда собран справочник, — в выгрузке игровых данных RePoE. */
const ICON_HOST = 'https://repoe-fork.github.io/poe2/Art/2DItems'

/** Адрес иконки базы; null — база неизвестна справочнику или у неё нет иконки. */
export function baseIconUrl(name: string): string | null {
  const icon = BASE_BY_NAME.get(name)?.icon
  return icon ? `${ICON_HOST}/${icon}.webp` : null
}

/** Разделы poe2db по языкам интерфейса. */
const POE2DB: Record<Lang, string> = { ru: 'ru', en: 'us', de: 'de', fr: 'fr', es: 'sp', pt: 'pt', ja: 'jp', ko: 'kr', th: 'th' }

/** Страница предмета (базы или уника) в справочнике poe2db на языке интерфейса. */
export const wikiUrl = (name: string, lang: Lang) =>
  `https://poe2db.tw/${POE2DB[lang]}/${encodeURIComponent(name.replaceAll(' ', '_'))}`

/** Поиск уника на официальном трейде: лоты с мгновенным выкупом, от дешёвых. */
export function uniqueTradeUrl(name: string, base: string, league: string): string {
  const query = { query: { name, type: base, status: { option: 'securable' } }, sort: { price: 'asc' } }
  return `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify(query))}`
}

/** Только заданные поля: пустые группы фильтров трейд отвергает. */
const filled = (fields: Record<string, unknown>) => Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))

/**
 * Запрос к трейду для базы с условиями правила: лоты с мгновенным выкупом, от дешёвых.
 * Уровень области в поиске не участвует — это условие места выпадения, а не предмета.
 */
export function baseTradeQuery(name: string, rule: BaseRule) {
  const min = (value: number) => (value > 0 ? { min: value } : undefined)
  // Трейд умеет искать одну редкость либо «любую, кроме уникальной»; несколько выбранных сводим ко второму.
  const rarity = rule.rarities.length === 1 ? rule.rarities[0].toLowerCase() : 'nonunique'
  const groups = {
    type_filters: { rarity: { option: rarity }, ilvl: min(rule.minItemLevel), quality: min(rule.minQuality) },
    equipment_filters: { rune_sockets: min(rule.minSockets) },
    misc_filters: {
      unidentified_tier: min(rule.minUnidentifiedTier),
      corrupted: rule.excludeCorrupted ? { option: 'false' } : undefined,
      mirrored: rule.excludeCorrupted ? { option: 'false' } : undefined,
    },
  }
  const filters = Object.fromEntries(
    Object.entries(groups)
      .map(([id, fields]) => [id, { filters: filled(fields) }] as const)
      .filter(([, group]) => Object.keys(group.filters).length > 0),
  )
  return { query: { type: name, status: { option: 'securable' }, filters }, sort: { price: 'asc' } }
}

export function baseTradeUrl(name: string, league: string, rule: BaseRule): string {
  const query = encodeURIComponent(JSON.stringify(baseTradeQuery(name, rule)))
  return `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(league)}?q=${query}`
}

/** Названия групп — в словаре: «baseGroup.<id>». */
export const BASE_GROUPS: BaseGroup[] = ['weapon', 'armour', 'jewellery']

export const classNames = (...groups: BaseGroup[]) => BASE_CLASSES.filter((c) => groups.includes(c.group)).map((c) => c.name)

/** Оружие и броня — то, что скрывает правило «обычные и магические предметы». */
export const GEAR_CLASSES = classNames('weapon', 'armour')

/** Классы, к которым относятся перечисленные базы. */
export function classesOf(bases: string[]): string[] {
  const wanted = new Set(bases)
  return BASE_CLASSES.filter((c) => c.bases.some((b) => wanted.has(b.name))).map((c) => c.name)
}

/** Старшие базы класса: в пределах этого числа уровней выпадения от лучшей. */
const TOP_BASE_WINDOW = 5

export function topBases(classes: string[]): string[] {
  return BASE_CLASSES.filter((c) => classes.includes(c.name)).flatMap((c) => {
    const best = Math.max(...c.bases.map((b) => b.drop))
    return c.bases.filter((b) => b.drop >= best - TOP_BASE_WINDOW).map((b) => b.name)
  })
}

/** Оформление правила: своё, если оно задано, иначе — тира, на который правило ссылается. */
export const ruleStyle = (rule: BaseRule, tiers: Record<TierId, TierStyle>): TierStyle => rule.style ?? tiers[rule.tier]

/** Переставляет элемент списка на место перед другим элементом или после него. */
export function moveItem<Item extends { id: string }>(list: Item[], fromId: string, toId: string, after: boolean): Item[] {
  const moved = list.find((item) => item.id === fromId)
  if (!moved || fromId === toId) return list
  const rest = list.filter((item) => item.id !== fromId)
  const index = rest.findIndex((item) => item.id === toId)
  if (index < 0) return list
  rest.splice(after ? index + 1 : index, 0, moved)
  return rest
}

export const EMPTY_RULE: Omit<BaseRule, 'id' | 'name'> = {
  enabled: true,
  action: 'show',
  classes: [],
  bases: [],
  rarities: [...RARITIES],
  minItemLevel: 0,
  minQuality: 0,
  minSockets: 0,
  minUnidentifiedTier: 0,
  minAreaLevel: 0,
  excludeCorrupted: false,
  tier: 'C',
}

/** Правило одной строкой, как его прочёл бы человек. */
export function describeRule(rule: BaseRule, t: T): string {
  const all = rule.rarities.length === 0 || rule.rarities.length === RARITIES.length
  const scope = rule.bases.length
    ? t('desc.bases', { n: rule.bases.length })
    : rule.classes.length === 0
      ? t('desc.noClasses')
      : rule.classes.length <= 3
        ? rule.classes.map((name) => t(keyOf('class', name))).join(', ')
        : t('desc.classes', { n: rule.classes.length })
  return [
    all ? t('desc.anyRarity') : rule.rarities.map((r) => t(keyOf('rarityLower', r))).join(t('desc.and')),
    scope,
    rule.minItemLevel > 0 && t('desc.itemLevel', { n: rule.minItemLevel }),
    rule.minQuality > 0 && t('desc.quality', { n: rule.minQuality }),
    rule.minSockets > 0 && t('desc.sockets', { n: rule.minSockets }),
    rule.minUnidentifiedTier > 0 && t('desc.unidentified', { n: rule.minUnidentifiedTier }),
    rule.excludeCorrupted && t('desc.notCorrupted'),
    rule.minAreaLevel > 0 && t('desc.area', { n: rule.minAreaLevel }),
    rule.action === 'show' && rule.style && t('desc.customStyle'),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** С какой доли персонажей база считается популярной. */
export const POPULAR_SHARE = 0.03

export function popularBases(classes: string[], shares: Record<string, number>, minShare: number): string[] {
  return BASE_CLASSES.filter((c) => classes.includes(c.name)).flatMap((c) =>
    c.bases.filter((b) => (shares[b.name] ?? 0) >= minShare).map((b) => b.name),
  )
}

export function popularRule(shares: Record<string, number>, t: T): Omit<BaseRule, 'id'> {
  const classes = BASE_CLASSES.filter((c) => c.bases.some((b) => (shares[b.name] ?? 0) >= POPULAR_SHARE)).map((c) => c.name)
  return {
    ...EMPTY_RULE,
    name: t('template.popular'),
    classes,
    bases: popularBases(classes, shares, POPULAR_SHARE),
    rarities: ['Normal', 'Magic'],
    minItemLevel: 82,
  }
}

type TemplateKey = 'template.top' | 'template.quality' | 'template.sockets' | 'template.jewellery' | 'template.empty'

/** Шаблоны отдельных правил; название правила создаётся на языке интерфейса в момент добавления. */
export const RULE_TEMPLATES: { title: TemplateKey; make: (t: T) => Omit<BaseRule, 'id'> }[] = [
  {
    title: 'template.top',
    make: (t) => ({
      ...EMPTY_RULE,
      name: t('template.top'),
      classes: GEAR_CLASSES,
      bases: topBases(GEAR_CLASSES),
      rarities: ['Normal', 'Magic'],
      minItemLevel: 82,
    }),
  },
  {
    title: 'template.quality',
    make: (t) => ({ ...EMPTY_RULE, name: t('template.quality'), classes: GEAR_CLASSES, minQuality: 20 }),
  },
  {
    title: 'template.sockets',
    make: (t) => ({ ...EMPTY_RULE, name: t('template.sockets'), classes: GEAR_CLASSES, minSockets: 2, tier: 'D' }),
  },
  {
    title: 'template.jewellery',
    make: (t) => ({ ...EMPTY_RULE, name: t('template.jewellery'), classes: classNames('jewellery'), rarities: ['Rare'] }),
  },
  { title: 'template.empty', make: (t) => ({ ...EMPTY_RULE, name: t('template.emptyName') }) },
]
