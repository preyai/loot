import { CURRENCIES } from '../defaults'
import { keyOf } from '../i18n'
import { useI18n } from '../i18n-react'
import { cutoffPrice, roundPrice } from '../tiering'
import { TIER_IDS, type Config, type Currency, type MarketSnapshot, type TierId, type Visibility } from '../types'

interface Props {
  value: Visibility
  thresholds: Config['thresholds']
  currency: Currency
  /** Без курса нельзя перевести границу тира в выбранную валюту — подсказка о стопках не показывается. */
  rates: MarketSnapshot['rates'] | null
  onChange: (value: Visibility) => void
  disabled?: boolean
  /** Раздел с нескладываемыми предметами: настройка стопок не показывается. */
  unstackable?: boolean
}

/** Настройки «что показывать»: общие или для одного раздела. */
export function VisibilityFields({ value, thresholds, currency, rates, onChange, disabled, unstackable }: Props) {
  const { t } = useI18n()
  const cutoff = rates ? roundPrice(cutoffPrice(value, thresholds, currency, rates)) : 0
  const unit = CURRENCIES[currency].short
  return (
    <fieldset className="visibility" disabled={disabled}>
      <label>
        {t('vis.fromTier')}
        <select value={value.minTier} onChange={(e) => onChange({ ...value, minTier: e.target.value as TierId })}>
          {TIER_IDS.map((tier) => (
            <option key={tier} value={tier}>
              {tier === 'E' ? t('vis.allTiers') : t('vis.andAbove', { tier: t(keyOf('tier', tier)) })}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('vis.notCheaper')}
        <input
          type="number"
          min={0}
          step="any"
          value={value.minPrice}
          onChange={(e) => onChange({ ...value, minPrice: Math.max(0, Number(e.target.value)) })}
        />
        {unit}
      </label>
      {unstackable ? (
        <span className="note">{t('vis.unstackable')}</span>
      ) : (
        <label className="check">
          <input type="checkbox" checked={value.stacks} onChange={(e) => onChange({ ...value, stacks: e.target.checked })} />
          {t('vis.stacks')}
          {cutoff > 0 && ` ${t('vis.stacksFrom', { value: cutoff, unit })}`}
        </label>
      )}
    </fieldset>
  )
}
