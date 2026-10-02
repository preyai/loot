import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { BASE_PRICE_ILVL } from '../src/bases'
import type { BasePriceJob, MarketItem, MarketSnapshot } from '../src/types'
import { getSnapshot } from './market'

const TRADE = 'https://www.pathofexile.com/api/trade2'
const HEADERS = {
  'User-Agent': 'loot-filter-editor/0.1 (personal project)',
  Accept: 'application/json',
  'Content-Type': 'application/json',
}
const STORE_FILE = path.resolve(process.env.DATA_DIR ?? 'data', 'base-prices.json')
/** Сколько самых дешёвых лотов идёт в медиану. */
const SAMPLE = 10
/** Меньше лотов на рынке — цена ненадёжна. */
const MIN_LISTINGS = 5
/** Свежие цены при повторном запуске не перезапрашиваются: так обновление можно продолжить после остановки. */
const FRESH_MS = 6 * 60 * 60 * 1000
/** Окна лимитов длиннее этого не задают темп, а работают как общий бюджет. */
const PACING_WINDOW_S = 300

interface StoredPrice {
  divine: number | null
  listings: number
  icon: string | null
  at: string
}
type Store = Record<string, Record<string, StoredPrice>>

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await readFile(STORE_FILE, 'utf8')) as Store
  } catch {
    return {}
  }
}

async function writeStore(store: Store) {
  await mkdir(path.dirname(STORE_FILE), { recursive: true })
  await writeFile(STORE_FILE, JSON.stringify(store, null, 1))
}

/** Сохранённые цены белых баз в виде предметов раздела. */
export async function basePriceItems(league: string): Promise<MarketItem[]> {
  const prices = (await readStore())[league] ?? {}
  return Object.entries(prices).map(([name, p]) => ({
    name,
    icon: p.icon ?? '',
    section: 'white-bases',
    divine: p.divine,
    listings: p.listings,
  }))
}

/** Снимок poe.ninja вместе с сохранёнными ценами белых баз. */
export async function getFullSnapshot(league: string, force = false): Promise<MarketSnapshot> {
  const [snapshot, bases] = await Promise.all([getSnapshot(league, force), basePriceItems(league)])
  return { ...snapshot, items: [...snapshot.items, ...bases] }
}

export interface Pacing {
  /** Минимальный интервал между запросами. */
  spacingMs: number
  /** Сколько подождать прямо сейчас: исчерпано короткое окно или действует штраф. */
  pauseMs: number
  /** Исчерпан длинный лимит — продолжать нельзя; текст для пользователя. */
  exhausted: string | null
}

/**
 * Разбирает заголовки лимитов трейда. Правила: «макс:период:штраф», состояние: «сейчас:период:штраф»,
 * через запятую, периоды в секундах.
 */
export function pacing(rulesHeader: string | null, stateHeader: string | null): Pacing {
  const parse = (h: string | null) => (h ?? '').split(',').filter(Boolean).map((r) => r.split(':').map(Number))
  const state = parse(stateHeader)
  const result: Pacing = { spacingMs: 0, pauseMs: 0, exhausted: null }
  parse(rulesHeader).forEach(([max, period], i) => {
    const [current = 0, , penalty = 0] = state[i] ?? []
    if (penalty > 0) result.pauseMs = Math.max(result.pauseMs, penalty * 1000)
    if (period <= PACING_WINDOW_S) {
      // Запас 10%: наши часы и часы сервера не совпадают.
      result.spacingMs = Math.max(result.spacingMs, (period / max) * 1100)
      if (current >= max) result.pauseMs = Math.max(result.pauseMs, period * 1000)
    } else if (current >= max) {
      result.exhausted = `Лимит трейда исчерпан: ${max} запросов за ${Math.round(period / 3600)} ч. Продолжить можно позже — уже полученные цены сохранены.`
    }
  })
  return result
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

class Limiter {
  private nextAt = 0
  private exhausted: string | null = null
  constructor(private spacingMs: number) {}

  async wait() {
    // Проверяем заранее: превышение длинного лимита карает блокировкой на час.
    if (this.exhausted) throw new Error(this.exhausted)
    await sleep(Math.max(0, this.nextAt - Date.now()))
  }

  observe(headers: Headers) {
    const p = pacing(headers.get('x-rate-limit-ip'), headers.get('x-rate-limit-ip-state'))
    if (p.spacingMs) this.spacingMs = p.spacingMs
    this.exhausted = p.exhausted
    this.nextAt = Date.now() + Math.max(this.spacingMs, p.pauseMs)
  }

  pause(ms: number) {
    this.nextAt = Date.now() + ms
  }
}

// У поиска и у загрузки лотов отдельные лимиты; стартовые интервалы — на случай ответа без заголовков.
const searchLimiter = new Limiter(11_000)
const fetchLimiter = new Limiter(6_600)

async function tradeRequest<T>(limiter: Limiter, url: string, init?: RequestInit): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await limiter.wait()
    const res = await fetch(url, { ...init, headers: HEADERS, signal: AbortSignal.timeout(30_000) })
    limiter.observe(res.headers)
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') ?? 60)
      if (attempt > 0 || retryAfter > 600) {
        throw new Error(`Трейд ограничил запросы, повторите через ${Math.ceil(retryAfter / 60)} мин.`)
      }
      limiter.pause(retryAfter * 1000)
      continue
    }
    if (!res.ok) throw new Error(`Трейд ответил ${res.status}`)
    return (await res.json()) as T
  }
}

