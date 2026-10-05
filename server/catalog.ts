import type { IncomingMessage } from 'node:http'
import {
  AccountError,
  createFilter,
  database,
  readBody,
  readToken,
  sessionUser,
  STATS_COLUMNS,
  summary,
  type FilterRow,
  type FilterSummary,
} from './accounts'

/**
 * «Фильтры сообщества»: опубликованные фильтры, их оценки, подписки и копии.
 * Публикация требует ссылки «поделиться»: каталог ведёт на ту же страницу фильтра по ссылке.
 */

const MAX_DESCRIPTION = 300
const CATALOG_LIMIT = 100
/** Сглаживание рейтинга: к оценкам фильтра будто добавлены 3 оценки по 3.5 — одна пятёрка не выводит в топ. */
const PRIOR_COUNT = 3
const PRIOR_MEAN = 3.5

export type CatalogSort = 'popular' | 'rating' | 'new'

export interface CatalogEntry extends FilterSummary {
  owner: string
  publishedAt: string | null
  /** Только для вошедшего: его оценка и подписан ли он. */
  myRating?: number | null
  subscribed?: boolean
  own?: boolean
}

interface CatalogRow extends FilterRow {
  owner: string
  published_at: Date | null
  my_rating?: number | null
  subscribed?: boolean
  own?: boolean
}

const entry = (row: CatalogRow, viewer: string | null): CatalogEntry => ({
  ...summary(row),
  owner: row.owner,
  publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
  ...(viewer ? { myRating: row.my_rating ?? null, subscribed: Boolean(row.subscribed), own: Boolean(row.own) } : {}),
})

/** Столбцы для зрителя ($n — его id или null): его оценка, подписка, свой ли фильтр. */
const viewerColumns = (n: number) => `(SELECT value FROM filter_ratings r WHERE r.filter_id = f.id AND r.user_id = $${n}) AS my_rating,
  EXISTS (SELECT 1 FROM filter_subscriptions s WHERE s.filter_id = f.id AND s.user_id = $${n}) AS subscribed,
  f.user_id = $${n} AS own`

const ORDER: Record<CatalogSort, string> = {
  popular: 'subscribers + f.copies DESC, f.published_at DESC',
  rating: `(coalesce(rating * ratings, 0) + ${PRIOR_COUNT * PRIOR_MEAN}) / (ratings + ${PRIOR_COUNT}) DESC, ratings DESC, f.published_at DESC`,
  new: 'f.published_at DESC',
}

export async function catalog(sort: CatalogSort, query: string, viewer: string | null): Promise<CatalogEntry[]> {
  // Поиск по подстроке: % и _ в запросе — обычные символы, а не шаблоны.
  const needle = query.trim().slice(0, 60).replace(/[\\%_]/g, (c) => `\\${c}`)
  const rows = await (
    await database()
  ).query<CatalogRow>(
    `SELECT * FROM (
       SELECT f.id, f.name, f.share_code, f.is_public, f.description, f.copies, f.created_at, f.updated_at, f.published_at,
         u.login AS owner, ${STATS_COLUMNS}, ${viewerColumns(2)}
       FROM filters f JOIN users u ON u.id = f.user_id
       WHERE f.is_public AND ($1 = '' OR f.name ILIKE '%' || $1 || '%' OR u.login ILIKE '%' || $1 || '%')
     ) f
     ORDER BY ${ORDER[sort]}
     LIMIT ${CATALOG_LIMIT}`,
    [needle, viewer],
  )
  return rows.map((row) => entry(row, viewer))
}

function checkDescription(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string' || value.trim().length > MAX_DESCRIPTION) throw new AccountError(400, `description: up to ${MAX_DESCRIPTION} characters`)
  return value.trim()
}

/** Опубликовать свой фильтр: заодно создаётся ссылка «поделиться», если её не было. */
export async function publishFilter(userId: string, id: string, description: unknown): Promise<FilterSummary> {
  const [row] = await (
    await database()
  ).query<FilterRow>(
    `UPDATE filters SET is_public = true, description = $3, share_code = coalesce(share_code, $4), published_at = coalesce(published_at, now())
     WHERE user_id = $1 AND id = $2 RETURNING id, name, share_code, is_public, description, copies, created_at, updated_at`,
    [userId, id, checkDescription(description), newCode()],
  )
  if (!row) throw new AccountError(404, 'filter not found')
  return summary(row)
}

export async function unpublishFilter(userId: string, id: string) {
  const rows = await (await database()).query(`UPDATE filters SET is_public = false WHERE user_id = $1 AND id = $2 RETURNING id`, [userId, id])
  if (rows.length === 0) throw new AccountError(404, 'filter not found')
}

const newCode = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12)

export interface SharedInfo extends CatalogEntry {
  config: Record<string, unknown>
}

/** Фильтр по ссылке «поделиться» — с настройками и, если опубликован, статистикой. */
export async function sharedFilter(code: string, viewer: string | null = null): Promise<SharedInfo> {
  const [row] = await (
    await database()
  ).query<CatalogRow & { config: Record<string, unknown> }>(
    `SELECT f.id, f.name, f.share_code, f.is_public, f.description, f.copies, f.created_at, f.updated_at, f.published_at, f.config,
       u.login AS owner, ${STATS_COLUMNS}, ${viewerColumns(2)}
     FROM filters f JOIN users u ON u.id = f.user_id WHERE f.share_code = $1`,
    [code, viewer],
  )
  if (!row) throw new AccountError(404, 'link not found')
  return { ...entry(row, viewer), config: row.config }
}

