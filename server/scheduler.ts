// Сбор данных по расписанию: пользователи только читают сохранённое и сами ничего не запускают.
import { getLeagues, snapshots } from './market'
import { popularity } from './popularity'
import { describeError, getTradeJob, scanAgeMs, startExceptionalScan } from './trade'

const HOUR_MS = 60 * 60 * 1000
const TICK_MS = 10 * 60 * 1000
/** Как часто опрашивать трейд на исключительные вещи. */
const SCAN_INTERVAL_MS = Number(process.env.SCAN_INTERVAL_HOURS ?? 24) * HOUR_MS
/** Нижняя граница цены для опроса трейда, в exalted. */
const MIN_EXALTED = Number(process.env.EXCEPTIONAL_MIN_EXALTED ?? 100)
/** После неудачного опроса не повторяем раньше этого срока, чтобы не биться в ограничение трейда. */
const SCAN_RETRY_MS = 2 * HOUR_MS

const lastScanAttempt = new Map<string, number>()

/** Лиги, для которых данные собираются заранее: из LEAGUES (через запятую) или текущая лига poe.ninja. */
async function trackedLeagues(): Promise<string[]> {
  const configured = (process.env.LEAGUES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (configured.length) return configured
  const [current] = await getLeagues()
  return current ? [current.name] : []
}

async function tick() {
  try {
    const leagues = await trackedLeagues()
    for (const league of leagues) {
      for (const [title, resource] of [['цены', snapshots], ['популярность баз', popularity]] as const) {
        await resource.refreshIfStale(league).catch((e: unknown) => console.warn(`Расписание: ${title} «${league}»: ${describeError(e)}`))
      }
    }

    // Трейд опрашивается по одной лиге за раз: лимит запросов один на весь сервер.
    if (getTradeJob().running) return
    for (const league of leagues) {
      const age = await scanAgeMs(league)
      const sinceAttempt = Date.now() - (lastScanAttempt.get(league) ?? 0)
      if (age < SCAN_INTERVAL_MS || sinceAttempt < SCAN_RETRY_MS) continue
      lastScanAttempt.set(league, Date.now())
      startExceptionalScan(league, MIN_EXALTED)
      return
    }
  } catch (e) {
    console.warn(`Расписание: ${describeError(e)}`)
  }
}

export function startScheduler() {
  console.log(`Расписание: опрос трейда раз в ${SCAN_INTERVAL_MS / HOUR_MS} ч, порог ${MIN_EXALTED} ex`)
  void tick()
  // unref: таймер не должен мешать серверу завершиться по сигналу.
  setInterval(() => void tick(), TICK_MS).unref()
}
