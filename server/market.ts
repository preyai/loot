import { SECTIONS } from '../src/sections'
import type { League, MarketItem, MarketSnapshot, SectionId } from '../src/types'

const API = 'https://poe.ninja/poe2/api'
const ICON_HOST = 'https://web.poecdn.com'
const HEADERS = { 'User-Agent': 'loot-filter-editor/0.1 (personal project)', Accept: 'application/json' }
// poe.ninja сам кэширует ответы на 30 минут, чаще спрашивать бессмысленно.
const TTL_MS = 30 * 60 * 1000

interface NinjaOverview {
  core?: { rates?: { exalted?: number; chaos?: number } }
  items?: { id: string; name: string; image: string }[]
  lines?: { id: string; primaryValue: number }[]
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

const cache = new Map<string, { at: number; snapshot: MarketSnapshot }>()

export async function getSnapshot(league: string, force = false): Promise<MarketSnapshot> {
  const cached = cache.get(league)
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.snapshot

  const results = await Promise.allSettled(
    SECTIONS.map((s) =>
      getJson<NinjaOverview>(
        `${API}/economy/exchange/current/overview?league=${encodeURIComponent(league)}&type=${s.ninja}`,
      ),
    ),
  )

  const items: MarketItem[] = []
  const failed: SectionId[] = []
  const seen = new Set<string>()
  let rates = { exalted: 0, chaos: 0 }

  results.forEach((result, i) => {
    const section = SECTIONS[i].id
    if (result.status === 'rejected') {
      failed.push(section)
      return
    }
    const { core, items: ninjaItems = [], lines = [] } = result.value
    if (core?.rates?.exalted) rates = { exalted: core.rates.exalted, chaos: core.rates.chaos ?? 0 }
    const prices = new Map(lines.map((l) => [l.id, l.primaryValue]))
    for (const it of ninjaItems) {
      // Один и тот же предмет встречается в нескольких типах (идолы — ещё и в «Ритуале»).
      if (seen.has(it.name)) continue
      seen.add(it.name)
      items.push({ name: it.name, icon: ICON_HOST + it.image, section, divine: prices.get(it.id) ?? null })
    }
  })

  if (failed.length === SECTIONS.length) throw new Error('poe.ninja недоступен')

  const snapshot: MarketSnapshot = { league, fetchedAt: new Date().toISOString(), rates, items, failed }
  cache.set(league, { at: Date.now(), snapshot })
  return snapshot
}
