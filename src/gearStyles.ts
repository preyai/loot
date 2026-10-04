import type { Rgba, TierStyle } from './types'

/**
 * Оформление правил экипировки в наборах и шаблонах — по стилям NeverSink для экипировки.
 * Намеренно не совпадает с тирами валюты: на земле сразу видно, что это вещь, а не сфера.
 * Текст задаётся явно: в фильтре у правила один цвет, поэтому для «редких» он жёлтый, для «магических» синий и т. д.
 */
const rgba = (r: number, g: number, b: number, a = 255): Rgba => ({ r, g, b, a })

const RARE_TEXT = rgba(255, 255, 119)
const MAGIC_TEXT = rgba(136, 136, 255)
const NORMAL_TEXT = rgba(200, 200, 200)
const TEAL = rgba(0, 240, 190)
const DARK = rgba(20, 20, 0)

const style = (fields: Partial<TierStyle> & Pick<TierStyle, 'text'>): TierStyle => ({
  fontSize: 40,
  border: null,
  background: null,
  sound: null,
  effect: null,
  icon: null,
  ...fields,
})

export const GEAR_STYLES = {
  /** Лучшие исключительные: 3+ гнезда, качество 27%+ (exotics_artifacthigh). */
  exceptionalTop: style({
    fontSize: 42,
    text: rgba(240, 0, 0),
    border: rgba(240, 0, 0),
    background: rgba(70, 0, 20),
    sound: { id: 3, volume: 300 },
    effect: { color: 'Orange', temp: false },
    icon: { size: 0, color: 'Orange', shape: 'Pentagon' },
  }),
  /** Исключительные и редкие с высокой ступенью свойств (exotics_btier). */
  exceptional: style({
    fontSize: 42,
    text: TEAL,
    border: TEAL,
    background: rgba(0, 75, 30),
    sound: { id: 3, volume: 300 },
    effect: { color: 'Blue', temp: false },
    icon: { size: 0, color: 'Blue', shape: 'Diamond' },
  }),
  /** Ступень свойств пониже (exotics_ctier). */
  notable: style({
    text: TEAL,
    sound: { id: 3, volume: 300 },
    effect: { color: 'Blue', temp: false },
    icon: { size: 1, color: 'Blue', shape: 'Diamond' },
  }),
  /** Белые базы под шансинг дорогих уников (itemproperty_achancing). */
  chancing: style({
    fontSize: 45,
    text: rgba(125, 255, 89),
    border: rgba(125, 255, 89),
    background: rgba(0, 50, 0),
    sound: { id: 1, volume: 300 },
    effect: { color: 'Red', temp: false },
    icon: { size: 0, color: 'Red', shape: 'Diamond' },
  }),
  /** Редкая бижутерия (gear_jewellery1). */
  jewellery: style({
    fontSize: 42,
    text: RARE_TEXT,
    background: rgba(75, 75, 0),
    effect: { color: 'Yellow', temp: false },
    icon: { size: 1, color: 'White', shape: 'Diamond' },
  }),
  /** Редкая бижутерия с высокой ступенью свойств (gear_tieredjewellery). */
  jewelleryTiered: style({
    fontSize: 42,
    text: rgba(255, 255, 0),
    border: rgba(220, 220, 0),
    background: rgba(75, 75, 0),
    sound: { id: 2, volume: 300 },
    effect: { color: 'Yellow', temp: false },
    icon: { size: 1, color: 'Yellow', shape: 'Diamond' },
  }),
  /** Заготовки под крафт: белые и синие на хороших базах (itemproperty_becocraft). */
  crafting: style({
    text: NORMAL_TEXT,
    border: rgba(255, 127, 127),
    background: DARK,
    sound: { id: 3, volume: 300 },
    effect: { color: 'Yellow', temp: true },
    icon: { size: 1, color: 'Yellow', shape: 'Diamond' },
  }),
  /** Редкие на хороших базах — крупно, без шума (gear_highlightedsize). */
  rare: style({ text: RARE_TEXT, background: DARK }),
  /** Флаконы и обереги в картах (toplevelflasks, hight1charms). */
  flasks: style({ text: NORMAL_TEXT, border: rgba(245, 175, 0), background: rgba(10, 60, 40) }),
  /** Флаконы и обереги на прокачке (earlymappinglifemana). */
  flasksLeveling: style({ text: NORMAL_TEXT, border: rgba(100, 100, 100), background: rgba(10, 60, 40) }),
  /** Редкие самоцветы (gear_jewelrare). */
  jewelsRare: style({
    fontSize: 42,
    text: rgba(220, 220, 0),
    border: rgba(220, 220, 0),
    background: rgba(75, 75, 0),
    sound: { id: 2, volume: 300 },
    effect: { color: 'Yellow', temp: false },
    icon: { size: 1, color: 'Yellow', shape: 'Diamond' },
  }),
  /** Обычные и магические самоцветы (gear_jewelmagic). */
  jewelsMagic: style({
    fontSize: 42,
    text: rgba(0, 70, 255),
    border: rgba(0, 70, 255),
    background: rgba(30, 0, 70),
    sound: { id: 2, volume: 300 },
    effect: { color: 'Blue', temp: false },
    icon: { size: 1, color: 'Blue', shape: 'Diamond' },
  }),
  /** Магические вещи, которые стоит поднять на прокачке (gear_highlightdrop2). */
  magicPick: style({ fontSize: 42, text: MAGIC_TEXT, background: rgba(30, 0, 70) }),
  /** Обычная и магическая бижутерия на прокачке (gear_highlightdrop3). */
  jewelleryPick: style({ text: NORMAL_TEXT, background: rgba(30, 0, 70) }),
  /** Вещи на разбор: с качеством или гнёздами (itemproperty_salvagelvl1). */
  salvage: style({ text: NORMAL_TEXT, border: rgba(180, 180, 180), background: rgba(0, 0, 0, 200) }),
  /** Для правил скрытия: под Alt мелко и без фона, как у NeverSink (SetFontSize 18), в цвете редкости. */
  hiddenRare: style({ fontSize: 18, text: RARE_TEXT, border: rgba(0, 0, 0, 0), background: rgba(20, 20, 0, 0) }),
  hiddenNormal: style({ fontSize: 18, text: NORMAL_TEXT, border: rgba(0, 0, 0, 0), background: rgba(20, 20, 0, 0) }),
}
