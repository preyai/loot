import { useState } from 'react'
import { useI18n } from '../i18n-react'
import { playStyleSound } from '../sound'
import { addSounds, removeSound, SOUND_EXTENSIONS, useSoundLibrary } from '../soundLibrary'
import { SOUND_VOLUME_MAX } from '../defaults'

/** Свои звуки: загрузка, прослушивание и удаление. Выбираются потом в любом оформлении. */
export function SoundLibrary() {
  const { t } = useI18n()
  const sounds = useSoundLibrary()
  const [rejected, setRejected] = useState<string[]>([])

  return (
    <section className="panel sound-library">
      <h2>{t('styles.customSounds')}</h2>
      <p className="note">{t('styles.customSoundsNote')}</p>
      <div className="actions">
        <label className="button-like">
          {t('styles.uploadSounds')}
          <input
            type="file"
            multiple
            hidden
            accept={SOUND_EXTENSIONS.map((e) => `.${e}`).join(',')}
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              setRejected(await addSounds(files))
            }}
          />
        </label>
      </div>
      {rejected.length > 0 && <p className="note note--error">{t('styles.soundsRejected', { files: rejected.join(', ') })}</p>}
      {sounds.length === 0 ? (
        <p className="note">{t('styles.noCustomSounds')}</p>
      ) : (
        <ul className="sound-list">
          {sounds.map((file) => (
            <li key={file}>
              <button
                className="sound-play"
                aria-label={t('preview.customSound', { file })}
                onClick={() => playStyleSound({ id: 0, volume: SOUND_VOLUME_MAX, file }).catch(() => {})}
              >
                ▶
              </button>
              <span>{file}</span>
              <button
                className="icon-button"
                aria-label={t('styles.deleteSound', { file })}
                title={t('styles.deleteSound', { file })}
                onClick={() => confirm(t('styles.deleteSoundConfirm', { file })) && removeSound(file)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
