import { useState } from 'react'
import { useI18n } from '../i18n-react'
import type { TierStyle } from '../types'
import { ItemLabel } from './ItemLabel'
import { StyleFields } from './StyleFields'

interface Props {
  id: string
  title: string
  sample: string
  /** null — предметы этой строки скрыты или не выделяются. */
  style: TierStyle | null
  note?: string
  onChange: (style: TierStyle) => void
  /** Слева от названия: переключатель или поле. */
  children?: React.ReactNode
  /** Ключ для перехода к строке из предпросмотра (focus.ts). */
  focusKey?: string
  /** Образец показывается, но поля оформления не открываются (вид задан в другом месте). */
  locked?: boolean
}

/** Строка с образцом плашки и раскрывающимися полями оформления. */
export function StyleRow({ id, title, sample, style, note, onChange, children, focusKey, locked }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <div className="style-row" data-focus={focusKey}>
      <div className="style-row-head">
        {children}
        <span className="style-row-title">{title}</span>
        {note && <span className="count">{note}</span>}
        <div className="ground">
          <ItemLabel name={sample} style={style} />
        </div>
        <button disabled={!style || locked} aria-expanded={open && !!style && !locked} onClick={() => setOpen(!open)}>
          {t('waystones.style')}
        </button>
      </div>
      {open && style && !locked && (
        <div className="rule-style">
          <StyleFields id={id} style={style} onChange={onChange} />
        </div>
      )}
    </div>
  )
}
