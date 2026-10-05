import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  AccountError,
  clientIp,
  discordSignIn,
  linkDiscord,
  readCookie,
  readToken,
  recordRegistration,
  sessionUser,
  setToken,
  tooManyRegistrations,
  unlinkDiscord,
  type DiscordProfile,
} from './accounts'

/**
 * Вход через Discord (OAuth 2, scope identify — только id и имя, без почты).
 * Приложение регистрируется в discord.com/developers; его id и секрет — в DISCORD_CLIENT_ID и DISCORD_CLIENT_SECRET.
 * Redirect URI в настройках приложения: https://<домен>/api/auth/discord/callback.
 */

const API = 'https://discord.com/api'
const STATE_COOKIE = 'loot_oauth'
const STATE_MS = 10 * 60 * 1000
const CALLBACK = '/api/auth/discord/callback'

// Читаем при каждом запросе: в разработке переменные подставляет vite.config уже после загрузки модуля.
const credentials = () => {
  const id = process.env.DISCORD_CLIENT_ID ?? ''
  const secret = process.env.DISCORD_CLIENT_SECRET ?? ''
  return id && secret ? { id, secret } : null
}

/** Адрес сайта, на котором начат вход: за Caddy протокол — из заголовка прокси. Discord сверит его со списком в настройках. */
function origin(req: IncomingMessage) {
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() || 'http'
  return `${proto}://${req.headers.host ?? 'localhost'}`
}

function redirect(res: ServerResponse, location: string) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' }).end()
}

function setState(req: IncomingMessage, res: ServerResponse, value: string | null) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
  // Lax: cookie приходит, когда Discord возвращает пользователя обычным переходом по ссылке.
  res.appendHeader(
    'Set-Cookie',
    `${STATE_COOKIE}=${value ?? ''}; HttpOnly; Path=/api/auth/discord; SameSite=Lax; Max-Age=${value ? STATE_MS / 1000 : 0}${secure}`,
  )
}

/** Код из Discord → профиль. */
async function fetchProfile(req: IncomingMessage, code: string, creds: { id: string; secret: string }): Promise<DiscordProfile> {
  const tokenRes = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${creds.id}:${creds.secret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: origin(req) + CALLBACK }),
  })
  if (!tokenRes.ok) throw new Error(`Discord token: HTTP ${tokenRes.status}`)
  const { access_token } = (await tokenRes.json()) as { access_token: string }
  const userRes = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${access_token}` } })
  if (!userRes.ok) throw new Error(`Discord user: HTTP ${userRes.status}`)
  const user = (await userRes.json()) as { id: string; username: string; global_name?: string | null }
  return { id: user.id, name: user.username }
}

/** Результат входа — в адресе страницы «Мои фильтры», интерфейс покажет сообщение. */
const back = (result: string) => `/#/filters?auth=${result}`

/** Запросы к /api/auth/discord/…; false — запрос не про Discord. */
export async function handleDiscord(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const path = url.pathname
  if (path === '/api/auth/providers' && req.method === 'GET') {
    res.end(JSON.stringify({ discord: credentials() !== null }))
    return true
  }
  if (!path.startsWith('/api/auth/discord/')) return false
  const creds = credentials()

  if (path === '/api/auth/discord/start' && req.method === 'GET') {
    if (!creds) {
      redirect(res, back('unavailable'))
      return true
    }
    // state защищает от подмены входа: Discord вернёт его, и он должен совпасть с тем, что в cookie.
    const state = randomBytes(16).toString('base64url')
    const mode = url.searchParams.get('link') ? 'link' : 'login'
    setState(req, res, `${state}.${mode}`)
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: creds.id,
      scope: 'identify',
      state,
      redirect_uri: origin(req) + CALLBACK,
      prompt: 'none',
    })
    redirect(res, `https://discord.com/oauth2/authorize?${params}`)
    return true
  }

  if (path === CALLBACK && req.method === 'GET') {
    const go = (location: string) => {
      redirect(res, location)
      return true
    }
    const [state, mode] = (readCookie(req, STATE_COOKIE) ?? '').split('.')
    setState(req, res, null)
    if (url.searchParams.get('error')) return go(back('denied'))
    const code = url.searchParams.get('code')
    if (!creds || !code || !state || url.searchParams.get('state') !== state) return go(back('failed'))
    try {
      const discord = await fetchProfile(req, code, creds)
      if (mode === 'link') {
        const user = await sessionUser(readToken(req))
        if (!user) return go(back('failed'))
        await linkDiscord(user.id, discord)
        return go(back('linked'))
      }
      const ip = clientIp(req)
      // Новых пользователей через Discord ограничиваем так же, как обычные регистрации.
      if (tooManyRegistrations(ip)) return go(back('limit'))
      const result = await discordSignIn(discord)
      if (result.created) recordRegistration(ip)
      setToken(req, res, result.token)
      return go(back('ok'))
    } catch (e) {
      console.error('Discord:', e instanceof Error ? e.message : e)
      return go(back(e instanceof AccountError && e.status === 409 ? 'taken' : 'failed'))
    }
  }

  if (path === '/api/auth/discord/unlink' && req.method === 'POST') {
    const user = await sessionUser(readToken(req))
    if (!user) throw new AccountError(401, 'sign in first')
    await unlinkDiscord(user.id)
    res.end('{}')
    return true
  }
  return false
}
