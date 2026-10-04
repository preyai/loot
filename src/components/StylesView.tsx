import { CURRENCIES, DEFAULT_CONFIG } from '../defaults'
import { keyOf } from '../i18n'
import { useI18n } from '../i18n-react'
import type { UpdateConfig } from '../store'
import { convertThresholds, perDivine } from '../tiering'
import { TIER_IDS, type Config, type MarketSnapshot, type TierId, type TierStyle } from '../types'
import { HiddenStylePanel } from './HiddenStyleFields'
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

      <SoundLibrary />

      <HiddenStylePanel value={config.hiddenStyle} onChange={(hiddenStyle) => update((c) => ({ ...c, hiddenStyle }))} />

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
