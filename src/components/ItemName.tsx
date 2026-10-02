import { useI18n } from '../i18n-react'

/**
 * Английское имя предмета мелким шрифтом — рядом с названием на языке интерфейса.
 * Нужно, чтобы узнать предмет в файле фильтра и на трейде. Не помещается — обрезается многоточием.
 */
export function EnglishName({ name }: { name: string }) {
  const english = useI18n().english(name)
  return english ? (
    <span className="english-name" title={english}>
      {english}
    </span>
  ) : null
}
