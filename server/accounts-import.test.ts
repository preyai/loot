import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'

// Данные в старом формате (JSON-файлы) кладём до импорта модуля: перенос идёт при первом обращении к базе.
let dir: string
let accounts: typeof import('./accounts')

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'loot-import-'))
  process.env.DATA_DIR = dir
  const files = path.join(dir, 'accounts', 'filters')
  await mkdir(files, { recursive: true })
  const json = (file: string, value: unknown) => writeFile(path.join(dir, 'accounts', file), JSON.stringify(value))
  await json('users.json', {
    tul: { id: 'u1', login: 'Tul', createdAt: '2026-10-01T00:00:00.000Z', discordId: '42', discordName: 'tul' },
  })
  await json('sessions.json', {
    [createHash('sha256').update('token-1').digest('hex')]: { userId: 'u1', expires: Date.now() + 60_000 },
    old: { userId: 'u1', expires: Date.now() - 1 },
  })
  await json('filters/u1.json', [
    { id: 'f1', name: 'Мой', config: { filterName: 'Mine' }, createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z', shareCode: 'share123' },
  ])
  accounts = await import('./accounts')
})

afterAll(() => rm(dir, { recursive: true, force: true }))

it('переносит пользователей, сессии, фильтры и ссылки из JSON-файлов в базу', async () => {
  expect(await accounts.sessionUser('token-1')).toEqual({ id: 'u1', login: 'Tul' })
  expect(await accounts.listFilters('u1')).toEqual([
    { id: 'f1', name: 'Мой', createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z', shareCode: 'share123' },
  ])
  expect(await accounts.sharedFilter('share123')).toMatchObject({ name: 'Мой', owner: 'Tul', config: { filterName: 'Mine' } })
  // Тот же Discord входит в перенесённую учётную запись, а не создаёт новую.
  expect(await accounts.discordSignIn({ id: '42', name: 'tul' })).toMatchObject({ login: 'Tul', created: false })
  // Старые файлы не удаляются, а откладываются.
  await expect(access(path.join(dir, 'accounts.imported', 'users.json'))).resolves.toBeUndefined()
  await expect(access(path.join(dir, 'accounts'))).rejects.toThrow()
})
