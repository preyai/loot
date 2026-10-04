/**
 * Предметы, которые игра не даёт скрыть фильтром: Hide на них не действует — предмет всё равно лежит на земле
 * (оформление из правила при этом применяется). Так ведут себя ключи реликвария (класс Vault Keys) и реликвии;
 * NeverSink их никогда не скрывает. Поэтому фильтр пишет для них Show с неприметным оформлением,
 * а предпросмотр показывает их и при Hide.
 */
export const UNHIDEABLE_CLASSES = ['Vault Keys', 'Relics']

const RELICS = ['Amphora Relic', 'Coffer Relic', 'Incense Relic', 'Seal Relic', 'Tapestry Relic', 'Urn Relic', 'Vase Relic']

/** Ключ реликвария или реликвия — по названию (в разделах рынка класс предмета неизвестен). */
export const isUnhideable = (name: string) => / Reliquary Key\b/.test(name) || RELICS.includes(name)
