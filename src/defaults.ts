import type { Config, Currency, Rgba } from './types'
import { DEFAULT_GOLD } from './gold'
import { DEFAULT_WAYSTONES } from './waystones'

/** title — имя предмета-валюты в игре (английское); на экране переводится как любое имя предмета. */
export const CURRENCIES: Record<Currency, { short: string; title: string }> = {
  exalted: { short: 'ex', title: 'Exalted Orb' },
  chaos: { short: 'c', title: 'Chaos Orb' },
  divine: { short: 'div', title: 'Divine Orb' },
}

export const EFFECT_COLORS = [
  'Red', 'Green', 'Blue', 'Brown', 'White', 'Yellow', 'Cyan', 'Grey', 'Orange', 'Pink', 'Purple',
]

export const ICON_SHAPES = [
  'Circle', 'Diamond', 'Hexagon', 'Square', 'Star', 'Triangle',
  'Cross', 'Moon', 'Raindrop', 'Kite', 'Pentagon', 'UpsideDownHouse',
]

export const FONT_SIZE = { min: 18, max: 45, base: 32 }
export const SOUND_IDS = Array.from({ length: 16 }, (_, i) => i + 1)
export const SOUND_VOLUME_MAX = 300

const rgba = (r: number, g: number, b: number, a = 255): Rgba => ({ r, g, b, a })

export const DEFAULT_CONFIG: Config = {
  language: 'ru',
  league: null,
  currency: 'exalted',
  thresholds: { S: 500, A: 50, B: 10, C: 2, D: 0.5 },
  // Оформление и звуки тиров — как у валюты в фильтре NeverSink (тиры s, a, b, c, d, e).
  tiers: {
    S: {
      fontSize: 45,
      text: rgba(255, 0, 0),
      border: rgba(255, 0, 0),
      background: rgba(255, 255, 255),
      sound: { id: 6, volume: 300 },
      effect: { color: 'Red', temp: false },
      icon: { size: 0, color: 'Red', shape: 'Star' },
    },
    A: {
      fontSize: 45,
      text: rgba(255, 255, 255),
      border: rgba(255, 255, 255),
      background: rgba(245, 105, 90),
      sound: { id: 1, volume: 300 },
      effect: { color: 'Red', temp: false },
      icon: { size: 0, color: 'Red', shape: 'Circle' },
    },
    B: {
      fontSize: 42,
      text: rgba(0, 0, 0),
      border: rgba(0, 0, 0),
      background: rgba(245, 105, 90),
      sound: { id: 2, volume: 300 },
      effect: { color: 'Yellow', temp: false },
      icon: { size: 1, color: 'Yellow', shape: 'Circle' },
    },
    C: {
      fontSize: 42,
      text: rgba(0, 0, 0),
      border: rgba(0, 0, 0),
      background: rgba(245, 139, 87),
      sound: { id: 2, volume: 300 },
      effect: { color: 'White', temp: false },
      icon: { size: 1, color: 'Yellow', shape: 'Circle' },
    },
    D: {
      fontSize: 40,
      text: rgba(0, 0, 0),
      border: rgba(0, 0, 0),
      background: rgba(240, 180, 100),
      sound: { id: 2, volume: 300 },
      effect: { color: 'White', temp: false },
      icon: { size: 2, color: 'White', shape: 'Circle' },
    },
    E: {
      fontSize: 40,
      text: rgba(240, 207, 132),
      border: rgba(240, 207, 132),
      background: null,
      sound: null,
      effect: { color: 'White', temp: true },
      icon: { size: 2, color: 'Grey', shape: 'Circle' },
    },
  },
  overrides: {},
  disabledSections: [],
  baseRules: [],
  visibility: { minTier: 'E', minPrice: 0, stacks: true },
  sectionVisibility: {},
  gear: { hideLowRarity: false, areaLevel: 65 },
  waystones: DEFAULT_WAYSTONES,
  gold: DEFAULT_GOLD,
}
