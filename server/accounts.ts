import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { promisify } from 'node:util'
import { readData, writeData } from './storage'

/**
 * Пользователи, их сохранённые фильтры и ссылки «поделиться».
 * Хранится в JSON-файлах каталога данных: пользователей и фильтров немного, база данных пока не нужна.
 * Пароли — только хешем scrypt с солью; сессия — случайный токен в HttpOnly-cookie, на диске лежит его хеш.
 */

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>

export class AccountError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

interface User {
  id: string
  login: string
  salt: string
  hash: string
  createdAt: string
}

interface Session {
  userId: string
  expires: number
}

export interface SavedFilter {
  id: string
  name: string
  /** Настройки редактора (без языка интерфейса и лиги — они у каждого свои). */
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
  shareCode?: string
}

export type FilterSummary = Omit<SavedFilter, 'config'>

const USERS = 'accounts/users.json'
const SESSIONS = 'accounts/sessions.json'
const SHARES = 'accounts/shares.json'
const filtersFile = (userId: string) => `accounts/filters/${userId}.json`

export const SESSION_DAYS = 30
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000
const MAX_FILTERS = 50
/** Настройки редактора — десятки килобайт; больший объём — уже не настройки. */
const MAX_CONFIG_BYTES = 512 * 1024
const LOGIN = /^[\p{L}\p{N}_.-]{3,32}$/u

// --- Запись по очереди: одновременные запросы не должны терять изменения друг друга.
const queues = new Map<string, Promise<unknown>>()
function locked<T>(file: string, run: () => Promise<T>): Promise<T> {
  const previous = queues.get(file) ?? Promise.resolve()
  const next = previous.then(run, run)
  queues.set(
    file,
    next.catch(() => undefined),
  )
  return next
}

async function update<T, R>(file: string, fallback: T, change: (value: T) => R | Promise<R>): Promise<R> {
  return locked(file, async () => {
    const value = (await readData<T>(file)) ?? fallback
    const result = await change(value)
    await writeData(file, value)
    return result
  })
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
const newId = (bytes = 12) => randomBytes(bytes).toString('base64url')

async function hashPassword(password: string, salt: Buffer) {
  return (await scrypt(password, salt, 64)).toString('hex')
}

function checkCredentials(login: unknown, password: unknown): { login: string; password: string } {
  if (typeof login !== 'string' || !LOGIN.test(login)) {
    throw new AccountError(400, 'login: 3–32 letters, digits, «_», «.», «-»')
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    throw new AccountError(400, 'password: 8–200 characters')
  }
  return { login, password }
}

async function newSession(userId: string): Promise<string> {
  const token = newId(32)
  await update<Record<string, Session>, void>(SESSIONS, {}, (sessions) => {
    const now = Date.now()
    // Заодно выбрасываем истёкшие сессии.
    for (const [key, session] of Object.entries(sessions)) if (session.expires < now) delete sessions[key]
    sessions[tokenHash(token)] = { userId, expires: now + SESSION_MS }
  })
  return token
}

export async function register(loginValue: unknown, passwordValue: unknown): Promise<{ login: string; token: string }> {
  const { login, password } = checkCredentials(loginValue, passwordValue)
  const salt = randomBytes(16)
  const hash = await hashPassword(password, salt)
  const user = await update<Record<string, User>, User>(USERS, {}, (users) => {
    const key = login.toLowerCase()
    if (users[key]) throw new AccountError(409, 'login is taken')
    users[key] = { id: newId(), login, salt: salt.toString('hex'), hash, createdAt: new Date().toISOString() }
    return users[key]
  })
  return { login: user.login, token: await newSession(user.id) }
}

export async function login(loginValue: unknown, passwordValue: unknown): Promise<{ login: string; token: string }> {
  const { login, password } = checkCredentials(loginValue, passwordValue)
  const users = (await readData<Record<string, User>>(USERS)) ?? {}
  const user = users[login.toLowerCase()]
  // Хеш считаем и для несуществующего логина: по времени ответа нельзя понять, есть ли такой пользователь.
  const hash = Buffer.from(await hashPassword(password, Buffer.from(user?.salt ?? '00'.repeat(16), 'hex')), 'hex')
  if (!user || !timingSafeEqual(hash, Buffer.from(user.hash, 'hex'))) throw new AccountError(401, 'wrong login or password')
  return { login: user.login, token: await newSession(user.id) }
}

export async function logout(token: string) {
  await update<Record<string, Session>, void>(SESSIONS, {}, (sessions) => {
    delete sessions[tokenHash(token)]
  })
}

export async function sessionUser(token: string | null): Promise<{ id: string; login: string } | null> {
  if (!token) return null
  const session = ((await readData<Record<string, Session>>(SESSIONS)) ?? {})[tokenHash(token)]
  if (!session || session.expires < Date.now()) return null
  const users = (await readData<Record<string, User>>(USERS)) ?? {}
  const user = Object.values(users).find((u) => u.id === session.userId)
  return user ? { id: user.id, login: user.login } : null
}

// --- Фильтры пользователя

const summary = ({ config: _config, ...rest }: SavedFilter): FilterSummary => rest

function checkName(name: unknown): string {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) throw new AccountError(400, 'name: 1–60 characters')
  return name.trim()
}

