import { FONT_SIZE } from '../defaults'
import type { Rgba, TierStyle } from '../types'

const css = (c: Rgba | null) => (c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${(c.a / 255).toFixed(3)})` : 'transparent')

/** Плашка предмета так, как она будет выглядеть на земле в игре; style = null — предмет скрыт. */
export function ItemLabel({ name, style }: { name: string; style: TierStyle | null }) {
  if (!style) return <span className="item-label item-label--hidden">{name}</span>
  return (
    <span
      className="item-label"
      style={{
        color: css(style.text),
        background: css(style.background),
        borderColor: css(style.border),
        fontSize: `${(style.fontSize / FONT_SIZE.base) * 15}px`,
      }}
    >
      {name}
    </span>
  )
}
