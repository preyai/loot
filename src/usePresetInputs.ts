import { useMemo } from 'react'
import { CHANCING_MIN_DIVINE, chancingBases, chancingRule } from './chancing'
import { useI18n } from './i18n-react'
import { usePopularity } from './store'
import { formatPrice } from './tiering'
import type { Config, MarketSnapshot } from './types'

/** Что нужно наборам правил баз: популярность баз в лиге и правило под шансинг по текущим ценам уников. */
export function usePresetInputs(config: Config, snapshot: MarketSnapshot | null) {
  const { t } = useI18n()
  const popularity = usePopularity(config.league)
  const rates = snapshot?.rates ?? null
  const chancing = useMemo(() => {
    if (!snapshot || !rates) return null
    const bases = chancingBases(snapshot.items, CHANCING_MIN_DIVINE)
    return bases.length ? chancingRule(bases, formatPrice(CHANCING_MIN_DIVINE, rates, config.currency, t), t) : null
  }, [snapshot, rates, config.currency, t])
  return { popularity, shares: popularity.data?.shares ?? null, chancing }
}
