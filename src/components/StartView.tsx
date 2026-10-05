import { useState } from 'react'
import { generateFilter } from '../filter'
import { filterFileName, type GameFolder } from '../gameFolder'
import { keyOf } from '../i18n'
import { useI18n } from '../i18n-react'
import { applyLevel, MARKET_LEVELS, RULE_PRESETS, type RulePreset } from '../presets'
import type { UpdateConfig } from '../store'
import type { Config, MarketSnapshot } from '../types'
import { usePresetInputs } from '../usePresetInputs'
import { downloadFilter, FilterTarget } from './ExportView'

interface Props {
  config: Config
  update: UpdateConfig
  snapshot: MarketSnapshot | null
  gameFolder: GameFolder
}

/** Куда идти дальше: страница и что на ней настраивается. */
const NEXT = [
  ['styles', 'styles'],
  ['bases', 'bases'],
  ['currency', 'market'],
  ['preview', 'preview'],
  ['filters', 'filters'],
] as const

/** Стартовая страница: строгость, название и папка, сохранение в игру — фильтр за три шага. */
export function StartView({ config, update, snapshot, gameFolder }: Props) {
  const { t } = useI18n()
  const { shares, chancing } = usePresetInputs(config, snapshot)
  // Набор, который ждёт подтверждения: он заменит уже настроенные правила баз.
  const [pending, setPending] = useState<RulePreset | null>(null)
  const ownRules = config.baseRules.filter((rule) => rule.source !== 'trade').length
  const name = filterFileName(config.filterName).replace(/\.filter$/, '')

  const choose = (preset: RulePreset) => {
    setPending(null)
    update((c) => applyLevel(c, preset, shares, t, chancing))
  }

  return (
    <div className="start">
      <header className="page-header">
        <h1>{t('start.title')}</h1>
      </header>
      <p className="start-intro">{t('start.intro')}</p>

      <section className="panel start-step">
        <h2>
          <span className="step-number">1</span>
          {t('start.step1')}
        </h2>
        <p className="note">{t('start.step1Note')}</p>
        <div className="presets">
          {RULE_PRESETS.map((preset) => {
            const chosen = config.level === preset.id
            return (
              <article key={preset.id} className={chosen ? 'preset preset--chosen' : 'preset'}>
                <h3>{t(keyOf('preset', `${preset.id}.title`))}</h3>
                <p>{t(keyOf('preset', `${preset.id}.summary`))}</p>
                <p className="note">{t(keyOf('start.market', MARKET_LEVELS[preset.id].minTier))}</p>
                {pending?.id === preset.id ? (
                  <div className="confirm-row">
                    <span>{t('start.replace', { n: ownRules })}</span>
                    <button className="primary" onClick={() => choose(preset)}>
                      {t('filters.yes')}
                    </button>
                    <button onClick={() => setPending(null)}>{t('filters.cancel')}</button>
                  </div>
                ) : (
                  <button
                    className={chosen ? undefined : 'primary'}
                    disabled={chosen}
                    // Уже настроенные правила баз — сначала спросить: набор их заменит.
                    onClick={() => (ownRules > 0 ? setPending(preset) : choose(preset))}
                  >
                    {chosen ? `✓ ${t('start.chosen')}` : t('start.choose')}
                  </button>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className="panel start-step export-settings">
        <h2>
          <span className="step-number">2</span>
          {t('start.step2')}
        </h2>
        <FilterTarget config={config} update={update} gameFolder={gameFolder} />
      </section>

      <section className="panel start-step">
        <h2>
          <span className="step-number">3</span>
          {t('start.step3')}
        </h2>
        <div className="actions">
          {gameFolder.supported && gameFolder.folder && (
            <button className="primary" disabled={!snapshot} onClick={() => snapshot && gameFolder.save(generateFilter(snapshot, config), config.filterName)}>
              {t('export.save')}
            </button>
          )}
          <button
            className={gameFolder.folder ? undefined : 'primary'}
            disabled={!snapshot}
            onClick={() => snapshot && downloadFilter(generateFilter(snapshot, config), config.filterName)}
          >
            {t('top.download')}
          </button>
        </div>
        <ol className="note steps">
          {!gameFolder.folder && (
            <li>
              {t('export.step1')} <code>{t('export.folder')}</code>.
            </li>
          )}
          <li>{t('export.step2', { name })}</li>
          <li>{t('start.refresh')}</li>
        </ol>
      </section>

      <section className="panel">
        <h2>{t('start.next')}</h2>
        <ul className="start-next">
          {NEXT.map(([route, key]) => (
            <li key={key}>
              <a href={`#/${route}`}>{t(keyOf('start.next', `${key}.title`))}</a>
              <span className="note">{t(keyOf('start.next', `${key}.text`))}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
