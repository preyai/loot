import { FONT_SIZE } from '../defaults'
import { DEFAULT_HIDDEN_STYLE } from '../filter'
import { useI18n } from '../i18n-react'
import type { UpdateConfig } from '../store'
import type { Config, HiddenStyle } from '../types'
import { ItemLabel } from './ItemLabel'
import { ColorField } from './StyleFields'

/** Цвет текста образца «по редкости» — как у магического предмета. */
const SAMPLE_TEXT = { r: 136, g: 136, b: 255, a: 255 }

/** Оформление скрытых предметов: так игра показывает их, если держать Alt. */
export function HiddenStyleFields({ config, update }: { config: Config; update: UpdateConfig }) {
  const { t } = useI18n()
  const style = config.hiddenStyle
  const set = (change: Partial<HiddenStyle>) => update((c) => ({ ...c, hiddenStyle: { ...c.hiddenStyle, ...change } }))

  return (
    <section className="panel">
      <h2>{t('styles.hidden')}</h2>
      <p className="note">{t('styles.hiddenNote')}</p>
      <div className="ground ground--wide">
        <ItemLabel
          name={t('rules.sampleItem')}
          style={{ fontSize: style.fontSize, text: style.text ?? SAMPLE_TEXT, border: style.border, background: style.background, sound: null, effect: null, icon: null }}
        />
      </div>
      <div className="fields">
        <div className="field">
          <label htmlFor="hidden-font">{t('styles.fontSize', { size: style.fontSize })}</label>
          <input
            id="hidden-font"
            type="range"
            min={FONT_SIZE.min}
            max={FONT_SIZE.max}
            value={style.fontSize}
            onChange={(e) => set({ fontSize: Number(e.target.value) })}
          />
        </div>
        <ColorField label={t('styles.hiddenText')} optional value={style.text} onChange={(text) => set({ text })} />
        <ColorField label={t('styles.border')} optional value={style.border} onChange={(border) => set({ border })} />
        <ColorField label={t('styles.background')} optional value={style.background} onChange={(background) => set({ background })} />
      </div>
      <div className="actions">
        <button onClick={() => set(DEFAULT_HIDDEN_STYLE)}>{t('waystones.reset')}</button>
      </div>
    </section>
  )
}
