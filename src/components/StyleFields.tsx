import { useState } from 'react'
import { EFFECT_COLORS, FONT_SIZE, ICON_SHAPES, SOUND_IDS, SOUND_VOLUME_MAX } from '../defaults'
import { keyOf } from '../i18n'
import { useI18n } from '../i18n-react'
import { playAlertSound } from '../sound'
import type { Rgba, TierStyle } from '../types'

const toHex = ({ r, g, b }: Rgba) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
const fromHex = (hex: string, a: number): Rgba => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
  a,
})
const OPAQUE_BLACK: Rgba = { r: 0, g: 0, b: 0, a: 255 }
const ICON_SIZES = [0, 1, 2] as const

function ColorField(props: { label: string; value: Rgba; onChange: (v: Rgba) => void }): React.ReactNode
function ColorField(props: { label: string; value: Rgba | null; onChange: (v: Rgba | null) => void; optional: true }): React.ReactNode
function ColorField({
  label,
  value,
  onChange,
  optional,
}: {
  label: string
  value: Rgba | null
  onChange: (v: Rgba) => void
  optional?: boolean
}) {
  const { t } = useI18n()
  const clear = onChange as (v: Rgba | null) => void
  return (
    <div className="field">
      <label className="check">
        {optional && (
          <input type="checkbox" checked={value !== null} onChange={(e) => clear(e.target.checked ? OPAQUE_BLACK : null)} />
        )}
        {label}
      </label>
      {value && (
        <>
          <input
            type="color"
            aria-label={label}
            value={toHex(value)}
            onChange={(e) => onChange(fromHex(e.target.value, value.a))}
          />
          <input
            type="range"
            min={0}
            max={255}
            aria-label={`${label}: ${t('styles.opacity')}`}
            title={t('styles.opacity')}
            value={value.a}
            onChange={(e) => onChange({ ...value, a: Number(e.target.value) })}
          />
        </>
      )}
    </div>
  )
}

interface Props {
  /** Отличает поля разных редакторов на одной странице (для связи подписи с ползунком). */
  id: string
  style: TierStyle
  onChange: (style: TierStyle) => void
}

/** Поля оформления предмета: шрифт, цвета, звук, луч и значок на карте. Общие для тиров и для правил со своим оформлением. */
export function StyleFields({ id, style, onChange }: Props) {
  const { t } = useI18n()
  const set = <K extends keyof TierStyle>(key: K, value: TierStyle[K]) => onChange({ ...style, [key]: value })
  const [soundError, setSoundError] = useState(false)
  const listen = (soundId: number, volume: number) => {
    setSoundError(false)
    playAlertSound(soundId, volume).catch((e: unknown) => {
      // Новый звук обрывает предыдущий — это не ошибка, а обычное переключение.
      if (!(e instanceof DOMException && e.name === 'AbortError')) setSoundError(true)
    })
  }
  // В фильтр идут английские слова, на экране — перевод.
  const colorOptions = EFFECT_COLORS.map((c) => (
    <option key={c} value={c}>
      {t(keyOf('color', c))}
    </option>
  ))

  return (
    <div className="fields">
      <div className="field">
        <label htmlFor={`font-${id}`}>{t('styles.fontSize', { size: style.fontSize })}</label>
        <input
          id={`font-${id}`}
          type="range"
          min={FONT_SIZE.min}
          max={FONT_SIZE.max}
          value={style.fontSize}
          onChange={(e) => set('fontSize', Number(e.target.value))}
        />
      </div>
      <ColorField label={t('styles.text')} value={style.text} onChange={(v) => set('text', v)} />
      <ColorField label={t('styles.border')} optional value={style.border} onChange={(v) => set('border', v)} />
      <ColorField label={t('styles.background')} optional value={style.background} onChange={(v) => set('background', v)} />

      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            checked={style.sound !== null}
            onChange={(e) => set('sound', e.target.checked ? { id: 1, volume: SOUND_VOLUME_MAX } : null)}
          />
          {t('styles.sound')}
        </label>
        {style.sound && (
          <>
            <select
              aria-label={t('styles.soundNumber')}
              value={style.sound.id}
              onChange={(e) => {
                const soundId = Number(e.target.value)
                set('sound', { ...style.sound!, id: soundId })
                // Звуки выбирают на слух: проигрываем сразу, не заставляя жать отдельную кнопку.
                listen(soundId, style.sound!.volume)
              }}
            >
              {SOUND_IDS.map((n) => (
                <option key={n} value={n}>
                  № {n}
                </option>
              ))}
            </select>
            <input
              type="range"
              min={0}
              max={SOUND_VOLUME_MAX}
              aria-label={t('styles.volume')}
              title={`${t('styles.volume')}: ${style.sound.volume}`}
              value={style.sound.volume}
              onChange={(e) => set('sound', { ...style.sound!, volume: Number(e.target.value) })}
            />
            <button
              className="sound-play"
              aria-label={t('styles.listen', { n: style.sound.id })}
              title={t('styles.listenHint')}
              onClick={() => listen(style.sound!.id, style.sound!.volume)}
            >
              ▶
            </button>
            {soundError && <span className="note--error">{t('styles.soundError')}</span>}
          </>
        )}
      </div>

      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            checked={style.effect !== null}
            onChange={(e) => set('effect', e.target.checked ? { color: 'White', temp: false } : null)}
          />
          {t('styles.beam')}
        </label>
        {style.effect && (
          <>
            <select
              aria-label={t('styles.beamColor')}
              value={style.effect.color}
              onChange={(e) => set('effect', { ...style.effect!, color: e.target.value })}
            >
              {colorOptions}
            </select>
            <label className="check">
              <input
                type="checkbox"
                checked={style.effect.temp}
                onChange={(e) => set('effect', { ...style.effect!, temp: e.target.checked })}
              />
              {t('styles.beamTemp')}
            </label>
          </>
        )}
      </div>

      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            checked={style.icon !== null}
            onChange={(e) => set('icon', e.target.checked ? { size: 1, color: 'White', shape: 'Circle' } : null)}
          />
          {t('styles.icon')}
        </label>
        {style.icon && (
          <>
            <select
              aria-label={t('styles.iconSize')}
              value={style.icon.size}
              onChange={(e) => set('icon', { ...style.icon!, size: Number(e.target.value) as 0 | 1 | 2 })}
            >
              {ICON_SIZES.map((size) => (
                <option key={size} value={size}>
                  {t(keyOf('styles.size', size))}
                </option>
              ))}
            </select>
            <select
              aria-label={t('styles.iconColor')}
              value={style.icon.color}
              onChange={(e) => set('icon', { ...style.icon!, color: e.target.value })}
            >
              {colorOptions}
            </select>
            <select
              aria-label={t('styles.iconShape')}
              value={style.icon.shape}
              onChange={(e) => set('icon', { ...style.icon!, shape: e.target.value })}
            >
              {ICON_SHAPES.map((s) => (
                <option key={s} value={s}>
                  {t(keyOf('shape', s))}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
    </div>
  )
}
