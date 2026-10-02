import { CURRENCIES, TIER_TITLES } from '../defaults'
import { cutoffPrice } from '../tiering'
import { TIER_IDS, type Config, type Currency, type TierId, type Visibility } from '../types'

interface Props {
  value: Visibility
  thresholds: Config['thresholds']
  currency: Currency
  onChange: (value: Visibility) => void
  disabled?: boolean
  /** Раздел с нескладываемыми предметами: настройка стопок не показывается. */
  unstackable?: boolean
}

/** Настройки «что показывать»: общие или для одного раздела. */
export function VisibilityFields({ value, thresholds, currency, onChange, disabled, unstackable }: Props) {
  const cutoff = cutoffPrice(value, thresholds)
  const unit = CURRENCIES[currency].short
  return (
    <fieldset className="visibility" disabled={disabled}>
      <label>
        Показывать с тира
        <select value={value.minTier} onChange={(e) => onChange({ ...value, minTier: e.target.value as TierId })}>
          {TIER_IDS.map((t) => (
            <option key={t} value={t}>
              {t === 'E' ? 'E — показывать все тиры' : `${TIER_TITLES[t]} и выше`}
            </option>
          ))}
        </select>
      </label>
      <label>
        и не дешевле
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
        <span className="note">Остальное скрывается: эти предметы не складываются в стопки.</span>
      ) : (
        <label className="check">
          <input type="checkbox" checked={value.stacks} onChange={(e) => onChange({ ...value, stacks: e.target.checked })} />
          Остальное показывать стопками{cutoff > 0 && ` на сумму от ${cutoff} ${unit}`}
        </label>
      )}
    </fieldset>
  )
}
