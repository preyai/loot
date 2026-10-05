import path from 'node:path'
import postgres from 'postgres'
import { DATA_DIR } from './storage'

/**
 * База данных: пользователи, сессии, сохранённые фильтры.
 * На сервере — Postgres в соседнем контейнере (DATABASE_URL). В разработке и тестах — PGlite:
 * тот же Postgres, собранный в WebAssembly, работает прямо в процессе и не требует Docker.
 */

export interface Db {
  /** Запрос с параметрами $1, $2…; возвращает строки. */
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>
  /** Всё внутри — одна транзакция: при ошибке не сохранится ничего. */
  transaction<R>(run: (db: Db) => Promise<R>): Promise<R>
  close(): Promise<void>
}

/** Схема по шагам: применённые шаги записаны в schema_migrations, новые дописываются в конец. */
const MIGRATIONS = [
  `CREATE TABLE users (
    id text PRIMARY KEY,
    login text NOT NULL,
    discord_id text UNIQUE,
    discord_name text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX users_login ON users (lower(login));
  CREATE TABLE sessions (
    token_hash text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
  );
  CREATE INDEX sessions_user ON sessions (user_id);
  CREATE TABLE filters (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name text NOT NULL,
    config jsonb NOT NULL,
    share_code text UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX filters_user ON filters (user_id, updated_at DESC);`,
]

async function migrate(db: Db) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
  const [{ version }] = await db.query<{ version: number }>(`SELECT coalesce(max(version), 0) AS version FROM schema_migrations`)
  for (let i = version; i < MIGRATIONS.length; i++) {
    await db.transaction(async (tx) => {
      for (const statement of MIGRATIONS[i].split(/;\s*$/m).filter((s) => s.trim())) await tx.query(statement)
      await tx.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [i + 1])
    })
  }
}

function fromPostgres(url: string): Db {
  // Пул небольшой: пользователей немного, а памяти на сервере 2 ГБ на всё.
  const sql = postgres(url, { max: 5, onnotice: () => undefined })
  const wrap = (run: postgres.Sql | postgres.TransactionSql): Db => ({
    query: async <T>(text: string, params: unknown[] = []) =>
      (await run.unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as T[],
    transaction: (inner) => (run === sql ? sql.begin((tx) => inner(wrap(tx))) : inner(wrap(run))) as never,
    close: () => sql.end(),
  })
  return wrap(sql)
}

/** PGlite подгружается только без DATABASE_URL: в сборку для сервера он не входит. */
async function fromPglite(dataDir: string | undefined): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite')
  const pg = new PGlite(dataDir)
  type Runner = Pick<typeof pg, 'query'>
  const wrap = (run: Runner, top: boolean): Db => ({
    query: async <T>(text: string, params: unknown[] = []) => (await run.query<T>(text, params)).rows,
    transaction: (inner) => (top ? pg.transaction((tx) => inner(wrap(tx, false))) : inner(wrap(run, false))),
    close: () => pg.close(),
  })
  return wrap(pg, true)
}

let opened: Promise<Db> | null = null

/** База приложения: открывается при первом обращении, схема при этом доводится до последней версии. */
export function db(): Promise<Db> {
  opened ??= (async () => {
    const url = process.env.DATABASE_URL
    const instance = url
      ? fromPostgres(url)
      : // Тесты — в памяти, разработка — в каталоге данных.
        await fromPglite(process.env.VITEST ? undefined : path.join(DATA_DIR, 'pglite'))
    await migrate(instance)
    return instance
  })()
  return opened
}
