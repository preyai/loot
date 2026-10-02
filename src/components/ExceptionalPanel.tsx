import { CURRENCIES } from '../defaults'
import { exceptionalBases, exceptionalRules, withExceptionalRules } from '../exceptional'
import { keyOf } from '../i18n'
import { useI18n } from '../i18n-react'
import type { UpdateConfig } from '../store'
import { perDivine, tierByValue } from '../tiering'
import type { Config, ExceptionalKind, ExceptionalScan, MarketSnapshot, TierId } from '../types'

/** Тир для правил, пока курсы валют не загружены и цену порога нельзя перевести в основную валюту. */
const FALLBACK_TIER: TierId = 'B'

interface Props {
  config: Config
  update: UpdateConfig
  /** null, пока цены не загружены. */
  rates: MarketSnapshot['rates'] | null
  /** Последний опрос трейда для выбранной лиги; null — его ещё не было. */
  scan: ExceptionalScan | null
  loading: boolean
}

export function ExceptionalPanel({ config, update, rates, scan, loading }: Props) {
  const { t, locale } = useI18n()
  const bases = scan ? exceptionalBases(scan) : null
  const kinds = bases ? (Object.keys(bases) as ExceptionalKind[]) : []
  const price = scan ? `${scan.minExalted} ${CURRENCIES.exalted.short}` : ''

  const apply = () => {
    if (!scan) return
    // Тир — тот, в который по общим порогам попал бы предмет с ценой на нижней границе опроса.
    const tier =
      rates && rates.exalted > 0
        ? tierByValue((scan.minExalted / rates.exalted) * perDivine(config.currency, rates), config.thresholds)
        : FALLBACK_TIER
    update((c) => ({ ...c, baseRules: withExceptionalRules(c.baseRules, exceptionalRules(scan, price, tier, t)) }))
  }

  return (
    <section className="panel">
      <h2>{t('exceptional.title')}</h2>
      <p className="note">{t('exceptional.note')}</p>
      {scan && bases ? (
        <>
          <p className="note" role="status">
            {t('exceptional.status', {
              time: new Date(scan.at).toLocaleString(locale),
              price,
              found: kinds.map((kind) => `${t(keyOf('exceptional', kind))} — ${bases[kind].length}`).join(', '),
            })}
          </p>
          <div className="actions">
            <button className="primary" disabled={kinds.every((kind) => bases[kind].length === 0)} onClick={apply}>
              {t('exceptional.create')}
            </button>
          </div>
        </>
      ) : (
        <p className="note" role="status">
          {loading ? t('exceptional.loading') : t('exceptional.none')}
        </p>
      )}
    </section>
  )
}
