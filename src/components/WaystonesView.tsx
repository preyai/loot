import { useState } from 'react'
import { useI18n } from '../i18n-react'
import type { UpdateConfig } from '../store'
import type { Config, TierStyle, WaystoneConfig } from '../types'
import { DEFAULT_WAYSTONES, MAX_WAYSTONE_TIER, SPECIAL_WAYSTONE_STYLE, WAYSTONE_BANDS, waystoneName } from '../waystones'
import { ItemLabel } from './ItemLabel'
import { StyleFields } from './StyleFields'

interface Props {
  config: Config
  update: UpdateConfig
}

const TIERS = Array.from({ length: MAX_WAYSTONE_TIER }, (_, i) => i + 1)

/** Строка с образцом плашки и раскрывающимися полями оформления. */
function StyleRow({
  id,
  title,
  sample,
  style,
  note,
  onChange,
  children,
}: {
  id: string
  title: string
  sample: string
  /** null — камни этой строки скрыты или не выделяются. */
  style: TierStyle | null
  note?: string
  onChange: (style: TierStyle) => void
  children?: React.ReactNode
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <div className="waystone-row">
      <div className="waystone-row-head">
        {children}
        <span className="waystone-row-title">{title}</span>
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
          <StyleFields id={`waystone-${id}`} style={style} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

export function WaystonesView({ config, update }: Props) {
  const { t, name } = useI18n()
  const w = config.waystones
  const set = (change: Partial<WaystoneConfig>) => update((c) => ({ ...c, waystones: { ...c.waystones, ...change } }))

  return (
    <div>
      <header className="page-header">
        <h1>{t('nav.waystones')}</h1>
        <label className="check">
          <input type="checkbox" checked={w.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          {t('waystones.enable')}
        </label>
      </header>

      <p className="note">{t(w.enabled ? 'waystones.note' : 'waystones.disabled')}</p>

      <fieldset className="plain" disabled={!w.enabled}>
        <section className="panel">
          <label className="check">
            {t('waystones.minTier')}
            <select value={w.minTier} onChange={(e) => set({ minTier: Number(e.target.value) })}>
              {TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {t('waystones.tier', { n: tier })}
                </option>
              ))}
            </select>
          </label>
          <p className="note">{t('waystones.minTierNote')}</p>

          <label className="check">
            <input type="checkbox" checked={w.upgradeBorder} onChange={(e) => set({ upgradeBorder: e.target.checked })} />
            {t('waystones.upgrade')}
          </label>
          <p className="note">{t('waystones.upgradeNote')}</p>
        </section>

        <section className="panel">
          <h2>{t('waystones.special')}</h2>
          <p className="note">{t('waystones.specialNote')}</p>
          {(['corrupted', 'enchanted'] as const).map((kind) => (
            <StyleRow
              key={kind}
              id={kind}
              title={t(`waystones.${kind}`)}
              sample={name(waystoneName(MAX_WAYSTONE_TIER))}
              style={w[kind]}
              onChange={(style) => set({ [kind]: style })}
            >
              <input
                type="checkbox"
                aria-label={t(`waystones.${kind}`)}
                checked={w[kind] !== null}
                onChange={(e) => set({ [kind]: e.target.checked ? SPECIAL_WAYSTONE_STYLE : null })}
              />
            </StyleRow>
          ))}
        </section>

        <section className="panel">
          <h2>{t('waystones.tiers')}</h2>
          {WAYSTONE_BANDS.map((band) => {
            const hidden = band.to < w.minTier
            const partly = !hidden && band.from < w.minTier
            return (
              <StyleRow
                key={band.id}
                id={band.id}
                title={band.from === band.to ? t('waystones.tier', { n: band.from }) : t('waystones.range', { from: band.from, to: band.to })}
                note={hidden ? t('waystones.hidden') : partly ? t('waystones.partly', { n: w.minTier }) : undefined}
                sample={name(waystoneName(band.to))}
                style={hidden ? null : w.styles[band.id]}
                onChange={(style) => set({ styles: { ...w.styles, [band.id]: style } })}
              />
            )
          })}
        </section>
      </fieldset>

      <div className="actions">
        <button onClick={() => confirm(t('waystones.resetConfirm')) && set(DEFAULT_WAYSTONES)}>{t('waystones.reset')}</button>
      </div>
    </div>
  )
}
