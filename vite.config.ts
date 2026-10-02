import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'
import { handleApi } from './server/api'

// poe.ninja и трейд не отдают CORS-заголовки, поэтому данные забирает сервер, а не браузер.
// В разработке API живёт внутри dev-сервера Vite, в продакшене — в server/index.ts.
function marketApi(): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (!(await handleApi(req, res))) next()
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
