import { CURRENCIES, DEFAULT_CONFIG } from '../defaults'
import { keyOf } from '../i18n'
import { useMemo } from 'react'
import { useI18n } from '../i18n-react'
import type { UpdateConfig } from '../store'
import { autoTier, perDivine } from '../tiering'
import { TIER_IDS, type Config, type Currency, type MarketSnapshot, type ThresholdTier, type TierId, type TierStyle } from '../types'
import { ItemLabel } from './ItemLabel'
import { SoundLibrary } from './SoundLibrary'
import { StyleFields } from './StyleFields'
import { VisibilityFields } from './VisibilityFields'

/** Предмет для образца плашки: его знают все, и название есть на обоих языках. */
const SAMPLE_ITEM = 'Divine Orb'

function TierEditor({ id, style, onChange }: { id: TierId; style: TierStyle; onChange: (s: TierStyle) => void }) {
  const { t, name } = useI18n()
  return (
    <section className="tier-editor">
      <h2>{t(keyOf('tier', id))}</h2>

      <div className="ground ground--wide">
        <ItemLabel name={name(SAMPLE_ITEM)} style={style} />
      </div>

      <StyleFields id={id} style={style} onChange={onChange} />
    </section>
  )
}

interface Props {
  config: Config
  update: UpdateConfig
  /** null, пока цены не загружены. */
  snapshot: MarketSnapshot | null
}

export function StylesView({ config, update, snapshot }: Props) {
  const { t, name } = useI18n()
  const rates = snapshot?.rates ?? null
  const thresholdTiers = TIER_IDS.filter((tier): tier is ThresholdTier => tier !== 'E')
  const overrideCount = Object.keys(config.overrides).length
  // Сколько предметов рынка попадает в каждый тир по этим границам — чтобы двигать их осознанно.
  const counts = useMemo(() => {
    const result = Object.fromEntries(TIER_IDS.map((tier) => [tier, 0])) as Record<TierId, number>
    if (!snapshot) return null
    for (const item of snapshot.items) if (item.divine !== null) result[autoTier(item, config, snapshot.rates)]++
    return result
  }, [snapshot, config])
  const setThreshold = (tier: ThresholdTier, change: Partial<Config['thresholds'][ThresholdTier]>) =>
    update((c) => ({ ...c, thresholds: { ...c.thresholds, [tier]: { ...c.thresholds[tier], ...change } } }))

  return (
    <div>
      <header className="page-header">
        <h1>{t('nav.styles')}</h1>
      </header>

      <section className="panel">
        <h2>{t('styles.thresholds')}</h2>
        <p className="note">
          {t('styles.thresholdsNote')}
          {rates &&
            ` ${t('styles.rates', { exalted: Math.round(perDivine('exalted', rates)), chaos: perDivine('chaos', rates).toFixed(1) })}`}
        </p>
        <div className="thresholds">
          {thresholdTiers.map((tier) => (
            <label key={tier}>
              {t('styles.from', { tier })}
              <input
                type="number"
                min={0}
                step="any"
                value={config.thresholds[tier].value}
                onChange={(e) => setThreshold(tier, { value: Math.max(0, Number(e.target.value)) })}
              />
              <select value={config.thresholds[tier].currency} onChange={(e) => setThreshold(tier, { currency: e.target.value as Currency })}>
                {(Object.keys(CURRENCIES) as Currency[]).map((id) => (
                  <option key={id} value={id} title={name(CURRENCIES[id].title)}>
                    {CURRENCIES[id].short}
                  </option>
                ))}
              </select>
              {counts && <span className="count">{t('styles.count', { n: counts[tier] })}</span>}
            </label>
          ))}
          {counts && <span className="count">{t('styles.countE', { n: counts.E })}</span>}
        </div>
      </section>

      <section className="panel">
        <h2>{t('styles.visibility')}</h2>
        <p className="note">{t('styles.visibilityNote')}</p>
        <VisibilityFields
          value={config.visibility}
          thresholds={config.thresholds}
          currency={config.currency}
          rates={rates}
          onChange={(visibility) => update((c) => ({ ...c, visibility }))}
        />
      </section>

      <SoundLibrary />

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
            onClick={() =>
              confirm(t('styles.resetStylesConfirm')) && update((c) => ({ ...c, tiers: DEFAULT_CONFIG.tiers, thresholds: DEFAULT_CONFIG.thresholds }))
            }
          >
            {t('styles.resetStyles')}
          </button>
        </div>
      </section>
    </div>
  )
}
