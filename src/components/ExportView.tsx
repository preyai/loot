import { useMemo, useState } from 'react'
import { generateFilter } from '../filter'
import type { Config, MarketSnapshot } from '../types'

const FILE_NAME = 'LootEditor.filter'

export function downloadFilter(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = FILE_NAME
  a.click()
  URL.revokeObjectURL(url)
}

export function ExportView({ snapshot, config }: { snapshot: MarketSnapshot; config: Config }) {
  const text = useMemo(() => generateFilter(snapshot, config), [snapshot, config])
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <header className="page-header">
        <h1>Экспорт</h1>
        <div className="actions">
          <button onClick={copy}>{copied ? 'Скопировано' : 'Копировать'}</button>
          <button className="primary" onClick={() => downloadFilter(text)}>
            Скачать {FILE_NAME}
          </button>
        </div>
      </header>
      <ol className="note steps">
        <li>
          Положите файл в папку <code>Документы\My Games\Path of Exile 2</code>.
        </li>
        <li>В игре: Настройки → Игра → Фильтр предметов → выберите «LootEditor» и нажмите «Обновить».</li>
      </ol>
      <pre className="filter-text">{text}</pre>
    </div>
  )
}
