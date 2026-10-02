import { useEffect, useRef, useState } from 'react'
import { DEFAULT_CONFIG } from './defaults'
import type { Config, League, MarketSnapshot, Visibility } from './types'

const CONFIG_KEY = 'loot-filter-editor:config'

/** Настройки, сохранённые до появления stackPrice: раньше порог стопки выводился из мин. цены и мин. тира. */
function withStackPrice(stored: Partial<Visibility> | undefined, thresholds: Config['thresholds']): Visibility {
  const visibility = { ...DEFAULT_CONFIG.visibility, ...stored }
  if (stored && stored.stackPrice === undefined) {
    const derived = Math.max(visibility.minPrice, visibility.minTier === 'E' ? 0 : thresholds[visibility.minTier])
    if (derived > 0) visibility.stackPrice = derived
  }
  return visibility
}

function loadConfig(): Config {
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null') as Partial<Config> | null
    if (!stored) return DEFAULT_CONFIG
    // Поля, добавленные в новых версиях, берутся из значений по умолчанию.
    const thresholds = { ...DEFAULT_CONFIG.thresholds, ...stored.thresholds }
    return {
      ...DEFAULT_CONFIG,
      ...stored,
      thresholds,
      tiers: { ...DEFAULT_CONFIG.tiers, ...stored.tiers },
      visibility: withStackPrice(stored.visibility, thresholds),
      sectionVisibility: Object.fromEntries(
        Object.entries(stored.sectionVisibility ?? {}).map(([id, v]) => [id, withStackPrice(v, thresholds)]),
      ),
      gear: { ...DEFAULT_CONFIG.gear, ...stored.gear },
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

export type UpdateConfig = (change: (config: Config) => Config) => void

export function useConfig(): [Config, UpdateConfig] {
  const [config, setConfig] = useState(loadConfig)
  useEffect(() => {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
    } catch {
      // Хранилище недоступно — настройки проживут до закрытия вкладки.
    }
  }, [config])
  return [config, setConfig]
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(path)
  const body = (await res.json()) as T | { error: string }
  if (!res.ok) throw new Error((body as { error: string }).error ?? `Ошибка ${res.status}`)
  return body as T
}

export interface Market {
  leagues: League[]
  snapshot: MarketSnapshot | null
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useMarket(league: string | null, onDefaultLeague: (name: string) => void): Market {
  const [leagues, setLeagues] = useState<League[]>([])
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshCount, setRefreshCount] = useState(0)
  const force = useRef(false)

  // Список лиг нужен один раз при запуске.
  useEffect(() => {
    api<League[]>('/api/leagues')
      .then((list) => {
        setLeagues(list)
        if (!league && list.length) onDefaultLeague(list[0].name)
      })
      .catch((e: Error) => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!league) return
    // Ответ на устаревший запрос (лигу успели сменить) не должен перетереть свежий.
    let stale = false
    setLoading(true)
    setError(null)
    api<MarketSnapshot>(`/api/market?league=${encodeURIComponent(league)}${force.current ? '&force' : ''}`)
      .then((s) => !stale && setSnapshot(s))
      .catch((e: Error) => !stale && setError(e.message))
      .finally(() => !stale && setLoading(false))
    force.current = false
    return () => {
      stale = true
    }
  }, [league, refreshCount])

  return {
    leagues,
    snapshot,
    loading,
    error,
    refresh: () => {
      force.current = true
      setRefreshCount((n) => n + 1)
    },
  }
}
