import { useEffect, useRef, useState } from 'react'
import { EMPTY_RULE } from './bases'
import { DEFAULT_CONFIG } from './defaults'
import type { BasePopularity, Config, Currency, ExceptionalScan, League, MarketSnapshot, TradeJob } from './types'

const CONFIG_KEY = 'loot-filter-editor:config'

function loadConfig(): Config {
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null') as Partial<Config> | null
    if (!stored) return DEFAULT_CONFIG
    // Поля, добавленные в новых версиях, берутся из значений по умолчанию.
    return {
      ...DEFAULT_CONFIG,
      ...stored,
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...stored.thresholds },
      tiers: { ...DEFAULT_CONFIG.tiers, ...stored.tiers },
      visibility: { ...DEFAULT_CONFIG.visibility, ...stored.visibility },
      gear: { ...DEFAULT_CONFIG.gear, ...stored.gear },
      baseRules: (stored.baseRules ?? []).map((rule) => ({ ...EMPTY_RULE, ...rule })),
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

const JOB_POLL_MS = 3000

/** Опрос трейда на исключительные вещи: запуск, остановка, слежение за ходом и последний результат. */
export function useExceptionalScan(league: string | null, onFinished: (scan: ExceptionalScan) => void) {
  const [job, setJob] = useState<TradeJob | null>(null)
  const [scan, setScan] = useState<ExceptionalScan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const finished = useRef(onFinished)
  finished.current = onFinished

  // Опрос мог быть запущен до открытия страницы.
  useEffect(() => {
    api<TradeJob>('/api/exceptional/status').then(setJob, () => {})
  }, [])

  useEffect(() => {
    setScan(null)
    if (!league) return
    let stale = false
    api<ExceptionalScan | null>(`/api/exceptional?league=${encodeURIComponent(league)}`).then(
      (saved) => !stale && setScan(saved),
      () => {},
    )
    return () => {
      stale = true
    }
  }, [league])

  const running = job?.running ?? false
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      api<TradeJob>('/api/exceptional/status').then(
        (next) => {
          setJob(next)
          // Остановленный или упавший опрос результата не оставляет.
          if (next.running || next.error || next.done < next.total || !next.league) return
          api<ExceptionalScan | null>(`/api/exceptional?league=${encodeURIComponent(next.league)}`).then((saved) => {
            if (!saved) return
            setScan(saved)
            finished.current(saved)
          })
        },
        (e: Error) => setError(e.message),
      )
    }, JOB_POLL_MS)
    return () => clearInterval(timer)
  }, [running])

  const post = (path: string, body: unknown = {}) => {
    setError(null)
    api<TradeJob>(path, { method: 'POST', body: JSON.stringify(body) }).then(setJob, (e: Error) => setError(e.message))
  }

  return {
    job,
    scan,
    error,
    start: (scanLeague: string, minPrice: number, currency: Currency) =>
      post('/api/exceptional/scan', { league: scanLeague, minPrice, currency }),
    stop: () => post('/api/exceptional/stop'),
  }
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
