import { createHash, randomBytes } from 'node:crypto'
import { rename } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { db, type Db } from './db'
import { DATA_DIR, readData } from './storage'

/**
 * Пользователи, их сохранённые фильтры и ссылки «поделиться» — в базе данных (server/db.ts).
 * Вход — только через Discord (server/discord.ts); сессия — случайный токен в HttpOnly-cookie, в базе лежит его хеш.
 */

export class AccountError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Учётная запись Discord, которой вошёл пользователь. */
export interface DiscordProfile {
  id: string
  name: string
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

export const SESSION_DAYS = 30
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000
const MAX_FILTERS = 50
/** Настройки редактора — десятки килобайт; больший объём — уже не настройки. */
const MAX_CONFIG_BYTES = 512 * 1024
/** Имя на сайте: буквы, цифры, «_», «.», «-». */
const LOGIN = /^[\p{L}\p{N}_.-]{3,32}$/u

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
const newId = (bytes = 12) => randomBytes(bytes).toString('base64url')
const iso = (value: Date | string) => new Date(value).toISOString()

let ready: Promise<Db> | null = null

/** База с перенесёнными данными: до перехода на базу учётные записи лежали в JSON-файлах. */
function database(): Promise<Db> {
  ready ??= db().then(async (instance) => {
    await importJson(instance)
    return instance
  })
  return ready
}

// --- Перенос из JSON-файлов (data/accounts) — один раз, в пустую базу; папка потом переименовывается.

interface JsonUser {
  id: string
  login: string
  createdAt: string
  discordId?: string
  discordName?: string
}

async function importJson(instance: Db) {
  const users = await readData<Record<string, JsonUser>>('accounts/users.json')
  if (!users) return
  const [{ count }] = await instance.query<{ count: number }>(`SELECT count(*)::int AS count FROM users`)
  if (count > 0) return
  const sessions = (await readData<Record<string, { userId: string; expires: number }>>('accounts/sessions.json')) ?? {}
  await instance.transaction(async (tx) => {
    for (const user of Object.values(users)) {
      await tx.query(`INSERT INTO users (id, login, discord_id, discord_name, created_at) VALUES ($1, $2, $3, $4, $5)`, [
        user.id,
        user.login,
        user.discordId ?? null,
        user.discordName ?? null,
        user.createdAt,
      ])
      for (const filter of (await readData<SavedFilter[]>(`accounts/filters/${user.id}.json`)) ?? []) {
        await tx.query(
          `INSERT INTO filters (id, user_id, name, config, share_code, created_at, updated_at) VALUES ($1, $2, $3, $4::text::jsonb, $5, $6, $7)`,
          [filter.id, user.id, filter.name, JSON.stringify(filter.config), filter.shareCode ?? null, filter.createdAt, filter.updatedAt],
        )
      }
    }
    for (const [hash, session] of Object.entries(sessions)) {
      if (session.expires < Date.now() || !Object.values(users).some((u) => u.id === session.userId)) continue
      await tx.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [hash, session.userId, new Date(session.expires)])
    }
  })
  const dir = path.join(DATA_DIR, 'accounts')
  await rename(dir, `${dir}.imported`)
  console.log(`Учётные записи перенесены в базу: ${Object.keys(users).length}; файлы — в ${dir}.imported`)
}

// --- Сессии

export async function newSession(userId: string): Promise<string> {
  const token = newId(32)
  const sql = await database()
  // Заодно выбрасываем истёкшие сессии.
  await sql.query(`DELETE FROM sessions WHERE expires_at < now()`)
  await sql.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [
    tokenHash(token),
    userId,
    new Date(Date.now() + SESSION_MS),
  ])
  return token
}

export async function logout(token: string) {
  await (await database()).query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash(token)])
}

