import { CURRENCIES } from '../defaults'
import { EXCEPTIONAL_KINDS, EXCEPTIONAL_QUERIES, exceptionalBases, exceptionalRules, withExceptionalRules } from '../exceptional'
import { useExceptionalScan, type UpdateConfig } from '../store'
import { tierByValue } from '../tiering'
import type { Config, ExceptionalKind, ExceptionalScan } from '../types'

/** Поиск раз в 11 секунд и до четырёх загрузок лотов по 6,6 секунды на каждый запрос — если трейд не просит подождать. */
const SECONDS_PER_QUERY = 26
const ESTIMATE_MIN = Math.ceil((EXCEPTIONAL_QUERIES.length * SECONDS_PER_QUERY) / 60)

export function ExceptionalPanel({ config, update }: { config: Config; update: UpdateConfig }) {
  const unit = CURRENCIES[config.currency].short

  const apply = (scan: ExceptionalScan) =>
    update((c) => {
      const label = `${scan.minPrice} ${CURRENCIES[scan.currency].short}`
      // Тир — тот, в который по общим порогам попал бы предмет с ценой на нижней границе опроса.
      const tier = tierByValue(c.exceptional.minPrice, c.thresholds)
      return { ...c, baseRules: withExceptionalRules(c.baseRules, exceptionalRules(scan, label, tier)) }
    })

  const { job, scan, error, start, stop } = useExceptionalScan(config.league, apply)
  const running = job?.running ?? false
  const bases = scan ? exceptionalBases(scan) : null

  return (
    <section className="panel">
      <h2>Исключительные вещи с трейда</h2>
      <p className="note">
        Опрос ищет на трейде обычные предметы с лишними гнёздами или качеством 21%+, выставленные не дешевле заданной цены, и
        по найденным базам создаёт правила. Они встают первыми в списке и при следующем опросе заменяются; остальные правила
        не затрагиваются.
      </p>
      <div className="visibility">
        <label>
          Цена от
          <input
            type="number"
            min={0}
            step="any"
            disabled={running}
            value={config.exceptional.minPrice}
            onChange={(e) => update((c) => ({ ...c, exceptional: { minPrice: Math.max(0, Number(e.target.value)) } }))}
          />
          {unit}
        </label>
        {running ? (
          <button onClick={stop}>Остановить</button>
        ) : (
          <button
            className="primary"
            disabled={!config.league || !(config.exceptional.minPrice > 0)}
            onClick={() => config.league && start(config.league, config.exceptional.minPrice, config.currency)}
          >
            Опросить трейд: {EXCEPTIONAL_QUERIES.length} запросов, от {ESTIMATE_MIN} мин
          </button>
        )}
        {!running && scan && <button onClick={() => apply(scan)}>Создать правила заново</button>}
      </div>
      <p className="note" role="status">
        {running && `Выполнено ${job!.done} из ${job!.total}${job!.current ? ` — сейчас «${job!.current}»` : ''}. `}
        {running &&
          (job!.waitingUntil
            ? `Трейд попросил подождать до ${new Date(job!.waitingUntil).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} — опрос продолжится сам, страницу можно закрыть.`
            : 'Трейд может приостанавливать опрос на несколько минут; он идёт на сервере, страницу можно закрыть.')}
        {!running && scan && bases && (
          <>
            Последний опрос: {new Date(scan.at).toLocaleString('ru-RU')}, цена от {scan.minPrice} {CURRENCIES[scan.currency].short}.
            Найдено баз:{' '}
            {(Object.keys(bases) as ExceptionalKind[]).map((kind) => `${EXCEPTIONAL_KINDS[kind].title} — ${bases[kind].length}`).join(', ')}.
          </>
        )}
        {!running && !scan && 'Опроса для этой лиги ещё не было. Лимит запросов трейда общий с вашим браузером.'}
        {(job?.error || error) && <span className="note--error"> {job?.error ?? error}</span>}
      </p>
    </section>
  )
}
