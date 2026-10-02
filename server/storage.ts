import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Каталог с собранными данными: цены, популярность баз, результаты опроса трейда. */
export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? 'data')

/** Имя файла из ключа (названия лиги): без разделителей пути, какие бы символы ни были в ключе. */
export const fileNameFor = (key: string) => encodeURIComponent(key).replace(/[%.]/g, '_') + '.json'

export async function readData<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, file), 'utf8')) as T
  } catch {
    return null
  }
}

export async function writeData(file: string, value: unknown): Promise<void> {
  const target = path.join(DATA_DIR, file)
  await mkdir(path.dirname(target), { recursive: true })
  // Пишем во временный файл и переименовываем: оборванная запись не оставит битый JSON.
  const temp = `${target}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(value))
  await rename(temp, target)
}

interface Stored {
  fetchedAt: string
}

export interface StoredResource<T> {
  /**
   * Сохранённое значение — даже устаревшее: тогда оно обновляется в фоне, а читатель не ждёт.
   * Источник ждём, только если не сохранено ничего.
   */
  get(key: string): Promise<T>
  /** Обновить из источника, если сохранённого нет или оно устарело. Для планировщика. */
  refreshIfStale(key: string): Promise<void>
}

/** Данные из внешнего источника по ключу: память → диск → источник. */
export function storedResource<T extends Stored>(
  name: string,
  ttlMs: number,
  load: (key: string) => Promise<T>,
): StoredResource<T> {
  const memory = new Map<string, T>()
  const inFlight = new Map<string, Promise<T>>()
  const file = (key: string) => path.join(name, fileNameFor(key))
  const isStale = (value: T) => Date.now() - Date.parse(value.fetchedAt) > ttlMs

  const peek = async (key: string) => {
    const known = memory.get(key)
    if (known) return known
    const saved = await readData<T>(file(key))
    if (saved) memory.set(key, saved)
    return saved
  }

  // Одновременные запросы одного ключа ждут одну загрузку, а не запускают каждый свою.
  const refresh = (key: string) => {
    let pending = inFlight.get(key)
    if (!pending) {
      pending = load(key)
        .then(async (value) => {
          memory.set(key, value)
          await writeData(file(key), value)
          return value
        })
        .finally(() => inFlight.delete(key))
      inFlight.set(key, pending)
    }
    return pending
  }

  return {
    async get(key) {
      const saved = await peek(key)
      if (!saved) return refresh(key)
      if (isStale(saved)) {
        refresh(key).catch((e: unknown) => console.warn(`${name}: не удалось обновить «${key}»: ${e instanceof Error ? e.message : e}`))
      }
      return saved
    },
    async refreshIfStale(key) {
      const saved = await peek(key)
      if (!saved || isStale(saved)) await refresh(key)
    },
  }
}
