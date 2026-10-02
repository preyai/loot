// Собирает сведения о том, какие уники нельзя получить сферой удачи, в src/data/unique-drops.json.
// Запускать после патчей игры: npm run update-uniques
//
// Источник — база данных вики poe2wiki.net: у уника с ограниченным выпадением (только с босса,
// только из особого источника) шансинг не срабатывает.
import { writeFile } from 'node:fs/promises'

const API = 'https://www.poe2wiki.net/w/api.php'
const OUTPUT = new URL('../src/data/unique-drops.json', import.meta.url)
const PAGE = 500

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
/** Вики отдаёт текст с HTML-сущностями: «Atziri&#039;s Rule». */
const decode = (text) =>
  text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&(\w+);/g, (all, name) => ENTITIES[name] ?? all)

/** Оставляет от описания источника простой текст: без ссылок вики и всплывающих карточек предметов. */
const plain = (text) =>
  decode(text)
    // От всплывающей карточки предмета остаётся только ссылка с его названием.
    .replace(/<span class="hoverbox__display.*?class=item-icon\]\]/gs, '')
    .replace(/\[\[File:[^\]]*\]\]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

const rows = []
for (let offset = 0; ; offset += PAGE) {
  const query = new URLSearchParams({
    action: 'cargoquery',
    format: 'json',
    tables: 'items',
    fields: 'items.name,items.is_drop_restricted,items.drop_enabled,items.drop_text',
    where: 'items.rarity_id="unique"',
    order_by: 'items.name',
    limit: String(PAGE),
    offset: String(offset),
  })
  const res = await fetch(`${API}?${query}`, { headers: { 'User-Agent': 'loot-filter-editor/0.1 (personal project)' } })
  if (!res.ok) throw new Error(`вики: HTTP ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(`вики: ${data.error.info ?? JSON.stringify(data.error)}`)
  const page = data.cargoquery.map((row) => row.title)
  rows.push(...page)
  if (page.length < PAGE) break
}

const known = []
const restricted = {}
for (const row of rows) {
  const name = decode(row.name)
  known.push(name)
  if (row['drop enabled'] === '0') restricted[name] = 'Cannot drop'
  else if (row['is drop restricted'] === '1') restricted[name] = plain(row['drop text'] ?? '') || 'Drop-restricted'
}

// known — все уники, о которых вики знает: уник вне этого списка — «нет данных», а не «шансится».
await writeFile(OUTPUT, JSON.stringify({ known: [...new Set(known)].sort(), restricted }) + '\n')
console.log(`уников в вики: ${known.length}, с ограниченным выпадением: ${Object.keys(restricted).length} → src/data/unique-drops.json`)
