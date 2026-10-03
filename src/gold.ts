import type { GoldConfig, GoldPileId, Rgba, TierStyle } from './types'

const rgba = (r: number, g: number, b: number, a = 255): Rgba => ({ r, g, b, a })

/** Кучи золота от крупных к мелким; mini — всё, что не дотянуло до средней. */
export const GOLD_PILES: GoldPileId[] = ['huge', 'large', 'medium']

/**
 * На прокачке золота падает меньше, поэтому NeverSink выделяет кучи поменьше — до указанного уровня области.
 * Проверяются после обычных порогов.
 */
export const LEVELING_GOLD: { pile: Exclude<GoldPileId, 'huge'>; size: number; maxAreaLevel: number }[] = [
  { pile: 'large', size: 500, maxAreaLevel: 24 },
  { pile: 'large', size: 1000, maxAreaLevel: 64 },
  { pile: 'medium', size: 100, maxAreaLevel: 16 },
  { pile: 'medium', size: 250, maxAreaLevel: 34 },
  { pile: 'medium', size: 400, maxAreaLevel: 64 },
]

const WHITE = rgba(255, 255, 255)
const plain = (icon: TierStyle['icon']): TierStyle => ({
  fontSize: 32,
  text: WHITE,
  border: WHITE,
  background: null,
  sound: null,
  effect: { color: 'Orange', temp: true },
  icon,
})

// Оформление и пороги — из фильтра NeverSink (у него золото идёт в самом начале фильтра).
export const DEFAULT_GOLD: GoldConfig = {
  enabled: true,
  sizes: { huge: 5000, large: 2000, medium: 650 },
  styles: {
    huge: {
      fontSize: 40,
      text: WHITE,
      border: WHITE,
      background: rgba(20, 20, 0),
      sound: null,
      effect: { color: 'Orange', temp: false },
      icon: { size: 1, color: 'Yellow', shape: 'Cross' },
    },
    large: plain({ size: 1, color: 'White', shape: 'Cross' }),
    medium: plain(null),
    small: {
      fontSize: 32,
      text: rgba(180, 180, 180),
      border: rgba(0, 0, 0),
      background: rgba(20, 20, 0, 180),
      sound: null,
      effect: null,
      icon: null,
    },
  },
  leveling: true,
  hideSmall: false,
}
