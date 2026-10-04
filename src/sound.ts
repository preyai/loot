import { SOUND_VOLUME_MAX } from './defaults'
import { getSound } from './soundLibrary'
import type { TierStyle } from './types'

/**
 * Встроенные звуки оповещений игры. В проект не копируются: это файлы игры,
 * поэтому проигрываются с сайта FilterBlade, где они выложены для такого же прослушивания.
 */
const soundUrl = (id: number) => `https://www.filterblade.xyz/assets/sounds/AlertSound${id}.mp3`

let current: HTMLAudioElement | null = null

function play(src: string, volume: number): Promise<void> {
  current?.pause()
  const audio = new Audio(src)
  audio.volume = Math.min(1, Math.max(0, volume / SOUND_VOLUME_MAX))
  current = audio
  return audio.play()
}

/** Проигрывает звук оповещения с громкостью из фильтра (0–300); предыдущий звук обрывается. */
export const playAlertSound = (id: number, volume: number): Promise<void> => play(soundUrl(id), volume)

/** Звук оформления: свой файл из библиотеки или встроенный звук игры. */
export async function playStyleSound(sound: NonNullable<TierStyle['sound']>): Promise<void> {
  if (!sound.file) return playAlertSound(sound.id, sound.volume)
  const blob = await getSound(sound.file)
  if (!blob) throw new Error(`no sound ${sound.file}`)
  const url = URL.createObjectURL(blob)
  try {
    await play(url, sound.volume)
  } finally {
    // Адрес нужен только на время загрузки: браузер уже прочитал файл.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
