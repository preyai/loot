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

interface NameData {
  items: Record<string, string>
  bases: Record<string, string>
  uniques: Record<string, string>
}

/** Названия предметов — отдельные файлы по сотне килобайт: грузится только файл выбранного языка. */
const NAME_FILES: Record<Exclude<Lang, 'en'>, () => Promise<{ default: NameData }>> = {
  ru: () => import('./data/names-ru.json'),
  de: () => import('./data/names-de.json'),
  fr: () => import('./data/names-fr.json'),
  es: () => import('./data/names-es.json'),
  pt: () => import('./data/names-pt.json'),
  ja: () => import('./data/names-ja.json'),
  ko: () => import('./data/names-ko.json'),
  th: () => import('./data/names-th.json'),
}
const ENGLISH: I18n = { lang: 'en', locale: LOCALES.en, t: translator('en'), name: identity, english: () => null }

const I18nContext = createContext<I18n>(ENGLISH)

export const useI18n = () => useContext(I18nContext)

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  // Названия хранятся вместе с языком: при смене языка старые не должны показаться ни на миг.
  const [names, setNames] = useState<{ lang: Lang; map: Map<string, string> } | null>(null)

  useEffect(() => {
    if (lang === 'en' || names?.lang === lang) return
    let stale = false
    NAME_FILES[lang]().then(({ default: data }) => {
      // Валюта главнее баз, базы главнее уников — на случай одинаковых английских имён.
      const map = new Map([...Object.entries(data.uniques), ...Object.entries(data.bases), ...Object.entries(data.items)])
      if (!stale) setNames({ lang, map })
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
    const map = names?.lang === lang ? names.map : null
    const name = (english: string) => map?.get(english) ?? english
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
