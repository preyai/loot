import { FONT_SIZE } from '../defaults'
import type { Rgba, TierStyle } from '../types'

const css = (c: Rgba | null) => (c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${(c.a / 255).toFixed(3)})` : 'transparent')

/** Цвет текста по редкости — каким его рисует игра, если фильтр цвет не задал. */
export const RARITY_TEXT: Record<'Normal' | 'Magic' | 'Rare' | 'Unique', Rgba> = {
  Normal: { r: 200, g: 200, b: 200, a: 255 },
  Magic: { r: 136, g: 136, b: 255, a: 255 },
  Rare: { r: 255, g: 255, b: 119, a: 255 },
  Unique: { r: 175, g: 96, b: 37, a: 255 },
}

/**
 * Плашка предмета так, как она будет выглядеть на земле в игре; style = null — предмет скрыт.
 * fallbackText — цвет текста, если оформление его не задаёт (цвет редкости).
 */
export function ItemLabel({ name, style, fallbackText = RARITY_TEXT.Normal }: { name: string; style: TierStyle | null; fallbackText?: Rgba }) {
  if (!style) return <span className="item-label item-label--hidden">{name}</span>
  return (
    <span
      className="item-label"
      style={{
        color: css(style.text ?? fallbackText),
        background: css(style.background),
        borderColor: css(style.border),
        fontSize: `${(style.fontSize / FONT_SIZE.base) * 15}px`,
      }}
    >
      {name}
    </span>
  )
}
