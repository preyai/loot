import { useMemo, useState } from 'react'
import { CURRENCIES } from '../defaults'
import { useI18n } from '../i18n-react'
import { autoTier } from '../tiering'
import { TIER_IDS, type Config, type Currency, type MarketItem, type MarketSnapshot, type ThresholdTier, type TierId } from '../types'

const THRESHOLD_TIERS = TIER_IDS.filter((tier): tier is ThresholdTier => tier !== 'E')

/**
 * Число, которое правят с клавиатуры: набираемый текст хранится, пока его правят, — иначе «0.5» не набрать
 * (на «0.» поле сбросилось бы в 0). Значение применяется, как только набрано целое число; при уходе — снова действующее.
 */
function DecimalInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      type="text"
      inputMode="decimal"
      className="number-input"
      value={draft ?? String(value)}
      onChange={(e) => {
        setDraft(e.target.value)
        // Запятая — тоже разделитель: так пишут дробные числа во многих языках.
        const n = Number(e.target.value.replace(',', '.'))
        if (e.target.value.trim() && Number.isFinite(n) && n >= 0) onChange(n)
      }}
      onBlur={() => setDraft(null)}
    />
  )
}

interface Props {
  thresholds: Config['thresholds']
  onChange: (thresholds: Config['thresholds']) => void
  /** Для счётчиков «сколько предметов в тире»: настройки с этими границами и предметы, которые они делят. */
  config: Config
  snapshot: MarketSnapshot | null
  items?: MarketItem[]
  disabled?: boolean
}

/** Границы тиров: у каждой — число и валюта; рядом — сколько предметов сейчас в тире. */
export function ThresholdFields({ thresholds, onChange, config, snapshot, items, disabled }: Props) {
  const { t, name } = useI18n()
  const counts = useMemo(() => {
    if (!snapshot) return null
    const result = Object.fromEntries(TIER_IDS.map((tier) => [tier, 0])) as Record<TierId, number>
    // Считаем по переданным границам, а не по тем, что действуют сейчас: так видно, что изменится.
    const probe = { ...config, thresholds, sectionThresholds: {} }
    for (const item of items ?? snapshot.items) if (item.divine !== null) result[autoTier(item, probe, snapshot.rates)]++
    return result
  }, [snapshot, items, config, thresholds])
  const set = (tier: ThresholdTier, change: Partial<Config['thresholds'][ThresholdTier]>) =>
    onChange({ ...thresholds, [tier]: { ...thresholds[tier], ...change } })

  return (
    <fieldset className="thresholds" disabled={disabled}>
      {THRESHOLD_TIERS.map((tier) => (
        <label key={tier}>
          {t('styles.from', { tier })}
          <DecimalInput value={thresholds[tier].value} onChange={(value) => set(tier, { value })} />
          <select value={thresholds[tier].currency} onChange={(e) => set(tier, { currency: e.target.value as Currency })}>
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
    </fieldset>
  )
}
