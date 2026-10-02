import type { BasePopularity } from '../src/types'
import { API, HEADERS } from './market'
import { storedResource } from './storage'

// Снимок билдов на poe.ninja обновляется несколько раз в сутки.
const TTL_MS = 3 * 60 * 60 * 1000
const CONCURRENCY = 4

/** Поле protobuf: число (varint) или вложенные байты. Схемы у poe.ninja нет, читаем по номерам полей. */
type Field = { num: number; value: number | Uint8Array }

export function readProtobuf(buf: Uint8Array): Field[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const fields: Field[] = []
  let p = 0
  const varint = () => {
    let result = 0
    for (let shift = 1; ; shift *= 128) {
      if (p >= buf.length) throw new Error('Обрыв protobuf-сообщения')
      const byte = buf[p++]
      result += (byte & 0x7f) * shift
      if (!(byte & 0x80)) return result
    }
  }
  while (p < buf.length) {
    const key = varint()
    const num = Math.floor(key / 8)
    const wire = key % 8
    if (wire === 0) fields.push({ num, value: varint() })
    else if (wire === 2) {
      const length = varint()
      fields.push({ num, value: buf.subarray(p, p + length) })
      p += length
    } else if (wire === 5) {
      fields.push({ num, value: view.getUint32(p, true) })
      p += 4
    } else if (wire === 1) p += 8
    else throw new Error(`Неизвестный тип поля protobuf: ${wire}`)
  }
  return fields
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
const messages = (fields: Field[], num: number) =>
  fields.filter((f): f is { num: number; value: Uint8Array } => f.num === num && f.value instanceof Uint8Array).map((f) => f.value)
const numberAt = (fields: Field[], num: number) => {
  const field = fields.find((f) => f.num === num)
  // Нулевые значения в protobuf не передаются.
  return typeof field?.value === 'number' ? field.value : 0
}
const stringAt = (fields: Field[], num: number) => text(messages(fields, num)[0] ?? new Uint8Array())

/**
 * Словарь poe.ninja (формат «NDIC»): заголовок, таблица смещений блоков,
 * затем длины строк по одному байту и сами строки подряд.
 */
export function readDictionary(buf: Uint8Array): string[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (text(buf.subarray(0, 4)) !== 'NDIC') throw new Error('Словарь poe.ninja в неизвестном формате')
  const count = view.getUint32(12, true)
  const blockSize = view.getUint32(24, true)
  // Размер таблицы смещений в заголовке не записан явно — подбираем тот, при котором длины сходятся с размером файла.
  for (const blocks of [Math.floor((count - 1) / blockSize), Math.floor(count / blockSize), view.getUint32(28, true)]) {
    const lengths = buf.subarray(44 + blocks * 8, 44 + blocks * 8 + count)
    const stringsStart = 44 + blocks * 8 + count
    if (stringsStart + lengths.reduce((sum, n) => sum + n, 0) !== buf.length) continue
    let p = stringsStart
    return Array.from(lengths, (length) => text(buf.subarray(p, (p += length))))
  }
  throw new Error('Словарь poe.ninja в неизвестном формате')
}

interface Search {
  /** Сколько персонажей подошло под фильтр. */
  total: number
  dimensions: { id: string; entries: { key: number; count: number }[] }[]
  /** Имя словаря → хэш для его загрузки. */
  dictionaries: Map<string, string>
}

export function readSearch(buf: Uint8Array): Search {
  const root = readProtobuf(messages(readProtobuf(buf), 1)[0] ?? new Uint8Array())
  return {
    total: numberAt(root, 1),
    dimensions: messages(root, 2).map((bytes) => {
      const fields = readProtobuf(bytes)
      const entries = messages(fields, 3).map((entry) => {
        const pair = readProtobuf(entry)
        return { key: numberAt(pair, 1), count: numberAt(pair, 2) }
      })
      return { id: stringAt(fields, 1), entries }
    }),
    dictionaries: new Map(
      messages(root, 6).map((bytes) => {
        const fields = readProtobuf(bytes)
        return [stringAt(fields, 1), stringAt(fields, 2)]
      }),
    ),
  }
}

async function getBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`poe.ninja ответил ${res.status} на ${url}`)
  return new Uint8Array(await res.arrayBuffer())
}

interface IndexState {
  buildLeagues: { name: string; url: string }[]
  snapshotVersions: { url: string; version: string; snapshotName: string }[]
}

async function loadPopularity(league: string): Promise<BasePopularity> {
  const stateRes = await fetch(`${API}/data/index-state`, { headers: HEADERS, signal: AbortSignal.timeout(20_000) })
  if (!stateRes.ok) throw new Error(`poe.ninja ответил ${stateRes.status}`)
  const state = (await stateRes.json()) as IndexState
  const url = state.buildLeagues.find((l) => l.name === league)?.url
  const snapshot = state.snapshotVersions.find((s) => s.url === url)
  if (!snapshot) throw new Error(`На poe.ninja нет данных о билдах лиги «${league}»`)

  const search = async (item?: string) => {
    const query = new URLSearchParams({ overview: snapshot.snapshotName, type: 'exp', ...(item && { items: item }) })
    return readSearch(await getBytes(`${API}/builds/${snapshot.version}/search?${query}`))
  }
  const dictionary = async (found: Search, name: string) => {
    const hash = found.dictionaries.get(name)
    if (!hash) throw new Error(`В ответе poe.ninja нет словаря «${name}»`)
    return readDictionary(await getBytes(`${API}/builds/dictionary/${hash}`))
  }

  // Список слотов берём из самих данных: так новые типы оружия подхватятся без правок.
  const overall = await search()
  const slots = (await dictionary(overall, 'item')).filter((name) => name.startsWith('Rare '))

  const shares: Record<string, number> = {}
  let baseNames: string[] | undefined
  const queue = [...slots]
  const worker = async () => {
    for (let slot = queue.shift(); slot; slot = queue.shift()) {
      const found = await search(slot)
      const dimension = found.dimensions.find((d) => d.id.startsWith('itembasetypes-'))
      if (!dimension || found.total === 0) continue
      baseNames ??= await dictionary(found, 'itembasetypes')
      for (const { key, count } of dimension.entries) {
        const name = baseNames[key]
        if (name) shares[name] = Math.max(shares[name] ?? 0, count / found.total)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  return { league, fetchedAt: new Date().toISOString(), characters: overall.total, shares }
}

/** Популярность баз по лигам: хранится на диске и обновляется не чаще раза в TTL. */
export const popularity = storedResource('popularity', TTL_MS, loadPopularity)

export const getPopularity = (league: string) => popularity.get(league)
