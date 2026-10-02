import { useEffect, useRef } from 'react'
import { baseWikiUrl, uniqueTradeUrl } from '../bases'
import { formatPrice } from '../tiering'
import type { Currency, MarketSnapshot, ModLine, UniqueInfo } from '../types'

interface Props {
  unique: UniqueInfo
  /** Базовый тип, на котором выпадает уник. */
  base: string
  league: string | null
  rates: MarketSnapshot['rates']
  currency: Currency
  onClose: () => void
}

function Mods({ lines, className }: { lines: ModLine[]; className: string }) {
  if (lines.length === 0) return null
  return (
    <ul className={className}>
      {lines.map((line, i) => (
        // Свойства-варианты: в игре у предмета будет только одно из них.
        <li key={i} className={line.variant ? 'variant' : undefined} title={line.variant ? 'Один из вариантов' : undefined}>
          {line.text}
        </li>
      ))}
    </ul>
  )
}

/** Карточка уника в духе игровой подсказки: свойства, цена и ссылки. */
export function UniqueCard({ unique, base, league, rates, currency, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  // showModal даёт затемнение, ловушку фокуса и закрытие по Esc без своего кода.
  useEffect(() => ref.current?.showModal(), [])

  const change = unique.divine !== null && unique.weekChange !== null ? unique.weekChange : null

  return (
    <dialog
      ref={ref}
      className="unique-card"
      aria-label={unique.name}
      onClose={onClose}
      // Клик по затемнению приходит на сам dialog, клик внутри карточки — на её содержимое.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="unique-card-body">
        <header>
          <div className="unique-card-name">{unique.name}</div>
          <div className="unique-card-base">{base}</div>
          <button className="unique-card-close" aria-label="Закрыть" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="unique-card-top">
          {unique.icon && <img src={unique.icon} alt="" />}
          <div className="unique-card-market">
            <div className="unique-card-price">
              {formatPrice(unique.divine, rates, currency)}
              {change !== null && change !== 0 && (
                <span className={change > 0 ? 'up' : 'down'} title="Изменение цены за 7 дней">
                  {change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(0)}%
                </span>
              )}
            </div>
            <div className="count">
              Лотов: {unique.listings}
              {unique.divine === null && ' — слишком мало, цене нельзя верить'}
            </div>
            <div className="unique-card-links">
              <a href={baseWikiUrl(unique.name)} target="_blank" rel="noreferrer">
                poe2db
              </a>
              {league && (
                <a href={uniqueTradeUrl(unique.name, base, league)} target="_blank" rel="noreferrer">
                  трейд
                </a>
              )}
            </div>
          </div>
        </div>

        <Mods lines={unique.properties.map((text) => ({ text }))} className="props" />
        <Mods lines={unique.requirements.map((text) => ({ text }))} className="props" />
        <Mods lines={unique.skills.map((text) => ({ text }))} className="mods" />
        <Mods lines={unique.implicits} className="mods" />
        <Mods lines={unique.explicits} className="mods" />
        {unique.flavour && <p className="flavour">{unique.flavour}</p>}
      </div>
    </dialog>
  )
}