/** Опубликованный фильтр по ссылке, который не принадлежит зрителю: оценивать и подписываться можно только на такие. */
async function othersPublic(code: string, viewer: string): Promise<string> {
  const [row] = await (
    await database()
  ).query<{ id: string; user_id: string; is_public: boolean }>(`SELECT id, user_id, is_public FROM filters WHERE share_code = $1`, [code])
  if (!row) throw new AccountError(404, 'link not found')
  if (!row.is_public) throw new AccountError(403, 'filter is not public')
  if (row.user_id === viewer) throw new AccountError(400, 'this is your own filter')
  return row.id
}

export async function rateFilter(code: string, viewer: string, value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) throw new AccountError(400, 'rating: 1–5')
  const id = await othersPublic(code, viewer)
  await (await database()).query(
    `INSERT INTO filter_ratings (filter_id, user_id, value) VALUES ($1, $2, $3)
     ON CONFLICT (filter_id, user_id) DO UPDATE SET value = EXCLUDED.value, rated_at = now()`,
    [id, viewer, value],
  )
}

export async function subscribe(code: string, viewer: string) {
  const id = await othersPublic(code, viewer)
  await (await database()).query(`INSERT INTO filter_subscriptions (filter_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, viewer])
}

export async function unsubscribe(code: string, viewer: string) {
  // Отписаться можно и от фильтра, который сняли с публикации.
  await (await database()).query(
    `DELETE FROM filter_subscriptions WHERE user_id = $2 AND filter_id = (SELECT id FROM filters WHERE share_code = $1)`,
    [code, viewer],
  )
}

/** Копия чужого фильтра по ссылке — в свои фильтры; у оригинала растёт счётчик копий. */
export async function copyShared(code: string, viewer: string): Promise<FilterSummary> {
  const shared = await sharedFilter(code)
  const copy = await createFilter(viewer, shared.name, shared.config)
  await (await database()).query(`UPDATE filters SET copies = copies + 1 WHERE share_code = $1 AND user_id <> $2`, [code, viewer])
  return copy
}

/** Подписки зрителя: фильтры, по которым ещё есть ссылка (иначе их не открыть). */
export async function subscriptions(viewer: string): Promise<CatalogEntry[]> {
  const rows = await (
    await database()
  ).query<CatalogRow>(
    `SELECT f.id, f.name, f.share_code, f.is_public, f.description, f.copies, f.created_at, f.updated_at, f.published_at,
       u.login AS owner, ${STATS_COLUMNS}, ${viewerColumns(1)}
     FROM filter_subscriptions s JOIN filters f ON f.id = s.filter_id JOIN users u ON u.id = f.user_id
     WHERE s.user_id = $1 AND f.share_code IS NOT NULL
     ORDER BY f.updated_at DESC`,
    [viewer],
  )
  return rows.map((row) => entry(row, viewer))
}

const SORTS: CatalogSort[] = ['popular', 'rating', 'new']

/** Запросы каталога; undefined — запрос не про каталог. */
export async function handleCatalog(req: IncomingMessage, url: URL): Promise<unknown> {
  const path = url.pathname
  const method = req.method ?? 'GET'
  const signedIn = async () => {
    const user = await sessionUser(readToken(req))
    if (!user) throw new AccountError(401, 'sign in first')
    return user.id
  }

  if (path === '/api/catalog' && method === 'GET') {
    const sort = SORTS.find((s) => s === url.searchParams.get('sort')) ?? 'popular'
    const viewer = (await sessionUser(readToken(req)))?.id ?? null
    return catalog(sort, url.searchParams.get('q') ?? '', viewer)
  }
  if (path === '/api/subscriptions' && method === 'GET') return subscriptions(await signedIn())

  const publish = /^\/api\/filters\/([\w-]{6,32})\/publish$/.exec(path)
  if (publish) {
    const viewer = await signedIn()
    if (method === 'POST') return publishFilter(viewer, publish[1], (await readBody(req)).description)
    if (method === 'DELETE') return unpublishFilter(viewer, publish[1]).then(() => ({}))
  }

  const shared = /^\/api\/shared\/([\w-]{6,32})(?:\/(rate|subscribe|copy))?$/.exec(path)
  if (shared) {
    const [, code, action] = shared
    if (!action && method === 'GET') return sharedFilter(code, (await sessionUser(readToken(req)))?.id ?? null)
    if (action === 'rate' && method === 'POST') return rateFilter(code, await signedIn(), (await readBody(req)).value).then(() => ({}))
    if (action === 'subscribe' && method === 'POST') return subscribe(code, await signedIn()).then(() => ({}))
    if (action === 'subscribe' && method === 'DELETE') return unsubscribe(code, await signedIn()).then(() => ({}))
    if (action === 'copy' && method === 'POST') return copyShared(code, await signedIn())
  }
  return undefined
}
