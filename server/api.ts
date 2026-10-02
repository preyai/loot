import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Currency } from '../src/types'
import { getLeagues, getSnapshot } from './market'
import { getPopularity } from './popularity'
import { getExceptionalScan, getTradeJob, startExceptionalScan, stopExceptionalScan } from './trade'

const CURRENCIES: Currency[] = ['exalted', 'chaos', 'divine']

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>
}

class BadRequest extends Error {}

function requireLeague(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new BadRequest('Не указана лига')
  return value
}

async function route(req: IncomingMessage, url: URL): Promise<unknown> {
  const force = url.searchParams.has('force')
  const league = () => requireLeague(url.searchParams.get('league'))
  switch (`${req.method} ${url.pathname}`) {
    case 'GET /api/leagues':
      return getLeagues()
    case 'GET /api/market':
      return getSnapshot(league(), force)
    case 'GET /api/popularity':
      return getPopularity(league(), force)
    case 'GET /api/exceptional':
      return getExceptionalScan(league())
    case 'GET /api/exceptional/status':
      return getTradeJob()
    case 'POST /api/exceptional/stop':
      return stopExceptionalScan()
    case 'POST /api/exceptional/scan': {
      const body = await readJson(req)
      const currency = CURRENCIES.find((c) => c === body.currency)
      const minPrice = Number(body.minPrice)
      if (!currency || !(minPrice > 0)) throw new BadRequest('Не задана цена')
      return startExceptionalScan(requireLeague(body.league), minPrice, currency)
    }
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
    const result = await route(req, url)
    // null — законный ответ («опроса ещё не было»), не найденным считается только undefined.
    if (result === undefined) res.statusCode = 404
    res.end(JSON.stringify(result === undefined ? { error: 'Not found' } : result))
  } catch (e) {
    res.statusCode = e instanceof BadRequest ? 400 : 502
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
  }
  return true
}
