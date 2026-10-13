import type { Database } from "sql.js";
import type { QueryResult } from "@/types/database";
import type { ValidationOutcome, ValidationRule } from "@/types/mission";
import type { CaseDef, CaseObjective, EvidenceDef, FlagValue, ValidationContext } from "@/types/case";
import { validate } from "./validator";
import { flagsMatch } from "./live";

/**
 * Прогресс по задачам дела (v2).
 *
 * Основные задачи идут строго по порядку (`order`): проверяется только самая
 * ранняя невыполненная, и за один запрос закрывается не больше одной основной
 * задачи. Дополнительные (`optional`) задачи порядка не имеют — каждая
 * проверяется на любом запросе, и за один запрос их может закрыться сколько
 * угодно. Проверяется результат запроса, а не его текст.
 *
 * Условные задачи (`when`) существуют только при своих флагах: если условие
 * ложно, задача не активна и не нужна для закрытия дела. Флаги берутся из
 * ValidationContext.flags (или отдельного аргумента flags); без них
 * отсутствующий флаг равен false.
 */

type Flags = Readonly<Record<string, FlagValue>> | undefined;

/** Задача, выполненная этим запросом */
export interface CompletedObjective {
  objectiveId: string;
  /** Вывод/реплика после выполнения (`success` задачи) */
  message: string;
  /** Карточка улики, которую получает игрок */
  evidence?: EvidenceDef;
  /** Сцена, которую нужно проиграть после выполнения */
  sceneAfter?: string;
  /** Дополнительная задача */
  optional?: true;
}

export interface CaseProgress {
  /** Сначала основная задача (если закрылась), затем дополнительные в порядке объявления */
  completed: CompletedObjective[];
  /**
   * Почему текущая основная задача не засчитана — сообщение валидатора.
   * Только если запрос похож на попытку: без ошибки и хотя бы с одним столбцом.
   */
  activeFeedback: string | null;
}

const BROKEN_RULE: ValidationOutcome = {
  passed: false,
  message: "Проверка задания сломана. Сообщите разработчику.",
};

/** validate(), который не роняет игру на сломанном правиле (например, custom) */
function safeValidate(rule: ValidationRule, result: QueryResult, db: Database, ctx?: ValidationContext): ValidationOutcome {
  try {
    return validate(rule, result, db, ctx);
  } catch {
    return BROKEN_RULE;
  }
}

function toCompleted(objective: CaseObjective): CompletedObjective {
  return {
    objectiveId: objective.id,
    message: objective.success,
    ...(objective.evidence ? { evidence: objective.evidence } : {}),
    ...(objective.sceneAfter ? { sceneAfter: objective.sceneAfter } : {}),
    ...(objective.optional ? { optional: true as const } : {}),
  };
}

/** Задача существует при этих флагах (условие when) */
export function objectiveApplies(objective: CaseObjective, flags?: Flags): boolean {
  return flagsMatch(objective.when, flags);
}

/** Основные задачи по порядку выполнения (условные — только при своих флагах) */
export function mainObjectives(caseDef: CaseDef, flags?: Flags): CaseObjective[] {
  return caseDef.objectives
    .filter((o) => !o.optional && objectiveApplies(o, flags))
    .sort((a, b) => a.order - b.order);
}

/** Дополнительные задачи в порядке объявления (условные — только при своих флагах) */
export function optionalObjectives(caseDef: CaseDef, flags?: Flags): CaseObjective[] {
  return caseDef.objectives.filter((o) => o.optional && objectiveApplies(o, flags));
}

/** Текущая основная задача — самая ранняя невыполненная; null, если все выполнены */
export function activeObjective(caseDef: CaseDef, completedIds: ReadonlySet<string>, flags?: Flags): CaseObjective | null {
  return mainObjectives(caseDef, flags).find((o) => !completedIds.has(o.id)) ?? null;
}

/** Все основные задачи выполнены (дополнительные не обязательны) */
export function isCaseObjectivesDone(caseDef: CaseDef, completedIds: ReadonlySet<string>, flags?: Flags): boolean {
  return activeObjective(caseDef, completedIds, flags) === null;
}

/**
 * Проверяет результат запроса против задач дела.
 * Запрос с ошибкой ничего не закрывает и не даёт обратной связи.
 * ctx — состояние стола (доска, реестр увиденного, слоты, флаги) для правил
 * pin / seen / slot и условных задач; необязателен.
 */
export function checkCaseProgress(
  caseDef: CaseDef,
  result: QueryResult,
  db: Database,
  completedIds: ReadonlySet<string>,
  ctx?: ValidationContext
): CaseProgress {
  if (result.error) return { completed: [], activeFeedback: null };

  const completed: CompletedObjective[] = [];
  let activeFeedback: string | null = null;
  const flags = ctx?.flags;

  const active = activeObjective(caseDef, completedIds, flags);
  if (active) {
    const outcome = safeValidate(active.validation, result, db, ctx);
    if (outcome.passed) {
      completed.push(toCompleted(active));
    } else if (result.columns.length > 0) {
      activeFeedback = outcome.message;
    }
  }

  for (const objective of optionalObjectives(caseDef, flags)) {
    if (completedIds.has(objective.id)) continue;
    if (safeValidate(objective.validation, result, db, ctx).passed) {
      completed.push(toCompleted(objective));
    }
  }

  return { completed, activeFeedback };
}
