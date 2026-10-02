import { SOUND_VOLUME_MAX } from './defaults'

/**
 * Встроенные звуки оповещений игры. В проект не копируются: это файлы игры,
 * поэтому проигрываются с сайта FilterBlade, где они выложены для такого же прослушивания.
 */
const soundUrl = (id: number) => `https://www.filterblade.xyz/assets/sounds/AlertSound${id}.mp3`

let current: HTMLAudioElement | null = null

/** Проигрывает звук оповещения с громкостью из фильтра (0–300); предыдущий звук обрывается. */
export function playAlertSound(id: number, volume: number): Promise<void> {
  current?.pause()
  const audio = new Audio(soundUrl(id))
  audio.volume = Math.min(1, Math.max(0, volume / SOUND_VOLUME_MAX))
  current = audio
  return audio.play()
}
