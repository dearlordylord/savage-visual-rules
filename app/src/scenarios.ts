/* eslint-disable max-lines -- scenario data file, inherently long */
import type { SavageEvent, SavageSnapshot } from "./machine"
import {
  activeEffectsList,
  afflictionType,
  blindedPenalty,
  hasEffect,
  isBleedingOut,
  isBlinded,
  isBound,
  isDead,
  isDefending,
  isDistracted,
  isEntangled,
  isFullyBlinded,
  isGrabbed,
  isGrappled,
  isIncapStable,
  isOnHold,
  isPinned,
  isProne,
  isRestrained,
  isShaken,
  isStunned,
  isVulnerable
} from "./machine"
import {
  afflictionDuration as ad,
  athleticsRollResult as ar,
  blindedSeverity as bs,
  damageMargin as dm,
  escapeRollResult as er,
  grappleEscapeRollResult as ger,
  grappleRollResult as gr,
  healAmount as ha,
  incapRollResult as ir,
  injuryRoll as ij,
  pinRollResult as pr,
  soakSuccesses as sk,
  spiritRollResult as sr,
  vigorRollResult as vr
} from "./types"

// ============================================================
// Types
// ============================================================

export interface ScenarioStep {
  event: SavageEvent | null // null for narrative-only steps (e.g. fear table result display)
  label: string
  expect: Array<{
    desc: string
    check: (snap: SavageSnapshot) => boolean
  }>
}

export interface Scenario {
  id: string
  title: string
  description: string
  category: string
  characterType: "wildCard" | "extra"
  steps: Array<ScenarioStep>
}

// ============================================================
// Category labels (Russian)
// ============================================================

export const categoryLabels: Record<string, string> = {
  damage: "Урон",
  soak: "Поглощение урона",
  shaken: "Оправление от шока",
  incap: "При смерти",
  bleedingOut: "Истекая кровью",
  extras: "Статисты и дикие карты",
  stunned: "Оглушение",
  conditions: "Отвлечён и уязвим",
  fatigue: "Усталость",
  healing: "Лечение",
  hold: "Наготове и прерывание",
  prone: "Положение лёжа",
  restraint: "Путы (схвачен/обездвижен)",
  grapple: "Захват",
  blinded: "Ослепление",
  afflictions: "Недуги",
  powers: "Мистические силы",
  defense: "Оборона",
  fear: "Страх",
  // Phase 2: cross-feature interactions
  crossCombat: "Бой: цикл раунда",
  crossRecovery: "Оправление: комбинации",
  crossHold: "Наготове: взаимодействия",
  crossRestraint: "Путы и захват: связи",
  crossAffliction: "Недуги: каскады",
  crossDefense: "Оборона и состояния",
  crossHealing: "Лечение и возврат в бой",
  crossFear: "Страх: каскады",
  crossDeath: "Гибель и выживание"
}

// ============================================================
// Scenarios
// ============================================================

