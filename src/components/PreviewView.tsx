import { useMemo, useState } from 'react'
import { evaluate, parseFilter, trace, type Appearance } from '../filterEval'
import { generateFilter } from '../filter'
import { useI18n } from '../i18n-react'
import { generateLoot, lootTemplates, type SimulatedItem } from '../lootSim'
import type { Config, MarketSnapshot } from '../types'
import { ItemDetails } from './ItemDetails'
import { ItemLabel } from './ItemLabel'

interface Props {
  config: Config
  snapshot: MarketSnapshot
}

const COUNTS = [30, 60, 120]

/** Цвета лучей и значков на миникарте — как их называет фильтр. */
const COLORS: Record<string, string> = {
  Red: '#ff3b30',
  Green: '#3ccf4e',
  Blue: '#3b7bff',
  Brown: '#a0703a',
  White: '#f2f2f2',
  Yellow: '#ffd60a',
  Cyan: '#40e0ff',
  Grey: '#9a9a9a',
  Orange: '#ff9500',
  Pink: '#ff6fcf',
  Purple: '#b061ff',
}

const SHAPES: Record<string, string> = {
  Circle: '●',
  Diamond: '◆',
  Hexagon: '⬢',
  Square: '■',
  Star: '★',
  Triangle: '▲',
  Cross: '✚',
  Moon: '☾',
  Raindrop: '⬮',
  Kite: '⬥',
  Pentagon: '⬟',
  UpsideDownHouse: '⬙',
}

export function PreviewView({ config, snapshot }: Props) {
  const { t, name } = useI18n()
  const [area, setArea] = useState(70)
  const [count, setCount] = useState(60)
  const [seed, setSeed] = useState(0)
  const [showHidden, setShowHidden] = useState(true)
  const [opened, setOpened] = useState<SimulatedItem | null>(null)
  // «Только предметы с названием»: все слова запроса — в русском или английском имени, в любом порядке
  // («ключ реликвария» находит «Ключ от Сумеречного Реликвария»), без учёта регистра.
  const [only, setOnly] = useState('')
  const words = useMemo(() => only.toLowerCase().split(/\s+/).filter(Boolean), [only])
  const match = useMemo(() => {
    if (words.length === 0) return undefined
    const has = (text: string) => words.every((word) => text.toLowerCase().includes(word))
    return (english: string) => has(english) || has(name(english))
  }, [words, name])
  const variants = useMemo(
    () => (match ? lootTemplates(snapshot.items, area).filter((template) => template.names.some(match)).length : null),
    [match, snapshot, area],
  )

  // Тот же текст, что уйдёт в файл: предпросмотр не может разойтись с фильтром.
  const blocks = useMemo(() => parseFilter(generateFilter(snapshot, config)), [snapshot, config])
  // seed — только чтобы кнопка давала новую выборку.
  const loot = useMemo(() => generateLoot(snapshot.items, area, count, Math.random, match), [snapshot, area, count, seed, match])
  const shown = useMemo(() => loot.map((item) => ({ item, look: evaluate(blocks, item, area) })), [loot, blocks, area])

  const hidden = shown.filter(({ look }) => !look.visible).length
  const unmatched = shown.filter(({ look }) => !look.block).length
  const visible = shown.filter(({ look }) => showHidden || look.visible)

  const title = (item: SimulatedItem) => {
    if (item.baseType === 'Gold') return t('gold.sample', { n: item.stackSize })
    const label = name(item.label)
    return item.stackSize > 1 ? `${item.stackSize} × ${label}` : label
  }

  const details = (item: SimulatedItem, look: Appearance) =>
    [
      item.label,
      item.rarity === 'Unique' ? t('preview.unique') : item.itemClass === 'Gold' ? null : t(`rarity.${item.rarity}` as 'rarity.Normal'),
      item.itemClass !== item.label && item.itemClass,
      item.itemLevel > 1 && t('preview.itemLevel', { n: item.itemLevel }),
      item.waystoneTier && t('preview.tier', { n: item.waystoneTier }),
      item.quality > 0 && t('preview.quality', { n: item.quality }),
      item.sockets > 0 && t('preview.sockets', { n: item.sockets }),
      item.corrupted && t('preview.corrupted'),
      '',
      look.block ? t('preview.rule', { rule: `${look.block.action} # ${look.block.comment}`, line: look.block.line }) : t('preview.noRule'),
      !look.visible && t('preview.hidden'),
      t('preview.clickHint'),
    ]
      .filter((line) => line !== false && line !== null && line !== undefined && line !== 0)
      .join('\n')

  return (
    <div>
      <header className="page-header">
        <h1>{t('nav.preview')}</h1>
      </header>
      <p className="note">{t('preview.note')}</p>

      <section className="panel preview-controls">
        <label className="check">
          {t('preview.area')}
          <input type="range" min={1} max={84} value={area} onChange={(e) => setArea(Number(e.target.value))} />
          <input type="number" min={1} max={84} value={area} onChange={(e) => setArea(Math.max(1, Math.min(84, Number(e.target.value))))} />
        </label>
        <label className="check">
          {t('preview.count')}
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {COUNTS.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
          {t('preview.showHidden')}
        </label>
        <button className="primary" onClick={() => setSeed(seed + 1)}>
          {t('preview.generate')}
        </button>
        <label className="check preview-only">
          {t('preview.only')}
          <input type="search" value={only} placeholder={t('preview.onlyPlaceholder')} onChange={(e) => setOnly(e.target.value)} />
          {variants !== null && <span className="count">{variants > 0 ? t('preview.variants', { n: variants }) : t('preview.noVariants')}</span>}
        </label>
        <span className="count">{t('preview.stats', { shown: loot.length - hidden, hidden, none: unmatched })}</span>
      </section>

      <div className="ground preview-ground">
        {visible.map(({ item, look }) => (
          <button
            key={item.id}
            className={look.visible ? 'preview-item' : 'preview-item preview-item--hidden'}
            title={details(item, look)}
            onClick={() => setOpened(item)}
          >
            {look.visible && look.style.effect && (
              <span
                className={look.style.effect.temp ? 'preview-beam preview-beam--temp' : 'preview-beam'}
                style={{ background: COLORS[look.style.effect.color] ?? '#fff' }}
              />
            )}
            <ItemLabel name={title(item)} style={look.visible ? look.style : null} />
            {look.visible && (look.style.icon || look.style.sound) && (
              <span className="preview-marks">
                {look.style.icon && (
                  <span
                    style={{ color: COLORS[look.style.icon.color] ?? '#fff', fontSize: [16, 13, 10][look.style.icon.size] }}
                    aria-hidden="true"
                  >
                    {SHAPES[look.style.icon.shape] ?? '●'}
                  </span>
                )}
                {look.style.sound && <span aria-hidden="true">♪{look.style.sound.file ? '★' : look.style.sound.id}</span>}
              </span>
            )}
          </button>
        ))}
      </div>

      {opened && (
        <ItemDetails
          key={opened.id}
          item={opened}
          title={title(opened)}
          look={evaluate(blocks, opened, area)}
          entries={trace(blocks, opened, area)}
          config={config}
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  )
}
