import {
  DEFAULT_CONFIG,
  EFFECT_COLORS,
  FONT_SIZE,
  ICON_SHAPES,
  SOUND_IDS,
  SOUND_VOLUME_MAX,
  TIER_TITLES,
} from '../defaults'
import type { UpdateConfig } from '../store'
import { TIER_IDS, type Config, type Rgba, type TierId, type TierStyle } from '../types'
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
const ICON_SIZES = ['Крупный', 'Средний', 'Мелкий']

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
            aria-label={`${label}: непрозрачность`}
            title="Непрозрачность"
            value={value.a}
            onChange={(e) => onChange({ ...value, a: Number(e.target.value) })}
          />
        </>
      )}
    </div>
  )
}

function TierEditor({ id, style, onChange }: { id: TierId; style: TierStyle; onChange: (s: TierStyle) => void }) {
  const set = <K extends keyof TierStyle>(key: K, value: TierStyle[K]) => onChange({ ...style, [key]: value })
  return (
    <section className="tier-editor">
      <h2>{TIER_TITLES[id]}</h2>

      <div className="ground ground--wide">
        <ItemLabel name="Divine Orb" style={style} />
      </div>

      <div className="fields">
        <div className="field">
          <label htmlFor={`font-${id}`}>Размер шрифта: {style.fontSize}</label>
          <input
            id={`font-${id}`}
            type="range"
            min={FONT_SIZE.min}
            max={FONT_SIZE.max}
            value={style.fontSize}
            onChange={(e) => set('fontSize', Number(e.target.value))}
          />
        </div>
        <ColorField label="Текст" value={style.text} onChange={(v) => set('text', v)} />
        <ColorField label="Рамка" optional value={style.border} onChange={(v) => set('border', v)} />
        <ColorField label="Фон" optional value={style.background} onChange={(v) => set('background', v)} />

        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={style.sound !== null}
              onChange={(e) => set('sound', e.target.checked ? { id: 1, volume: SOUND_VOLUME_MAX } : null)}
            />
            Звук
          </label>
          {style.sound && (
            <>
              <select
                aria-label="Номер звука"
                value={style.sound.id}
                onChange={(e) => set('sound', { ...style.sound!, id: Number(e.target.value) })}
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
                aria-label="Громкость"
                title={`Громкость: ${style.sound.volume}`}
                value={style.sound.volume}
                onChange={(e) => set('sound', { ...style.sound!, volume: Number(e.target.value) })}
              />
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
            Луч
          </label>
          {style.effect && (
            <>
              <select
                aria-label="Цвет луча"
                value={style.effect.color}
                onChange={(e) => set('effect', { ...style.effect!, color: e.target.value })}
              >
                {EFFECT_COLORS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <label className="check">
                <input
                  type="checkbox"
                  checked={style.effect.temp}
                  onChange={(e) => set('effect', { ...style.effect!, temp: e.target.checked })}
                />
                только при выпадении
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
            Значок на карте
          </label>
          {style.icon && (
            <>
              <select
                aria-label="Размер значка"
                value={style.icon.size}
                onChange={(e) => set('icon', { ...style.icon!, size: Number(e.target.value) as 0 | 1 | 2 })}
              >
                {ICON_SIZES.map((title, size) => (
                  <option key={size} value={size}>
                    {title}
                  </option>
                ))}
              </select>
              <select
                aria-label="Цвет значка"
                value={style.icon.color}
                onChange={(e) => set('icon', { ...style.icon!, color: e.target.value })}
              >
                {EFFECT_COLORS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select
                aria-label="Форма значка"
                value={style.icon.shape}
                onChange={(e) => set('icon', { ...style.icon!, shape: e.target.value })}
              >
                {ICON_SHAPES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

export function StylesView({ config, update, exaltedPerDivine }: { config: Config; update: UpdateConfig; exaltedPerDivine: number }) {
  const thresholdTiers = TIER_IDS.filter((t): t is Exclude<TierId, 'E'> => t !== 'E')
  const overrideCount = Object.keys(config.overrides).length

  return (
    <div>
      <header className="page-header">
        <h1>Тиры и стили</h1>
      </header>

      <section className="panel">
        <h2>Пороги цен</h2>
        <p className="note">
          Предмет попадает в тир, если стоит не меньше порога. Цены — в Exalted Orb
          {exaltedPerDivine > 0 && ` (сейчас 1 Divine ≈ ${Math.round(exaltedPerDivine)} ex)`}. Всё, что дешевле D, уходит в E.
        </p>
        <div className="thresholds">
          {thresholdTiers.map((t) => (
            <label key={t}>
              {t} от
              <input
                type="number"
                min={0}
                step="any"
                value={config.thresholds[t]}
                onChange={(e) =>
                  update((c) => ({ ...c, thresholds: { ...c.thresholds, [t]: Math.max(0, Number(e.target.value)) } }))
                }
              />
              ex
            </label>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Что показывать</h2>
        <p className="note">
          Общие настройки для всех разделов; в любом разделе их можно заменить своими. Тир, выбранный для предмета вручную,
          важнее минимальной цены.
        </p>
        <VisibilityFields
          value={config.visibility}
          thresholds={config.thresholds}
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
        <h2>Экипировка</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={config.gear.hideLowRarity}
            onChange={(e) => update((c) => ({ ...c, gear: { ...c.gear, hideLowRarity: e.target.checked } }))}
          />
          Скрывать обычные и магические оружие и броню начиная с уровня области
          <input
            type="number"
            min={1}
            max={100}
            aria-label="Уровень области"
            disabled={!config.gear.hideLowRarity}
            value={config.gear.areaLevel}
            onChange={(e) => update((c) => ({ ...c, gear: { ...c.gear, areaLevel: Number(e.target.value) } }))}
          />
        </label>
        <p className="note">Кольца, амулеты, пояса и все редкие и уникальные предметы остаются видимыми.</p>
      </section>

      <section className="panel">
        <h2>Сброс</h2>
        <div className="actions">
          <button
            disabled={overrideCount === 0}
            onClick={() => confirm(`Сбросить ручной выбор тира у ${overrideCount} предметов?`) && update((c) => ({ ...c, overrides: {} }))}
          >
            Сбросить ручные тиры ({overrideCount})
          </button>
          <button
            onClick={() =>
              confirm('Вернуть стили и пороги по умолчанию?') &&
              update((c) => ({ ...c, tiers: DEFAULT_CONFIG.tiers, thresholds: DEFAULT_CONFIG.thresholds }))
            }
          >
            Стили и пороги по умолчанию
          </button>
        </div>
      </section>
    </div>
  )
}
