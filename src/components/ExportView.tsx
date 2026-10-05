import { useMemo, useState } from 'react'
import { generateFilter } from '../filter'
import { filterFileName, GAME_FOLDER_NAME, type GameFolder } from '../gameFolder'
import { useI18n } from '../i18n-react'
import { getSound, soundsInFilter, useSoundLibrary } from '../soundLibrary'
import type { UpdateConfig } from '../store'
import type { Config, MarketSnapshot } from '../types'

function download(data: Blob, fileName: string) {
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export const downloadFilter = (text: string, name: string) => download(new Blob([text], { type: 'text/plain' }), filterFileName(name))

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
  const sounds = useMemo(() => soundsInFilter(text), [text])
  const library = useSoundLibrary()

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
            placeholder="ExileFilter"
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
          <p className="note note--ok">
            {t('export.saved', { file: status.file, time: status.at.toLocaleTimeString(locale) })}
            {status.sounds > 0 && ` · ${t('export.savedSounds', { n: status.sounds })}`}
          </p>
        )}
        {status?.kind === 'saved' && status.missing.length > 0 && (
          <p className="note note--error">{t('export.soundsMissing', { files: status.missing.join(', ') })}</p>
        )}
        {status?.kind === 'error' && <p className="note note--error">{t('export.saveError', { error: status.message })}</p>}
      </section>

      {sounds.length > 0 && (
        <section className="panel">
          <h2>{t('export.sounds')}</h2>
          <p className="note">{t('export.soundsNote')}</p>
          <ul className="sound-list">
            {sounds.map((sound) => (
              <li key={sound}>
                <span>{sound}</span>
                {library.includes(sound) ? (
                  <button onClick={() => getSound(sound).then((blob) => blob && download(blob, sound))}>
                    {t('export.download', { file: sound })}
                  </button>
                ) : (
                  <span className="note--error">{t('export.soundMissing')}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

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