export const scenarios: Array<Scenario> = [
  // ========================================
  // 1.1 Damage basics
  // ========================================
  {
    id: "damage-glancing",
    title: "Скользящий удар — только шок",
    description: "Урон равен стойкости персонажа (превышение 0). Персонаж оказывается в шоке, но не получает ранений.",
    category: "damage",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Удар проходит впритык (превышение 0)",
        expect: [
          { desc: "Персонаж в шоке", check: isShaken },
          { desc: "Ранения = 0", check: (s) => s.context.wounds === 0 }
        ]
      }
    ]
  },
  {
    id: "damage-solid",
    title: "Крепкий удар — шок и ранение",
    description: "Один подъём на броске урона (превышение 4+). Персонаж в шоке и получает одно ранение.",
    category: "damage",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(5), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Удар с подъёмом (превышение 5)",
        expect: [
          { desc: "Персонаж в шоке", check: isShaken },
          { desc: "Ранения = 1", check: (s) => s.context.wounds === 1 }
        ]
      }
    ]
  },
  {
    id: "damage-shaken-on-shaken",
    title: "Шок на шоке — автоматическое ранение",
    description: "Персонаж уже в шоке. Повторный шок автоматически наносит ранение.",
    category: "damage",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(2), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Первый удар — персонаж в шоке",
        expect: [
          { desc: "Персонаж в шоке", check: isShaken },
          { desc: "Ранения = 0", check: (s) => s.context.wounds === 0 }
        ]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(1), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Второй удар — шок на шоке",
        expect: [
          { desc: "Персонаж в шоке", check: isShaken },
          { desc: "Ранения = 1", check: (s) => s.context.wounds === 1 }
        ]
      }
    ]
  },
  {
    id: "damage-brutal",
    title: "Сокрушительный удар — несколько ранений",
    description: "Превышение 8 = два подъёма = шок и два ранения за один удар.",
    category: "damage",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(8), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Мощный удар (превышение 8)",
        expect: [
          { desc: "Персонаж в шоке", check: isShaken },
          { desc: "Ранения = 2", check: (s) => s.context.wounds === 2 }
        ]
      }
    ]
  },

  // ========================================
  // 1.2 Soak rolls
  // ========================================
  {
    id: "soak-partial",
    title: "Проверка на прочность — частичное поглощение",
    description: "Удар с подъёмом, но персонаж тратит фишку и поглощает одно ранение. Остаётся в шоке, но без ранений.",
    category: "soak",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(4), soakSuccesses: sk(1), incapRoll: ir(0) },
        label: "Удар с подъёмом, поглощение 1",
        expect: [
          { desc: "Персонаж в шоке", check: isShaken },
          { desc: "Ранения = 0", check: (s) => s.context.wounds === 0 }
        ]
      }
    ]
  },
  {
    id: "soak-clears-shaken",
    title: "Полное поглощение снимает шок",
    description: "Персонаж уже в шоке. Новый удар, но все ранения поглощены — шок снимается (особое правило SWADE).",
    category: "soak",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Первый удар — шок",
        expect: [{ desc: "Персонаж в шоке", check: isShaken }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(1), incapRoll: ir(0) },
        label: "Второй удар — полное поглощение",
        expect: [
          { desc: "Персонаж НЕ в шоке", check: (s) => !isShaken(s) },
          { desc: "Ранения = 0", check: (s) => s.context.wounds === 0 }
        ]
      }
    ]
  },

  // ========================================
  // 1.3 Shaken recovery
  // ========================================
  {
    id: "shaken-recovery-success",
    title: "Оправление от шока — успех",
    description: "В начале хода персонаж проходит проверку характера. Успех — шок снят, можно действовать.",
    category: "shaken",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Персонаж получает шок",
        expect: [{ desc: "Персонаж в шоке", check: isShaken }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) },
        label: "Начало хода — проверка характера (успех)",
        expect: [
          { desc: "Персонаж НЕ в шоке", check: (s) => !isShaken(s) },
          { desc: "Фаза хода: действует", check: (s) => s.matches({ alive: { turnPhase: "acting" } }) }
        ]
      }
    ]
  },
  {
    id: "shaken-recovery-fail",
    title: "Оправление от шока — провал",
    description:
      "Проверка характера провалена. Персонаж по-прежнему в шоке, может предпринимать только свободные действия.",
    category: "shaken",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Персонаж получает шок",
        expect: [{ desc: "Персонаж в шоке", check: isShaken }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода — проверка характера (провал)",
        expect: [
          { desc: "Персонаж в шоке", check: isShaken },
          { desc: "Фаза хода: действует", check: (s) => s.matches({ alive: { turnPhase: "acting" } }) }
        ]
      }
    ]
  },
  {
    id: "shaken-benny",
    title: "Фишка снимает шок мгновенно",
    description: "Персонаж тратит фишку, чтобы выйти из шока в любой момент раунда.",
    category: "shaken",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(2), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Персонаж в шоке",
        expect: [{ desc: "Персонаж в шоке", check: isShaken }]
      },
      {
        event: { type: "SPEND_BENNY" },
        label: "Трата фишки",
        expect: [{ desc: "Персонаж НЕ в шоке", check: (s) => !isShaken(s) }]
      }
    ]
  },

  // ========================================
  // 1.4 Incapacitation
  // ========================================
  {
    id: "incap-crit-fail",
    title: "При смерти — критический провал = гибель",
    description: "Ранения превышают максимум. Проверка выносливости — критический провал. Персонаж погибает.",
    category: "incap",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Тяжёлый удар — 3 ранения, шок",
        expect: [
          { desc: "Ранения = 3", check: (s) => s.context.wounds === 3 },
          { desc: "Персонаж в шоке", check: isShaken }
        ]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(-1) },
        label: "Ещё удар — превышение максимума, крит. провал выносливости",
        expect: [{ desc: "Персонаж мёртв", check: isDead }]
      }
    ]
  },
  {
    id: "incap-bleeding-out",
    title: "При смерти — провал = истекает кровью",
    description: "Проверка выносливости провалена (не критически). Персонаж истекает кровью.",
    category: "incap",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Тяжёлый удар — 3 ранения, шок",
        expect: [{ desc: "Ранения = 3", check: (s) => s.context.wounds === 3 }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Ещё удар — провал выносливости",
        expect: [
          {
            desc: "Истекает кровью",
            check: isBleedingOut
          }
        ]
      }
    ]
  },
  {
    id: "incap-stable",
    title: "При смерти — успех = стабилен + увечье",
    description: "Проверка выносливости успешна. Персонаж стабилен, но получает увечье по таблице.",
    category: "incap",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Тяжёлый удар — 3 ранения, шок",
        expect: [{ desc: "Ранения = 3", check: (s) => s.context.wounds === 3 }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(1), injuryRoll: ij(52) },
        label: "Ещё удар — успех выносливости, увечье",
        expect: [
          { desc: "Стабилен", check: isIncapStable },
          { desc: "Увечье: корпус (сломлен)", check: (s) => s.context.injuries.includes("guts_broken") }
        ]
      }
    ]
  },

  // ========================================
  // 1.5 Bleeding out
  // ========================================
  {
    id: "bleeding-death",
    title: "Истекая кровью — провал = гибель",
    description: "Персонаж истекает кровью. В начале хода проверка выносливости провалена — персонаж погибает.",
    category: "bleedingOut",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "3 ранения, шок",
        expect: [{ desc: "Ранения = 3", check: (s) => s.context.wounds === 3 }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Превышение максимума → истекает кровью",
        expect: [
          {
            desc: "Истекает кровью",
            check: isBleedingOut
          }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода — выносливость провал",
        expect: [{ desc: "Персонаж мёртв", check: isDead }]
      }
    ]
  },
  {
    id: "bleeding-stabilized",
    title: "Истекая кровью — подъём = стабилизация",
    description: "Проверка выносливости с подъёмом — состояние стабилизируется.",
    category: "bleedingOut",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "3 ранения, шок",
        expect: [{ desc: "Ранения = 3", check: (s) => s.context.wounds === 3 }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Превышение максимума → истекает кровью",
        expect: [
          {
            desc: "Истекает кровью",
            check: isBleedingOut
          }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(2), spiritRoll: sr(0) },
        label: "Начало хода — выносливость подъём",
        expect: [
          { desc: "Стабилен", check: isIncapStable },
          { desc: "Персонаж жив", check: (s) => !isDead(s) }
        ]
      }
    ]
  },

  // ========================================
  // 1.6 Extras vs Wild Cards
  // ========================================
  {
    id: "extra-dies",
    title: "Статист гибнет от первого ранения",
    description: "У статистов максимум ранений = 1. Любое ранение — гибель.",
    category: "extras",
    characterType: "extra",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(4), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Удар с подъёмом по статисту",
        expect: [
          { desc: "Статист мёртв", check: isDead },
          { desc: "Ранения = 1", check: (s) => s.context.wounds === 1 }
        ]
      }
    ]
  },
  {
    id: "wc-survives",
    title: "Дикая карта выживает при том же ударе",
    description: "Тот же урон, но дикая карта получает ранение и остаётся в строю.",
    category: "extras",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(4), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Удар с подъёмом по дикой карте",
        expect: [
          { desc: "Персонаж жив", check: (s) => !isDead(s) },
          { desc: "Персонаж в шоке", check: isShaken },
          { desc: "Ранения = 1", check: (s) => s.context.wounds === 1 }
        ]
      }
    ]
  },

  // ========================================
  // 1.7 Stunned
  // ========================================
  {
    id: "stunned-cascade",
    title: "Оглушение — каскад состояний",
    description: "Оглушённый персонаж падает, отвлечён и уязвим. Не может действовать.",
    category: "stunned",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_STUNNED" },
        label: "Персонаж оглушён",
        expect: [
          { desc: "Оглушён", check: isStunned },
          { desc: "Лежит", check: isProne },
          { desc: "Отвлечён", check: isDistracted },
          { desc: "Уязвим", check: isVulnerable }
        ]
      }
    ]
  },
  {
    id: "stunned-recovery-success",
    title: "Оправление от оглушения — успех",
    description: "Проверка выносливости успешна. Оглушение снято, но персонаж уязвим до конца следующего хода.",
    category: "stunned",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_STUNNED" },
        label: "Персонаж оглушён",
        expect: [{ desc: "Оглушён", check: isStunned }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(1), spiritRoll: sr(0) },
        label: "Начало хода — выносливость успех",
        expect: [
          { desc: "НЕ оглушён", check: (s) => !isStunned(s) },
          { desc: "Уязвим (таймер = 1)", check: (s) => isVulnerable(s) && s.context.vulnerableTimer === 1 }
        ]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Конец хода",
        expect: [{ desc: "Уязвим (таймер = 0)", check: (s) => s.context.vulnerableTimer === 0 }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Следующий ход",
        expect: []
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Конец следующего хода — уязвимость истекает",
        expect: [{ desc: "НЕ уязвим", check: (s) => !isVulnerable(s) }]
      }
    ]
  },
  {
    id: "stunned-recovery-raise",
    title: "Оправление от оглушения — подъём",
    description: "Подъём на проверке выносливости — уязвимость снимается уже в конце текущего хода.",
    category: "stunned",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_STUNNED" },
        label: "Персонаж оглушён",
        expect: [{ desc: "Оглушён", check: isStunned }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(2), spiritRoll: sr(0) },
        label: "Начало хода — выносливость подъём",
        expect: [
          { desc: "НЕ оглушён", check: (s) => !isStunned(s) },
          { desc: "Уязвим (таймер = 0)", check: (s) => s.context.vulnerableTimer === 0 }
        ]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Конец хода — уязвимость снята",
        expect: [{ desc: "НЕ уязвим", check: (s) => !isVulnerable(s) }]
      }
    ]
  },

  // ========================================
  // 1.8 Distracted/Vulnerable timing
  // ========================================
  {
    id: "distracted-outside-turn",
    title: "Отвлечён вне своего хода",
    description: "Персонаж отвлечён между ходами. Состояние длится до конца его следующего хода.",
    category: "conditions",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_DISTRACTED" },
        label: "Персонаж отвлечён (вне хода, idle)",
        expect: [
          { desc: "Отвлечён", check: isDistracted },
          { desc: "Таймер = 0", check: (s) => s.context.distractedTimer === 0 }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода",
        expect: [{ desc: "Отвлечён", check: isDistracted }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Конец хода — отвлечение снято",
        expect: [
          { desc: "НЕ отвлечён", check: (s) => !isDistracted(s) },
          { desc: "Таймер = -1", check: (s) => s.context.distractedTimer === -1 }
        ]
      }
    ]
  },
  {
    id: "distracted-during-turn",
    title: "Отвлечён во время своего хода",
    description: "Персонаж отвлечён во время собственного хода. Состояние длится до конца следующего хода.",
    category: "conditions",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода",
        expect: [{ desc: "Фаза: действует", check: (s) => s.matches({ alive: { turnPhase: "acting" } }) }]
      },
      {
        event: { type: "APPLY_DISTRACTED" },
        label: "Персонаж отвлечён (во время хода)",
        expect: [
          { desc: "Отвлечён", check: isDistracted },
          { desc: "Таймер = 1", check: (s) => s.context.distractedTimer === 1 }
        ]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Конец хода (таймер тикает)",
        expect: [{ desc: "Таймер = 0", check: (s) => s.context.distractedTimer === 0 }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Следующий ход",
        expect: [{ desc: "Всё ещё отвлечён", check: isDistracted }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Конец следующего хода — снято",
        expect: [{ desc: "НЕ отвлечён", check: (s) => !isDistracted(s) }]
      }
    ]
  },

  // ========================================
  // 1.9 Fatigue
  // ========================================
  {
    id: "fatigue-progression",
    title: "Усталость — нарастание",
    description: "Три уровня усталости: утомлён (−1), истощён (−2), при смерти.",
    category: "fatigue",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_FATIGUE" },
        label: "Первый уровень усталости",
        expect: [{ desc: "Утомлён", check: (s) => s.matches({ alive: { fatigueTrack: "fatigued" } }) }]
      },
      {
        event: { type: "APPLY_FATIGUE" },
        label: "Второй уровень усталости",
        expect: [{ desc: "Истощён", check: (s) => s.matches({ alive: { fatigueTrack: "exhausted" } }) }]
      },
      {
        event: { type: "APPLY_FATIGUE" },
        label: "Третий уровень усталости",
        expect: [
          { desc: "При смерти от усталости", check: (s) => s.matches({ alive: { fatigueTrack: "incapByFatigue" } }) }
        ]
      }
    ]
  },
  {
    id: "fatigue-recovery",
    title: "Усталость — восстановление",
    description: "Уровни усталости снимаются по одному.",
    category: "fatigue",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_FATIGUE" },
        label: "Утомлён",
        expect: [{ desc: "Утомлён", check: (s) => s.matches({ alive: { fatigueTrack: "fatigued" } }) }]
      },
      {
        event: { type: "APPLY_FATIGUE" },
        label: "Истощён",
        expect: [{ desc: "Истощён", check: (s) => s.matches({ alive: { fatigueTrack: "exhausted" } }) }]
      },
      {
        event: { type: "APPLY_FATIGUE" },
        label: "При смерти",
        expect: [
          { desc: "При смерти от усталости", check: (s) => s.matches({ alive: { fatigueTrack: "incapByFatigue" } }) }
        ]
      },
      {
        event: { type: "RECOVER_FATIGUE" },
        label: "Восстановление 1",
        expect: [{ desc: "Истощён", check: (s) => s.matches({ alive: { fatigueTrack: "exhausted" } }) }]
      },
      {
        event: { type: "RECOVER_FATIGUE" },
        label: "Восстановление 2",
        expect: [{ desc: "Утомлён", check: (s) => s.matches({ alive: { fatigueTrack: "fatigued" } }) }]
      },
      {
        event: { type: "RECOVER_FATIGUE" },
        label: "Восстановление 3",
        expect: [{ desc: "Свеж", check: (s) => s.matches({ alive: { fatigueTrack: "fresh" } }) }]
      }
    ]
  },

  // ========================================
  // 1.10 Healing
  // ========================================
  {
    id: "heal-wounds",
    title: "Лечение ранений",
    description: "Успешная проверка лечения уменьшает количество ранений.",
    category: "healing",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(8), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Персонаж получает 2 ранения и шок",
        expect: [{ desc: "Ранения = 2", check: (s) => s.context.wounds === 2 }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) },
        label: "Оправление от шока",
        expect: [{ desc: "НЕ в шоке", check: (s) => !isShaken(s) }]
      },
      {
        event: { type: "HEAL", amount: ha(1) },
        label: "Лечение — 1 ранение",
        expect: [{ desc: "Ранения = 1", check: (s) => s.context.wounds === 1 }]
      }
    ]
  },
  {
    id: "heal-incap",
    title: "Лечение снимает состояние при смерти",
    description: "Излечение хотя бы одного ранения у персонажа при смерти возвращает его в строй.",
    category: "healing",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "3 ранения, шок",
        expect: [{ desc: "Ранения = 3", check: (s) => s.context.wounds === 3 }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Шок на шоке → при смерти, истекает кровью",
        expect: [
          {
            desc: "Истекает кровью",
            check: isBleedingOut
          }
        ]
      },
      {
        event: { type: "HEAL", amount: ha(1) },
        label: "Лечение — 1 ранение",
        expect: [
          { desc: "Ранения = 2", check: (s) => s.context.wounds === 2 },
          { desc: "Снова в строю", check: (s) => s.matches({ alive: { damageTrack: "active" } }) }
        ]
      }
    ]
  },

  // ========================================
  // 1.11 Hold & Interrupt
  // ========================================
  {
    id: "hold-basic",
    title: "Наготове — ожидание",
    description: "Персонаж решает не действовать и остаётся наготове.",
    category: "hold",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода",
        expect: [{ desc: "Действует", check: (s) => s.matches({ alive: { turnPhase: "acting" } }) }]
      },
      {
        event: { type: "GO_ON_HOLD" },
        label: "Переход в состояние наготове",
        expect: [
          { desc: "Наготове", check: isOnHold },
          { desc: "Не свой ход", check: (s) => !s.context.ownTurn }
        ]
      }
    ]
  },
  {
    id: "hold-interrupt-success",
    title: "Прерывание — успех",
    description: "Персонаж наготове прерывает действие другого. Встречная проверка атлетики — успех. Действует первым.",
    category: "hold",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода",
        expect: []
      },
      {
        event: { type: "GO_ON_HOLD" },
        label: "Наготове",
        expect: [{ desc: "Наготове", check: isOnHold }]
      },
      {
        event: { type: "INTERRUPT", athleticsRoll: ar(1) },
        label: "Прерывание — атлетика успех",
        expect: [
          { desc: "Действует", check: (s) => s.matches({ alive: { turnPhase: "acting" } }) },
          { desc: "Прерывание удалось", check: (s) => s.context.interruptedSuccessfully }
        ]
      }
    ]
  },
  {
    id: "hold-interrupt-fail",
    title: "Прерывание — провал",
    description: "Проверка атлетики провалена. Персонаж действует после того, кого пытался прервать.",
    category: "hold",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода",
        expect: []
      },
      {
        event: { type: "GO_ON_HOLD" },
        label: "Наготове",
        expect: [{ desc: "Наготове", check: isOnHold }]
      },
      {
        event: { type: "INTERRUPT", athleticsRoll: ar(0) },
        label: "Прерывание — атлетика провал",
        expect: [
          { desc: "Действует (после соперника)", check: (s) => s.matches({ alive: { turnPhase: "acting" } }) },
          { desc: "Прерывание не удалось", check: (s) => !s.context.interruptedSuccessfully }
        ]
      }
    ]
  },
  {
    id: "hold-persist",
    title: "Наготове — сохраняется между раундами",
    description: "Персонаж не действует в этом раунде. Состояние наготове переносится в следующий раунд.",
    category: "hold",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода",
        expect: []
      },
      {
        event: { type: "GO_ON_HOLD" },
        label: "Наготове",
        expect: [{ desc: "Наготове", check: isOnHold }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Конец раунда",
        expect: [
          { desc: "Idle", check: (s) => s.matches({ alive: { turnPhase: "idle" } }) },
          { desc: "Наготове сохраняется (контекст)", check: (s) => s.context.onHold }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Новый раунд — снова наготове",
        expect: [{ desc: "Наготове", check: isOnHold }]
      },
      {
        event: { type: "ACT_FROM_HOLD" },
        label: "Решает действовать",
        expect: [
          { desc: "Действует", check: (s) => s.matches({ alive: { turnPhase: "acting" } }) },
          { desc: "НЕ наготове", check: (s) => !isOnHold(s) }
        ]
      }
    ]
  },

  // ========================================
  // 1.12 Prone
  // ========================================
  {
    id: "prone-cycle",
    title: "Лечь и встать",
    description: "Персонаж ложится (свободное действие) и встаёт (свободное действие, −2 к шагу).",
    category: "prone",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "DROP_PRONE" },
        label: "Персонаж ложится",
        expect: [{ desc: "Лежит", check: isProne }]
      },
      {
        event: { type: "STAND_UP" },
        label: "Персонаж встаёт",
        expect: [{ desc: "Стоит", check: (s) => !isProne(s) }]
      }
    ]
  },

  // ========================================
  // 1.13 Restraint
  // ========================================
  {
    id: "restraint-entangled",
    title: "Схвачен — уязвим до освобождения",
    description: "Персонаж схвачен (сетью, путами). Уязвим, пока не освободится.",
    category: "restraint",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_ENTANGLED" },
        label: "Персонаж схвачен",
        expect: [
          { desc: "Схвачен", check: isEntangled },
          { desc: "Уязвим", check: isVulnerable },
          { desc: "Уязвимость постоянная (99)", check: (s) => s.context.vulnerableTimer === 99 }
        ]
      }
    ]
  },
  {
    id: "restraint-escape-entangled",
    title: "Освобождение из пут (схвачен)",
    description: "Проверка силы или атлетики — успех. Персонаж свободен, уязвимость снята.",
    category: "restraint",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_ENTANGLED" },
        label: "Персонаж схвачен",
        expect: [{ desc: "Схвачен", check: isEntangled }]
      },
      {
        event: { type: "ESCAPE_ATTEMPT", rollResult: er(1) },
        label: "Попытка освободиться — успех",
        expect: [
          { desc: "Свободен", check: (s) => !isRestrained(s) },
          { desc: "НЕ уязвим", check: (s) => !isVulnerable(s) }
        ]
      }
    ]
  },
  {
    id: "restraint-bound",
    title: "Обездвижен — отвлечён и уязвим",
    description: "Персонаж обездвижен. Может только пытаться вырваться.",
    category: "restraint",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_BOUND" },
        label: "Персонаж обездвижен",
        expect: [
          { desc: "Обездвижен", check: isBound },
          { desc: "Отвлечён", check: isDistracted },
          { desc: "Уязвим", check: isVulnerable }
        ]
      }
    ]
  },
  {
    id: "restraint-escape-bound",
    title: "Освобождение из пут (обездвижен)",
    description: "Успех — понижение до схвачен. Подъём — полное освобождение.",
    category: "restraint",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_BOUND" },
        label: "Персонаж обездвижен",
        expect: [{ desc: "Обездвижен", check: isBound }]
      },
      {
        event: { type: "ESCAPE_ATTEMPT", rollResult: er(1) },
        label: "Попытка — успех (понижение)",
        expect: [{ desc: "Схвачен (не обездвижен)", check: (s) => isEntangled(s) && !isBound(s) }]
      },
      {
        event: { type: "ESCAPE_ATTEMPT", rollResult: er(1) },
        label: "Ещё попытка — успех из схвачен",
        expect: [{ desc: "Свободен", check: (s) => !isRestrained(s) }]
      }
    ]
  },

  // ========================================
  // 1.14 Grapple
  // ========================================
  {
    id: "grapple-grabbed",
    title: "Захват — успех = схвачен",
    description: "Встречная проверка атлетики — успех. Цель схвачена и уязвима.",
    category: "grapple",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "GRAPPLE_ATTEMPT", opponent: "opp1", rollResult: gr(1) },
        label: "Захват — успех",
        expect: [
          { desc: "Схвачен (grabbed)", check: isGrabbed },
          { desc: "Уязвим", check: isVulnerable },
          { desc: "НЕ отвлечён", check: (s) => !isDistracted(s) }
        ]
      }
    ]
  },
  {
    id: "grapple-pinned",
    title: "Захват — подъём = обездвижен",
    description: "Подъём на проверке захвата. Цель обездвижена, отвлечена и уязвима.",
    category: "grapple",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "GRAPPLE_ATTEMPT", opponent: "opp1", rollResult: gr(2) },
        label: "Захват — подъём",
        expect: [
          { desc: "Обездвижен (pinned)", check: isPinned },
          { desc: "Отвлечён", check: isDistracted },
          { desc: "Уязвим", check: isVulnerable }
        ]
      }
    ]
  },
  {
    id: "grapple-pin-from-grabbed",
    title: "Силовой приём → обездвижен",
    description: "Персонаж уже держит цель. Дополнительная проверка — обездвиживает.",
    category: "grapple",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "GRAPPLE_ATTEMPT", opponent: "opp1", rollResult: gr(1) },
        label: "Захват — схвачен",
        expect: [{ desc: "Схвачен", check: isGrabbed }]
      },
      {
        event: { type: "PIN_ATTEMPT", rollResult: pr(1) },
        label: "Силовой приём — успех",
        expect: [{ desc: "Обездвижен", check: isPinned }]
      }
    ]
  },
  {
    id: "grapple-escape",
    title: "Вырваться из захвата",
    description: "Из обездвижен: успех = схвачен, подъём = свободен. Из схвачен: успех = свободен.",
    category: "grapple",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "GRAPPLE_ATTEMPT", opponent: "opp1", rollResult: gr(2) },
        label: "Захват — обездвижен",
        expect: [{ desc: "Обездвижен", check: isPinned }]
      },
      {
        event: { type: "GRAPPLE_ESCAPE", rollResult: ger(1) },
        label: "Побег — успех (понижение)",
        expect: [{ desc: "Схвачен (не обездвижен)", check: (s) => isGrabbed(s) && !isPinned(s) }]
      },
      {
        event: { type: "GRAPPLE_ESCAPE", rollResult: ger(1) },
        label: "Побег из схвачен — успех",
        expect: [{ desc: "Свободен", check: (s) => !isGrappled(s) }]
      }
    ]
  },

  // ========================================
  // 1.15 Blinded
  // ========================================
  {
    id: "blinded-levels",
    title: "Ослепление — два уровня",
    description: "Частичное (−2) и полное (−4) ослепление.",
    category: "blinded",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_BLINDED", severity: bs(2) },
        label: "Частичное ослепление",
        expect: [
          { desc: "Ослеплён", check: isBlinded },
          { desc: "НЕ полностью", check: (s) => !isFullyBlinded(s) },
          { desc: "Штраф = −2", check: (s) => blindedPenalty(s) === -2 }
        ]
      }
    ]
  },
  {
    id: "blinded-recovery",
    title: "Восстановление зрения",
    description: "Проверка выносливости в конце хода. Подъём снимает полное ослепление, успех понижает уровень.",
    category: "blinded",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_BLINDED", severity: bs(4) },
        label: "Полное ослепление (−4)",
        expect: [{ desc: "Полностью ослеплён", check: isFullyBlinded }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода",
        expect: []
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(1) },
        label: "Конец хода — выносливость успех (понижение)",
        expect: [
          { desc: "Частично ослеплён", check: (s) => isBlinded(s) && !isFullyBlinded(s) },
          { desc: "Штраф = −2", check: (s) => blindedPenalty(s) === -2 }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Следующий ход",
        expect: []
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(1) },
        label: "Конец хода — успех (снято)",
        expect: [
          { desc: "НЕ ослеплён", check: (s) => !isBlinded(s) },
          { desc: "Штраф = 0", check: (s) => blindedPenalty(s) === 0 }
        ]
      }
    ]
  },

  // ========================================
  // 1.16 Afflictions
  // ========================================
  {
    id: "affliction-paralytic",
    title: "Паралитический яд",
    description: "Персонаж парализован. Не может оправиться от оглушения, пока действует яд.",
    category: "afflictions",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_AFFLICTION", afflictionType: "paralytic", duration: ad(5) },
        label: "Паралитический яд (5 раундов)",
        expect: [
          { desc: "Недуг: паралитический", check: (s) => afflictionType(s) === "paralytic" },
          { desc: "Таймер = 5", check: (s) => s.context.afflictionTimer === 5 }
        ]
      },
      {
        event: { type: "APPLY_STUNNED" },
        label: "Персонаж оглушён",
        expect: [{ desc: "Оглушён", check: isStunned }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(2), spiritRoll: sr(0) },
        label: "Попытка оправиться — подъём выносливости",
        expect: [{ desc: "Всё ещё оглушён (заблокировано ядом)", check: isStunned }]
      }
    ]
  },
  {
    id: "affliction-weak",
    title: "Ослабляющая болезнь",
    description: "При заражении персонаж сразу получает уровень усталости.",
    category: "afflictions",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_AFFLICTION", afflictionType: "weak", duration: ad(5) },
        label: "Ослабляющая болезнь (5 раундов)",
        expect: [
          { desc: "Недуг: ослабляющий", check: (s) => afflictionType(s) === "weak" },
          { desc: "Утомлён", check: (s) => s.matches({ alive: { fatigueTrack: "fatigued" } }) }
        ]
      }
    ]
  },
  {
    id: "affliction-lethal",
    title: "Смертельный яд",
    description: "Немедленно: ранение + шок. Если таймер истекает — гибель.",
    category: "afflictions",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_AFFLICTION", afflictionType: "lethal", duration: ad(1) },
        label: "Смертельный яд (1 раунд)",
        expect: [
          { desc: "В шоке", check: isShaken },
          { desc: "Ранения = 1", check: (s) => s.context.wounds === 1 }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Ход 1",
        expect: []
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Конец хода — таймер тикает",
        expect: [{ desc: "Таймер = 0", check: (s) => s.context.afflictionTimer === 0 }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Ход 2",
        expect: []
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Таймер истёк — гибель",
        expect: [{ desc: "Персонаж мёртв", check: isDead }]
      }
    ]
  },
  {
    id: "affliction-sleep",
    title: "Магический сон",
    description: "Спящий персонаж не может оправиться от шока и оглушения.",
    category: "afflictions",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Персонаж в шоке",
        expect: [{ desc: "В шоке", check: isShaken }]
      },
      {
        event: { type: "APPLY_AFFLICTION", afflictionType: "sleep", duration: ad(3) },
        label: "Магический сон (3 раунда)",
        expect: [{ desc: "Недуг: сон", check: (s) => afflictionType(s) === "sleep" }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) },
        label: "Попытка оправиться от шока — характер успех",
        expect: [{ desc: "Всё ещё в шоке (заблокировано сном)", check: isShaken }]
      }
    ]
  },

  // ========================================
  // 1.17 Power effects
  // ========================================
  {
    id: "power-apply-dismiss",
    title: "Поддержание и отмена силы",
    description: "Персонаж активирует мистическую силу. Эффект длится несколько раундов или отменяется досрочно.",
    category: "powers",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_POWER_EFFECT", etype: "armor", duration: 3 },
        label: "Активация силы «доспех» (3 раунда)",
        expect: [
          { desc: "Эффект «armor» активен", check: (s) => hasEffect(s, "armor") },
          { desc: "1 активный эффект", check: (s) => activeEffectsList(s).length === 1 }
        ]
      },
      {
        event: { type: "DISMISS_EFFECT", etype: "armor" },
        label: "Отмена силы",
        expect: [
          { desc: "Эффект «armor» снят", check: (s) => !hasEffect(s, "armor") },
          { desc: "0 активных эффектов", check: (s) => activeEffectsList(s).length === 0 }
        ]
      }
    ]
  },
  {
    id: "power-backlash",
    title: "Откат — все силы пропадают",
    description:
      "Критический провал при колдовстве. Все поддерживаемые силы мгновенно прекращаются, персонаж получает усталость.",
    category: "powers",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_POWER_EFFECT", etype: "armor", duration: 3 },
        label: "Сила «доспех»",
        expect: [{ desc: "1 эффект", check: (s) => activeEffectsList(s).length === 1 }]
      },
      {
        event: { type: "APPLY_POWER_EFFECT", etype: "boost", duration: 2 },
        label: "Сила «усиление»",
        expect: [{ desc: "2 эффекта", check: (s) => activeEffectsList(s).length === 2 }]
      },
      {
        event: { type: "BACKLASH" },
        label: "Откат!",
        expect: [
          { desc: "0 эффектов", check: (s) => activeEffectsList(s).length === 0 },
          { desc: "Утомлён", check: (s) => s.matches({ alive: { fatigueTrack: "fatigued" } }) }
        ]
      }
    ]
  },

  // ========================================
  // 1.18 Full defense
  // ========================================
  {
    id: "defense-basic",
    title: "Оборона",
    description: "Персонаж уходит в оборону (+4 к защите). Действует до начала следующего хода.",
    category: "defense",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода",
        expect: [{ desc: "Действует", check: (s) => s.matches({ alive: { turnPhase: "acting" } }) }]
      },
      {
        event: { type: "DEFEND" },
        label: "Оборона",
        expect: [{ desc: "В обороне", check: isDefending }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Конец хода",
        expect: [{ desc: "Оборона сохраняется", check: isDefending }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало следующего хода — оборона снята",
        expect: [{ desc: "НЕ в обороне", check: (s) => !isDefending(s) }]
      }
    ]
  },

  // ========================================
  // 1.19 Fear table (wrapped in machine events)
  // ========================================
  {
    id: "fear-distracted",
    title: "Страх — отвлечён",
    description: "Проверка храбрости провалена. Бросок d20 = 5. Персонаж отвлечён до конца следующего хода.",
    category: "fear",
    characterType: "wildCard",
    steps: [
      {
        event: null,
        label: "Бросок по таблице страха: d20 = 5 → отвлечён",
        expect: []
      },
      {
        event: { type: "APPLY_DISTRACTED" },
        label: "Результат страха: отвлечён",
        expect: [{ desc: "Отвлечён", check: isDistracted }]
      }
    ]
  },
  {
    id: "fear-stunned-cascade",
    title: "Ужас — оглушение и каскад",
    description: "Бросок d20 = 13. Персонаж оглушён (падает, отвлечён, уязвим) и получает шрам.",
    category: "fear",
    characterType: "wildCard",
    steps: [
      {
        event: null,
        label: "Бросок по таблице страха: d20 = 13 → оглушение + шрам",
        expect: []
      },
      {
        event: { type: "APPLY_STUNNED" },
        label: "Результат: оглушение",
        expect: [
          { desc: "Оглушён", check: isStunned },
          { desc: "Лежит", check: isProne },
          { desc: "Отвлечён", check: isDistracted },
          { desc: "Уязвим", check: isVulnerable }
        ]
      }
    ]
  },
  {
    id: "fear-shaken",
    title: "Страх — в шоке",
    description: "Бросок d20 = 11. Персонаж оказывается в шоке от ужаса.",
    category: "fear",
    characterType: "wildCard",
    steps: [
      {
        event: null,
        label: "Бросок по таблице страха: d20 = 11 → в шоке",
        expect: []
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Результат: шок (аналог урона, равного стойкости)",
        expect: [{ desc: "В шоке", check: isShaken }]
      }
    ]
  },

  // ========================================================
  // Phase 2: Cross-feature mechanics
  // ========================================================

  // ========================================
  // 2.1 — Полный боевой раунд
  // ========================================
  {
    id: "cross-full-round",
    title: "Полный боевой раунд",
    description:
      "Удар → шок → начало хода → оправление (характер успех) → действие → конец хода. Полный цикл одного раунда.",
    category: "crossCombat",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Персонаж получает удар — в шоке",
        expect: [
          { desc: "В шоке", check: isShaken },
          { desc: "Ранения = 0", check: (s) => s.context.wounds === 0 }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) },
        label: "Начало хода — характер успех, шок снят",
        expect: [
          { desc: "НЕ в шоке", check: (s) => !isShaken(s) },
          { desc: "Действует", check: (s) => s.matches({ alive: { turnPhase: "acting" } }) }
        ]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Конец хода",
        expect: [{ desc: "Idle", check: (s) => s.matches({ alive: { turnPhase: "idle" } }) }]
      }
    ]
  },

  // ========================================
  // 2.2 — Оглушение + шок: одновременное оправление
  // ========================================
  {
    id: "cross-stun-shaken-both-ok",
    title: "Оглушён + шок: оба оправления успешны",
    description:
      "Персонаж оглушён и в шоке. В начале хода выносливость (оглушение) и характер (шок) проверяются независимо. Оба успешны.",
    category: "crossRecovery",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Удар — шок",
        expect: [{ desc: "В шоке", check: isShaken }]
      },
      {
        event: { type: "APPLY_STUNNED" },
        label: "Оглушение",
        expect: [
          { desc: "Оглушён", check: isStunned },
          { desc: "В шоке", check: isShaken },
          { desc: "Лежит", check: isProne }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(1), spiritRoll: sr(1) },
        label: "Начало хода — выносливость успех, характер успех",
        expect: [
          { desc: "НЕ оглушён", check: (s) => !isStunned(s) },
          { desc: "НЕ в шоке", check: (s) => !isShaken(s) },
          { desc: "Уязвим (после оглушения)", check: isVulnerable }
        ]
      }
    ]
  },
  {
    id: "cross-stun-shaken-vigor-ok-spirit-fail",
    title: "Оглушён + шок: выносливость ок, характер провал",
    description: "Выносливость проходит (оглушение снято), но характер провален — персонаж остаётся в шоке.",
    category: "crossRecovery",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Удар — шок",
        expect: [{ desc: "В шоке", check: isShaken }]
      },
      {
        event: { type: "APPLY_STUNNED" },
        label: "Оглушение",
        expect: [{ desc: "Оглушён", check: isStunned }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(1), spiritRoll: sr(0) },
        label: "Начало хода — выносливость успех, характер провал",
        expect: [
          { desc: "НЕ оглушён", check: (s) => !isStunned(s) },
          { desc: "В шоке", check: isShaken },
          { desc: "Уязвим", check: isVulnerable }
        ]
      }
    ]
  },
  {
    id: "cross-stun-shaken-vigor-fail",
    title: "Оглушён + шок: выносливость провал",
    description: "Выносливость провалена — оглушение остаётся. Характер не проверяется (заблокирован оглушением).",
    category: "crossRecovery",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Удар — шок",
        expect: [{ desc: "В шоке", check: isShaken }]
      },
      {
        event: { type: "APPLY_STUNNED" },
        label: "Оглушение",
        expect: [{ desc: "Оглушён", check: isStunned }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) },
        label: "Начало хода — выносливость провал, характер успех (игнорируется)",
        expect: [
          { desc: "Оглушён", check: isStunned },
          { desc: "В шоке", check: isShaken }
        ]
      }
    ]
  },

  // ========================================
  // 2.3 — Шок отменяет наготове
  // ========================================
  {
    id: "cross-hold-broken-by-damage",
    title: "Шок отменяет наготове",
    description: "Персонаж наготове. Враг попадает — шок. Состояние наготове сбрасывается.",
    category: "crossHold",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода",
        expect: []
      },
      {
        event: { type: "GO_ON_HOLD" },
        label: "Наготове",
        expect: [{ desc: "Наготове", check: isOnHold }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Враг попадает — шок",
        expect: [
          { desc: "В шоке", check: isShaken },
          { desc: "НЕ наготове", check: (s) => !isOnHold(s) }
        ]
      }
    ]
  },

  // ========================================
  // 2.4 — Уязвимость не истекает, пока схвачен
  // ========================================
  {
    id: "cross-entangled-persistent-vulnerable",
    title: "Уязвимость не истекает, пока персонаж схвачен",
    description:
      "Схваченный персонаж уязвим с постоянным таймером (99). Ходы проходят — уязвимость остаётся. Освобождение снимает её.",
    category: "crossRestraint",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_ENTANGLED" },
        label: "Персонаж схвачен сетью",
        expect: [
          { desc: "Схвачен", check: isEntangled },
          { desc: "Уязвим", check: isVulnerable },
          { desc: "Таймер уязвимости = 99", check: (s) => s.context.vulnerableTimer === 99 }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода",
        expect: [{ desc: "Уязвим", check: isVulnerable }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Конец хода — таймер уязвимости заморожен (схвачен)",
        expect: [
          { desc: "Уязвим", check: isVulnerable },
          { desc: "Таймер = 99 (заморожен)", check: (s) => s.context.vulnerableTimer === 99 }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Следующий ход",
        expect: [{ desc: "Уязвим", check: isVulnerable }]
      },
      {
        event: { type: "ESCAPE_ATTEMPT", rollResult: er(1) },
        label: "Освобождение — успех",
        expect: [
          { desc: "Свободен", check: (s) => !isRestrained(s) },
          { desc: "НЕ уязвим", check: (s) => !isVulnerable(s) }
        ]
      }
    ]
  },

  // ========================================
  // 2.5 — Обездвижен замораживает таймеры
  // ========================================
  {
    id: "cross-bound-freezes-timers",
    title: "Обездвижен замораживает таймеры отвлечения и уязвимости",
    description: "Персонаж отвлечён, затем обездвижен. Таймер отвлечения не тикает на END_OF_TURN, пока обездвижен.",
    category: "crossRestraint",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода",
        expect: []
      },
      {
        event: { type: "APPLY_DISTRACTED" },
        label: "Персонаж отвлечён (во время хода, таймер = 1)",
        expect: [
          { desc: "Отвлечён", check: isDistracted },
          { desc: "Таймер отвлечения = 1", check: (s) => s.context.distractedTimer === 1 }
        ]
      },
      {
        event: { type: "APPLY_BOUND" },
        label: "Персонаж обездвижен",
        expect: [
          { desc: "Обездвижен", check: isBound },
          { desc: "Отвлечён", check: isDistracted }
        ]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Конец хода — таймеры заморожены (обездвижен)",
        expect: [
          { desc: "Таймер отвлечения = 1 (не тикнул)", check: (s) => s.context.distractedTimer === 1 },
          { desc: "Отвлечён", check: isDistracted }
        ]
      }
    ]
  },

  // ========================================
  // 2.6 — Захват → силовой приём → обездвижен
  // ========================================
  {
    id: "cross-grapple-to-bound",
    title: "Захват → силовой приём → обездвижен",
    description: "Схватил → обездвижил → APPLY_BOUND переводит в путы, очищает grappledBy.",
    category: "crossRestraint",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "GRAPPLE_ATTEMPT", opponent: "opp1", rollResult: gr(1) },
        label: "Захват — схвачен",
        expect: [
          { desc: "Схвачен (grabbed)", check: isGrabbed },
          { desc: "grappledBy = opp1", check: (s) => s.context.grappledBy === "opp1" }
        ]
      },
      {
        event: { type: "PIN_ATTEMPT", rollResult: pr(1) },
        label: "Силовой приём — обездвижен (pinned)",
        expect: [
          { desc: "Обездвижен (pinned)", check: isPinned },
          { desc: "grappledBy = opp1", check: (s) => s.context.grappledBy === "opp1" }
        ]
      },
      {
        event: { type: "APPLY_BOUND" },
        label: "Переход в путы (bound) — очистка grappledBy",
        expect: [
          { desc: "Обездвижен (bound)", check: isBound },
          { desc: "grappledBy пуст", check: (s) => s.context.grappledBy === "" },
          { desc: "Отвлечён", check: isDistracted },
          { desc: "Уязвим", check: isVulnerable }
        ]
      }
    ]
  },

  // ========================================
  // 2.7 — Смертельный яд + существующие ранения
  // ========================================
  {
    id: "cross-lethal-plus-wounds",
    title: "Смертельный яд на раненом персонаже",
    description:
      "Персонаж уже имеет 3 ранения. Смертельный яд добавляет ранение → превышение максимума → истекает кровью.",
    category: "crossAffliction",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Тяжёлый удар — 3 ранения, шок",
        expect: [
          { desc: "Ранения = 3", check: (s) => s.context.wounds === 3 },
          { desc: "В шоке", check: isShaken }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) },
        label: "Оправление от шока",
        expect: [{ desc: "НЕ в шоке", check: (s) => !isShaken(s) }]
      },
      {
        event: { type: "APPLY_AFFLICTION", afflictionType: "lethal", duration: ad(3) },
        label: "Смертельный яд — +1 ранение → превышение максимума",
        expect: [
          {
            desc: "Истекает кровью",
            check: isBleedingOut
          }
        ]
      }
    ]
  },

  // ========================================
  // 2.8 — Сон блокирует восстановление зрения
  // ========================================
  {
    id: "cross-sleep-blocks-blinded",
    title: "Сон блокирует восстановление зрения",
    description:
      "Спящий персонаж ослеплён. В конце хода проверка выносливости не применяется — зрение не восстанавливается.",
    category: "crossAffliction",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_AFFLICTION", afflictionType: "sleep", duration: ad(5) },
        label: "Магический сон",
        expect: [{ desc: "Недуг: сон", check: (s) => afflictionType(s) === "sleep" }]
      },
      {
        event: { type: "APPLY_BLINDED", severity: bs(4) },
        label: "Полное ослепление",
        expect: [{ desc: "Полностью ослеплён", check: isFullyBlinded }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода",
        expect: []
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(2) },
        label: "Конец хода — выносливость подъём (заблокировано сном)",
        expect: [{ desc: "Полностью ослеплён (без изменений)", check: isFullyBlinded }]
      }
    ]
  },

  // ========================================
  // 2.9 — Усталость до потери сознания снимает путы и слепоту
  // ========================================
  {
    id: "cross-fatigue-incap-clears-all",
    title: "Потеря сознания от усталости снимает путы и слепоту",
    description: "Персонаж схвачен и ослеплён. Третий уровень усталости → потеря сознания → путы и слепота снимаются.",
    category: "crossAffliction",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_ENTANGLED" },
        label: "Персонаж схвачен",
        expect: [{ desc: "Схвачен", check: isEntangled }]
      },
      {
        event: { type: "APPLY_BLINDED", severity: bs(4) },
        label: "Полное ослепление",
        expect: [{ desc: "Полностью ослеплён", check: isFullyBlinded }]
      },
      {
        event: { type: "APPLY_FATIGUE" },
        label: "Усталость 1 — утомлён",
        expect: [{ desc: "Утомлён", check: (s) => s.matches({ alive: { fatigueTrack: "fatigued" } }) }]
      },
      {
        event: { type: "APPLY_FATIGUE" },
        label: "Усталость 2 — истощён",
        expect: [{ desc: "Истощён", check: (s) => s.matches({ alive: { fatigueTrack: "exhausted" } }) }]
      },
      {
        event: { type: "APPLY_FATIGUE" },
        label: "Усталость 3 — потеря сознания",
        expect: [
          { desc: "При смерти от усталости", check: (s) => s.matches({ alive: { fatigueTrack: "incapByFatigue" } }) },
          { desc: "НЕ схвачен", check: (s) => !isEntangled(s) },
          { desc: "НЕ ослеплён", check: (s) => !isBlinded(s) }
        ]
      }
    ]
  },

  // ========================================
  // 2.10 — Оглушение отменяет оборону
  // ========================================
  {
    id: "cross-stun-breaks-defense",
    title: "Оглушение отменяет оборону",
    description: "Персонаж в обороне. Оглушение → оборона сброшена.",
    category: "crossDefense",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода",
        expect: [{ desc: "Действует", check: (s) => s.matches({ alive: { turnPhase: "acting" } }) }]
      },
      {
        event: { type: "DEFEND" },
        label: "Оборона",
        expect: [{ desc: "В обороне", check: isDefending }]
      },
      {
        event: { type: "APPLY_STUNNED" },
        label: "Оглушение",
        expect: [
          { desc: "Оглушён", check: isStunned },
          { desc: "НЕ в обороне", check: (s) => !isDefending(s) }
        ]
      }
    ]
  },

  // ========================================
  // 2.11 — Серия попаданий до потери сознания
  // ========================================
  {
    id: "cross-progressive-damage",
    title: "Серия попаданий до потери сознания",
    description: "Четыре раунда боя: удары, оправления, нарастание ранений до incap.",
    category: "crossCombat",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(4), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Раунд 1: удар с подъёмом — 1 ранение, шок",
        expect: [
          { desc: "Ранения = 1", check: (s) => s.context.wounds === 1 },
          { desc: "В шоке", check: isShaken }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) },
        label: "Раунд 2: оправление от шока",
        expect: [{ desc: "НЕ в шоке", check: (s) => !isShaken(s) }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Конец раунда 2",
        expect: []
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(5), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Раунд 3: ещё удар — +1 ранение, шок",
        expect: [
          { desc: "Ранения = 2", check: (s) => s.context.wounds === 2 },
          { desc: "В шоке", check: isShaken }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Раунд 4: оправление провал",
        expect: [{ desc: "В шоке", check: isShaken }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(8), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Раунд 4: шок на шоке → +2 ранения → превышение максимума",
        expect: [
          {
            desc: "Истекает кровью",
            check: isBleedingOut
          }
        ]
      }
    ]
  },

  // ========================================
  // 2.12 — Лечение возвращает в бой
  // ========================================
  {
    id: "cross-heal-from-incap",
    title: "Лечение возвращает в бой из incap",
    description: "Персонаж истекает кровью. Лечение 1 ранения → возврат в active. Лечение остальных ранений.",
    category: "crossHealing",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "3 ранения, шок",
        expect: [{ desc: "Ранения = 3", check: (s) => s.context.wounds === 3 }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Шок на шоке → истекает кровью",
        expect: [
          {
            desc: "Истекает кровью",
            check: isBleedingOut
          }
        ]
      },
      {
        event: { type: "HEAL", amount: ha(1) },
        label: "Лечение 1 ранения → возврат в строй",
        expect: [
          { desc: "Ранения = 2", check: (s) => s.context.wounds === 2 },
          { desc: "Снова в строю", check: (s) => s.matches({ alive: { damageTrack: "active" } }) }
        ]
      },
      {
        event: { type: "HEAL", amount: ha(2) },
        label: "Лечение оставшихся ранений",
        expect: [
          { desc: "Ранения = 0", check: (s) => s.context.wounds === 0 },
          { desc: "Полностью здоров", check: (s) => !isShaken(s) && s.context.wounds === 0 }
        ]
      }
    ]
  },

  // ========================================
  // 2.13 — Наготове сохраняется между раундами
  // ========================================
  {
    id: "cross-hold-persists-rounds",
    title: "Наготове сохраняется между раундами",
    description: "Персонаж наготове, пропускает два раунда, затем действует.",
    category: "crossHold",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Раунд 1: начало хода",
        expect: []
      },
      {
        event: { type: "GO_ON_HOLD" },
        label: "Наготове",
        expect: [{ desc: "Наготове", check: isOnHold }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Конец раунда 1",
        expect: [{ desc: "Наготове сохраняется (контекст)", check: (s) => s.context.onHold }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Раунд 2: наготове сохраняется",
        expect: [{ desc: "Наготове", check: isOnHold }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Конец раунда 2",
        expect: [{ desc: "Наготове сохраняется (контекст)", check: (s) => s.context.onHold }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Раунд 3: всё ещё наготове",
        expect: [{ desc: "Наготове", check: isOnHold }]
      },
      {
        event: { type: "ACT_FROM_HOLD" },
        label: "Решает действовать",
        expect: [
          { desc: "Действует", check: (s) => s.matches({ alive: { turnPhase: "acting" } }) },
          { desc: "НЕ наготове", check: (s) => !isOnHold(s) }
        ]
      }
    ]
  },

  // ========================================
  // 2.14 — Таймер отвлечения замораживается наготове
  // ========================================
  {
    id: "cross-distracted-frozen-on-hold",
    title: "Таймер отвлечения не тикает наготове",
    description:
      "Персонаж отвлечён, уходит наготове. Пока наготове, таймер не тикает. После действия — тикает нормально.",
    category: "crossHold",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_DISTRACTED" },
        label: "Отвлечён (вне хода, таймер = 0)",
        expect: [
          { desc: "Отвлечён", check: isDistracted },
          { desc: "Таймер = 0", check: (s) => s.context.distractedTimer === 0 }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода",
        expect: []
      },
      {
        event: { type: "GO_ON_HOLD" },
        label: "Наготове",
        expect: [{ desc: "Наготове", check: isOnHold }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Конец раунда (наготове → idle, таймер не тикает)",
        expect: [
          { desc: "Отвлечён", check: isDistracted },
          { desc: "Таймер = 0 (заморожен)", check: (s) => s.context.distractedTimer === 0 }
        ]
      }
    ]
  },

  // ========================================
  // 2.16 — Цепочка откатов
  // ========================================
  {
    id: "cross-backlash-chain",
    title: "Откат: все силы пропадают + усталость",
    description: "Мистик поддерживает 2 силы, уже утомлён. Откат → все силы сброшены, +1 усталость → истощён.",
    category: "crossAffliction",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_POWER_EFFECT", etype: "armor", duration: 3 },
        label: "Сила «доспех» (3 раунда)",
        expect: [{ desc: "1 эффект", check: (s) => activeEffectsList(s).length === 1 }]
      },
      {
        event: { type: "APPLY_POWER_EFFECT", etype: "boost", duration: 2 },
        label: "Сила «усиление» (2 раунда)",
        expect: [{ desc: "2 эффекта", check: (s) => activeEffectsList(s).length === 2 }]
      },
      {
        event: { type: "APPLY_FATIGUE" },
        label: "Уже утомлён",
        expect: [{ desc: "Утомлён", check: (s) => s.matches({ alive: { fatigueTrack: "fatigued" } }) }]
      },
      {
        event: { type: "BACKLASH" },
        label: "Откат! Все силы сброшены + усталость",
        expect: [
          { desc: "0 эффектов", check: (s) => activeEffectsList(s).length === 0 },
          { desc: "Истощён", check: (s) => s.matches({ alive: { fatigueTrack: "exhausted" } }) }
        ]
      }
    ]
  },

  // ========================================
  // 2.17 — Страх → оглушение → каскад
  // ========================================
  {
    id: "cross-fear-stun-cascade",
    title: "Страх → оглушение → полный каскад",
    description: "Бросок d20 = 13 по таблице страха → оглушение → лежит + отвлечён + уязвим. Попытка оправиться.",
    category: "crossFear",
    characterType: "wildCard",
    steps: [
      {
        event: null,
        label: "Бросок по таблице страха: d20 = 13 → оглушение + метка страха",
        expect: []
      },
      {
        event: { type: "APPLY_STUNNED" },
        label: "Результат: оглушение",
        expect: [
          { desc: "Оглушён", check: isStunned },
          { desc: "Лежит", check: isProne },
          { desc: "Отвлечён", check: isDistracted },
          { desc: "Уязвим", check: isVulnerable }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(1), spiritRoll: sr(0) },
        label: "Начало хода — выносливость успех, оглушение снято",
        expect: [
          { desc: "НЕ оглушён", check: (s) => !isStunned(s) },
          { desc: "Лежит (надо вставать)", check: isProne },
          { desc: "Уязвим (после оглушения)", check: isVulnerable }
        ]
      }
    ]
  },

  // ========================================
  // 2.18 — Дикая карта vs статист: один и тот же урон
  // ========================================
  {
    id: "cross-wc-survives-heavy-hit",
    title: "Дикая карта выживает при тяжёлом ударе",
    description: "Удар с превышением 8 (два подъёма). Дикая карта получает 2 ранения и шок, но остаётся в строю.",
    category: "crossCombat",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(8), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Удар (превышение 8) по дикой карте",
        expect: [
          { desc: "Жив", check: (s) => !isDead(s) },
          { desc: "В шоке", check: isShaken },
          { desc: "Ранения = 2", check: (s) => s.context.wounds === 2 }
        ]
      }
    ]
  },
  // ========================================
  // 2.19 — Гонка со смертью
  // ========================================
  {
    id: "cross-death-race",
    title: "Гонка со смертью — серия проверок",
    description:
      "Персонаж истекает кровью. Раунд 1: выносливость 1 — выжил, кровотечение продолжается. Раунд 2: подъём — стабилизация.",
    category: "crossDeath",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "3 ранения, шок",
        expect: [{ desc: "Ранения = 3", check: (s) => s.context.wounds === 3 }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Превышение максимума → истекает кровью",
        expect: [
          {
            desc: "Истекает кровью",
            check: isBleedingOut
          }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(1), spiritRoll: sr(0) },
        label: "Раунд 1: выносливость 1 — выжил, но кровотечение",
        expect: [
          {
            desc: "Всё ещё истекает кровью",
            check: isBleedingOut
          },
          { desc: "Жив", check: (s) => !isDead(s) }
        ]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: "Конец раунда 1",
        expect: []
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(2), spiritRoll: sr(0) },
        label: "Раунд 2: выносливость подъём — стабилизация",
        expect: [
          { desc: "Стабилен", check: isIncapStable },
          { desc: "Жив", check: (s) => !isDead(s) }
        ]
      }
    ]
  },

  // ========================================
  // 2.20 — Ограничения обороны
  // ========================================
  {
    id: "cross-defense-blocked-shaken",
    title: "Оборона невозможна в шоке",
    description: "Персонаж в шоке не может перейти в оборону.",
    category: "crossDefense",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: "Персонаж в шоке",
        expect: [{ desc: "В шоке", check: isShaken }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода — оправление провал",
        expect: [{ desc: "В шоке", check: isShaken }]
      },
      {
        event: { type: "DEFEND" },
        label: "Попытка обороны (заблокирована шоком)",
        expect: [{ desc: "НЕ в обороне", check: (s) => !isDefending(s) }]
      }
    ]
  },
  {
    id: "cross-defense-blocked-hold",
    title: "Оборона блокирует наготове",
    description: "Персонаж в обороне не может перейти наготове (holdUsed = true).",
    category: "crossDefense",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: "Начало хода",
        expect: [{ desc: "Действует", check: (s) => s.matches({ alive: { turnPhase: "acting" } }) }]
      },
      {
        event: { type: "DEFEND" },
        label: "Оборона",
        expect: [{ desc: "В обороне", check: isDefending }]
      },
      {
        event: { type: "GO_ON_HOLD" },
        label: "Попытка наготове (заблокирована обороной)",
        expect: [
          { desc: "НЕ наготове", check: (s) => !isOnHold(s) },
          { desc: "В обороне", check: isDefending }
        ]
      }
    ]
  }
]
