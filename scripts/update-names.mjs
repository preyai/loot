// Собирает русские названия предметов в src/data/names-ru.json.
// Запускать после патчей игры, вслед за update-bases: npm run update-names
//
// Источники:
//   • валюта и прочее с рынка — справочник валют официального трейда (совпадение по идентификатору);
//   • базы экипировки — страницы классов poe2db (ссылка содержит английское имя, текст — русское);
//   • уники — справочник предметов официального трейда (по порядку в списке уников), сверка с poe2db.
import { readFile, writeFile } from 'node:fs/promises'

const HEADERS = { 'User-Agent': 'loot-filter-editor/0.1 (personal project)' }
const OUTPUT = new URL('../src/data/names-ru.json', import.meta.url)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function get(url, as = 'json') {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return as === 'json' ? res.json() : res.text()
}

const trade = (lang, file) => get(`https://${lang === 'ru' ? 'ru' : 'www'}.pathofexile.com/api/trade2/data/${file}`)
const hasCyrillic = (text) => /[а-яё]/i.test(text)
// В разметке poe2db апостроф в именах записан HTML-сущностью.
const decodeHtml = (text) => text.replace(/&#0?39;|&apos;|&rsquo;/g, "'").replace(/&amp;/g, '&')

// --- Валюта и прочее: у записей есть устойчивый id.
const [enStatic, ruStatic] = await Promise.all([trade('en', 'static'), trade('ru', 'static')])
// «sep» — разделители списка: id у них общий, сопоставлять по нему нельзя.
const realEntries = (data) => data.result.flatMap((g) => g.entries).filter((e) => e.id !== 'sep')
const ruById = new Map(realEntries(ruStatic).map((e) => [e.id, e.text]))
const items = {}
for (const entry of realEntries(enStatic)) {
  const ru = ruById.get(entry.id)
  if (ru && ru !== entry.text) items[entry.text] = ru.trim()
}

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
const untranslated = [...marketNames].filter((name) => !items[name])
let fromWiki = 0
for (const name of untranslated) {
  const html = await get(`https://poe2db.tw/ru/${encodeURIComponent(name.replaceAll(' ', '_'))}`, 'text').catch(() => '')
  const title = /<title>([^<]*?) - PoE2DB/.exec(html)?.[1]?.trim()
  if (title && hasCyrillic(title)) {
    items[name] = decodeHtml(title)
    fromWiki++
  }
  await sleep(300)
}

// --- Уники: в справочнике предметов идентификаторов нет, но уники в обоих языках идут в одном порядке.
// (Базы там отсортированы по-разному, поэтому для них этот способ не годится.)
const [enItems, ruItems] = await Promise.all([trade('en', 'items'), trade('ru', 'items')])
const uniques = {}
const uniqueBases = {}
for (const group of enItems.result) {
  const ruGroup = ruItems.result.find((g) => g.id === group.id)
  const en = group.entries.filter((e) => e.flags?.unique)
  const ru = (ruGroup?.entries ?? []).filter((e) => e.flags?.unique)
  if (en.length !== ru.length) {
    console.warn(`  уники «${group.id}»: в английском списке ${en.length}, в русском ${ru.length} — группа пропущена`)
    continue
  }
  en.forEach((entry, i) => {
    uniques[entry.name] = ru[i].name.trim()
    // Заодно получаем перевод базы, на которой лежит уник: пригодится для сверки с poe2db.
    uniqueBases[entry.type] = ru[i].type.trim()
  })
}

// --- Базы: страницы классов poe2db.
const catalog = JSON.parse(await readFile(new URL('../src/data/bases.json', import.meta.url), 'utf8'))
const bases = {}
const pageNames = new Map()
for (const cls of catalog) {
  const html = await get(`https://poe2db.tw/ru/${cls.name.replaceAll(' ', '_')}`, 'text').catch((e) => {
    console.warn(`  класс «${cls.name}»: страница не открылась (${e.message})`)
    return ''
  })
  for (const [, href, text] of html.matchAll(/<a[^>]*href="([A-Za-z0-9_%'.&#;-]+)"[^>]*>([^<]{2,80})<\/a>/g)) {
    const en = decodeURIComponent(decodeHtml(href)).replaceAll('_', ' ')
    if (hasCyrillic(text)) pageNames.set(en, decodeHtml(text).trim())
  }
  for (const base of cls.bases) {
    // В адресах poe2db апострофы из имён выброшены: «Falconer's Jacket» → «Falconers_Jacket».
    const ru = pageNames.get(base.name) ?? pageNames.get(base.name.replaceAll("'", ''))
    if (ru) bases[base.name] = ru
  }
  await sleep(500)
}

// --- Сверка: порядок уников на трейде — совпадение, а не гарантия, поэтому проверяем его независимым источником.
// База уника по трейду должна называться так же, как эта база по poe2db.
const conflicts = Object.entries(uniqueBases).filter(([en, ru]) => bases[en] && bases[en] !== ru)
if (conflicts.length > 5) {
  throw new Error(
    `Порядок уников на трейде, похоже, разошёлся: ${conflicts.length} баз названы иначе, чем на poe2db. ` +
      `Примеры: ${conflicts.slice(0, 3).map(([en, ru]) => `${en}: «${ru}» против «${bases[en]}»`).join('; ')}`,
  )
}
// Базы уников, которых нет в справочнике экипировки (самоцветы, фляги, реликвии), берём из трейда.
for (const [en, ru] of Object.entries(uniqueBases)) bases[en] ??= ru

const sorted = (map) => Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)))
await writeFile(OUTPUT, JSON.stringify({ items: sorted(items), bases: sorted(bases), uniques: sorted(uniques) }) + '\n')

const total = catalog.reduce((n, c) => n + c.bases.length, 0)
const translated = catalog.reduce((n, c) => n + c.bases.filter((b) => bases[b.name]).length, 0)
const stillEnglish = [...marketNames].filter((name) => !items[name])
console.log(`предметы с рынка: ${Object.keys(items).length} (из них с poe2db: ${fromWiki})`)
console.log(`  на рынке лиги «${league}» без перевода: ${stillEnglish.length}${stillEnglish.length ? ` (${stillEnglish.slice(0, 8).join(', ')})` : ''}`)
console.log(`уники: ${Object.keys(uniques).length}`)
console.log(`базы экипировки: ${translated} из ${total}; расхождений с трейдом: ${conflicts.length}`)
for (const cls of catalog) {
  const missing = cls.bases.filter((b) => !bases[b.name])
  if (missing.length) console.log(`  ${cls.name}: без перевода ${missing.length} из ${cls.bases.length} (${missing.slice(0, 4).map((b) => b.name).join(', ')})`)
}
if (conflicts.length) console.log('  расхождения:', conflicts.map(([en, ru]) => `${en}: трейд «${ru}», poe2db «${bases[en]}»`).join('; '))
