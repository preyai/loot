/**
 * Цены обычных предметов (валюта, руны, эссенции…) с poe2scout.com — по внутриигровому обмену валюты.
 * Уники у poe2scout неполные (оружия и «прочих» почти нет), их цены остаются с poe.ninja.
 */

const API = 'https://api.poe2scout.com/poe2'
const HEADERS = { 'User-Agent': 'exile-filter/0.1 (+https://exile-filter.com)', Accept: 'application/json' }
/** Меньше сделок — цена случайна, лучше цена poe.ninja. */
const MIN_VOLUME = 5
const PER_PAGE = 250

interface ScoutLeague {
  Value: string
  /** Экзальтов за divine. */
  DivinePrice: number
  /** Хаосов за divine. */
  ChaosDivinePrice: number
  BaseCurrencyApiId: string
}

interface ScoutItem {
  Text: string
  /** В основной валюте лиги (экзальтах). */
  CurrentPrice: number | null
  CurrentQuantity: number
}

interface ScoutPage {
  Pages: number
  Items: ScoutItem[]
}

export interface ScoutPrices {
  rates: { exalted: number; chaos: number }
  /** Имя предмета → цена в divine и объём торгов. */
  prices: Map<string, { divine: number; volume: number }>
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`poe2scout ответил ${res.status} на ${url}`)
  return (await res.json()) as T
}

/** Цены всех категорий обмена валюты лиги; null — такой лиги у poe2scout нет. */
export async function scoutPrices(league: string): Promise<ScoutPrices | null> {
  const found = (await getJson<ScoutLeague[]>(`${API}/Leagues`)).find((l) => l.Value === league)
  // Цены считаем только от экзальта: в другой валюте пересчёт в divine был бы неверным.
  if (!found || found.BaseCurrencyApiId !== 'exalted' || !(found.DivinePrice > 0)) return null
  const base = `${API}/Leagues/${encodeURIComponent(league)}`
  const { CurrencyCategories } = await getJson<{ CurrencyCategories: { ApiId: string }[] }>(`${base}/Items/Categories`)

  const prices: ScoutPrices['prices'] = new Map()
  // По одной категории за раз: запросов два десятка, нагружать чужой сервис параллельно незачем.
  for (const { ApiId } of CurrencyCategories) {
    for (let page = 1; ; page++) {
      const data = await getJson<ScoutPage>(`${base}/Currencies/ByCategory?category=${ApiId}&page=${page}&perPage=${PER_PAGE}`)
      for (const item of data.Items) {
        if (item.CurrentPrice === null || item.CurrentPrice <= 0) continue
        prices.set(item.Text, { divine: item.CurrentPrice / found.DivinePrice, volume: item.CurrentQuantity })
      }
      if (page >= data.Pages) break
    }
  }
  return { rates: { exalted: found.DivinePrice, chaos: found.ChaosDivinePrice }, prices }
}

/** Цена предмета: poe2scout, если по нему было достаточно сделок или у poe.ninja цены нет. */
export function scoutPrice(scout: ScoutPrices, name: string, ninja: number | null): number | null {
  const price = scout.prices.get(name)
  if (!price) return null
  return price.volume >= MIN_VOLUME || ninja === null ? price.divine : null
}
