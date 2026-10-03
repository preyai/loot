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
}

/** Строка с образцом плашки и раскрывающимися полями оформления. */
export function StyleRow({ id, title, sample, style, note, onChange, children }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <div className="style-row">
      <div className="style-row-head">
        {children}
        <span className="style-row-title">{title}</span>
        {note && <span className="count">{note}</span>}
        <div className="ground">
          <ItemLabel name={sample} style={style} />
        </div>
        <button disabled={!style} aria-expanded={open && !!style} onClick={() => setOpen(!open)}>
          {t('waystones.style')}
        </button>
      </div>
      {open && style && (
        <div className="rule-style">
          <StyleFields id={id} style={style} onChange={onChange} />
        </div>
      )}
    </div>
  )
}