function checkConfig(config: unknown): Record<string, unknown> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new AccountError(400, 'config must be an object')
  if (JSON.stringify(config).length > MAX_CONFIG_BYTES) throw new AccountError(413, 'config is too large')
  return config as Record<string, unknown>
}

export async function listFilters(userId: string): Promise<FilterSummary[]> {
  const list = (await readData<SavedFilter[]>(filtersFile(userId))) ?? []
  return list.map(summary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getFilter(userId: string, id: string): Promise<SavedFilter> {
  const found = ((await readData<SavedFilter[]>(filtersFile(userId))) ?? []).find((f) => f.id === id)
  if (!found) throw new AccountError(404, 'filter not found')
  return found
}

export async function createFilter(userId: string, name: unknown, config: unknown): Promise<FilterSummary> {
  const filter: SavedFilter = {
    id: newId(),
    name: checkName(name),
    config: checkConfig(config),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  return update<SavedFilter[], FilterSummary>(filtersFile(userId), [], (list) => {
    if (list.length >= MAX_FILTERS) throw new AccountError(400, `no more than ${MAX_FILTERS} filters`)
    list.push(filter)
    return summary(filter)
  })
}

export async function updateFilter(userId: string, id: string, changes: { name?: unknown; config?: unknown }): Promise<FilterSummary> {
  const name = changes.name === undefined ? undefined : checkName(changes.name)
  const config = changes.config === undefined ? undefined : checkConfig(changes.config)
  return update<SavedFilter[], FilterSummary>(filtersFile(userId), [], (list) => {
    const filter = list.find((f) => f.id === id)
    if (!filter) throw new AccountError(404, 'filter not found')
    if (name !== undefined) filter.name = name
    if (config !== undefined) filter.config = config
    filter.updatedAt = new Date().toISOString()
    return summary(filter)
  })
}

export async function deleteFilter(userId: string, id: string) {
  const removed = await update<SavedFilter[], SavedFilter | undefined>(filtersFile(userId), [], (list) => {
    const index = list.findIndex((f) => f.id === id)
    return index >= 0 ? list.splice(index, 1)[0] : undefined
  })
  if (!removed) throw new AccountError(404, 'filter not found')
  if (removed.shareCode) await update<Record<string, unknown>, void>(SHARES, {}, (shares) => void delete shares[removed.shareCode!])
}

// --- Ссылки «поделиться»: код → чей и какой фильтр. По коду фильтр видит любой, у кого есть ссылка.

export async function shareFilter(userId: string, id: string): Promise<{ shareCode: string }> {
  const filter = await getFilter(userId, id)
  if (filter.shareCode) return { shareCode: filter.shareCode }
  const shareCode = newId(9)
  await update<Record<string, { userId: string; filterId: string }>, void>(SHARES, {}, (shares) => {
    shares[shareCode] = { userId, filterId: id }
  })
  await update<SavedFilter[], void>(filtersFile(userId), [], (list) => {
    const target = list.find((f) => f.id === id)
    if (target) target.shareCode = shareCode
  })
  return { shareCode }
}

export async function unshareFilter(userId: string, id: string) {
  const filter = await getFilter(userId, id)
  if (!filter.shareCode) return
  await update<Record<string, unknown>, void>(SHARES, {}, (shares) => void delete shares[filter.shareCode!])
  await update<SavedFilter[], void>(filtersFile(userId), [], (list) => {
    const target = list.find((f) => f.id === id)
    if (target) delete target.shareCode
  })
}

export async function sharedFilter(code: string): Promise<{ name: string; owner: string; config: Record<string, unknown>; updatedAt: string }> {
  const link = ((await readData<Record<string, { userId: string; filterId: string }>>(SHARES)) ?? {})[code]
  if (!link) throw new AccountError(404, 'link not found')
  const filter = await getFilter(link.userId, link.filterId)
  const users = (await readData<Record<string, User>>(USERS)) ?? {}
  const owner = Object.values(users).find((u) => u.id === link.userId)?.login ?? '?'
  return { name: filter.name, owner, config: filter.config, updatedAt: filter.updatedAt }
}

// --- Защита от перебора паролей: не больше 10 неудачных попыток входа с адреса за 10 минут.
const ATTEMPTS = 10
const WINDOW_MS = 10 * 60 * 1000
const failures = new Map<string, number[]>()

export function tooManyAttempts(ip: string, now = Date.now()): boolean {
  const recent = (failures.get(ip) ?? []).filter((at) => now - at < WINDOW_MS)
  failures.set(ip, recent)
  return recent.length >= ATTEMPTS
}

export function recordFailure(ip: string, now = Date.now()) {
  failures.set(ip, [...(failures.get(ip) ?? []), now])
}

// --- HTTP

const COOKIE = 'loot_session'

function readToken(req: IncomingMessage): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === COOKIE) return decodeURIComponent(value.join('='))
  }
  return null
}

