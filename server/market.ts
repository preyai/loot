import { SECTIONS, type Section } from '../src/sections'
import type { League, MarketItem, MarketSnapshot, ModLine, SectionId, UniqueInfo } from '../src/types'
import { readData, storedResource, writeData } from './storage'

export const API = 'https://poe.ninja/poe2/api'
const ICON_HOST = 'https://web.poecdn.com'
export const HEADERS = { 'User-Agent': 'loot-filter-editor/0.1 (personal project)', Accept: 'application/json' }
// poe.ninja сам кэширует ответы на 30 минут, чаще спрашивать бессмысленно.
const TTL_MS = 30 * 60 * 1000
/** Меньше лотов — цена ненадёжна: пара выставленных «за миллион» даёт абсурдное среднее. */
const MIN_LISTINGS = 5

interface ExchangeOverview {
  core?: { rates?: { exalted?: number; chaos?: number } }
  items?: { id: string; name: string; image?: string }[]
  lines?: { id: string; primaryValue: number }[]
}

interface NinjaMod {
  text: string
  optional?: boolean
}

interface UniqueLine {
  name: string
  baseType: string
  icon: string
  primaryValue: number
  listingCount: number
  flavourText?: string
  sparkLine?: { totalChange?: number }
  propertyModifiers?: NinjaMod[]
  utilityModifiers?: NinjaMod[]
  requirementModifiers?: NinjaMod[]
  grantedSkillModifiers?: NinjaMod[]
  implicitModifiers?: NinjaMod[]
  explicitModifiers?: NinjaMod[]
}

interface UniqueOverview {
  lines?: UniqueLine[]
}

/** Убирает разметку poe.ninja: «[Critical|Critical Hit]» → «Critical Hit», «[Physical]» → «Physical». */
export const plainText = (text: string) => text.replace(/\[(?:[^\]|]*\|)?([^\]]*)\]/g, '$1')

const texts = (mods: NinjaMod[] = []) => mods.map((m) => plainText(m.text))
const modLines = (mods: NinjaMod[] = []): ModLine[] =>
  mods.map((m) => (m.optional ? { text: plainText(m.text), variant: true } : { text: plainText(m.text) }))

function uniqueInfo(line: UniqueLine): UniqueInfo {
  return {
    name: line.name,
    divine: line.listingCount >= MIN_LISTINGS ? line.primaryValue : null,
    icon: line.icon,
    listings: line.listingCount,
    weekChange: line.sparkLine?.totalChange ?? null,
    properties: [...texts(line.propertyModifiers), ...texts(line.utilityModifiers)],
    requirements: texts(line.requirementModifiers),
    skills: texts(line.grantedSkillModifiers),
    implicits: modLines(line.implicitModifiers),
    explicits: modLines(line.explicitModifiers),
    flavour: (line.flavourText ?? '').replace(/\r/g, ''),
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`poe.ninja ответил ${res.status} на ${url}`)
  return (await res.json()) as T
}

const LEAGUES_TTL_MS = 60 * 60 * 1000

const leagueList = storedResource('leagues', LEAGUES_TTL_MS, async () => {
  const state = await getJson<{ economyLeagues: { name: string; hardcore: boolean }[] }>(`${API}/data/index-state`)
  const leagues: League[] = state.economyLeagues.map(({ name, hardcore }) => ({ name, hardcore }))
  return { fetchedAt: new Date().toISOString(), leagues }
})

export async function getLeagues(): Promise<League[]> {
  return (await leagueList.get('all')).leagues
}

/**
 * Уникальные предметы выпадают неопознанными, и фильтр видит только базовый тип,
 * поэтому строка раздела — база со списком уников на ней.
 */
export function groupUniques(lines: NonNullable<UniqueOverview['lines']>, section: SectionId): MarketItem[] {
  const bases = new Map<string, { icon: string; uniques: Map<string, UniqueInfo> }>()
  for (const line of lines) {
    const base = bases.get(line.baseType) ?? { icon: line.icon, uniques: new Map() }
    bases.set(line.baseType, base)
    const unique = uniqueInfo(line)
    // У одного уника бывает несколько строк (например, осквернённый вариант) — берём самую дорогую.
    const known = base.uniques.get(line.name)
    if (!known || (unique.divine ?? -1) > (known.divine ?? -1)) base.uniques.set(line.name, unique)
  }

  return [...bases].map(([name, { icon, uniques }]) => {
    const list = [...uniques.values()].sort((a, b) => (b.divine ?? Infinity) - (a.divine ?? Infinity))
    // Цена базы — по самому дорогому унику; если хоть у одного цена ненадёжна, не знаем и цену базы.
    const divine = list.some((u) => u.divine === null) ? null : Math.max(...list.map((u) => u.divine!))
    return { name, icon, section, divine, uniques: list }
  })
}

