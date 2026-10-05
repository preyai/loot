import { describe, expect, it } from 'vitest'
import { parseHex } from './StyleFields'

describe('цвет в HEX', () => {
  it('понимает #RGB, #RRGGBB и #RRGGBBAA, решётка необязательна', () => {
    expect(parseHex('#F5695A80')).toEqual({ r: 245, g: 105, b: 90, a: 128 })
    expect(parseHex('ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 255 })
    expect(parseHex(' #fff ')).toEqual({ r: 255, g: 255, b: 255, a: 255 })
  })

  it('незаконченный или чужой ввод — не цвет', () => {
    expect(parseHex('#F5695')).toBeNull()
    expect(parseHex('#F5695A8')).toBeNull()
    expect(parseHex('red')).toBeNull()
  })
})
