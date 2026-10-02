// Продакшен-сервер: раздаёт собранную страницу из dist и обслуживает /api/.
// Настройки — переменные окружения, см. README.
import { timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { handleApi } from './api'
import { startScheduler } from './scheduler'

const PORT = Number(process.env.PORT ?? 8080)
// По умолчанию слушаем только локальный интерфейс: наружу сервер выставляют осознанно.
const HOST = process.env.HOST ?? '127.0.0.1'
const STATIC_DIR = path.resolve(process.env.STATIC_DIR ?? 'dist')
const AUTH_USER = process.env.AUTH_USER ?? 'loot'
const AUTH_PASSWORD = process.env.AUTH_PASSWORD ?? ''

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const same = (a: string, b: string) => {
  const [x, y] = [Buffer.from(a), Buffer.from(b)]
  return x.length === y.length && timingSafeEqual(x, y)
}

export function isAuthorized(header: string | undefined, user: string, password: string): boolean {
  if (!password) return true
  const [scheme, encoded = ''] = (header ?? '').split(' ')
  if (scheme !== 'Basic') return false
  const decoded = Buffer.from(encoded, 'base64').toString('utf8')
  const colon = decoded.indexOf(':')
  // Сравниваем обе части всегда, чтобы время ответа не выдавало, что именно не совпало.
  const userOk = same(decoded.slice(0, colon), user)
  const passwordOk = same(decoded.slice(colon + 1), password)
  return colon >= 0 && userOk && passwordOk
}

/** Путь к файлу внутри каталога статики; null — запрос пытается выйти за его пределы. */
export function resolveStatic(root: string, pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  const file = path.resolve(root, '.' + path.posix.normalize('/' + decoded))
  return file === root || file.startsWith(root + path.sep) ? file : null
}

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end()
    return
  }
  const { pathname } = new URL(req.url ?? '/', 'http://localhost')
  const index = path.join(STATIC_DIR, 'index.html')
  let file = resolveStatic(STATIC_DIR, pathname)
  if (!file) {
    res.writeHead(400).end()
    return
  }
  // Каталог и несуществующий путь без расширения — это страница приложения.
  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) {
    if (path.extname(pathname)) {
      res.writeHead(404).end()
      return
    }
    file = index
  }

  res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream')
  // В именах файлов сборки есть хэш содержимого, а index.html должен обновляться сразу после деплоя.
  res.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res)
}

const server = createServer(async (req, res) => {
  try {
    if (!isAuthorized(req.headers.authorization, AUTH_USER, AUTH_PASSWORD)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Loot filter editor", charset="UTF-8"' }).end()
      return
    }
    if (!(await handleApi(req, res))) await serveStatic(req, res)
  } catch (e) {
    console.error(e)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  }
})

// При импорте из тестов сервер не запускается.
if (process.env.VITEST === undefined) {
  server.listen(PORT, HOST, () => {
    console.log(`Редактор лутфильтра: http://${HOST}:${PORT}`)
    if (!AUTH_PASSWORD && HOST !== '127.0.0.1' && HOST !== 'localhost') {
      console.warn('ВНИМАНИЕ: пароль не задан (AUTH_PASSWORD) — редактор доступен всем, кто знает адрес.')
    }
    if (process.env.SCHEDULER !== 'off') startScheduler()
  })
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)))
}
