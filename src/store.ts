import { useEffect, useState } from 'react'
import { EMPTY_RULE } from './bases'
import { DEFAULT_CONFIG } from './defaults'
import { detectLanguage, LANGUAGES } from './i18n'
import type { BasePopularity, Config, ExceptionalScan, League, MarketSnapshot } from './types'

const CONFIG_KEY = 'loot-filter-editor:config'

/** Настройки для первого запуска: язык — по языку браузера. */
const freshConfig = (): Config => ({ ...DEFAULT_CONFIG, language: detectLanguage() })

function loadConfig(): Config {
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null') as Partial<Config> | null
    if (!stored) return freshConfig()
    // Поля, добавленные в новых версиях, берутся из значений по умолчанию.
    return {
      ...DEFAULT_CONFIG,
      ...stored,
      language: LANGUAGES.find((lang) => lang === stored.language) ?? detectLanguage(),
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...stored.thresholds },
      tiers: { ...DEFAULT_CONFIG.tiers, ...stored.tiers },
      visibility: { ...DEFAULT_CONFIG.visibility, ...stored.visibility },
      gear: { ...DEFAULT_CONFIG.gear, ...stored.gear },
      baseRules: (stored.baseRules ?? []).map((rule) => ({ ...EMPTY_RULE, ...rule })),
    }
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
