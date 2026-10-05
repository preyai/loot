import { useEffect, useSyncExternalStore } from 'react'
import { normalizeConfig } from './store'
import type { Config } from './types'

/**
 * Учётная запись и фильтры на сервере (server/accounts.ts). Рабочая копия настроек по-прежнему живёт
 * в браузере; «открыть» подменяет её сохранённым фильтром, «сохранить» отправляет её на сервер.
 */

export interface FilterStats {
  /** Средняя оценка 1–5; null — оценок нет. */
  rating: number | null
  ratings: number
  subscribers: number
  copies: number
}

export interface FilterSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  shareCode?: string
  /** Опубликован в «Фильтрах сообщества». */
  isPublic: boolean
  description: string
  stats?: FilterStats
}

/** Фильтр в каталоге (server/catalog.ts); поля зрителя — только для вошедшего. */
export interface CatalogEntry extends FilterSummary {
  owner: string
  publishedAt: string | null
  myRating?: number | null
  subscribed?: boolean
  own?: boolean
}

export type CatalogSort = 'popular' | 'rating' | 'new'

/** Вошедший пользователь. */
export interface Me {
  login: string
  /** Текущее имя в Discord. */
  discord: string | null
}

export interface SharedFilter extends CatalogEntry {
  config: Partial<Config>
}

/** Ошибка сервера: по коду интерфейс показывает понятное сообщение на своём языке. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T | { error?: string }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data as T
}

/** Что уходит на сервер: настройки без языка интерфейса и лиги — у каждого пользователя они свои. */
export function savedPart(config: Config): Partial<Config> {
  const { language: _language, league: _league, ...rest } = config
  return rest
}

/** Сохранённый фильтр поверх текущих настроек: язык и лига остаются свои. */
export const applySaved = (current: Config, saved: Partial<Config>): Config =>
  normalizeConfig({ ...saved, language: current.language, league: current.league })

export const api = {
  me: () => call<Me | null>('/api/auth/me'),
  providers: () => call<{ discord: boolean }>('/api/auth/providers'),
  logout: () => call<object>('/api/auth/logout', 'POST'),
  list: () => call<FilterSummary[]>('/api/filters'),
  get: (id: string) => call<FilterSummary & { config: Partial<Config> }>(`/api/filters/${id}`),
  create: (name: string, config: Config) => call<FilterSummary>('/api/filters', 'POST', { name, config: savedPart(config) }),
  update: (id: string, changes: { name?: string; config?: Config }) =>
    call<FilterSummary>(`/api/filters/${id}`, 'PUT', {
      name: changes.name,
      config: changes.config && savedPart(changes.config),
    }),
  remove: (id: string) => call<object>(`/api/filters/${id}`, 'DELETE'),
  share: (id: string) => call<{ shareCode: string }>(`/api/filters/${id}/share`, 'POST'),
  unshare: (id: string) => call<object>(`/api/filters/${id}/share`, 'DELETE'),
  shared: (code: string) => call<SharedFilter>(`/api/shared/${encodeURIComponent(code)}`),
  publish: (id: string, description: string) => call<FilterSummary>(`/api/filters/${id}/publish`, 'POST', { description }),
  unpublish: (id: string) => call<object>(`/api/filters/${id}/publish`, 'DELETE'),
  catalog: (sort: CatalogSort, q: string) => call<CatalogEntry[]>(`/api/catalog?sort=${sort}&q=${encodeURIComponent(q)}`),
  subscriptions: () => call<CatalogEntry[]>('/api/subscriptions'),
  rate: (code: string, value: number) => call<object>(`/api/shared/${encodeURIComponent(code)}/rate`, 'POST', { value }),
  subscribe: (code: string) => call<object>(`/api/shared/${encodeURIComponent(code)}/subscribe`, 'POST'),
  unsubscribe: (code: string) => call<object>(`/api/shared/${encodeURIComponent(code)}/subscribe`, 'DELETE'),
  copy: (code: string) => call<FilterSummary>(`/api/shared/${encodeURIComponent(code)}/copy`, 'POST'),
}

/** Вход через Discord — обычный переход: сервер перенаправит на Discord и обратно на «Мои фильтры». */
export const discordUrl = '/api/auth/discord/start'

/** Ссылка на фильтр для других. */
export const shareUrl = (code: string) => `${location.origin}${location.pathname}#/shared/${code}`

// --- Кто вошёл: общий для всех компонентов.
let me: Me | null | undefined
const listeners = new Set<() => void>()
const setMe = (value: Me | null) => {
  me = value
  listeners.forEach((l) => l())
}

export function useAccount() {
  useEffect(() => {
    if (me === undefined) api.me().then(setMe, () => setMe(null))
  }, [])
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => me,
  )
  return {
    /** undefined — ещё не знаем, null — не вошёл. */
    me: current,
    logout: async () => {
      await api.logout()
      setMe(null)
      setActive(null)
    },
  }
}

// --- Какой сохранённый фильтр сейчас открыт: чтобы «Сохранить» знало, куда, и видно было несохранённые изменения.
const ACTIVE_KEY = 'loot-filter-editor:active'

export interface ActiveFilter {
  id: string
  name: string
  /** Сохранённые настройки (JSON) — для сравнения с текущими. */
  saved: string
}

let active: ActiveFilter | null = (() => {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_KEY) ?? 'null') as ActiveFilter | null
  } catch {
    return null
  }
})()
const activeListeners = new Set<() => void>()

export function setActive(value: ActiveFilter | null) {
  active = value
  try {
    if (value) localStorage.setItem(ACTIVE_KEY, JSON.stringify(value))
    else localStorage.removeItem(ACTIVE_KEY)
  } catch {
    // Без хранилища открытый фильтр забудется при перезагрузке — не страшно.
  }
  activeListeners.forEach((l) => l())
}

export const snapshotOf = (config: Config) => JSON.stringify(savedPart(config))

export function useActiveFilter(config: Config) {
  const current = useSyncExternalStore(
    (l) => {
      activeListeners.add(l)
      return () => activeListeners.delete(l)
    },
    () => active,
  )
  return { active: current, dirty: current ? current.saved !== snapshotOf(config) : false }
}
