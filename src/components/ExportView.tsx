import { useMemo, useState } from 'react'
import { generateFilter } from '../filter'
import { useI18n } from '../i18n-react'
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
  const { t } = useI18n()
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
        <h1>{t('nav.export')}</h1>
        <div className="actions">
          <button onClick={copy}>{copied ? t('export.copied') : t('export.copy')}</button>
          <button className="primary" onClick={() => downloadFilter(text)}>
            {t('export.download', { file: FILE_NAME })}
          </button>
        </div>
      </header>
      <ol className="note steps">
        <li>
          {t('export.step1')} <code>{t('export.folder')}</code>.
        </li>
        <li>{t('export.step2')}</li>
      </ol>
      <pre className="filter-text">{text}</pre>
    </div>
  )
}
