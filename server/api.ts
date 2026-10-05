import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { AccountError, handleAccounts } from './accounts'
import { handleDiscord } from './discord'
import { getLeagues, getSnapshot } from './market'
import { getPopularity } from './popularity'
import { getExceptionalScan, getTradeJob, startExceptionalScan, stopExceptionalScan } from './trade'

/** Ключ владельца сервера для служебных запросов; пока не задан, они отключены. */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? ''
const DEFAULT_MIN_EXALTED = Number(process.env.EXCEPTIONAL_MIN_EXALTED ?? 100)

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Данные собираются только для лиг, которые знает poe.ninja: иначе любой запрос плодил бы файлы и походы к источнику. */
async function knownLeague(value: unknown): Promise<string> {
  if (typeof value !== 'string' || !value) throw new HttpError(400, 'Не указана лига')
  if (!(await getLeagues()).some((l) => l.name === value)) throw new HttpError(400, 'Неизвестная лига')
  return value
}

function requireAdmin(req: IncomingMessage) {
  const given = Buffer.from(String(req.headers['x-admin-token'] ?? ''))
  const expected = Buffer.from(ADMIN_TOKEN)
  if (!ADMIN_TOKEN || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new HttpError(403, 'Нужен ключ администратора')
  }
}

async function route(req: IncomingMessage, url: URL): Promise<unknown> {
  const league = () => knownLeague(url.searchParams.get('league'))
  switch (`${req.method} ${url.pathname}`) {
    // Пользователям — только чтение сохранённого. Сбор данных запускает расписание (server/scheduler.ts).
    case 'GET /api/leagues':
      return getLeagues()
    case 'GET /api/market':
      return getSnapshot(await league())
    case 'GET /api/popularity':
      return getPopularity(await league())
    case 'GET /api/exceptional':
      return getExceptionalScan(await league())

    // Владельцу сервера: посмотреть ход опроса трейда, запустить его вне расписания или остановить.
    case 'GET /api/admin/scan':
      requireAdmin(req)
      return getTradeJob()
    case 'POST /api/admin/scan': {
      requireAdmin(req)
      const minExalted = Number(url.searchParams.get('min') ?? DEFAULT_MIN_EXALTED)
      if (!(minExalted > 0)) throw new HttpError(400, 'Не задана цена')
      return startExceptionalScan(await league(), minExalted)
    }
    case 'POST /api/admin/scan/stop':
      requireAdmin(req)
      return stopExceptionalScan()
    default:
      return undefined
  }
}

/**
 * Обрабатывает запросы к /api/. Возвращает false, если запрос не к API —
 * тогда им занимается вызывающий (Vite в разработке, раздача статики на сервере).
 */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (!url.pathname.startsWith('/api/')) return false

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  try {
    // Пользователи и их фильтры — свой обработчик (server/accounts.ts), остальное — данные о ценах.
    // Вход через Discord отвечает перенаправлением — сам, без JSON.
    if (await handleDiscord(req, res, url)) return true
    const accounts = await handleAccounts(req, res, url)
    const result = accounts !== undefined ? accounts : await route(req, url)
    // null — законный ответ («данных ещё нет»), не найденным считается только undefined.
    if (result === undefined) res.statusCode = 404
    res.end(JSON.stringify(result === undefined ? { error: 'Not found' } : result))
  } catch (e) {
    res.statusCode = e instanceof HttpError || e instanceof AccountError ? e.status : 502
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
  }
  return true
}
