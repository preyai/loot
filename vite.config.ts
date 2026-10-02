import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'
import { getLeagues, getSnapshot } from './server/market'

// poe.ninja не отдаёт CORS-заголовки, поэтому цены забирает dev-сервер, а не браузер.
function marketApi(): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith('/api/')) return next()

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    try {
      if (url.pathname === '/api/leagues') {
        res.end(JSON.stringify(await getLeagues()))
      } else if (url.pathname === '/api/market') {
        const league = url.searchParams.get('league')
        if (!league) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Не указана лига' }))
          return
        }
        res.end(JSON.stringify(await getSnapshot(league, url.searchParams.has('force'))))
      } else {
        res.statusCode = 404
        res.end(JSON.stringify({ error: 'Not found' }))
      }
    } catch (e) {
      res.statusCode = 502
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
})