export async function sessionUser(token: string | null): Promise<{ id: string; login: string } | null> {
  if (!token) return null
  const [user] = await (
    await database()
  ).query<{ id: string; login: string }>(
    `SELECT u.id, u.login FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash(token)],
  )
  return user ?? null
}

/** Что показывает интерфейс о вошедшем пользователе. */
export async function profile(userId: string) {
  const [user] = await (
    await database()
  ).query<{ login: string; discord_name: string | null }>(`SELECT login, discord_name FROM users WHERE id = $1`, [userId])
  // У старых учётных записей с паролем (до входа через Discord) имени в Discord нет.
  return user ? { login: user.login, discord: user.discord_name } : null
}

// --- Вход через Discord

/** Логин для нового пользователя из Discord: имя оттуда, а если занято или не подходит — с числом. */
async function freeLogin(sql: Db, name: string): Promise<string> {
  const base = name.replace(/[^\p{L}\p{N}_.-]/gu, '').slice(0, 26) || 'exile'
  const taken = async (login: string) =>
    (await sql.query(`SELECT 1 FROM users WHERE lower(login) = lower($1)`, [login])).length > 0
  if (LOGIN.test(base) && !(await taken(base))) return base
  for (;;) {
    const login = `${base}-${randomBytes(2).readUInt16BE() % 10000}`
    if (LOGIN.test(login) && !(await taken(login))) return login
  }
}

/** Вход через Discord: находит пользователя с этой учётной записью Discord или создаёт нового. */
export async function discordSignIn(discord: DiscordProfile): Promise<{ login: string; token: string; created: boolean }> {
  const sql = await database()
  const user = await sql.transaction(async (tx) => {
    const [found] = await tx.query<{ id: string; login: string }>(
      `UPDATE users SET discord_name = $2 WHERE discord_id = $1 RETURNING id, login`,
      [discord.id, discord.name],
    )
    if (found) return { ...found, created: false }
    const [made] = await tx.query<{ id: string; login: string }>(
      `INSERT INTO users (id, login, discord_id, discord_name) VALUES ($1, $2, $3, $4) RETURNING id, login`,
      [newId(), await freeLogin(tx, discord.name), discord.id, discord.name],
    )
    return { ...made, created: true }
  })
  return { login: user.login, token: await newSession(user.id), created: user.created }
}

// --- Фильтры пользователя

interface FilterRow {
  id: string
  name: string
  config?: Record<string, unknown>
  share_code: string | null
  created_at: Date
  updated_at: Date
}

const summary = (row: FilterRow): FilterSummary => ({
  id: row.id,
  name: row.name,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  ...(row.share_code ? { shareCode: row.share_code } : {}),
})

const SUMMARY_COLUMNS = 'id, name, share_code, created_at, updated_at'

function checkName(name: unknown): string {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) throw new AccountError(400, 'name: 1–60 characters')
  return name.trim()
}

/**
 * Настройки уходят в базу готовой JSON-строкой, а в SQL приводятся так: $n::text::jsonb. Просто $n::jsonb драйвер
 * postgres сериализовал бы строку ещё раз, и в базе лежала бы строка, а не объект.
 */
function checkConfig(config: unknown): string {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new AccountError(400, 'config must be an object')
  const json = JSON.stringify(config)
  if (json.length > MAX_CONFIG_BYTES) throw new AccountError(413, 'config is too large')
  return json
}

export async function listFilters(userId: string): Promise<FilterSummary[]> {
  const rows = await (
    await database()
  ).query<FilterRow>(`SELECT ${SUMMARY_COLUMNS} FROM filters WHERE user_id = $1 ORDER BY updated_at DESC`, [userId])
  return rows.map(summary)
}

export async function getFilter(userId: string, id: string): Promise<SavedFilter> {
  const [row] = await (
    await database()
  ).query<FilterRow>(`SELECT ${SUMMARY_COLUMNS}, config FROM filters WHERE user_id = $1 AND id = $2`, [userId, id])
  if (!row) throw new AccountError(404, 'filter not found')
  return { ...summary(row), config: row.config! }
}

export async function createFilter(userId: string, name: unknown, config: unknown): Promise<FilterSummary> {
  const values = [newId(), userId, checkName(name), checkConfig(config)]
  return (await database()).transaction(async (tx) => {
    // Блокируем строку пользователя: одновременные сохранения не обойдут ограничение на число фильтров.
    await tx.query(`SELECT 1 FROM users WHERE id = $1 FOR UPDATE`, [userId])
    const [{ count }] = await tx.query<{ count: number }>(`SELECT count(*)::int AS count FROM filters WHERE user_id = $1`, [userId])
    if (count >= MAX_FILTERS) throw new AccountError(400, `no more than ${MAX_FILTERS} filters`)
    const [row] = await tx.query<FilterRow>(
      `INSERT INTO filters (id, user_id, name, config) VALUES ($1, $2, $3, $4::text::jsonb) RETURNING ${SUMMARY_COLUMNS}`,
      values,
    )
    return summary(row)
  })
}

export async function updateFilter(userId: string, id: string, changes: { name?: unknown; config?: unknown }): Promise<FilterSummary> {
  const name = changes.name === undefined ? null : checkName(changes.name)
  const config = changes.config === undefined ? null : checkConfig(changes.config)
  const [row] = await (
    await database()
  ).query<FilterRow>(
    `UPDATE filters SET name = coalesce($3, name), config = coalesce($4::text::jsonb, config), updated_at = now()
     WHERE user_id = $1 AND id = $2 RETURNING ${SUMMARY_COLUMNS}`,
    [userId, id, name, config],
  )
  if (!row) throw new AccountError(404, 'filter not found')
  return summary(row)
}

export async function deleteFilter(userId: string, id: string) {
  const rows = await (await database()).query(`DELETE FROM filters WHERE user_id = $1 AND id = $2 RETURNING id`, [userId, id])
  if (rows.length === 0) throw new AccountError(404, 'filter not found')
}

// --- Ссылки «поделиться»: по коду фильтр видит любой, у кого есть ссылка.

export async function shareFilter(userId: string, id: string): Promise<{ shareCode: string }> {
  const [row] = await (
    await database()
  ).query<{ share_code: string }>(
    `UPDATE filters SET share_code = coalesce(share_code, $3) WHERE user_id = $1 AND id = $2 RETURNING share_code`,
    [userId, id, newId(9)],
  )
  if (!row) throw new AccountError(404, 'filter not found')
  return { shareCode: row.share_code }
}

export async function unshareFilter(userId: string, id: string) {
  const rows = await (
    await database()
  ).query(`UPDATE filters SET share_code = NULL WHERE user_id = $1 AND id = $2 RETURNING id`, [userId, id])
  if (rows.length === 0) throw new AccountError(404, 'filter not found')
}

export async function sharedFilter(code: string): Promise<{ name: string; owner: string; config: Record<string, unknown>; updatedAt: string }> {
  const [row] = await (
    await database()
  ).query<{ name: string; owner: string; config: Record<string, unknown>; updated_at: Date }>(
    `SELECT f.name, u.login AS owner, f.config, f.updated_at FROM filters f JOIN users u ON u.id = f.user_id WHERE f.share_code = $1`,
    [code],
  )
  if (!row) throw new AccountError(404, 'link not found')
  return { name: row.name, owner: row.owner, config: row.config, updatedAt: iso(row.updated_at) }
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
