import { useCallback, useEffect, useState } from 'react'

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

const DEFAULT_NAME = 'LootEditor'

/** Имя файла фильтра: без символов, запрещённых в именах файлов Windows. */
export function filterFileName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)
  return `${safe || DEFAULT_NAME}.filter`
}

// --- IndexedDB: одна запись с «ручкой» папки.
const DB = 'loot-filter-editor'
const STORE = 'handles'
const KEY = 'gameFolder'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE))
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
  })
}

const loadFolder = () => idb<FolderHandle | undefined>('readonly', (s) => s.get(KEY)).catch(() => undefined)
const storeFolder = (handle: FolderHandle) => idb('readwrite', (s) => s.put(handle, KEY))

export type SaveStatus = { kind: 'saved'; file: string; at: Date } | { kind: 'error'; message: string } | null

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
        const fileHandle = await handle.getFileHandle(file, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(text)
        await writable.close()
        setStatus({ kind: 'saved', file, at: new Date() })
      } catch (e) {
        setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    },
    [handle],
  )

  return { supported, folder: handle?.name ?? null, choose, save, status }
}
