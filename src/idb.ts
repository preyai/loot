/**
 * Небольшая база в браузере (IndexedDB) для того, что не помещается в настройки:
 * «ручка» папки игры и загруженные пользователем звуки.
 */
const DB = 'loot-filter-editor'
// Версия 2: к папке игры добавились звуки.
const VERSION = 2
export type StoreName = 'handles' | 'sounds'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION)
    request.onupgradeneeded = () => {
      for (const store of ['handles', 'sounds'] as const) {
        if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function idb<T>(store: StoreName, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(store, mode).objectStore(store))
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
  })
}
