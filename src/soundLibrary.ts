import { useEffect, useSyncExternalStore } from 'react'
import { idb } from './idb'

/**
 * Свои звуки пользователя: файлы хранятся в браузере, в фильтр попадает строка CustomAlertSound с именем файла.
 * Игра ищет файл рядом с фильтром, поэтому при сохранении в папку игры нужные звуки копируются туда же.
 */

export const SOUND_EXTENSIONS = ['mp3', 'wav', 'ogg']

/** Имя файла звука для фильтра: без пути, кавычек и символов, запрещённых в Windows. */
export function soundFileName(name: string): string | null {
  const base = name.split(/[\\/]/).pop() ?? ''
  const clean = base.replace(/["*?<>|:]/g, '').replace(/\s+/g, ' ').trim()
  const extension = /\.([a-z0-9]+)$/i.exec(clean)?.[1]?.toLowerCase()
  return extension && SOUND_EXTENSIONS.includes(extension) && clean.length > extension.length + 1 ? clean : null
}

/** Имена своих звуков в тексте фильтра. */
export function soundsInFilter(text: string): string[] {
  return [...new Set([...text.matchAll(/^\s*CustomAlertSound\s+"([^"]+)"/gm)].map((m) => m[1]))]
}

// --- Общий список имён: меняется при загрузке и удалении, все подписанные компоненты перерисовываются.
let names: string[] = []
let loaded = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

async function refresh() {
  names = ((await idb<IDBValidKey[]>('sounds', 'readonly', (s) => s.getAllKeys()).catch(() => [])) as string[]).sort((a, b) =>
    a.localeCompare(b),
  )
  loaded = true
  emit()
}

/** Добавляет файлы в библиотеку; файл с тем же именем заменяется. Возвращает имена отвергнутых файлов. */
export async function addSounds(files: Iterable<File>): Promise<string[]> {
  const rejected: string[] = []
  for (const file of files) {
    const name = soundFileName(file.name)
    if (!name) {
      rejected.push(file.name)
      continue
    }
    await idb('sounds', 'readwrite', (s) => s.put(file, name))
  }
  await refresh()
  return rejected
}

export async function removeSound(name: string) {
  await idb('sounds', 'readwrite', (s) => s.delete(name))
  await refresh()
}

export const getSound = (name: string) => idb<Blob | undefined>('sounds', 'readonly', (s) => s.get(name)).catch(() => undefined)

export function useSoundLibrary(): string[] {
  useEffect(() => {
    if (!loaded) void refresh()
  }, [])
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => names,
    () => names,
  )
}
