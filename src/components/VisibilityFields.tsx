import { TIER_TITLES } from '../defaults'
import { TIER_IDS, type TierId, type Visibility } from '../types'

interface Props {
  value: Visibility
  onChange: (value: Visibility) => void
  disabled?: boolean
  /** Раздел с нескладываемыми предметами: настройка стопок не показывается. */
  unstackable?: boolean
}

/** Настройки «что показывать»: общие или для одного раздела. */
export function VisibilityFields({ value, onChange, disabled, unstackable }: Props) {
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
        ex
      </label>
      {unstackable ? (
        <span className="note">Остальное скрывается: эти предметы не складываются в стопки.</span>
      ) : (
        <label className="check">
          <input type="checkbox" checked={value.stacks} onChange={(e) => onChange({ ...value, stacks: e.target.checked })} />
          Остальное показывать стопками на сумму от
          <input
            type="number"
            min={0}
            step="any"
            aria-label="Минимальная стоимость стопки"
            disabled={!value.stacks}
            value={value.stackPrice}
            onChange={(e) => onChange({ ...value, stackPrice: Math.max(0, Number(e.target.value)) })}
          />
          ex
        </label>
      )}
    </fieldset>
  )
}
