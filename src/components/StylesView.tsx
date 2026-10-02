import { useState } from 'react'
import { CURRENCIES, DEFAULT_CONFIG, EFFECT_COLORS, FONT_SIZE, ICON_SHAPES, SOUND_IDS, SOUND_VOLUME_MAX } from '../defaults'
import { keyOf } from '../i18n'
import { useI18n } from '../i18n-react'
import { playAlertSound } from '../sound'
import type { UpdateConfig } from '../store'
import { convertThresholds, perDivine } from '../tiering'
import { TIER_IDS, type Config, type MarketSnapshot, type Rgba, type TierId, type TierStyle } from '../types'
import { ItemLabel } from './ItemLabel'
import { VisibilityFields } from './VisibilityFields'

const toHex = ({ r, g, b }: Rgba) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
const fromHex = (hex: string, a: number): Rgba => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
  a,
})
const OPAQUE_BLACK: Rgba = { r: 0, g: 0, b: 0, a: 255 }
const ICON_SIZES = [0, 1, 2] as const
/** Предмет для образца плашки: его знают все, и название есть на обоих языках. */
const SAMPLE_ITEM = 'Divine Orb'

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

function TierEditor({ id, style, onChange }: { id: TierId; style: TierStyle; onChange: (s: TierStyle) => void }) {
  const { t, name } = useI18n()
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
    <section className="tier-editor">
      <h2>{t(keyOf('tier', id))}</h2>

      <div className="ground ground--wide">
        <ItemLabel name={name(SAMPLE_ITEM)} style={style} />
      </div>

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
    </section>
  )
}

interface Props {
  config: Config
  update: UpdateConfig
  /** null, пока цены не загружены. */
  rates: MarketSnapshot['rates'] | null
}

export function StylesView({ config, update, rates }: Props) {
  const { t, name } = useI18n()
  const unit = CURRENCIES[config.currency].short
  const thresholdTiers = TIER_IDS.filter((tier): tier is Exclude<TierId, 'E'> => tier !== 'E')
  const overrideCount = Object.keys(config.overrides).length

  return (
    <div>
      <header className="page-header">
        <h1>{t('nav.styles')}</h1>
      </header>

      <section className="panel">
        <h2>{t('styles.thresholds')}</h2>
        <p className="note">
          {t('styles.thresholdsNote', { currency: name(CURRENCIES[config.currency].title) })}
          {rates &&
            config.currency !== 'divine' &&
            t('styles.rate', { value: Math.round(perDivine(config.currency, rates)), unit })}
          . {t('styles.thresholdsNote2')}
        </p>
        <div className="thresholds">
          {thresholdTiers.map((tier) => (
            <label key={tier}>
              {t('styles.from', { tier })}
              <input
                type="number"
                min={0}
                step="any"
                value={config.thresholds[tier]}
                onChange={(e) =>
                  update((c) => ({ ...c, thresholds: { ...c.thresholds, [tier]: Math.max(0, Number(e.target.value)) } }))
                }
              />
              {unit}
            </label>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>{t('styles.visibility')}</h2>
        <p className="note">{t('styles.visibilityNote')}</p>
        <VisibilityFields
          value={config.visibility}
          thresholds={config.thresholds}
          currency={config.currency}
          onChange={(visibility) => update((c) => ({ ...c, visibility }))}
        />
      </section>

      <div className="tier-editors">
        {TIER_IDS.map((id) => (
          <TierEditor
            key={id}
            id={id}
            style={config.tiers[id]}
            onChange={(style) => update((c) => ({ ...c, tiers: { ...c.tiers, [id]: style } }))}
          />
        ))}
      </div>

      <section className="panel">
        <h2>{t('styles.reset')}</h2>
        <div className="actions">
          <button
            disabled={overrideCount === 0}
            onClick={() => confirm(t('styles.resetOverridesConfirm', { n: overrideCount })) && update((c) => ({ ...c, overrides: {} }))}
          >
            {t('styles.resetOverrides', { n: overrideCount })}
          </button>
          <button
            disabled={!rates}
            onClick={() =>
              rates &&
              confirm(t('styles.resetStylesConfirm')) &&
              update((c) => ({
                ...c,
                tiers: DEFAULT_CONFIG.tiers,
                // Пороги по умолчанию заданы в exalted — переводим в выбранную валюту.
                thresholds: convertThresholds(DEFAULT_CONFIG.thresholds, DEFAULT_CONFIG.currency, c.currency, rates),
              }))
            }
          >
            {t('styles.resetStyles')}
          </button>
        </div>
      </section>
    </div>
  )
}
