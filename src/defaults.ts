import type { Config, Rgba, TierId } from './types'

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

/** Классы экипировки, которые скрывает правило «обычные и магические предметы». */
export const GEAR_CLASSES = [
  'Body Armours', 'Helmets', 'Gloves', 'Boots', 'Shields', 'Bucklers', 'Foci', 'Quivers',
  'One Hand Maces', 'Two Hand Maces', 'Quarterstaves', 'Bows', 'Crossbows', 'Spears',
  'Wands', 'Staves', 'Sceptres',
]

export const TIER_TITLES: Record<TierId, string> = {
  S: 'S — джекпот',
  A: 'A — очень ценное',
  B: 'B — ценное',
  C: 'C — полезное',
  D: 'D — мелочь',
  E: 'E — почти мусор',
}

const rgba = (r: number, g: number, b: number, a = 255): Rgba => ({ r, g, b, a })

export const DEFAULT_CONFIG: Config = {
  league: null,
  thresholds: { S: 500, A: 50, B: 10, C: 2, D: 0.5 },
  tiers: {
    S: {
      fontSize: 45,
      text: rgba(255, 255, 255),
      border: rgba(255, 255, 255),
      background: rgba(220, 20, 20),
      sound: { id: 6, volume: 300 },
      effect: { color: 'Red', temp: false },
      icon: { size: 0, color: 'Red', shape: 'Star' },
    },
    A: {
      fontSize: 42,
      text: rgba(0, 0, 0),
      border: rgba(0, 0, 0),
      background: rgba(255, 165, 0),
      sound: { id: 1, volume: 300 },
      effect: { color: 'Orange', temp: false },
      icon: { size: 0, color: 'Orange', shape: 'Diamond' },
    },
    B: {
      fontSize: 40,
      text: rgba(0, 0, 0),
      border: rgba(0, 0, 0),
      background: rgba(245, 220, 70),
      sound: { id: 2, volume: 250 },
      effect: { color: 'Yellow', temp: false },
      icon: { size: 1, color: 'Yellow', shape: 'Circle' },
    },
    C: {
      fontSize: 36,
      text: rgba(245, 220, 70),
      border: rgba(245, 220, 70),
      background: rgba(40, 30, 0, 235),
      sound: null,
      effect: { color: 'Yellow', temp: true },
      icon: { size: 2, color: 'Yellow', shape: 'Circle' },
    },
    D: {
      fontSize: 32,
      text: rgba(200, 190, 150),
      border: rgba(120, 110, 80),
      background: rgba(20, 20, 20, 220),
      sound: null,
      effect: null,
      icon: null,
    },
    E: {
      fontSize: 26,
      text: rgba(150, 150, 150, 200),
      border: null,
      background: rgba(0, 0, 0, 150),
      sound: null,
      effect: null,
      icon: null,
    },
  },
  overrides: {},
  disabledSections: [],
  visibility: { minTier: 'E', minPrice: 0, stacks: true, stackPrice: 5 },
  sectionVisibility: {},
  gear: { hideLowRarity: false, areaLevel: 65 },
}
