import type { IncomingMessage } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'
import { getLeagues } from './server/market'
import { getPopularity } from './server/popularity'
import { getBasePriceJob, getFullSnapshot, startBasePriceUpdate, stopBasePriceUpdate } from './server/trade'

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

// poe.ninja и трейд не отдают CORS-заголовки, поэтому данные забирает dev-сервер, а не браузер.
function marketApi(): Plugin {
  const route = async (req: IncomingMessage, url: URL): Promise<unknown> => {
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

  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith('/api/')) return next()

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    try {
      const result = await route(req, url)
      if (result === undefined) res.statusCode = 404
      res.end(JSON.stringify(result ?? { error: 'Not found' }))
    } catch (e) {
      res.statusCode = e instanceof BadRequest ? 400 : 502
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
    }
  }

  return {
    name: 'market-api',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  }
}

export default defineConfig({
  plugins: [react(), marketApi()],
  // Файл с ценами баз переписывается во время обновления — это не повод перезагружать страницу.
  server: { watch: { ignored: ['**/data/base-prices.json'] } },
})
