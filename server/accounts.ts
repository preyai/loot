import { createHash, randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readData, writeData } from './storage'

/**
 * Пользователи, их сохранённые фильтры и ссылки «поделиться».
 * Хранится в JSON-файлах каталога данных: пользователей и фильтров немного, база данных пока не нужна.
 * Вход — только через Discord (server/discord.ts); сессия — случайный токен в HttpOnly-cookie, на диске лежит его хеш.
 */

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
  /** Имя на сайте: из Discord при первом входе, дальше не меняется. */
  login: string
  createdAt: string
  /** Нет у учётных записей, созданных до входа через Discord: войти в них больше нельзя. */
  discordId?: string
  /** Текущее имя в Discord — обновляется при каждом входе. */
  discordName?: string
}

/** Учётная запись Discord, которой вошёл пользователь. */
export interface DiscordProfile {
  id: string
  name: string
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
/** Имя на сайте: буквы, цифры, «_», «.», «-». */
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

export async function newSession(userId: string): Promise<string> {
  const token = newId(32)
  await update<Record<string, Session>, void>(SESSIONS, {}, (sessions) => {
    const now = Date.now()
    // Заодно выбрасываем истёкшие сессии.
    for (const [key, session] of Object.entries(sessions)) if (session.expires < now) delete sessions[key]
    sessions[tokenHash(token)] = { userId, expires: now + SESSION_MS }
  })
  return token
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

/** Что показывает интерфейс о вошедшем пользователе. */
export async function profile(userId: string) {
  const users = (await readData<Record<string, User>>(USERS)) ?? {}
  const user = Object.values(users).find((u) => u.id === userId)
  if (!user) return null
  // У старых учётных записей с паролем (до входа через Discord) имени в Discord нет.
  return { login: user.login, discord: user.discordName ?? null }
}

/** Логин для нового пользователя из Discord: имя оттуда, а если занято или не подходит — с числом. */
function freeLogin(users: Record<string, User>, name: string): string {
  const base = name.replace(/[^\p{L}\p{N}_.-]/gu, '').slice(0, 26) || 'exile'
  const fits = (login: string) => LOGIN.test(login) && !users[login.toLowerCase()]
  if (fits(base)) return base
  for (;;) {
    const login = `${base}-${randomBytes(2).readUInt16BE() % 10000}`
    if (fits(login)) return login
  }
}

/** Вход через Discord: находит пользователя с этой учётной записью Discord или создаёт нового. */
export async function discordSignIn(discord: DiscordProfile): Promise<{ login: string; token: string; created: boolean }> {
  const { user, created } = await update<Record<string, User>, { user: User; created: boolean }>(USERS, {}, (users) => {
    const found = Object.values(users).find((u) => u.discordId === discord.id)
    if (found) {
      found.discordName = discord.name
      return { user: found, created: false }
    }
    const login = freeLogin(users, discord.name)
    const user: User = {
      id: newId(),
      login,
      createdAt: new Date().toISOString(),
      discordId: discord.id,
      discordName: discord.name,
    }
    users[login.toLowerCase()] = user
    return { user, created: true }
  })
  return { login: user.login, token: await newSession(user.id), created }
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

// --- Сайт открыт всем: не больше 5 новых учётных записей с адреса за час, чтобы их не плодили скриптом.
const REGISTRATIONS = 5
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000
const registrations = new Map<string, number[]>()

export function tooManyRegistrations(ip: string, now = Date.now()): boolean {
  const recent = (registrations.get(ip) ?? []).filter((at) => now - at < REGISTRATION_WINDOW_MS)
  registrations.set(ip, recent)
  return recent.length >= REGISTRATIONS
}

export function recordRegistration(ip: string, now = Date.now()) {
  registrations.set(ip, [...(registrations.get(ip) ?? []), now])
}

// --- HTTP

const COOKIE = 'loot_session'

export function readCookie(req: IncomingMessage, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return null
}

export const readToken = (req: IncomingMessage) => readCookie(req, COOKIE)

export function setToken(req: IncomingMessage, res: ServerResponse, token: string | null) {
  // За Caddy запрос приходит по http, но сайт открыт по https: смотрим заголовок прокси.
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
  // append, а не set: рядом может уходить и другая cookie (состояние входа через Discord).
  res.appendHeader(
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

// Последний адрес в цепочке дописал наш прокси (Caddy), первые клиент может подставить сам.
export const clientIp = (req: IncomingMessage) =>
  String(req.headers['x-forwarded-for'] ?? '').split(',').pop()?.trim() || req.socket.remoteAddress || '?'

/** Запросы к /api/auth/, /api/filters и /api/shared/; undefined — запрос не про пользователей. */
export async function handleAccounts(req: IncomingMessage, res: ServerResponse, url: URL): Promise<unknown> {
  const path = url.pathname
  const method = req.method ?? 'GET'

  if (path === '/api/auth/me' && method === 'GET') {
    const user = await sessionUser(readToken(req))
    return user ? profile(user.id) : null
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
