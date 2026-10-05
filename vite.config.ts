import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import { handleApi } from './server/api'
import { DATA_DIR } from './server/storage'

// poe.ninja и трейд не отдают CORS-заголовки, поэтому данные забирает сервер, а не браузер.
// В разработке API живёт внутри dev-сервера Vite, в продакшене — в server/index.ts.
// Расписание сбора данных (server/scheduler.ts) в разработке не запускается: данные читаются с диска
// или подтягиваются при первом запросе, а трейд опрашивается только служебным запросом с ADMIN_TOKEN.
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

export default defineConfig(({ mode }) => {
  // Ключи входа через Discord и адрес базы для разработки — из .env.local (в git не попадает), на сервере — из .env контейнера.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ['DISCORD_', 'DATABASE_']))
  return {
    plugins: [react(), marketApi()],
    // Образ на сервере — без node_modules: драйвер Postgres входит в сборку сервера.
    // PGlite нужен только в разработке и тестах (когда нет DATABASE_URL) и в сборку не попадает.
    ssr: { noExternal: ['postgres'], external: ['@electric-sql/pglite'] },
    // Сохранённые данные переписываются сервером — это не повод перезагружать страницу.
    // Только каталог в корне проекта: шаблон «**/data/**» задел бы и src/data со справочником баз.
    server: { watch: { ignored: [`${DATA_DIR.replaceAll('\\', '/')}/**`] } },
  }
})
