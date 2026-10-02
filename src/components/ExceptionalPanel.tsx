import { CURRENCIES } from '../defaults'
import { EXCEPTIONAL_KINDS, exceptionalBases, exceptionalRules, withExceptionalRules } from '../exceptional'
import { useExceptionalScan, type UpdateConfig } from '../store'
import { perDivine, tierByValue } from '../tiering'
import type { Config, ExceptionalKind, MarketSnapshot, TierId } from '../types'

/** Тир для правил, пока курсы валют не загружены и цену порога нельзя перевести в основную валюту. */
const FALLBACK_TIER: TierId = 'B'

interface Props {
  config: Config
  update: UpdateConfig
  /** null, пока цены не загружены. */
  rates: MarketSnapshot['rates'] | null
}

export function ExceptionalPanel({ config, update, rates }: Props) {
  const { scan, loading } = useExceptionalScan(config.league)
  const bases = scan ? exceptionalBases(scan) : null
  const found = bases ? (Object.keys(bases) as ExceptionalKind[]).filter((kind) => bases[kind].length > 0) : []

  const apply = () => {
    if (!scan) return
    // Тир — тот, в который по общим порогам попал бы предмет с ценой на нижней границе опроса.
    const tier =
      rates && rates.exalted > 0
        ? tierByValue((scan.minExalted / rates.exalted) * perDivine(config.currency, rates), config.thresholds)
        : FALLBACK_TIER
    const label = `${scan.minExalted} ${CURRENCIES.exalted.short}`
    update((c) => ({ ...c, baseRules: withExceptionalRules(c.baseRules, exceptionalRules(scan, label, tier)) }))
  }

  return (
    <section className="panel">
      <h2>Исключительные вещи с трейда</h2>
      <p className="note">
        Сервер сам регулярно ищет на трейде обычные предметы с лишними гнёздами или качеством 21%+, выставленные не дешевле
        порога. По найденным базам можно создать правила: они встанут первыми в списке и заменят прежние правила «с трейда»;
        остальные правила не затрагиваются.
      </p>
      {scan && bases ? (
        <>
          <p className="note" role="status">
            Данные от {new Date(scan.at).toLocaleString('ru-RU')}, цена от {scan.minExalted} {CURRENCIES.exalted.short}. Найдено
            баз: {(Object.keys(bases) as ExceptionalKind[]).map((kind) => `${EXCEPTIONAL_KINDS[kind].title} — ${bases[kind].length}`).join(', ')}.
          </p>
          <div className="actions">
            <button className="primary" disabled={found.length === 0} onClick={apply}>
              Создать правила из этих данных
            </button>
          </div>
        </>
      ) : (
        <p className="note" role="status">
          {loading ? 'Загрузка…' : 'Для этой лиги данных пока нет: сервер опрашивает трейд по расписанию и только для основной лиги.'}
        </p>
      )}
    </section>
  )
}
