import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LOCALES, translator, type Lang, type T } from './i18n'

export interface I18n {
  lang: Lang
  /** Локаль для дат и чисел. */
  locale: string
  t: T
  /** Название предмета на языке интерфейса; имя из игры (английское), если перевода нет. */
  name: (english: string) => string
  /** Английское имя, если на экране показано другое; иначе null. */
  english: (english: string) => string | null
}

const identity = (english: string) => english
const ENGLISH: I18n = { lang: 'en', locale: LOCALES.en, t: translator('en'), name: identity, english: () => null }

const I18nContext = createContext<I18n>(ENGLISH)

export const useI18n = () => useContext(I18nContext)

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const [names, setNames] = useState<Map<string, string> | null>(null)

  // Русские названия — отдельный файл на сотни килобайт: грузим его, только когда он нужен.
  useEffect(() => {
    if (lang !== 'ru' || names) return
    let stale = false
    import('./data/names-ru.json').then(({ default: data }) => {
      // Валюта главнее баз, базы главнее уников — на случай одинаковых английских имён.
      if (!stale) setNames(new Map([...Object.entries(data.uniques), ...Object.entries(data.bases), ...Object.entries(data.items)]))
    })
    return () => {
      stale = true
    }
  }, [lang, names])

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = translator(lang)('app.title')
  }, [lang])

  const value = useMemo<I18n>(() => {
    if (lang === 'en') return ENGLISH
    const name = (english: string) => names?.get(english) ?? english
    return {
      lang,
      locale: LOCALES[lang],
      t: translator(lang),
      name,
      english: (english) => (name(english) === english ? null : english),
    }
  }, [lang, names])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
