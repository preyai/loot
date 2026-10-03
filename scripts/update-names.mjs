// Собирает названия предметов на языках интерфейса в src/data/names-<язык>.json.
// Запускать после патчей игры, вслед за update-bases: npm run update-names [-- ru de …]
// Без аргументов обновляются все языки.
//
// Источники:
//   • валюта и прочее с рынка — справочник валют официального трейда (совпадение по идентификатору);
//   • базы экипировки — страницы классов poe2db (ссылка содержит английское имя, текст — перевод);
//   • уники — справочник предметов официального трейда (по порядку в списке уников), сверка с poe2db.
import { readFile, writeFile } from 'node:fs/promises'

const HEADERS = { 'User-Agent': 'loot-filter-editor/0.1 (personal project)' }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Язык интерфейса → поддомен официального трейда и раздел poe2db. */
const SOURCES = {
  ru: { trade: 'ru', db: 'ru' },
  pt: { trade: 'br', db: 'pt' },
  de: { trade: 'de', db: 'de' },
  fr: { trade: 'fr', db: 'fr' },
  es: { trade: 'es', db: 'sp' },
  ja: { trade: 'jp', db: 'jp' },
  ko: { trade: 'kr', db: 'kr' },
  th: { trade: 'th', db: 'th' },
}

async function get(url, as = 'json') {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return as === 'json' ? res.json() : res.text()
}

const trade = (subdomain, file) => get(`https://${subdomain}.pathofexile.com/api/trade2/data/${file}`)
// В разметке poe2db апостроф в именах записан HTML-сущностью.
const decodeHtml = (text) => text.replace(/&#0?39;|&apos;|&rsquo;/g, "'").replace(/&amp;/g, '&')
// «sep» — разделители списка: id у них общий, сопоставлять по нему нельзя.
const realEntries = (data) => data.result.flatMap((g) => g.entries).filter((e) => e.id !== 'sep')
const sorted = (map) => Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)))

const requested = process.argv.slice(2)
const unknown = requested.filter((lang) => !SOURCES[lang])
if (unknown.length) throw new Error(`Неизвестные языки: ${unknown.join(', ')}. Есть: ${Object.keys(SOURCES).join(', ')}`)
const languages = requested.length ? requested : Object.keys(SOURCES)

// --- Общее для всех языков: английские справочники трейда, названия с рынка и справочник баз.
const [enStatic, enItems] = await Promise.all([trade('www', 'static'), trade('www', 'items')])
const catalog = JSON.parse(await readFile(new URL('../src/data/bases.json', import.meta.url), 'utf8'))

// Новые предметы лиги попадают на рынок раньше, чем в справочник трейда. Для тех, что уже есть
// на poe.ninja, спрашиваем название у poe2db: заголовок страницы предмета начинается с него.
const NINJA = 'https://poe.ninja/poe2/api'
const EXCHANGE_TYPES = [
  'Currency', 'Fragments', 'Ritual', 'Delirium', 'Abyss', 'Breach', 'Expedition',
  'Essences', 'Runes', 'SoulCores', 'Idols', 'LineageSupportGems', 'UncutGems', 'Verisium',
]
// Не уники из раздела предметов: в справочнике валют трейда их нет, название — базовый тип.
const BASE_TYPES = ['PrecursorTablets']
const [{ name: league }] = (await get(`${NINJA}/data/index-state`)).economyLeagues
const marketNames = new Set()
for (const type of EXCHANGE_TYPES) {
  const overview = await get(`${NINJA}/economy/exchange/current/overview?league=${encodeURIComponent(league)}&type=${type}`)
  for (const item of overview.items ?? []) marketNames.add(item.name)
}
for (const type of BASE_TYPES) {
  const overview = await get(`${NINJA}/economy/stash/current/item/overview?league=${encodeURIComponent(league)}&type=${type}`)
  for (const line of overview.lines ?? []) marketNames.add(line.baseType)
}

let failed = false
for (const lang of languages) {
  try {
    await updateLanguage(lang)
  } catch (e) {
    failed = true
    console.error(`[${lang}] ${e.message}`)
  }
}
if (failed) process.exitCode = 1

