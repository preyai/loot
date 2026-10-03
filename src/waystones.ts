import type { Rgba, TierStyle, WaystoneBandId, WaystoneConfig } from './types'

const rgba = (r: number, g: number, b: number, a = 255): Rgba => ({ r, g, b, a })

export const MAX_WAYSTONE_TIER = 16

/** Группы тиров с общим оформлением — как в фильтре NeverSink. */
export const WAYSTONE_BANDS: { id: WaystoneBandId; from: number; to: number }[] = [
  { id: 't16', from: 16, to: 16 },
  { id: 't15', from: 15, to: 15 },
  { id: 't12', from: 12, to: 14 },
  { id: 't7', from: 7, to: 11 },
  { id: 't1', from: 1, to: 6 },
]

/**
 * Уровень области, ниже которого камень тира t «продвигает» игрока (индекс — t − 1).
 * Значения из NeverSink: примерно уровень области самой карты.
 */
export const UPGRADE_AREA_LEVEL = [65, 66, 67, 68, 69, 70, 71, 72, 72, 73, 74, 75, 76, 78, 79, 80]

/** Рамка камня выше текущей области. */
export const UPGRADE_BORDER = rgba(220, 50, 0)

/** Английское имя камня тира — для образца плашки (на экране — перевод). */
export const waystoneName = (tier: number) => `Waystone (Tier ${tier})`

// Оформление — из NeverSink: декоратор группы (шрифт, рамка) плюс блок тира (цвета, звук, луч, значок).
const PURPLE = rgba(145, 30, 220)
const SPECIAL: TierStyle = {
  fontSize: 42,
  text: PURPLE,
  border: PURPLE,
  background: rgba(235, 220, 245),
  sound: { id: 5, volume: 300 },
  effect: { color: 'Red', temp: false },
  icon: { size: 0, color: 'Purple', shape: 'Square' },
}

const lowStyle = (iconSize: 1 | 2): TierStyle => ({
  fontSize: 40,
  text: rgba(255, 255, 255),
  border: rgba(200, 200, 200),
  background: rgba(20, 20, 0),
  sound: { id: 4, volume: 300 },
  effect: { color: 'White', temp: true },
  icon: { size: iconSize, color: 'White', shape: 'Square' },
})

export const DEFAULT_WAYSTONES: WaystoneConfig = {
  enabled: true,
  minTier: 1,
  styles: {
    t16: SPECIAL,
    t15: {
      fontSize: 42,
      text: rgba(0, 0, 0),
      border: rgba(0, 0, 0),
      background: rgba(235, 235, 235),
      sound: { id: 5, volume: 300 },
      effect: { color: 'Yellow', temp: false },
      icon: { size: 1, color: 'Red', shape: 'Square' },
    },
    t12: {
      fontSize: 40,
      text: rgba(0, 0, 0),
      border: rgba(0, 0, 0),
      background: rgba(200, 200, 200),
      sound: { id: 4, volume: 300 },
      effect: { color: 'Yellow', temp: true },
      icon: { size: 1, color: 'Yellow', shape: 'Square' },
    },
    t7: lowStyle(1),
    t1: lowStyle(2),
  },
  enchanted: SPECIAL,
  corrupted: SPECIAL,
  upgradeBorder: true,
}

/** Стиль особых камней при включении: то же выделение, что у NeverSink. */
export const SPECIAL_WAYSTONE_STYLE = SPECIAL
