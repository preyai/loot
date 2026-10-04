import { useMemo, useState } from 'react'
import { generateFilter } from '../filter'
import { filterFileName, GAME_FOLDER_NAME, type GameFolder } from '../gameFolder'
import { useI18n } from '../i18n-react'
import type { UpdateConfig } from '../store'
import type { Config, MarketSnapshot } from '../types'

export function downloadFilter(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filterFileName(name)
  a.click()
  URL.revokeObjectURL(url)
}

interface Props {
  snapshot: MarketSnapshot
  config: Config
  update: UpdateConfig
  gameFolder: GameFolder
}

export function ExportView({ snapshot, config, update, gameFolder }: Props) {
  const { t, locale } = useI18n()
  const text = useMemo(() => generateFilter(snapshot, config), [snapshot, config])
  const [copied, setCopied] = useState(false)
  const file = filterFileName(config.filterName)
  const name = file.replace(/\.filter$/, '')
  const { supported, folder, choose, save, status } = gameFolder

  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <header className="page-header">
        <h1>{t('nav.export')}</h1>
        <div className="actions">
          <button onClick={copy}>{copied ? t('export.copied') : t('export.copy')}</button>
          <button onClick={() => downloadFilter(text, config.filterName)}>{t('export.download', { file })}</button>
          {supported && folder && (
            <button className="primary" onClick={() => save(text, config.filterName)}>
              {t('export.save')}
            </button>
          )}
        </div>
      </header>

      <section className="panel export-settings">
        <label className="check">
          {t('export.name')}
          <input
            type="text"
            maxLength={60}
            value={config.filterName}
            placeholder="LootEditor"
            onChange={(e) => update((c) => ({ ...c, filterName: e.target.value }))}
          />
        </label>
        <p className="note">{t('export.nameHint', { file })}</p>

        <h2>{t('export.folderTitle')}</h2>
        {supported ? (
          <>
            <div className="actions">
              <button onClick={choose}>{folder ? t('export.changeFolder') : t('export.chooseFolder')}</button>
              {folder && <span>{t('export.folderChosen', { folder })}</span>}
            </div>
            {folder && folder !== GAME_FOLDER_NAME && <p className="note note--error">{t('export.folderWrong', { folder: GAME_FOLDER_NAME })}</p>}
            <p className="note">{t('export.folderNote', { path: t('export.folder') })}</p>
          </>
        ) : (
          <p className="note">{t('export.noFolderApi')}</p>
        )}
        {status?.kind === 'saved' && (
          <p className="note note--ok">{t('export.saved', { file: status.file, time: status.at.toLocaleTimeString(locale) })}</p>
        )}
        {status?.kind === 'error' && <p className="note note--error">{t('export.saveError', { error: status.message })}</p>}
      </section>

      <ol className="note steps">
        <li>
          {t('export.step1')} <code>{t('export.folder')}</code>.
        </li>
        <li>{t('export.step2', { name })}</li>
      </ol>
      <pre className="filter-text">{text}</pre>
    </div>
  )
}
