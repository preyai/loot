import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './defaults'
import { styleLines } from './filter'
import { evaluate, parseFilter, type DroppedItem } from './filterEval'
import { soundFileName, soundsInFilter } from './soundLibrary'

describe('свои звуки', () => {
  it('имя файла: только mp3, wav, ogg, без пути и кавычек', () => {
    expect(soundFileName(String.raw`C:\sounds\Drop "big".MP3`)).toBe('Drop big.MP3')
    expect(soundFileName('sounds/ding.ogg')).toBe('ding.ogg')
    expect(soundFileName('ding.wav')).toBe('ding.wav')
    expect(soundFileName('readme.txt')).toBeNull()
    expect(soundFileName('.mp3')).toBeNull()
  })

  it('в фильтр пишется CustomAlertSound вместо звука игры', () => {
    const style = { ...DEFAULT_CONFIG.tiers.S, sound: { id: 6, volume: 250, file: 'my drop.mp3' } }
    expect(styleLines(style)).toContain('CustomAlertSound "my drop.mp3" 250')
    expect(styleLines(style).some((line) => line.startsWith('PlayAlertSound'))).toBe(false)
    expect(styleLines(DEFAULT_CONFIG.tiers.S)).toContain('PlayAlertSound 6 300')
  })

  it('список звуков фильтра и разбор для предпросмотра', () => {
    const text = 'Show # a\n    BaseType == "Divine Orb"\n    CustomAlertSound "my drop.mp3" 250\n\nShow # b\n    CustomAlertSound "my drop.mp3"\n    Class == "Boots"\n'
    expect(soundsInFilter(text)).toEqual(['my drop.mp3'])
    const item: DroppedItem = {
      itemClass: 'Stackable Currency',
      baseType: 'Divine Orb',
      rarity: 'Normal',
      itemLevel: 1,
      quality: 0,
      sockets: 0,
      stackSize: 1,
      unidentifiedTier: 0,
      corrupted: false,
      mirrored: false,
      enchanted: false,
      twiceCorrupted: false,
      explicitMods: 0,
      dropLevel: 1,
    }
    expect(evaluate(parseFilter(text), item, 70).style.sound).toEqual({ id: 0, volume: 250, file: 'my drop.mp3' })
  })
})
