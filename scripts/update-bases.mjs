// Собирает справочник базовых типов экипировки из выгрузки игровых данных RePoE.
// Запускать после патчей игры: npm run update-bases
import { writeFile } from 'node:fs/promises'

const SOURCE = 'https://repoe-fork.github.io/poe2'
const OUTPUT = new URL('../src/data/bases.json', import.meta.url)
const JEWELLERY = new Set(['Amulet', 'Ring', 'Belt'])
// Флаконы, обереги (в данных — UtilityFlask) и самоцветы: в игровых данных у них свои домены, а не «item».
const FLASKS = new Set(['LifeFlask', 'ManaFlask', 'UtilityFlask'])
const JEWELS = new Set(['Jewel'])
const SKIPPED_CLASSES = new Set([
  'HiddenItem',
  'FishingRod',
  // Классы оружия, которыми в игре пока нельзя пользоваться: на poe.ninja нет ни одного персонажа с таким оружием.
  // Когда класс выпустят, строку отсюда нужно убрать.
  'Dagger',
  'Flail',
  'One Hand Axe',
  'One Hand Sword',
  'Two Hand Axe',
  'Two Hand Sword',
])

const load = async (file) => {
  const res = await fetch(`${SOURCE}/${file}`)
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
  return res.json()
}

const [items, itemClasses] = await Promise.all([load('base_items.min.json'), load('item_classes.min.json')])

// В игровых данных есть базы, которые ещё не выпадают: целые классы вроде мечей и кинжалов и отдельные заготовки.
// Выпущенными считаем те, что знает официальный трейд.
const tradeRes = await fetch('https://www.pathofexile.com/api/trade2/data/items', {
  headers: { 'User-Agent': 'loot-filter-editor/0.1 (personal project)' },
})
if (!tradeRes.ok) throw new Error(`трейд: HTTP ${tradeRes.status}`)
const tradeable = new Set((await tradeRes.json()).result.flatMap((group) => group.entries.map((entry) => entry.type)))

const classes = new Map()
for (const [id, item] of Object.entries(items)) {
  if ((item.domain !== 'item' && !FLASKS.has(item.item_class) && !JEWELS.has(item.item_class)) || item.release_state !== 'released' || SKIPPED_CLASSES.has(item.item_class)) continue
  // Базы, которые существуют только под уникальные предметы.
  if (id.includes('Unique')) continue
  if (!tradeable.has(item.name)) continue

  // В фильтре класс называется так же, как в игре («Quarterstaves»), а не по внутреннему id («Warstaff»).
  const className = itemClasses[item.item_class]?.name
  if (!className) continue
  const props = item.properties ?? {}
  const group = FLASKS.has(item.item_class)
    ? 'flasks'
    : JEWELS.has(item.item_class)
      ? 'jewels'
      : JEWELLERY.has(item.item_class)
      ? 'jewellery'
      : item.tags.includes('armour')
        ? 'armour'
        : 'weapon'
  // a — броня, e — уклонение, s — энергощит
  const defence = (props.armour ? 'a' : '') + (props.evasion ? 'e' : '') + (props.energy_shield ? 's' : '')
  // Путь к иконке без общего начала и расширения: так справочник заметно меньше.
  const icon = item.visual_identity?.dds_file?.replace('Art/2DItems/', '').replace('.dds', '')

  const entry = classes.get(className) ?? { name: className, group, bases: new Map() }
  classes.set(className, entry)
  const known = entry.bases.get(item.name)
  // Одно имя встречается у нескольких записей — берём вариант с наибольшим уровнем выпадения.
  if (!known || item.drop_level > known.drop) {
    entry.bases.set(item.name, { name: item.name, drop: item.drop_level, ...(defence && { defence }), ...(icon && { icon }) })
  }
}

const GROUP_ORDER = ['weapon', 'armour', 'jewellery', 'flasks', 'jewels']
const result = [...classes.values()]
  .map((c) => ({ ...c, bases: [...c.bases.values()].sort((a, b) => b.drop - a.drop || a.name.localeCompare(b.name)) }))
  .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.name.localeCompare(b.name))

await writeFile(OUTPUT, JSON.stringify(result) + '\n')
console.log(`${result.length} классов, ${result.reduce((n, c) => n + c.bases.length, 0)} баз → src/data/bases.json`)
for (const c of result) console.log(`  ${c.group.padEnd(9)} ${c.name.padEnd(20)} ${c.bases.length}`)
