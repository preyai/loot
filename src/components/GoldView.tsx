import { useI18n } from '../i18n-react'
import type { UpdateConfig } from '../store'
import { DEFAULT_GOLD, GOLD_PILES } from '../gold'
import type { Config, GoldConfig } from '../types'
import { StyleRow } from './StyleRow'

interface Props {
  config: Config
  update: UpdateConfig
}

export function GoldView({ config, update }: Props) {
  const { t, locale } = useI18n()
  const gold = config.gold
  const set = (change: Partial<GoldConfig>) => update((c) => ({ ...c, gold: { ...c.gold, ...change } }))
  const sample = (n: number) => t('gold.sample', { n: n.toLocaleString(locale) })
  // Пороги идут по убыванию: средняя куча не может быть больше крупной.
  const smallest = gold.sizes.medium

  return (
    <div>
      <header className="page-header">
        <h1>{t('nav.gold')}</h1>
        <label className="check">
          <input type="checkbox" checked={gold.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          {t('gold.enable')}
        </label>
      </header>

      <p className="note">{t(gold.enabled ? 'gold.note' : 'gold.disabled')}</p>

      <fieldset className="plain" disabled={!gold.enabled}>
        <section className="panel">
          <h2>{t('gold.piles')}</h2>
          {GOLD_PILES.map((pile) => (
            <StyleRow
              key={pile}
              id={`gold-${pile}`}
              title={t(`gold.${pile}`)}
              sample={sample(gold.sizes[pile])}
              style={gold.styles[pile]}
              onChange={(style) => set({ styles: { ...gold.styles, [pile]: style } })}
            >
              <label className="check">
                {t('gold.from')}
                <input
                  type="number"
                  min={1}
                  step={50}
                  aria-label={t(`gold.${pile}`)}
                  value={gold.sizes[pile]}
                  onChange={(e) => set({ sizes: { ...gold.sizes, [pile]: Math.max(1, Math.round(Number(e.target.value))) } })}
                />
              </label>
            </StyleRow>
          ))}
          <StyleRow
            id="gold-small"
            title={t('gold.small', { n: smallest.toLocaleString(locale) })}
            sample={sample(Math.max(1, Math.round(smallest / 10)))}
            style={gold.hideSmall ? null : gold.styles.small}
            note={gold.hideSmall ? t('gold.hidden') : undefined}
            onChange={(style) => set({ styles: { ...gold.styles, small: style } })}
          >
            <label className="check">
              <input type="checkbox" checked={gold.hideSmall} onChange={(e) => set({ hideSmall: e.target.checked })} />
              {t('gold.hideSmall')}
            </label>
          </StyleRow>
        </section>

        <section className="panel">
          <label className="check">
            <input type="checkbox" checked={gold.leveling} onChange={(e) => set({ leveling: e.target.checked })} />
            {t('gold.leveling')}
          </label>
          <p className="note">{t('gold.levelingNote')}</p>
        </section>
      </fieldset>

      <div className="actions">
        <button onClick={() => confirm(t('gold.resetConfirm')) && set(DEFAULT_GOLD)}>{t('waystones.reset')}</button>
      </div>
    </div>
  )
}
