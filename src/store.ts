import { useEffect, useState } from 'react'
import { EMPTY_RULE } from './bases'
import { DEFAULT_CONFIG } from './defaults'
import { detectLanguage, LANGUAGES } from './i18n'
import type { BasePopularity, Config, ExceptionalScan, League, MarketSnapshot, Threshold, ThresholdTier } from './types'

const CONFIG_KEY = 'loot-filter-editor:config'

/** Настройки для первого запуска: язык — по языку браузера. */
const freshConfig = (): Config => ({ ...DEFAULT_CONFIG, language: detectLanguage() })

/**
 * Настройки из сохранённых (в браузере, на сервере или по ссылке): поля, добавленные в новых версиях,
 * берутся из значений по умолчанию.
 */
export function normalizeConfig(stored: Partial<Config>): Config {
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    language: LANGUAGES.find((lang) => lang === stored.language) ?? detectLanguage(),
    thresholds: thresholdsOf(stored),
    tiers: { ...DEFAULT_CONFIG.tiers, ...stored.tiers },
    visibility: { ...DEFAULT_CONFIG.visibility, ...stored.visibility },
    gear: { ...DEFAULT_CONFIG.gear, ...stored.gear },
    waystones: {
      ...DEFAULT_CONFIG.waystones,
      ...stored.waystones,
      styles: { ...DEFAULT_CONFIG.waystones.styles, ...stored.waystones?.styles },
    },
    gold: {
      ...DEFAULT_CONFIG.gold,
      ...stored.gold,
      sizes: { ...DEFAULT_CONFIG.gold.sizes, ...stored.gold?.sizes },
      styles: { ...DEFAULT_CONFIG.gold.styles, ...stored.gold?.styles },
    },
    itemStacks: { ...stored.itemStacks },
    sectionThresholds: { ...stored.sectionThresholds },
    baseRules: (stored.baseRules ?? []).map((rule) => ({ ...EMPTY_RULE, ...rule })),
  }
}

/** Границы тиров: раньше это были числа в основной валюте — переводим в границы со своей валютой. */
function thresholdsOf(stored: Partial<Config>): Config['thresholds'] {
  const result = { ...DEFAULT_CONFIG.thresholds }
  for (const [tier, value] of Object.entries(stored.thresholds ?? {}) as [ThresholdTier, Threshold | number][]) {
    if (!(tier in result)) continue
    result[tier] = typeof value === 'number' ? { value, currency: stored.currency ?? 'exalted' } : value
  }
  return result
}

function loadConfig(): Config {
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null') as Partial<Config> | null
    return stored ? normalizeConfig(stored) : freshConfig()
  } catch {
    return freshConfig()
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body = (await res.json()) as T | { error: string }
  if (!res.ok) throw new Error((body as { error: string }).error ?? `Ошибка ${res.status}`)
  return body as T
}

export interface Popularity {
  data: BasePopularity | null
  loading: boolean
  error: string | null
}

export function usePopularity(league: string | null): Popularity {
  const [state, setState] = useState<Popularity>({ data: null, loading: false, error: null })
  useEffect(() => {
    if (!league) return
    let stale = false
    setState({ data: null, loading: true, error: null })
    api<BasePopularity>(`/api/popularity?league=${encodeURIComponent(league)}`)
      .then((data) => !stale && setState({ data, loading: false, error: null }))
      .catch((e: Error) => !stale && setState({ data: null, loading: false, error: e.message }))
    return () => {
      stale = true
    }
  }, [league])
  return state
}

/** Последний сохранённый на сервере опрос трейда для лиги; null — опроса ещё не было. */
export function useExceptionalScan(league: string | null) {
  const [state, setState] = useState<{ scan: ExceptionalScan | null; loading: boolean }>({ scan: null, loading: false })
  useEffect(() => {
    if (!league) return
    let stale = false
    setState({ scan: null, loading: true })
    api<ExceptionalScan | null>(`/api/exceptional?league=${encodeURIComponent(league)}`).then(
      (scan) => !stale && setState({ scan, loading: false }),
      () => !stale && setState({ scan: null, loading: false }),
    )
    return () => {
      stale = true
    }
  }, [league])
  return state
}

export interface Market {
  leagues: League[]
  snapshot: MarketSnapshot | null
  loading: boolean
  error: string | null
  /** Повторить загрузку после ошибки. */
  retry: () => void
}

export function useMarket(league: string | null, onDefaultLeague: (name: string) => void): Market {
  const [leagues, setLeagues] = useState<League[]>([])
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

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
    api<MarketSnapshot>(`/api/market?league=${encodeURIComponent(league)}`)
      .then((s) => !stale && setSnapshot(s))
      .catch((e: Error) => !stale && setError(e.message))
      .finally(() => !stale && setLoading(false))
    return () => {
      stale = true
    }
  }, [league, attempt])

  return {
    leagues,
    snapshot,
    loading,
    error,
    retry: () => setAttempt((n) => n + 1),
  }
}
