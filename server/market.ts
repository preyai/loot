import { SECTIONS, type Section } from '../src/sections'
import type { League, MarketItem, MarketSnapshot, ModLine, SectionId, UniqueInfo } from '../src/types'
import { readData, storedResource, writeData } from './storage'

export const API = 'https://poe.ninja/poe2/api'
const ICON_HOST = 'https://web.poecdn.com'
export const HEADERS = { 'User-Agent': 'exile-filter/0.1 (+https://exile-filter.com)', Accept: 'application/json' }
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

/** Справочник обмена валюты: всё, что есть на внутриигровом рынке, по группам. */
export interface ExchangeCatalog {
  fetchedAt: string
  groups: Record<string, { name: string; icon: string }[]>
}

interface TradeStatic {
  result: { id: string; entries: { id: string; text: string; image?: string }[] }[]
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

/**
 * Предметы не-уников из раздела предметов poe.ninja (плитки): у базы по строке на каждую редкость.
 * Фильтр их различать не будет, поэтому цена базы — по самому дорогому варианту с надёжной ценой.
 */
export function groupBases(lines: NonNullable<UniqueOverview['lines']>, section: SectionId): MarketItem[] {
  const bases = new Map<string, MarketItem>()
  for (const line of lines) {
    const base = bases.get(line.baseType) ?? { name: line.baseType, icon: line.icon, section, divine: null }
    bases.set(line.baseType, base)
    if (line.listingCount >= MIN_LISTINGS) base.divine = Math.max(base.divine ?? 0, line.primaryValue)
  }
  return [...bases.values()]
}

const CATALOG_URL = 'https://www.pathofexile.com/api/trade2/data/static'
// Справочник меняется только с патчами игры.
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000

const exchangeCatalog = storedResource<ExchangeCatalog>('catalog', CATALOG_TTL_MS, async () => {
  const res = await fetch(CATALOG_URL, { headers: HEADERS, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`трейд ответил ${res.status} на ${CATALOG_URL}`)
  const data = (await res.json()) as TradeStatic
  const groups: ExchangeCatalog['groups'] = {}
  for (const group of data.result) {
    // «sep» — разделители списка: заголовки подгрупп и пустые строки, а не предметы.
    groups[group.id] = group.entries
      .filter((e) => e.id !== 'sep' && e.text)
      .map((e) => ({ name: e.text, icon: e.image ? ICON_HOST + e.image : '' }))
  }
  return { fetchedAt: new Date().toISOString(), groups }
})

/** Предметы раздела из справочника обмена, которых ещё нет в списке: цены у них нет. */
export function catalogItems(catalog: ExchangeCatalog, section: Section, seen: Set<string>): MarketItem[] {
  const items: MarketItem[] = []
  for (const group of section.trade ?? []) {
    for (const { name, icon } of catalog.groups[group] ?? []) {
      if (seen.has(name)) continue
      seen.add(name)
      items.push({ name, icon, section: section.id, divine: null })
    }
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
    const path = section.unique || section.bases ? 'stash/current/item' : 'exchange/current'
    return Promise.all(
      section.ninja.map((type) =>
        getJson<ExchangeOverview & UniqueOverview>(
          `${API}/economy/${path}/overview?league=${encodeURIComponent(league)}&type=${type}`,
        ),
      ),
    )
  }
  const [results, catalog] = await Promise.all([
    Promise.allSettled(SECTIONS.map(load)),
    // Без справочника обходимся: пропадут только предметы без цены.
    exchangeCatalog.get('all').catch((e: unknown) => {
      console.warn(`справочник обмена не загрузился: ${e instanceof Error ? e.message : String(e)}`)
      return null
    }),
  ])

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
    if (section.unique || section.bases) {
      const group = section.unique ? groupUniques : groupBases
      items.push(...group(result.value.flatMap((o) => o.lines ?? []), section.id))
      return
    }
    for (const overview of result.value) {
      const { exalted, chaos } = overview.core?.rates ?? {}
      if (exalted) rates = { exalted, chaos: chaos ?? 0 }
      items.push(...exchangeItems(overview, section.id, seen))
    }
  })

  // С poe.ninja не пришло ничего — справочник это не заменит: цен нет, показывать нечего.
  if (failed.length === SECTIONS.filter((s) => s.ninja.length > 0).length) throw new Error('poe.ninja недоступен')

  // Предметы без цены — после всех разделов с ценами: если poe.ninja отнёс предмет к другому разделу, он там и останется.
  for (const section of SECTIONS) {
    if (failed.includes(section.id) || !section.trade) continue
    if (catalog) items.push(...catalogItems(catalog, section, seen))
    else if (section.ninja.length === 0) failed.push(section.id)
  }
  await fillMissingIcons(items)

  return { league, fetchedAt: new Date().toISOString(), rates, items, failed }
}

/** Снимки цен по лигам: хранятся на диске и обновляются не чаще раза в TTL. */
// «v2» в имени: в снимках появились свойства уников, старые файлы под новый формат не годятся.
export const snapshots = storedResource('market-v2', TTL_MS, loadSnapshot)

export const getSnapshot = (league: string) => snapshots.get(league)
