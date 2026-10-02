import { EXCEPTIONAL_KINDS, EXCEPTIONAL_QUERIES, type ExceptionalQuery } from '../src/exceptional'
import type { ExceptionalGroup, ExceptionalScan, TradeJob } from '../src/types'
import { readData, writeData } from './storage'

const TRADE = 'https://www.pathofexile.com/api/trade2'
const HEADERS = {
  'User-Agent': 'loot-filter-editor/0.1 (personal project)',
  Accept: 'application/json',
  'Content-Type': 'application/json',
}
const STORE_FILE = 'exceptional.json'
/** Сколько лотов из каждого поиска разбираем по базам. Поиск отдаёт до 100, но каждые 10 — отдельный запрос. */
const SAMPLE = 40
const FETCH_BATCH = 10
/** Окна лимитов длиннее этого не задают темп, а работают как общий бюджет. */
const PACING_WINDOW_S = 300

type Store = Record<string, ExceptionalScan>

const readStore = async () => (await readData<Store>(STORE_FILE)) ?? {}

/** Последний сохранённый опрос лиги; null — опроса ещё не было. */
export async function getExceptionalScan(league: string): Promise<ExceptionalScan | null> {
  return (await readStore())[league] ?? null
}

/** Сколько прошло с последнего опроса лиги; бесконечность, если опроса не было. */
export async function scanAgeMs(league: string): Promise<number> {
  const scan = await getExceptionalScan(league)
  return scan ? Date.now() - Date.parse(scan.at) : Infinity
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
      result.exhausted = `Лимит трейда исчерпан: ${max} запросов за ${Math.round(period / 3600)} ч. Повторите позже.`
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

/**
 * Сколько раз один запрос готов переждать ограничение трейда. Кроме лимитов из заголовков у трейда есть
 * скрытые: на широких поисках по категории он отвечает 429 после пяти-шести запросов подряд.
 */
const MAX_LIMIT_WAITS = 3
/** Дольше этого не ждём — проще повторить опрос позже. */
const MAX_LIMIT_WAIT_S = 900

/** Паузы перед повторами после разового сбоя: обрыв соединения или ошибка на стороне трейда. */
const RETRY_DELAYS_MS = [5_000, 20_000, 60_000]

/** Сообщение вместе с цепочкой причин: у сетевых ошибок fetch само сообщение — всегда безликое «fetch failed». */
export function describeError(error: unknown): string {
  const parts: string[] = []
  for (let e = error; e instanceof Error; e = e.cause) {
    const code = (e as { code?: unknown }).code
    parts.push(typeof code === 'string' ? `${e.message} [${code}]` : e.message)
  }
  return parts.join(' ← ') || String(error)
}

async function tradeRequest<T>(limiter: Limiter, url: string, init?: RequestInit): Promise<T> {
  let failures = 0
  let limitWaits = 0
  // Опрос идёт несколько минут — один сбой не должен обрывать его целиком.
  const retry = (reason: string) => {
    if (failures >= RETRY_DELAYS_MS.length) throw new Error(`Трейд недоступен: ${reason}`)
    console.warn(`Трейд: ${reason}; повтор ${failures + 1} из ${RETRY_DELAYS_MS.length}`)
    limiter.pause(RETRY_DELAYS_MS[failures++])
  }

  for (;;) {
    await limiter.wait()
    let res: Response
    try {
      res = await fetch(url, { ...init, headers: HEADERS, signal: AbortSignal.timeout(30_000) })
    } catch (e) {
      retry(describeError(e))
      continue
    }
    limiter.observe(res.headers)
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') ?? 60)
      if (limitWaits >= MAX_LIMIT_WAITS || retryAfter > MAX_LIMIT_WAIT_S) {
        throw new Error(`Трейд ограничил запросы, повторите через ${Math.ceil(retryAfter / 60)} мин.`)
      }
      limitWaits++
      console.warn(`Трейд: ограничение запросов, ждём ${retryAfter} с (состояние: ${res.headers.get('x-rate-limit-ip-state')})`)
      // Пара секунд сверху: повтор ровно в момент снятия ограничения трейд часто отклоняет снова.
      const waitMs = (retryAfter + 2) * 1000
      job = { ...job, waitingUntil: new Date(Date.now() + waitMs).toISOString() }
      limiter.pause(waitMs)
      continue
    }
    if (res.status >= 500) {
      retry(`ответ ${res.status}`)
      continue
    }
    if (!res.ok) throw new Error(`Трейд ответил ${res.status}`)
    if (job.waitingUntil) job = { ...job, waitingUntil: null }
    return (await res.json()) as T
  }
}

