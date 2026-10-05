import { useCallback, useEffect, useState } from 'react'
import { idb } from './idb'
import { getSound, soundsInFilter } from './soundLibrary'

/**
 * Сохранение фильтра прямо в папку игры через File System Access API (Chrome, Edge, Opera).
 * Пользователь один раз выбирает папку; её «ручка» хранится в IndexedDB, и дальше файл перезаписывается одной кнопкой.
 * Браузер может раз за сеанс переспросить разрешение на запись — это делает сам requestPermission.
 */

// В стандартных типах DOM этих методов пока нет.
interface PermissionHandle {
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
}
type FolderHandle = FileSystemDirectoryHandle & PermissionHandle
type PickerWindow = Window & {
  showDirectoryPicker?: (options: { id?: string; mode?: 'readwrite'; startIn?: string }) => Promise<FolderHandle>
}

export const folderSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

/** Имя папки, куда игра смотрит за фильтрами. */
export const GAME_FOLDER_NAME = 'Path of Exile 2'

const DEFAULT_NAME = 'ExileFilter'

/** Имя файла фильтра: без символов, запрещённых в именах файлов Windows. */
export function filterFileName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)
  return `${safe || DEFAULT_NAME}.filter`
}

const KEY = 'gameFolder'
const loadFolder = () => idb<FolderHandle | undefined>('handles', 'readonly', (s) => s.get(KEY)).catch(() => undefined)
const storeFolder = (handle: FolderHandle) => idb('handles', 'readwrite', (s) => s.put(handle, KEY))

export type SaveStatus =
  /** sounds — сколько своих звуков скопировано; missing — нужны фильтру, но их нет в библиотеке. */
  | { kind: 'saved'; file: string; at: Date; sounds: number; missing: string[] }
  | { kind: 'error'; message: string }
  | null

export interface GameFolder {
  supported: boolean
  /** Имя выбранной папки; null — папка не выбрана. */
  folder: string | null
  choose: () => Promise<void>
  /** Записать фильтр в папку, перезаписав файл с тем же именем. */
  save: (text: string, name: string) => Promise<void>
  status: SaveStatus
}

export function useGameFolder(): GameFolder {
  const supported = folderSupported()
  const [handle, setHandle] = useState<FolderHandle | null>(null)
  const [status, setStatus] = useState<SaveStatus>(null)

  useEffect(() => {
    if (supported) loadFolder().then((h) => h && setHandle(h))
  }, [supported])

  const choose = useCallback(async () => {
    const picker = (window as PickerWindow).showDirectoryPicker
    if (!picker) return
    try {
      // id запоминает место между вызовами; startIn — подсказка начать с «Документов».
      const picked = await picker({ id: 'poe2-filters', mode: 'readwrite', startIn: 'documents' })
      await storeFolder(picked)
      setHandle(picked)
      setStatus(null)
    } catch (e) {
      // Отказ от выбора — не ошибка.
      if (!(e instanceof DOMException && e.name === 'AbortError')) setStatus({ kind: 'error', message: String(e) })
    }
  }, [])

  const save = useCallback(
    async (text: string, name: string) => {
      if (!handle) return
      const file = filterFileName(name)
      try {
        // Разрешение на запись могло истечь с прошлого сеанса: спрашиваем по нажатию кнопки, как требует браузер.
        if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
          if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('permission denied')
        }
        const write = async (name: string, data: string | Blob) => {
          const writable = await (await handle.getFileHandle(name, { create: true })).createWritable()
          await writable.write(data)
          await writable.close()
        }
        // Свои звуки игра ищет рядом с фильтром: кладём их туда же, заменяя старые копии.
        const missing: string[] = []
        let sounds = 0
        for (const sound of soundsInFilter(text)) {
          const blob = await getSound(sound)
          if (!blob) {
            missing.push(sound)
            continue
          }
          await write(sound, blob)
          sounds++
        }
        await write(file, text)
        setStatus({ kind: 'saved', file, at: new Date(), sounds, missing })
      } catch (e) {
        setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    },
    [handle],
  )

  return { supported, folder: handle?.name ?? null, choose, save, status }
}
