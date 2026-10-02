import { useEffect, useRef, useState } from 'react'
import { DEFAULT_CONFIG } from './defaults'
import type { BasePopularity, BasePriceJob, Config, League, MarketSnapshot } from './types'

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

/** Фоновое обновление цен белых баз: запуск, остановка и слежение за ходом. */
export function useBasePriceJob(onFinished: () => void) {
  const [job, setJob] = useState<BasePriceJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const finished = useRef(onFinished)
  finished.current = onFinished

  // Обновление могло быть запущено до открытия страницы.
  useEffect(() => {
    api<BasePriceJob>('/api/base-prices/status').then(setJob, () => {})
  }, [])

  const running = job?.running ?? false
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      api<BasePriceJob>('/api/base-prices/status').then(
        (next) => {
          setJob(next)
          if (!next.running) finished.current()
        },
        (e: Error) => setError(e.message),
      )
    }, JOB_POLL_MS)
    return () => clearInterval(timer)
  }, [running])

  const post = (path: string, body: unknown = {}) => {
    setError(null)
    api<BasePriceJob>(path, { method: 'POST', body: JSON.stringify(body) }).then(setJob, (e: Error) => setError(e.message))
  }

  return {
    job,
    error,
    start: (league: string, bases: string[]) => post('/api/base-prices/update', { league, bases }),
    stop: () => post('/api/base-prices/stop'),
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