function setToken(req: IncomingMessage, res: ServerResponse, token: string | null) {
  // За Caddy запрос приходит по http, но сайт открыт по https: смотрим заголовок прокси.
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    token
      ? `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure}`
      : `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`,
  )
}

const MAX_BODY = MAX_CONFIG_BYTES + 64 * 1024

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) throw new AccountError(413, 'request is too large')
    chunks.push(chunk as Buffer)
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    if (!body || typeof body !== 'object') throw new Error()
    return body as Record<string, unknown>
  } catch {
    throw new AccountError(400, 'invalid JSON')
  }
}

const clientIp = (req: IncomingMessage) =>
  String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '?'

/** Запросы к /api/auth/, /api/filters и /api/shared/; undefined — запрос не про пользователей. */
export async function handleAccounts(req: IncomingMessage, res: ServerResponse, url: URL): Promise<unknown> {
  const path = url.pathname
  const method = req.method ?? 'GET'

  if (path === '/api/auth/me' && method === 'GET') {
    const user = await sessionUser(readToken(req))
    return user ? { login: user.login } : null
  }
  if ((path === '/api/auth/register' || path === '/api/auth/login') && method === 'POST') {
    const ip = clientIp(req)
    if (tooManyAttempts(ip)) throw new AccountError(429, 'too many attempts, try again later')
    const body = await readBody(req)
    try {
      const result = path.endsWith('register') ? await register(body.login, body.password) : await login(body.login, body.password)
      setToken(req, res, result.token)
      return { login: result.login }
    } catch (e) {
      if (e instanceof AccountError && e.status === 401) recordFailure(ip)
      throw e
    }
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    const token = readToken(req)
    if (token) await logout(token)
    setToken(req, res, null)
    return {}
  }

  const shared = /^\/api\/shared\/([\w-]{6,32})$/.exec(path)
  if (shared && method === 'GET') return sharedFilter(shared[1])

  if (!path.startsWith('/api/filters')) return undefined
  const user = await sessionUser(readToken(req))
  if (!user) throw new AccountError(401, 'sign in first')

  if (path === '/api/filters') {
    if (method === 'GET') return listFilters(user.id)
    if (method === 'POST') {
      const body = await readBody(req)
      return createFilter(user.id, body.name, body.config)
    }
  }
  const one = /^\/api\/filters\/([\w-]{6,32})(\/share)?$/.exec(path)
  if (one) {
    const [, id, share] = one
    if (share) {
      if (method === 'POST') return shareFilter(user.id, id)
      if (method === 'DELETE') return unshareFilter(user.id, id).then(() => ({}))
    } else {
      if (method === 'GET') return getFilter(user.id, id)
      if (method === 'PUT') {
        const body = await readBody(req)
        return updateFilter(user.id, id, { name: body.name, config: body.config })
      }
      if (method === 'DELETE') return deleteFilter(user.id, id).then(() => ({}))
    }
  }
  return undefined
}
