import type { IncomingMessage, ServerResponse } from 'node:http'
import { getLeagues } from './market'
import { getPopularity } from './popularity'
import { getBasePriceJob, getFullSnapshot, startBasePriceUpdate, stopBasePriceUpdate } from './trade'

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
      return getFullSnapshot(league(), force)
    case 'GET /api/popularity':
      return getPopularity(league(), force)
    case 'GET /api/base-prices/status':
      return getBasePriceJob()
    case 'POST /api/base-prices/stop':
      return stopBasePriceUpdate()
    case 'POST /api/base-prices/update': {
      const body = await readJson(req)
      const bases = Array.isArray(body.bases) ? body.bases.filter((b): b is string => typeof b === 'string') : []
      if (bases.length === 0) throw new BadRequest('Не выбраны базы')
      return startBasePriceUpdate(requireLeague(body.league), bases)
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
    if (result === undefined) res.statusCode = 404
    res.end(JSON.stringify(result ?? { error: 'Not found' }))
  } catch (e) {
    res.statusCode = e instanceof BadRequest ? 400 : 502
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
  }
  return true
}
