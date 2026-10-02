import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// DATA_DIR читается при загрузке модуля, поэтому каталог задаём до импорта.
let dir: string
let storage: typeof import('./storage')

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'loot-storage-'))
  process.env.DATA_DIR = dir
  storage = await import('./storage')
})

afterAll(() => rm(dir, { recursive: true, force: true }))

const HOUR = 60 * 60 * 1000
const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

describe('storedResource', () => {
  it('первый запрос ходит в источник и сохраняет результат на диск, следующие читают сохранённое', async () => {
    let loads = 0
    const make = () =>
      storage.storedResource('fresh', HOUR, async (key) => {
        loads++
        return { fetchedAt: at(0), key }
      })
    const resource = make()
    expect((await resource.get('Forbidden Rites')).key).toBe('Forbidden Rites')
    await resource.get('Forbidden Rites')
    expect(loads).toBe(1)

    const saved = JSON.parse(await readFile(path.join(dir, 'fresh', storage.fileNameFor('Forbidden Rites')), 'utf8'))
    expect(saved.key).toBe('Forbidden Rites')
    // После перезапуска сервера память пуста, но диск остался — источник снова не нужен.
    await make().get('Forbidden Rites')
    expect(loads).toBe(1)
  })

  it('одновременные запросы ждут одну загрузку', async () => {
    let loads = 0
    const resource = storage.storedResource('parallel', HOUR, async () => {
      loads++
      await new Promise((r) => setTimeout(r, 20))
      return { fetchedAt: at(0) }
    })
    await Promise.all([resource.get('a'), resource.get('a'), resource.get('a')])
    expect(loads).toBe(1)
  })

  it('устаревшее отдаётся сразу, а обновляется в фоне', async () => {
    let version = 0
    const resource = storage.storedResource('stale', HOUR, async () => ({ fetchedAt: at(version === 0 ? 2 * HOUR : 0), version: ++version }))
    expect((await resource.get('a')).version).toBe(1)
    // Сохранённое уже устарело: читатель получает его, не дожидаясь источника.
    expect((await resource.get('a')).version).toBe(1)
    await new Promise((r) => setTimeout(r, 30))
    expect((await resource.get('a')).version).toBe(2)
  })

  it('refreshIfStale не трогает свежее и не глотает ошибку источника', async () => {
    let loads = 0
    const resource = storage.storedResource('scheduled', HOUR, async () => {
      loads++
      return { fetchedAt: at(0) }
    })
    await resource.refreshIfStale('a')
    await resource.refreshIfStale('a')
    expect(loads).toBe(1)

    const broken = storage.storedResource('broken', HOUR, async () => {
      throw new Error('источник недоступен')
    })
    await expect(broken.refreshIfStale('a')).rejects.toThrow('источник недоступен')
    await expect(broken.get('a')).rejects.toThrow('источник недоступен')
  })
})

describe('fileNameFor', () => {
  it('не выпускает за пределы каталога, каким бы ни был ключ', async () => {
    for (const key of ['../../etc/passwd', '..', 'a/b\\c', 'The Dyck Bois (PL86814)', 'Лига']) {
      const name = storage.fileNameFor(key)
      expect(name).toMatch(/^[A-Za-z0-9_()!~*'-]+\.json$/)
    }
    expect(storage.fileNameFor('a')).not.toBe(storage.fileNameFor('b'))
    await storage.writeData(path.join('names', storage.fileNameFor('../x')), {})
    expect(await readdir(path.join(dir, 'names'))).toEqual([storage.fileNameFor('../x')])
  })
})
