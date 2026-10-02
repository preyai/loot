import { describe, expect, it } from 'vitest'
import { readDictionary, readProtobuf, readSearch } from './popularity'

const bytes = (...parts: (number | number[] | Uint8Array | string)[]) =>
  Uint8Array.from(
    parts.flatMap((p) => (typeof p === 'number' ? [p] : typeof p === 'string' ? [...new TextEncoder().encode(p)] : [...p])),
  )
/** Поле с вложенными байтами: ключ (номер, тип 2), длина, содержимое. */
const nested = (num: number, ...content: Parameters<typeof bytes>) => {
  const body = bytes(...content)
  return bytes(num * 8 + 2, body.length, body)
}
const varintField = (num: number, ...value: number[]) => bytes(num * 8, value)

describe('readProtobuf', () => {
  it('читает числа, в том числе многобайтные, и вложенные байты', () => {
    // 300 = 0xAC 0x02
    const fields = readProtobuf(bytes(varintField(1, 0xac, 0x02), nested(2, 'ab')))
    expect(fields[0]).toEqual({ num: 1, value: 300 })
    expect(fields[1].num).toBe(2)
    expect(new TextDecoder().decode(fields[1].value as Uint8Array)).toBe('ab')
  })
})

describe('readSearch', () => {
  it('достаёт число персонажей, измерения и хэши словарей', () => {
    const dimension = nested(
      2,
      nested(1, 'itembasetypes-Gloves'),
      nested(2, 'itembasetypes'),
      nested(3, varintField(2, 7)), // ключ 0 в protobuf не передаётся
      nested(3, varintField(1, 2), varintField(2, 3)),
    )
    const dictionary = nested(6, nested(1, 'itembasetypes'), nested(2, 'abc123'))
    const search = readSearch(nested(1, varintField(1, 10), dimension, dictionary))
    expect(search.total).toBe(10)
    expect(search.dimensions).toEqual([
      {
        id: 'itembasetypes-Gloves',
        entries: [
          { key: 0, count: 7 },
          { key: 2, count: 3 },
        ],
      },
    ])
    expect(search.dictionaries.get('itembasetypes')).toBe('abc123')
  })
})

describe('readDictionary', () => {
  const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]
  const dictionary = (names: string[], blockSize: number) => {
    const blocks = Math.floor((names.length - 1) / blockSize)
    return bytes(
      'NDIC',
      u32(2),
      u32(0),
      u32(names.length),
      u32(0),
      u32(0),
      u32(blockSize),
      u32(blocks + 1),
      u32(names.length),
      u32(0),
      u32(0),
      Array.from({ length: blocks }, () => [...u32(0), ...u32(0)]).flat(),
      names.map((n) => n.length),
      names.join(''),
    )
  }

  it('читает строки по таблице длин', () => {
    const names = ['Adherent Bow', 'Crude Bow', 'Zealot Bow']
    expect(readDictionary(dictionary(names, 2))).toEqual(names)
  })

  it('отказывается от чужого формата', () => {
    expect(() => readDictionary(bytes('NOPE', u32(0), u32(0), u32(0)))).toThrow()
  })
})
