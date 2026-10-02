import { useEffect, useRef } from 'react'
import { uniqueTradeUrl, wikiUrl } from '../bases'
import { chanceOf, dropSource } from '../chancing'
import { keyOf } from '../i18n'
import { useI18n } from '../i18n-react'
import { formatPrice } from '../tiering'
import type { Currency, MarketSnapshot, ModLine, UniqueInfo } from '../types'
import { EnglishName } from './ItemName'

interface Props {
  unique: UniqueInfo
  /** Базовый тип, на котором выпадает уник. */
  base: string
  league: string | null
  rates: MarketSnapshot['rates']
  currency: Currency
  onClose: () => void
}

function Mods({ lines, className, variantHint }: { lines: ModLine[]; className: string; variantHint: string }) {
  if (lines.length === 0) return null
  return (
    <ul className={className}>
      {lines.map((line, i) => (
        // Свойства-варианты: в игре у предмета будет только одно из них.
        <li key={i} className={line.variant ? 'variant' : undefined} title={line.variant ? variantHint : undefined}>
          {line.text}
        </li>
      ))}
    </ul>
  )
}

/** Карточка уника в духе игровой подсказки: свойства, цена и ссылки. */
export function UniqueCard({ unique, base, league, rates, currency, onClose }: Props) {
  const { t, lang, name } = useI18n()
  const ref = useRef<HTMLDialogElement>(null)
  // showModal даёт затемнение, ловушку фокуса и закрытие по Esc без своего кода.
  useEffect(() => ref.current?.showModal(), [])

  const change = unique.divine !== null && unique.weekChange !== null ? unique.weekChange : null
  const variant = t('unique.variant')
  const chance = chanceOf(unique.name)
  const plain = (lines: string[]) => lines.map((text) => ({ text }))
  const hasMods = unique.properties.length + unique.implicits.length + unique.explicits.length + unique.skills.length > 0

  return (
    <dialog
      ref={ref}
      className="unique-card"
      aria-label={name(unique.name)}
      onClose={onClose}
      // Клик по затемнению приходит на сам dialog, клик внутри карточки — на её содержимое.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="unique-card-body">
        <header>
          <div className="unique-card-name">{name(unique.name)}</div>
          <div className="unique-card-base">{name(base)}</div>
          <div className="unique-card-english">
            <EnglishName name={unique.name} /> <EnglishName name={base} />
          </div>
          <button className="unique-card-close" aria-label={t('unique.close')} onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="unique-card-top">
          {unique.icon && <img src={unique.icon} alt="" />}
          <div className="unique-card-market">
            <div className="unique-card-price">
              {formatPrice(unique.divine, rates, currency, t)}
              {change !== null && change !== 0 && (
                <span className={change > 0 ? 'up' : 'down'} title={t('unique.weekChange')}>
                  {change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(0)}%
                </span>
              )}
            </div>
            <div className="count">
              {t('unique.listings', { n: unique.listings })}
              {unique.divine === null && t('unique.tooFew')}
            </div>
            <div className={`unique-card-chance unique-card-chance--${chance}`}>
              {t(keyOf('unique.chance', chance))}
              {/* Источник — текст вики, перевода у него нет. */}
              {chance === 'no' && <span className="count">{dropSource(unique.name)}</span>}
            </div>
            <div className="unique-card-links">
              <a href={wikiUrl(unique.name, lang)} target="_blank" rel="noreferrer">
                poe2db
              </a>
              {league && (
                <a href={uniqueTradeUrl(unique.name, base, league)} target="_blank" rel="noreferrer">
                  {t('rules.trade')}
                </a>
              )}
            </div>
          </div>
        </div>

        <Mods lines={plain(unique.properties)} className="props" variantHint={variant} />
        <Mods lines={plain(unique.requirements)} className="props" variantHint={variant} />
        <Mods lines={plain(unique.skills)} className="mods" variantHint={variant} />
        <Mods lines={unique.implicits} className="mods" variantHint={variant} />
        <Mods lines={unique.explicits} className="mods" variantHint={variant} />
        {unique.flavour && <p className="flavour">{unique.flavour}</p>}
        {hasMods && t('unique.modsNote') && <p className="count unique-card-note">{t('unique.modsNote')}</p>}
      </div>
    </dialog>
  )
}
