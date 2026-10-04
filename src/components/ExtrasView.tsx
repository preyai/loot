import { EXTRA_GROUPS, extraKey } from '../extras'
import { keyOf } from '../i18n'
import { useI18n } from '../i18n-react'
import type { UpdateConfig } from '../store'
import { TIER_IDS, type Config, type ExtraChoice } from '../types'
import { ItemLabel } from './ItemLabel'

interface Props {
  config: Config
  update: UpdateConfig
}

const CHOICES: ExtraChoice[] = [...TIER_IDS, 'hide', 'off']

export function ExtrasView({ config, update }: Props) {
  const { t, name } = useI18n()
  const changed = Object.keys(config.extras).length

  const setChoice = (key: string, choice: ExtraChoice, fallback: ExtraChoice) =>
    update((c) => {
      const { [key]: _old, ...rest } = c.extras
      // Храним только отличия от значений по умолчанию: новые правила подхватят свои умолчания.
      return { ...c, extras: choice === fallback ? rest : { ...rest, [key]: choice } }
    })
  const toggleGroup = (id: string, on: boolean) =>
    update((c) => ({ ...c, disabledExtras: on ? c.disabledExtras.filter((g) => g !== id) : [...c.disabledExtras, id] }))

  return (
    <div>
      <header className="page-header">
        <h1>{t('nav.extras')}</h1>
      </header>
      <p className="note">{t('extras.note')}</p>

      {EXTRA_GROUPS.map((group) => {
        const on = !config.disabledExtras.includes(group.id)
        return (
          <section key={group.id} className="panel">
            <h2>
              <label className="check">
                <input type="checkbox" checked={on} onChange={(e) => toggleGroup(group.id, e.target.checked)} />
                {t(keyOf('extraGroup', group.id))}
              </label>
            </h2>
            <fieldset className="plain" disabled={!on}>
              {group.rules.map((rule) => {
                const key = extraKey(group, rule)
                const choice = config.extras[key] ?? rule.tier
                const label = t(keyOf('extra', key))
                return (
                  <div key={key} className="style-row" data-focus={key}>
                    <div className="style-row-head extra-row">
                      <span className="style-row-title">
                        {label}
                        {rule.unhideable && <span className="count unhideable"> · {t('items.unhideable')}</span>}
                      </span>
                      <div className="ground">
                        <ItemLabel
                          name={rule.sample ? name(rule.sample) : label}
                          style={choice === 'hide' || choice === 'off' ? null : config.tiers[choice]}
                        />
                      </div>
                      <select
                        aria-label={label}
                        value={choice}
                        onChange={(e) => setChoice(key, e.target.value as ExtraChoice, rule.tier)}
                      >
                        {CHOICES.filter((c) => !(rule.unhideable && c === 'hide')).map((c) => (
                          <option key={c} value={c}>
                            {c === 'hide' ? t('extras.hide') : c === 'off' ? t('extras.off') : t(keyOf('tier', c))}
                            {c === rule.tier ? ` ${t('extras.default')}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )
              })}
            </fieldset>
          </section>
        )
      })}

      <div className="actions">
        <button
          disabled={changed === 0 && config.disabledExtras.length === 0}
          onClick={() => confirm(t('extras.resetConfirm')) && update((c) => ({ ...c, extras: {}, disabledExtras: [] }))}
        >
          {t('waystones.reset')}
        </button>
      </div>
    </div>
  )
}