interface TradeListing {
  listing: { price?: { amount: number; currency: string } }
  item: { icon?: string }
}

/** Цена лота в Divine; null — валюта, для которой у нас нет курса. */
export function listingDivine(price: { amount: number; currency: string } | undefined, rates: MarketSnapshot['rates']) {
  if (!price) return null
  if (price.currency === 'divine') return price.amount
  if (price.currency === 'exalted' && rates.exalted > 0) return price.amount / rates.exalted
  if (price.currency === 'chaos' && rates.chaos > 0) return price.amount / rates.chaos
  return null
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

async function priceBase(league: string, base: string, rates: MarketSnapshot['rates']): Promise<StoredPrice> {
  const search = await tradeRequest<{ id: string; result: string[]; total: number }>(
    searchLimiter,
    `${TRADE}/search/poe2/${encodeURIComponent(league)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        query: {
          // Только лоты с мгновенным выкупом: у них цена настоящая, а не приглашение поторговаться.
          status: { option: 'securable' },
          type: base,
          filters: { type_filters: { filters: { rarity: { option: 'normal' }, ilvl: { min: BASE_PRICE_ILVL } } } },
        },
        sort: { price: 'asc' },
      }),
    },
  )
  const at = new Date().toISOString()
  if (search.result.length === 0) return { divine: null, listings: 0, icon: null, at }

  const ids = search.result.slice(0, SAMPLE).join(',')
  const fetched = await tradeRequest<{ result: (TradeListing | null)[] }>(
    fetchLimiter,
    `${TRADE}/fetch/${ids}?query=${search.id}&realm=poe2`,
  )
  const listings = fetched.result.filter((l): l is TradeListing => l !== null)
  const prices = listings.map((l) => listingDivine(l.listing.price, rates)).filter((p): p is number => p !== null)
  return {
    divine: search.total >= MIN_LISTINGS ? median(prices) : null,
    listings: search.total,
    icon: listings.find((l) => l.item.icon)?.item.icon ?? null,
    at,
  }
}

const IDLE: BasePriceJob = { running: false, league: null, done: 0, total: 0, current: null, error: null, finishedAt: null }
let job: BasePriceJob = IDLE
let stopRequested = false

export const getBasePriceJob = () => job

export function stopBasePriceUpdate() {
  stopRequested = true
  return job
}

export function startBasePriceUpdate(league: string, bases: string[]): BasePriceJob {
  if (job.running) throw new Error('Обновление цен уже идёт')
  stopRequested = false
  job = { ...IDLE, running: true, league, total: bases.length }
  void run(league, bases)
  return job
}

async function run(league: string, bases: string[]) {
  try {
    const { rates } = await getSnapshot(league)
    const store = await readStore()
    const prices = (store[league] ??= {})
    const isFresh = (base: string) => prices[base] && Date.now() - Date.parse(prices[base].at) < FRESH_MS
    const todo = bases.filter((base) => !isFresh(base))
    job = { ...job, total: todo.length }

    for (const base of todo) {
      if (stopRequested) break
      job = { ...job, current: base }
      prices[base] = await priceBase(league, base, rates)
      job = { ...job, done: job.done + 1 }
      // Пишем после каждой базы: обновление долгое, и прерывание не должно терять результат.
      await writeStore(store)
    }
  } catch (e) {
    job = { ...job, error: e instanceof Error ? e.message : String(e) }
  } finally {
    job = { ...job, running: false, current: null, finishedAt: new Date().toISOString() }
  }
}