function exchangeItems(overview: ExchangeOverview, section: SectionId, seen: Set<string>): MarketItem[] {
  const prices = new Map((overview.lines ?? []).map((l) => [l.id, l.primaryValue]))
  const items: MarketItem[] = []
  for (const it of overview.items ?? []) {
    // Один и тот же предмет встречается в нескольких типах (идолы — ещё и в «Ритуале»).
    if (seen.has(it.name)) continue
    seen.add(it.name)
    // У новинок лиги poe.ninja картинку не отдаёт: оставляем пусто, недостающие иконки добирает fillMissingIcons.
    items.push({ name: it.name, icon: it.image ? ICON_HOST + it.image : '', section, divine: prices.get(it.id) ?? null })
  }
  return items
}

const ICONS_FILE = 'icons.json'

/** Иконка предмета со страницы poe2db; null — страницы или картинки нет. */
async function wikiIcon(name: string): Promise<string | null> {
  const res = await fetch(`https://poe2db.tw/us/${encodeURIComponent(name.replaceAll(' ', '_'))}`, {
    headers: { 'User-Agent': HEADERS['User-Agent'] },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) return null
  return /property="og:image" content="(https:\/\/cdn\.poe2db\.tw\/image\/[^"]+)"/.exec(await res.text())?.[1] ?? null
}

/**
 * Проставляет иконки предметам, у которых poe.ninja её не дал. Найденное запоминается на диске,
 * чтобы не ходить на poe2db при каждом обновлении цен; ненайденное пробуем снова в следующий раз.
 */
async function fillMissingIcons(items: MarketItem[]): Promise<void> {
  const missing = items.filter((item) => !item.icon)
  if (missing.length === 0) return
  const known = (await readData<Record<string, string>>(ICONS_FILE)) ?? {}
  let found = false
  for (const item of missing) {
    if (!known[item.name]) {
      const icon = await wikiIcon(item.name).catch(() => null)
      if (icon) {
        known[item.name] = icon
        found = true
      }
    }
    item.icon = known[item.name] ?? ''
  }
  if (found) await writeData(ICONS_FILE, known)
}

async function loadSnapshot(league: string): Promise<MarketSnapshot> {
  const load = (section: Section) => {
    const path = section.unique ? 'stash/current/item' : 'exchange/current'
    return Promise.all(
      section.ninja.map((type) =>
        getJson<ExchangeOverview & UniqueOverview>(
          `${API}/economy/${path}/overview?league=${encodeURIComponent(league)}&type=${type}`,
        ),
      ),
    )
  }
  const results = await Promise.allSettled(SECTIONS.map(load))

  const items: MarketItem[] = []
  const failed: SectionId[] = []
  const seen = new Set<string>()
  let rates = { exalted: 0, chaos: 0 }

  results.forEach((result, i) => {
    const section = SECTIONS[i]
    if (result.status === 'rejected') {
      failed.push(section.id)
      return
    }
    if (section.unique) {
      items.push(...groupUniques(result.value.flatMap((o) => o.lines ?? []), section.id))
      return
    }
    for (const overview of result.value) {
      const { exalted, chaos } = overview.core?.rates ?? {}
      if (exalted) rates = { exalted, chaos: chaos ?? 0 }
      items.push(...exchangeItems(overview, section.id, seen))
    }
  })

  if (failed.length === SECTIONS.length) throw new Error('poe.ninja недоступен')
  await fillMissingIcons(items)

  return { league, fetchedAt: new Date().toISOString(), rates, items, failed }
}

/** Снимки цен по лигам: хранятся на диске и обновляются не чаще раза в TTL. */
// «v2» в имени: в снимках появились свойства уников, старые файлы под новый формат не годятся.
export const snapshots = storedResource('market-v2', TTL_MS, loadSnapshot)

export const getSnapshot = (league: string) => snapshots.get(league)