/** Тело поиска: обычные предметы категории с лишними гнёздами или качеством, не дешевле порога. */
export function searchBody(query: ExceptionalQuery, minExalted: number) {
  const { sockets, quality } = EXCEPTIONAL_KINDS[query.kind]
  return {
    query: {
      // Только лоты с мгновенным выкупом: у них цена настоящая, а не приглашение поторговаться.
      status: { option: 'securable' },
      filters: {
        type_filters: {
          filters: {
            // Редкие и магические не берём: у них цену задают свойства, и готовых вещей с гнёздами тысячи.
            rarity: { option: 'normal' },
            category: { option: query.category },
            ...(quality > 0 && { quality: { min: quality } }),
          },
        },
        ...(sockets > 0 && { equipment_filters: { filters: { rune_sockets: { min: sockets } } } }),
        // Цена без указания валюты считается в эквиваленте exalted и включает лоты в любой валюте.
        // collapse оставляет по одному лоту на продавца — счётчик баз превращается в число продавцов.
        trade_filters: { filters: { price: { min: minExalted }, collapse: { option: 'true' } } },
        misc_filters: { filters: { corrupted: { option: 'false' }, mirrored: { option: 'false' } } },
      },
    },
    sort: { price: 'asc' },
  }
}

interface TradeListing {
  item: { baseType?: string; typeLine?: string }
}

async function runQuery(league: string, query: ExceptionalQuery, minExalted: number): Promise<ExceptionalGroup> {
  const search = await tradeRequest<{ id: string; result: string[]; total: number }>(
    searchLimiter,
    `${TRADE}/search/poe2/${encodeURIComponent(league)}`,
    { method: 'POST', body: JSON.stringify(searchBody(query, minExalted)) },
  )
  const group: ExceptionalGroup = { kind: query.kind, title: query.title, total: search.total, sampled: 0, bases: {} }
  const ids = search.result.slice(0, SAMPLE)
  for (let from = 0; from < ids.length && !stopRequested; from += FETCH_BATCH) {
    const fetched = await tradeRequest<{ result: (TradeListing | null)[] }>(
      fetchLimiter,
      `${TRADE}/fetch/${ids.slice(from, from + FETCH_BATCH).join(',')}?query=${search.id}&realm=poe2`,
    )
    for (const listing of fetched.result) {
      const base = listing?.item.baseType ?? listing?.item.typeLine
      if (!base) continue
      group.sampled++
      group.bases[base] = (group.bases[base] ?? 0) + 1
    }
  }
  return group
}

const IDLE: TradeJob = {
  running: false,
  league: null,
  done: 0,
  total: 0,
  current: null,
  waitingUntil: null,
  error: null,
  finishedAt: null,
}
let job: TradeJob = IDLE
let stopRequested = false

export const getTradeJob = () => job

export function stopExceptionalScan() {
  stopRequested = true
  return job
}

export function startExceptionalScan(league: string, minExalted: number): TradeJob {
  if (job.running) throw new Error('Опрос трейда уже идёт')
  stopRequested = false
  job = { ...IDLE, running: true, league, total: EXCEPTIONAL_QUERIES.length }
  void run(league, minExalted)
  return job
}

async function run(league: string, minExalted: number) {
  try {
    console.log(`Исключительные: опрос начат, лига ${league}, порог ${minExalted} ex, запросов ${EXCEPTIONAL_QUERIES.length}`)

    const groups: ExceptionalGroup[] = []
    for (const query of EXCEPTIONAL_QUERIES) {
      if (stopRequested) break
      job = { ...job, current: query.title }
      groups.push(await runQuery(league, query, minExalted))
      job = { ...job, done: job.done + 1 }
    }
    // Прерванный опрос не сохраняем: неполный результат выдал бы себя за полный и затёр прежний.
    if (!stopRequested) {
      const store = await readStore()
      store[league] = { league, at: new Date().toISOString(), minExalted, groups }
      await writeData(STORE_FILE, store)
    }
  } catch (e) {
    // В журнал — с причиной и шагом, на котором остановились.
    console.error(`Исключительные: остановлено на «${job.current}»: ${describeError(e)}`)
    job = { ...job, error: e instanceof Error ? e.message : String(e) }
  } finally {
    job = { ...job, running: false, current: null, waitingUntil: null, finishedAt: new Date().toISOString() }
    console.log(`Исключительные: опрос завершён, выполнено ${job.done} из ${job.total}`)
  }
}
