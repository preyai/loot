import type { SectionId } from './types'

export interface Section {
  id: SectionId
  title: string
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
  { id: 'currency', title: 'Валюта', label: 'Currency', ninja: ['Currency'] },
  { id: 'fragments', title: 'Фрагменты', label: 'Fragments', ninja: ['Fragments'] },
  { id: 'ritual', title: 'Ритуал', label: 'Ritual', ninja: ['Ritual'] },
  { id: 'delirium', title: 'Делириум', label: 'Delirium', ninja: ['Delirium'] },
  { id: 'abyss', title: 'Бездна', label: 'Abyss', ninja: ['Abyss'] },
  { id: 'breach', title: 'Разлом', label: 'Breach', ninja: ['Breach'] },
  { id: 'expedition', title: 'Экспедиция', label: 'Expedition', ninja: ['Expedition'] },
  { id: 'essences', title: 'Сущности', label: 'Essences', ninja: ['Essences'] },
  { id: 'runes', title: 'Руны', label: 'Runes', ninja: ['Runes'] },
  { id: 'soulcores', title: 'Ядра душ', label: 'Soul Cores', ninja: ['SoulCores'] },
  { id: 'idols', title: 'Идолы', label: 'Idols', ninja: ['Idols'] },
  { id: 'lineage', title: 'Камни родословной', label: 'Lineage Supports', ninja: ['LineageSupportGems'], unstackable: true },
  { id: 'gems', title: 'Неогранённые камни', label: 'Uncut Gems', ninja: ['UncutGems'], unstackable: true },
  { id: 'uq-weapons', title: 'Уники: оружие', label: 'Unique Weapons', ninja: ['UniqueWeapons'], unique: true, unstackable: true },
  { id: 'uq-armour', title: 'Уники: броня', label: 'Unique Armours', ninja: ['UniqueArmours'], unique: true, unstackable: true },
  {
    id: 'uq-accessories',
    title: 'Уники: бижутерия',
    label: 'Unique Accessories',
    ninja: ['UniqueAccessories'],
    unique: true,
    unstackable: true,
  },
  {
    id: 'uq-other',
    title: 'Уники: прочее',
    label: 'Unique Misc',
    ninja: ['UniqueFlasks', 'UniqueJewels', 'UniqueCharms', 'UniqueSanctumRelics', 'UniqueTablets'],
    unique: true,
    unstackable: true,
  },
]
