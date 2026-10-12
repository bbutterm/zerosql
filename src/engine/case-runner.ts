import type { Database } from "sql.js";
import type { QueryResult } from "@/types/database";
import type { ValidationOutcome, ValidationRule } from "@/types/mission";
import type { CaseDef, CaseObjective, EvidenceDef } from "@/types/case";
import { validate } from "./validator";

/**
 * Прогресс по задачам дела (v2).
 *
 * Основные задачи идут строго по порядку (`order`): проверяется только самая
 * ранняя невыполненная, и за один запрос закрывается не больше одной основной
 * задачи. Дополнительные (`optional`) задачи порядка не имеют — каждая
 * проверяется на любом запросе, и за один запрос их может закрыться сколько
 * угодно. Проверяется результат запроса, а не его текст.
 */

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
function safeValidate(rule: ValidationRule, result: QueryResult, db: Database): ValidationOutcome {
  try {
    return validate(rule, result, db);
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

/** Основные задачи по порядку выполнения */
export function mainObjectives(caseDef: CaseDef): CaseObjective[] {
  return caseDef.objectives.filter((o) => !o.optional).sort((a, b) => a.order - b.order);
}

/** Дополнительные задачи в порядке объявления */
export function optionalObjectives(caseDef: CaseDef): CaseObjective[] {
  return caseDef.objectives.filter((o) => o.optional);
}

/** Текущая основная задача — самая ранняя невыполненная; null, если все выполнены */
export function activeObjective(caseDef: CaseDef, completedIds: ReadonlySet<string>): CaseObjective | null {
  return mainObjectives(caseDef).find((o) => !completedIds.has(o.id)) ?? null;
}

/** Все основные задачи выполнены (дополнительные не обязательны) */
export function isCaseObjectivesDone(caseDef: CaseDef, completedIds: ReadonlySet<string>): boolean {
  return activeObjective(caseDef, completedIds) === null;
}

/**
 * Проверяет результат запроса против задач дела.
 * Запрос с ошибкой ничего не закрывает и не даёт обратной связи.
 */
export function checkCaseProgress(
  caseDef: CaseDef,
  result: QueryResult,
  db: Database,
  completedIds: ReadonlySet<string>
): CaseProgress {
  if (result.error) return { completed: [], activeFeedback: null };

  const completed: CompletedObjective[] = [];
  let activeFeedback: string | null = null;

  const active = activeObjective(caseDef, completedIds);
  if (active) {
    const outcome = safeValidate(active.validation, result, db);
    if (outcome.passed) {
      completed.push(toCompleted(active));
    } else if (result.columns.length > 0) {
      activeFeedback = outcome.message;
    }
  }

  for (const objective of optionalObjectives(caseDef)) {
    if (completedIds.has(objective.id)) continue;
    if (safeValidate(objective.validation, result, db).passed) {
      completed.push(toCompleted(objective));
    }
  }

  return { completed, activeFeedback };
}