async function updateLanguage(lang) {
  const source = SOURCES[lang]
  const log = (text) => console.log(`[${lang}] ${text}`)
  const poe2db = (page) => `https://poe2db.tw/${source.db}/${page}`

  // --- Валюта и прочее: у записей есть устойчивый id.
  const localStatic = await trade(source.trade, 'static')
  const localById = new Map(realEntries(localStatic).map((e) => [e.id, e.text]))
  const items = {}
  for (const entry of realEntries(enStatic)) {
    const local = localById.get(entry.id)
    if (local && local !== entry.text) items[entry.text] = local.trim()
  }

  const untranslated = [...marketNames].filter((name) => !items[name])
  let fromWiki = 0
  for (const name of untranslated) {
    const html = await get(poe2db(encodeURIComponent(name.replaceAll(' ', '_'))), 'text').catch(() => '')
    const title = decodeHtml(/<title>([^<]*?) - (?:PoE2DB|流亡2)/.exec(html)?.[1]?.trim() ?? '')
    if (title && title !== name) {
      items[name] = title
      fromWiki++
    }
    await sleep(300)
  }

  // --- Базы: страницы классов poe2db.
  const bases = {}
  const pageNames = new Map()
  for (const cls of catalog) {
    const html = await get(poe2db(cls.name.replaceAll(' ', '_')), 'text').catch((e) => {
      log(`класс «${cls.name}»: страница не открылась (${e.message})`)
      return ''
    })
    for (const [, href, text] of html.matchAll(/<a[^>]*href="([A-Za-z0-9_%'.&#;-]+)"[^>]*>([^<]{2,80})<\/a>/g)) {
      const en = decodeURIComponent(decodeHtml(href)).replaceAll('_', ' ')
      const local = decodeHtml(text).trim()
      if (local !== en) pageNames.set(en, local)
    }
    for (const base of cls.bases) {
      // В адресах poe2db апострофы из имён выброшены: «Falconer's Jacket» → «Falconers_Jacket».
      const local = pageNames.get(base.name) ?? pageNames.get(base.name.replaceAll("'", ''))
      if (local) bases[base.name] = local
    }
    await sleep(500)
  }

  // --- Уники: в справочнике предметов идентификаторов нет, но уники в обоих языках идут в одном порядке.
  // (Базы там отсортированы по-разному, поэтому для них этот способ не годится.)
  const localItems = await trade(source.trade, 'items')
  const uniques = {}
  const uniqueBases = {}
  for (const group of enItems.result) {
    const localGroup = localItems.result.find((g) => g.id === group.id)
    const en = group.entries.filter((e) => e.flags?.unique)
    const local = (localGroup?.entries ?? []).filter((e) => e.flags?.unique)
    const pair = (entry, match) => {
      if (match.name.trim() !== entry.name) uniques[entry.name] = match.name.trim()
      // Заодно получаем перевод базы, на которой лежит уник: пригодится для сверки с poe2db.
      if (match.type.trim() !== entry.type) uniqueBases[entry.type] = match.type.trim()
    }
    if (en.length === local.length) {
      en.forEach((entry, i) => pair(entry, local[i]))
      continue
    }
    // Списки разной длины (в переводе нет пары уников): сопоставляем по базам, перевод которых знает poe2db.
    // Внутри одной базы порядок тот же; базы, где число уников не совпало, пропускаем.
    const byType = (list) => Map.groupBy(list, (e) => e.type.trim())
    const enByType = byType(en)
    const localByType = byType(local)
    let matched = 0
    for (const [type, list] of enByType) {
      const localList = localByType.get(bases[type] ?? type)
      if (localList?.length !== list.length) continue
      list.forEach((entry, i) => pair(entry, localList[i]))
      matched += list.length
    }
    log(`уники «${group.id}»: в английском списке ${en.length}, в переводе ${local.length} — по базам сопоставлено ${matched}`)
  }

  // --- Сверка: порядок уников на трейде — совпадение, а не гарантия, поэтому проверяем его независимым источником.
  // База уника по трейду должна называться так же, как эта база по poe2db.
  const conflicts = Object.entries(uniqueBases).filter(([en, local]) => bases[en] && bases[en] !== local)
  if (conflicts.length > 5) {
    throw new Error(
      `Порядок уников на трейде, похоже, разошёлся: ${conflicts.length} баз названы иначе, чем на poe2db. ` +
        `Примеры: ${conflicts.slice(0, 3).map(([en, local]) => `${en}: «${local}» против «${bases[en]}»`).join('; ')}. Файл не обновлён.`,
    )
  }
  // Базы уников, которых нет в справочнике экипировки (самоцветы, фляги, реликвии), берём из трейда.
  for (const [en, local] of Object.entries(uniqueBases)) bases[en] ??= local

  const output = new URL(`../src/data/names-${lang}.json`, import.meta.url)
  await writeFile(output, JSON.stringify({ items: sorted(items), bases: sorted(bases), uniques: sorted(uniques) }) + '\n')

  const total = catalog.reduce((n, c) => n + c.bases.length, 0)
  const translated = catalog.reduce((n, c) => n + c.bases.filter((b) => bases[b.name]).length, 0)
  const stillEnglish = [...marketNames].filter((name) => !items[name])
  log(`предметы с рынка: ${Object.keys(items).length} (из них с poe2db: ${fromWiki})`)
  log(`  на рынке лиги «${league}» без перевода: ${stillEnglish.length}${stillEnglish.length ? ` (${stillEnglish.slice(0, 8).join(', ')})` : ''}`)
  log(`уники: ${Object.keys(uniques).length}`)
  log(`базы экипировки: ${translated} из ${total}; расхождений с трейдом: ${conflicts.length}`)
  if (conflicts.length) log(`  расхождения: ${conflicts.map(([en, local]) => `${en}: трейд «${local}», poe2db «${bases[en]}»`).join('; ')}`)
}
