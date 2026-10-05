import { useState } from 'react'
import { EFFECT_COLORS, FONT_SIZE, ICON_SHAPES, SOUND_IDS, SOUND_VOLUME_MAX } from '../defaults'
import { keyOf } from '../i18n'
import { useI18n } from '../i18n-react'
import { playStyleSound } from '../sound'
import { useSoundLibrary } from '../soundLibrary'
import type { Rgba, TierStyle } from '../types'

const toHex = ({ r, g, b }: Rgba) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
const fromHex = (hex: string, a: number): Rgba => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
  a,
})
const OPAQUE_BLACK: Rgba = { r: 0, g: 0, b: 0, a: 255 }
const hex2 = (v: number) => v.toString(16).padStart(2, '0')
/** Цвет с прозрачностью: #RRGGBBAA; непрозрачный — короче, #RRGGBB. */
const toHex8 = (c: Rgba) => toHex(c) + (c.a === 255 ? '' : hex2(c.a))
const css = ({ r, g, b, a }: Rgba) => `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`

/** #RGB, #RRGGBB или #RRGGBBAA (решётка необязательна); null — не цвет. */
export function parseHex(text: string): Rgba | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text.trim())
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  const at = (i: number) => parseInt(h.slice(i, i + 2), 16)
  return { r: at(0), g: at(2), b: at(4), a: h.length === 8 ? at(6) : 255 }
}

/** Поле HEX: правится свободно, применяется, как только набран целый цвет; при уходе — снова значение цвета. */
function HexInput({ value, onChange, label }: { value: Rgba; onChange: (v: Rgba) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      type="text"
      className="hex-input"
      aria-label={label}
      spellCheck={false}
      maxLength={9}
      value={draft ?? toHex8(value)}
      onChange={(e) => {
        setDraft(e.target.value)
        const parsed = parseHex(e.target.value)
        if (parsed) onChange(parsed)
      }}
      onBlur={() => setDraft(null)}
    />
  )
}
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
          {/* Системный выбор цвета не знает прозрачности: образец рисуем сами (на шахматке), а палитру открывает
              невидимое поле поверх него. */}
          <label className="color-swatch" style={{ '--swatch': css(value) } as React.CSSProperties} title={toHex8(value)}>
            <input type="color" aria-label={label} value={toHex(value)} onChange={(e) => onChange(fromHex(e.target.value, value.a))} />
          </label>
          <HexInput value={value} onChange={onChange} label={`${label}: HEX`} />
          <span className="color-alpha" style={{ '--opaque': css({ ...value, a: 255 }) } as React.CSSProperties}>
            <input
              type="range"
              className="alpha-slider"
              min={0}
              max={255}
              aria-label={`${label}: ${t('styles.opacity')}`}
              title={t('styles.opacity')}
              value={value.a}
              onChange={(e) => onChange({ ...value, a: Number(e.target.value) })}
            />
            <span className="alpha-value" title={t('styles.opacity')}>
              {Math.round((value.a / 255) * 100)}%
            </span>
          </span>
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
  const library = useSoundLibrary()
  const listen = (sound: NonNullable<TierStyle['sound']>) => {
    setSoundError(false)
    playStyleSound(sound).catch((e: unknown) => {
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
              value={style.sound.file ? `file:${style.sound.file}` : style.sound.id}
              onChange={(e) => {
                const value = e.target.value
                // Свой звук — «file:<имя>», звук игры — номер.
                const { file: _old, ...rest } = style.sound!
                const sound = value.startsWith('file:') ? { ...rest, file: value.slice(5) } : { ...rest, id: Number(value) }
                set('sound', sound)
                // Звуки выбирают на слух: проигрываем сразу, не заставляя жать отдельную кнопку.
                listen(sound)
              }}
            >
              <optgroup label={t('styles.gameSounds')}>
                {SOUND_IDS.map((n) => (
                  <option key={n} value={n}>
                    № {n}
                  </option>
                ))}
              </optgroup>
              {(library.length > 0 || style.sound.file) && (
                <optgroup label={t('styles.customSounds')}>
                  {library.map((file) => (
                    <option key={file} value={`file:${file}`}>
                      {file}
                    </option>
                  ))}
                  {/* Звук выбран, но его нет в библиотеке (например, удалён) — показываем, чтобы выбор не потерялся. */}
                  {style.sound.file && !library.includes(style.sound.file) && (
                    <option value={`file:${style.sound.file}`}>{t('styles.soundMissing', { file: style.sound.file })}</option>
                  )}
                </optgroup>
              )}
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
              aria-label={style.sound.file ? t('preview.customSound', { file: style.sound.file }) : t('styles.listen', { n: style.sound.id })}
              title={t('styles.listenHint')}
              onClick={() => listen(style.sound!)}
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
