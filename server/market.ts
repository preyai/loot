import { SECTIONS, type Section } from '../src/sections'
import type { League, MarketItem, MarketSnapshot, SectionId, UniqueInfo } from '../src/types'

export const API = 'https://poe.ninja/poe2/api'
const ICON_HOST = 'https://web.poecdn.com'
export const HEADERS = { 'User-Agent': 'loot-filter-editor/0.1 (personal project)', Accept: 'application/json' }
// poe.ninja сам кэширует ответы на 30 минут, чаще спрашивать бессмысленно.
const TTL_MS = 30 * 60 * 1000
/** Меньше лотов — цена ненадёжна: пара выставленных «за миллион» даёт абсурдное среднее. */
const MIN_LISTINGS = 5

interface ExchangeOverview {
  core?: { rates?: { exalted?: number; chaos?: number } }
  items?: { id: string; name: string; image: string }[]
  lines?: { id: string; primaryValue: number }[]
}

interface UniqueOverview {
  lines?: { name: string; baseType: string; icon: string; primaryValue: number; listingCount: number }[]
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`poe.ninja ответил ${res.status} на ${url}`)
  return (await res.json()) as T
}

export async function getLeagues(): Promise<League[]> {
  const state = await getJson<{ economyLeagues: { name: string; hardcore: boolean }[] }>(`${API}/data/index-state`)
  return state.economyLeagues.map(({ name, hardcore }) => ({ name, hardcore }))
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
    const divine = line.listingCount >= MIN_LISTINGS ? line.primaryValue : null
    // У одного уника бывает несколько строк (например, осквернённый вариант) — берём самую дорогую.
    const known = base.uniques.get(line.name)
    if (!known || (divine ?? -1) > (known.divine ?? -1)) base.uniques.set(line.name, { name: line.name, divine })
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
    items.push({ name: it.name, icon: ICON_HOST + it.image, section, divine: prices.get(it.id) ?? null })
  }
  return items
}

const cache = new Map<string, { at: number; snapshot: MarketSnapshot }>()

export async function getSnapshot(league: string, force = false): Promise<MarketSnapshot> {
  const cached = cache.get(league)
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.snapshot

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

  const snapshot: MarketSnapshot = { league, fetchedAt: new Date().toISOString(), rates, items, failed }
  cache.set(league, { at: Date.now(), snapshot })
  return snapshot
}
