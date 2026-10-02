import type { SectionId } from './types'

/** Названия разделов — в словаре: ключи «section.<id>» и, для коротких имён в боковой панели, «sectionShort.<id>». */
export interface Section {
  id: SectionId
  /** Английское имя для комментариев в .filter (игра читает файл не как UTF-8). */
  label: string
  /** Типы в API poe.ninja. */
  ninja: string[]
  /** Раздел уникальных предметов: строка раздела — базовый тип, а не отдельный предмет. */
  unique?: true
  /** Предметы раздела не складываются в стопки, правило «показывать стопками» к ним неприменимо. */
  unstackable?: true
}

export const SECTIONS: Section[] = [
  { id: 'currency', label: 'Currency', ninja: ['Currency'] },
  { id: 'fragments', label: 'Fragments', ninja: ['Fragments'] },
  { id: 'ritual', label: 'Ritual', ninja: ['Ritual'] },
  { id: 'delirium', label: 'Delirium', ninja: ['Delirium'] },
  { id: 'abyss', label: 'Abyss', ninja: ['Abyss'] },
  { id: 'breach', label: 'Breach', ninja: ['Breach'] },
  { id: 'expedition', label: 'Expedition', ninja: ['Expedition'] },
  { id: 'essences', label: 'Essences', ninja: ['Essences'] },
  { id: 'runes', label: 'Runes', ninja: ['Runes'] },
  { id: 'soulcores', label: 'Soul Cores', ninja: ['SoulCores'] },
  { id: 'idols', label: 'Idols', ninja: ['Idols'] },
  { id: 'lineage', label: 'Lineage Supports', ninja: ['LineageSupportGems'], unstackable: true },
  { id: 'gems', label: 'Uncut Gems', ninja: ['UncutGems'], unstackable: true },
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
