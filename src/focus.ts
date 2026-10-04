import { useEffect, useState } from 'react'

/**
 * Переход «к нужной строке»: адрес вида «#/bases?focus=<ключ>». Страница помечает строки атрибутом
 * data-focus, а useFocusScroll прокручивает к строке с этим ключом и ненадолго её подсвечивает.
 */

/** Ссылка на страницу с переходом к строке. */
export const focusHref = (page: string, key: string) => `#/${page}?focus=${encodeURIComponent(key)}`

const readFocus = () => {
  const query = location.hash.split('?')[1] ?? ''
  return new URLSearchParams(query).get('focus')
}

/** Ключ строки из адреса; меняется вместе с адресом. */
export function useFocus(): string | null {
  const [focus, setFocus] = useState(readFocus)
  useEffect(() => {
    const onChange = () => setFocus(readFocus())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return focus
}

const HIGHLIGHT_MS = 2500

/** Прокрутка к строке и подсветка. Строка может появиться не сразу (данные ещё грузятся) — ищем её несколько раз. */
export function useFocusScroll(focus: string | null, route: string) {
  useEffect(() => {
    if (!focus) return
    let tries = 0
    let timer = 0
    const find = () => {
      const element = document.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focus)}"]`)
      if (!element) {
        if (++tries < 20) timer = window.setTimeout(find, 100)
        return
      }
      // К началу строки: высокая карточка правила иначе уехала бы заголовком под верхнюю панель (отступ — scroll-margin в CSS).
      element.scrollIntoView({ block: 'start', behavior: 'smooth' })
      element.classList.add('is-focused')
      timer = window.setTimeout(() => element.classList.remove('is-focused'), HIGHLIGHT_MS)
    }
    // После отрисовки страницы: карточка правила сначала раскрывается, потом к ней прокручиваемся.
    timer = window.setTimeout(find, 50)
    return () => window.clearTimeout(timer)
  }, [focus, route])
}
