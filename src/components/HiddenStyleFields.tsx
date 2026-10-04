import { FONT_SIZE } from '../defaults'
import { DEFAULT_HIDDEN_STYLE } from '../filter'
import { useI18n } from '../i18n-react'
import type { HiddenStyle } from '../types'
import { ItemLabel } from './ItemLabel'
import { ColorField } from './StyleFields'

/** Цвет текста образца «по редкости» — как у магического предмета. */
const SAMPLE_TEXT = { r: 136, g: 136, b: 255, a: 255 }

interface Props {
  /** Отличает поля разных редакторов на одной странице. */
  id: string
  value: HiddenStyle
  onChange: (style: HiddenStyle) => void
}

/** Поля оформления скрытых предметов: так игра показывает их, если держать Alt. */
export function HiddenStyleFields({ id, value, onChange }: Props) {
  const { t } = useI18n()
  const set = (change: Partial<HiddenStyle>) => onChange({ ...value, ...change })

  return (
    <>
      <div className="ground ground--wide">
        <ItemLabel
          name={t('rules.sampleItem')}
          style={{ fontSize: value.fontSize, text: value.text ?? SAMPLE_TEXT, border: value.border, background: value.background, sound: null, effect: null, icon: null }}
        />
      </div>
      <div className="fields">
        <div className="field">
          <label htmlFor={`${id}-font`}>{t('styles.fontSize', { size: value.fontSize })}</label>
          <input
            id={`${id}-font`}
            type="range"
            min={FONT_SIZE.min}
            max={FONT_SIZE.max}
            value={value.fontSize}
            onChange={(e) => set({ fontSize: Number(e.target.value) })}
          />
        </div>
        <ColorField label={t('styles.hiddenText')} optional value={value.text} onChange={(text) => set({ text })} />
        <ColorField label={t('styles.border')} optional value={value.border} onChange={(border) => set({ border })} />
        <ColorField label={t('styles.background')} optional value={value.background} onChange={(background) => set({ background })} />
      </div>
    </>
  )
}

/** Блок «Скрытые предметы» на странице «Тиры и стили» — общее оформление скрытых. */
export function HiddenStylePanel({ value, onChange }: { value: HiddenStyle; onChange: (style: HiddenStyle) => void }) {
  const { t } = useI18n()
  return (
    <section className="panel">
      <h2>{t('styles.hidden')}</h2>
      <p className="note">{t('styles.hiddenNote')}</p>
      <HiddenStyleFields id="hidden" value={value} onChange={onChange} />
      <div className="actions">
        <button onClick={() => onChange(DEFAULT_HIDDEN_STYLE)}>{t('waystones.reset')}</button>
      </div>
    </section>
  )
}
