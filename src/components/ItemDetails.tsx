import { useEffect, useRef } from 'react'
import { EXTRA_GROUPS, extraKey } from '../extras'
import type { Appearance, BlockRole, FilterBlock, TraceEntry } from '../filterEval'
import { keyOf } from '../i18n'
import { useI18n } from '../i18n-react'
import type { SimulatedItem } from '../lootSim'
import { SECTIONS } from '../sections'
import { playAlertSound } from '../sound'
import type { Config } from '../types'
import { ItemLabel } from './ItemLabel'

interface Props {
  item: SimulatedItem
  title: string
  look: Appearance
  entries: TraceEntry[]
  config: Config
  onClose: () => void
}

/** Понятное название блока и страница, где он настраивается; комментарии блоков пишет наш генератор. */
function useBlockTitle(config: Config) {
  const { t } = useI18n()
  return (block: FilterBlock): { title: string; href: string | null } => {
    const [head, ...rest] = block.comment.split(' / ')
    const tail = rest.join(' / ')
    const rule = /^rule (\d+)$/.exec(tail)
    if (head === 'Bases' && rule) {
      const index = Number(rule[1]) - 1
      return { title: `${t('nav.bases')}: ${config.baseRules[index]?.name ?? tail}`, href: '#/bases' }
    }
    if (head === 'Other') {
      const [group, id] = rest
      const known = EXTRA_GROUPS.find((g) => g.id === group)?.rules.find((r) => r.id === id)
      const label = known ? t(keyOf('extra', extraKey({ id: group, rules: [] }, known))) : tail
      return { title: `${t('nav.extras')}: ${label}`, href: '#/extras' }
    }
    if (head === 'Gold') return { title: `${t('nav.gold')}: ${tail}`, href: '#/gold' }
    if (head === 'Waystones') return { title: `${t('nav.waystones')}: ${tail}`, href: '#/waystones' }
    if (head === 'Gear') return { title: t('rules.rest'), href: '#/bases' }
    const section = SECTIONS.find((s) => s.label === head)
    if (section) {
      // «Currency / A» → «Валюта: A — очень ценное», «… / stacks of 20+» и «… / hidden» — как есть.
      const tier = /^[SABCDE]$/.test(tail) ? t(keyOf('tier', tail)) : tail
      return { title: `${t(keyOf('section', section.id))}: ${tier}`, href: `#/${section.id}` }
    }
    return { title: block.comment || `${block.action}`, href: null }
  }
}

const ROLE_ORDER: BlockRole[] = ['decorator', 'decisive', 'unreached', 'near']

export function ItemDetails({ item, title, look, entries, config, onClose }: Props) {
  const { t } = useI18n()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => ref.current?.showModal(), [])
  const blockTitle = useBlockTitle(config)

  const properties = [
    item.rarity === 'Unique' ? t('preview.unique') : item.itemClass === 'Gold' ? null : t(`rarity.${item.rarity}` as 'rarity.Normal'),
    item.itemClass !== item.label ? item.itemClass : null,
    item.itemLevel > 1 ? t('preview.itemLevel', { n: item.itemLevel }) : null,
    item.stackSize > 1 ? t('preview.stack', { n: item.stackSize }) : null,
    item.waystoneTier ? t('preview.tier', { n: item.waystoneTier }) : null,
    item.gemLevel ? t('preview.gemLevel', { n: item.gemLevel }) : null,
    item.quality > 0 ? t('preview.quality', { n: item.quality }) : null,
    item.sockets > 0 ? t('preview.sockets', { n: item.sockets }) : null,
    item.unidentifiedTier > 0 ? t('preview.modTier', { n: item.unidentifiedTier }) : null,
    item.explicitMods > 0 ? t('preview.mods', { n: item.explicitMods }) : null,
    item.corrupted ? t('preview.corrupted') : null,
    item.enchanted ? t('preview.enchanted') : null,
  ].filter((line): line is string => line !== null)

  const sorted = [...entries].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.block.line - b.block.line)

  return (
    <dialog
      ref={ref}
      className="unique-card item-details"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="unique-card-body">
        <header>
          <div className="ground ground--wide">
            <ItemLabel name={title} style={look.visible ? look.style : null} />
          </div>
          <div className="unique-card-english">{item.label}</div>
          <button className="unique-card-close" aria-label={t('unique.close')} onClick={onClose}>
            ✕
          </button>
        </header>

        <section>
          <h3>{t('preview.properties')}</h3>
          <ul className="props">
            {properties.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <section>
          <h3>{t('preview.result')}</h3>
          <p>
            {look.visible ? t('preview.shown') : t('preview.hidden')}
            {look.visible && look.style.effect && ` · ${t('styles.beam')}: ${t(keyOf('color', look.style.effect.color))}`}
            {look.visible && look.style.icon && ` · ${t('styles.icon')}: ${t(keyOf('color', look.style.icon.color))}, ${t(keyOf('shape', look.style.icon.shape))}`}
            {look.visible && look.style.sound && (
              <>
                {' · '}
                <button className="sound-play" onClick={() => playAlertSound(look.style.sound!.id, look.style.sound!.volume).catch(() => {})}>
                  ▶ {t('preview.sound', { n: look.style.sound.id })}
                </button>
              </>
            )}
          </p>
        </section>

        <section>
          <h3>{t('preview.rules')}</h3>
          {!entries.some((e) => e.role !== 'near') && <p className="note">{t('preview.noRules')}</p>}
          <ol className="trace">
            {sorted.map(({ block, role, failed }) => {
              const { title: name, href } = blockTitle(block)
              return (
                <li key={block.line} className={`trace-${role}`}>
                  <div className="trace-head">
                    <span className="trace-role">{t(keyOf('preview.role', role))}</span>
                    <span className="trace-title">{name}</span>
                    {href && (
                      <a href={href} onClick={onClose}>
                        {t('preview.open')}
                      </a>
                    )}
                  </div>
                  {/* Сам блок фильтра: условия, а у «почти подошедших» невыполненные выделены. */}
                  <pre className="trace-block">
                    <span>{`${block.action} # ${block.comment}   (${t('preview.line', { n: block.line })})`}</span>
                    {block.conditions.map((condition) => (
                      <span key={condition} className={failed.includes(condition) ? 'trace-failed' : undefined}>
                        {`\n    ${condition}`}
                      </span>
                    ))}
                    {block.continues && <span>{'\n    Continue'}</span>}
                  </pre>
                </li>
              )
            })}
          </ol>
        </section>
      </div>
    </dialog>
  )
}
