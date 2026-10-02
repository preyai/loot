import { useMemo } from 'react'
import { BASE_CLASSES, BASE_PRICE_ILVL, popularBases } from '../bases'
import { useBasePriceJob, usePopularity, type UpdateConfig } from '../store'
import type { Config } from '../types'

/** Темп задаёт лимит поиска на трейде: 30 запросов за 5 минут с запасом. */
const SECONDS_PER_BASE = 11
const ALL_CLASSES = BASE_CLASSES.map((c) => c.name)

interface Props {
  config: Config
  update: UpdateConfig
  /** Перечитать цены после обновления. */
  onUpdated: () => void
}

export function BasePricesPanel({ config, update, onUpdated }: Props) {
  const popularity = usePopularity(config.league)
  const { job, start, stop, error } = useBasePriceJob(onUpdated)
  const { minShare } = config.basePricing

  const bases = useMemo(
    () => (popularity.data ? popularBases(ALL_CLASSES, popularity.data.shares, minShare) : []),
    [popularity.data, minShare],
  )
  const running = job?.running ?? false

  return (
    <section className="panel">
      <h2>Обновление цен с трейда</h2>
      <p className="note">
        Оцениваются белые базы с уровнем предмета {BASE_PRICE_ILVL}+, популярные у игроков по данным poe.ninja. Цена — медиана
        десяти самых дешёвых лотов с мгновенным выкупом. Обновление только ручное: трейд ограничивает число запросов, и этот
        лимит общий с вашим браузером.
      </p>
      <div className="visibility">
        <label>
          Базы с популярностью от
          <input
            type="number"
            min={0}
            max={100}
            step="any"
            disabled={running}
            value={Number((minShare * 100).toFixed(2))}
            onChange={(e) =>
              update((c) => ({ ...c, basePricing: { minShare: Math.min(100, Math.max(0, Number(e.target.value))) / 100 } }))
            }
          />
          %
        </label>
        {running ? (
          <button onClick={stop}>Остановить</button>
        ) : (
          <button
            className="primary"
            disabled={!config.league || bases.length === 0}
            onClick={() => config.league && start(config.league, bases)}
          >
            Обновить цены: {bases.length} баз, до {Math.ceil((bases.length * SECONDS_PER_BASE) / 60)} мин
          </button>
        )}
      </div>
      <p className="note" role="status">
        {popularity.loading && 'Загрузка популярности баз с poe.ninja…'}
        {popularity.error && <span className="note--error">Популярность баз недоступна: {popularity.error}</span>}
        {running && `Запрошено ${job!.done} из ${job!.total}${job!.current ? ` — сейчас ${job!.current}` : ''}`}
        {!running && job?.finishedAt && !job.error && `Готово: обновлено ${job.done} из ${job.total}.`}
        {!running && popularity.data && !job?.finishedAt && 'Базы, оценённые менее 6 часов назад, повторно не запрашиваются.'}
        {(job?.error || error) && <span className="note--error"> {job?.error ?? error}</span>}
      </p>
    </section>
  )
}
