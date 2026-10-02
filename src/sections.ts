import type { SectionId } from './types'

/** Названия разделов — в словаре: ключи «section.<id>» и, для коротких имён в боковой панели, «sectionShort.<id>». */
export interface Section {
  id: SectionId
  /** Английское имя для комментариев в .filter (игра читает файл не как UTF-8). */
  label: string
  /** Типы в API poe.ninja; пусто — цен на poe.ninja нет, предметы берутся только из справочника обмена. */
  ninja: string[]
  /**
   * Группы справочника обмена валюты (официальный трейд). Из них добираются предметы, которых
   * на poe.ninja нет: без цены, но с возможностью назначить тир вручную.
   */
  trade?: string[]
  /**
   * Цены из раздела предметов poe.ninja, но не уники: строка раздела — базовый тип,
   * а цена — по самому дорогому варианту редкости.
   */
  bases?: true
  /** Раздел уникальных предметов: строка раздела — базовый тип, а не отдельный предмет. */
  unique?: true
  /** Предметы раздела не складываются в стопки, правило «показывать стопками» к ним неприменимо. */
  unstackable?: true
}

export const SECTIONS: Section[] = [
  { id: 'currency', label: 'Currency', ninja: ['Currency'], trade: ['Currency'] },
  { id: 'fragments', label: 'Fragments', ninja: ['Fragments'], trade: ['Fragments'] },
  { id: 'ritual', label: 'Ritual', ninja: ['Ritual'], trade: ['Ritual'] },
  { id: 'delirium', label: 'Delirium', ninja: ['Delirium'], trade: ['Delirium'] },
  { id: 'abyss', label: 'Abyss', ninja: ['Abyss'], trade: ['Abyss'] },
  { id: 'breach', label: 'Breach', ninja: ['Breach'], trade: ['Breach'] },
  { id: 'expedition', label: 'Expedition', ninja: ['Expedition'], trade: ['Expedition'] },
  { id: 'essences', label: 'Essences', ninja: ['Essences'], trade: ['Essences'] },
  { id: 'runes', label: 'Runes', ninja: ['Runes'], trade: ['Runes'] },
  { id: 'soulcores', label: 'Soul Cores', ninja: ['SoulCores'], trade: ['Vaal'] },
  { id: 'idols', label: 'Idols', ninja: ['Idols'] },
  { id: 'verisium', label: 'Verisium', ninja: ['Verisium'], trade: ['Verisium'] },
  { id: 'lineage', label: 'Lineage Supports', ninja: ['LineageSupportGems'], trade: ['LineageSupportGems'], unstackable: true },
  { id: 'gems', label: 'Uncut Gems', ninja: ['UncutGems'], trade: ['UncutGems'], unstackable: true },
  { id: 'tablets', label: 'Tablets', ninja: ['PrecursorTablets'], bases: true, unstackable: true },
  { id: 'waystones', label: 'Waystones', ninja: [], trade: ['Waystones'], unstackable: true },
  {
    id: 'uq-weapons',
   
    label: 'Unique Weapons',
    ninja: ['UniqueWeapons'],
    unique: true,
    unstackable: true,
  },
  {
    id: 'uq-armour',
   
    label: 'Unique Armours',
    ninja: ['UniqueArmours'],
    unique: true,
    unstackable: true,
  },
  {
    id: 'uq-accessories',
   
    label: 'Unique Accessories',
    ninja: ['UniqueAccessories'],
    unique: true,
    unstackable: true,
  },
  {
    id: 'uq-other',
   
    label: 'Unique Misc',
    ninja: ['UniqueFlasks', 'UniqueJewels', 'UniqueCharms', 'UniqueSanctumRelics', 'UniqueTablets'],
    unique: true,
    unstackable: true,
  },
]
