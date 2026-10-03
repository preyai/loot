import type { ExtraChoice } from './types'

/**
 * Правила для предметов, которых нет ни на рынке poe.ninja, ни среди баз экипировки: квестовые предметы,
 * испытания, реликвии, лучшие камни умений и неизвестные новинки лиги. Условия — по разделам фильтра NeverSink.
 * Флаконы, обереги и самоцветы настраиваются правилами баз.
 * Подпись правила — в словаре: «extra.<группа>.<правило>», группы — «extraGroup.<группа>».
 */
export interface ExtraRule {
  id: string
  /** Блоки фильтра с одинаковым оформлением; каждый — набор условий. */
  blocks: string[][]
  /** Тир по умолчанию или скрытие. */
  tier: ExtraChoice
  /** Английское название предмета для образца плашки; без него на плашке — подпись правила. */
  sample?: string
}

export interface ExtraGroup {
  id: string
  rules: ExtraRule[]
}

const levels = (from: number | null, to: number | null) => [
  ...(from !== null ? [`ItemLevel >= ${from}`] : []),
  ...(to !== null ? [`ItemLevel <= ${to}`] : []),
]

export const EXTRA_GROUPS: ExtraGroup[] = [
  {
    id: 'quest',
    rules: [
      { id: 'items', tier: 'C', sample: 'Gold Key', blocks: [['Class == "Quest Items" "Instance Local Items"'], ['BaseType == "Bronze Key" "Gold Key" "Silver Key"']] },
    ],
  },
  {
    id: 'trials',
    rules: [
      { id: 'ultimatumReward', tier: 'A', sample: 'Inscribed Ultimatum', blocks: [['Rarity Magic Rare Unique', 'BaseType == "Inscribed Ultimatum"']] },
      {
        id: 'trialBarya',
        tier: 'C',
        sample: 'Test of Will Barya',
        blocks: [['BaseType == "Test of Cunning Barya" "Test of Strength Barya" "Test of Time Barya" "Test of Will Barya"']],
      },
      { id: 'barya80', tier: 'C', sample: 'Djinn Barya', blocks: [[...levels(80, null), 'BaseType == "Djinn Barya"']] },
      { id: 'barya60', tier: 'D', sample: 'Djinn Barya', blocks: [[...levels(60, 79), 'BaseType == "Djinn Barya"']] },
      { id: 'baryaLow', tier: 'E', sample: 'Djinn Barya', blocks: [[...levels(null, 59), 'BaseType == "Djinn Barya"']] },
      { id: 'ultimatum80', tier: 'C', sample: 'Inscribed Ultimatum', blocks: [[...levels(80, null), 'BaseType == "Inscribed Ultimatum"']] },
      { id: 'ultimatum75', tier: 'D', sample: 'Inscribed Ultimatum', blocks: [[...levels(75, 79), 'BaseType == "Inscribed Ultimatum"']] },
      { id: 'ultimatumLow', tier: 'E', sample: 'Inscribed Ultimatum', blocks: [[...levels(null, 74), 'BaseType == "Inscribed Ultimatum"']] },
    ],
  },
  {
    id: 'relics',
    rules: [
      {
        id: 'any',
        tier: 'D',
        sample: 'Vase Relic',
        blocks: [
          [
            'Rarity Normal Magic',
            'BaseType == "Amphora Relic" "Coffer Relic" "Incense Relic" "Seal Relic" "Tapestry Relic" "Urn Relic" "Vase Relic"',
          ],
        ],
      },
    ],
  },
  {
    id: 'gems',
    rules: [{ id: 'twiceTop', tier: 'S', blocks: [['Class == "Skill Gems" "Support Gems"', 'TwiceCorrupted True', 'Quality > 20', 'GemLevel > 20']] }],
  },
  {
    // Последней: ловит валюту и прочее, чего нет ни в одном разделе (новинки лиги), — поэтому громко.
    id: 'unknown',
    rules: [{ id: 'currency', tier: 'B', blocks: [['Class == "Stackable Currency" "Incubators" "Omen" "Augment"']] }],
  },
]

export const extraKey = (group: ExtraGroup, rule: ExtraRule) => `${group.id}.${rule.id}`
