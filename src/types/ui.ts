/**
 * Презентационные типы UI v2 (стол расследования, улики, протокол).
 *
 * Это «вид» для компонентов: стор собирает их из данных кейса и прогресса
 * игрока. Компоненты сами ничего не вычисляют о сюжете — только показывают.
 */

/* ---------- Улики ---------- */

export const EVIDENCE_KINDS = [
  "document",
  "record",
  "photo",
  "audio",
  "testimony",
  "lead",
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface EvidenceCardData {
  id: string;
  kind: EvidenceKind;
  title: string;
  /** Короткое описание — 1–3 предложения */
  text: string;
  /** SQL, которым улика была найдена (если найдена запросом) */
  sourceQuery?: string;
  /** Откуда улика: «журнал пропусков», «показания Ахметова», … */
  source?: string;
  /** Внутриигровое время находки, уже отформатированное */
  foundAt?: string;
  /** Только что получена — подсветить и проиграть появление */
  isNew?: boolean;
}

/* ---------- Задачи ---------- */

export type ObjectiveState = "done" | "active" | "locked";

export interface ObjectiveHint {
  text: string;
  /** id персонажа, от лица которого подсказка (необязательно) */
  speaker?: string;
}

export interface ObjectiveView {
  id: string;
  text: string;
  state: ObjectiveState;
  /** Бонусная задача: показывается отдельным блоком */
  optional?: boolean;
  /** Уточнение под текстом задачи */
  detail?: string;
  /** Подсказки по уровням: от намёка до почти готового запроса */
  hints?: ObjectiveHint[];
  /** Сколько уровней уже открыто */
  hintsRevealed?: number;
  /** Сюжетный итог, показывается у выполненной задачи */
  outcome?: string;
}

/* ---------- Протокол ---------- */

export interface ProtocolOption {
  value: string;
  label: string;
  /** Короткая пометка справа: «житель», «сотрудник ЦОД», … */
  note?: string;
}

export interface ProtocolBlank {
  /** Уникален в пределах протокола */
  id: string;
  /** Что вписывается: «кто», «когда», … — для подписи и aria */
  label: string;
  options: ProtocolOption[];
}

export interface ProtocolQuestionView {
  id: string;
  /**
   * Текст утверждения с пропусками в фигурных скобках по id пропуска:
   * «{who} вошёл в машинный зал в {when}».
   */
  text: string;
  blanks: ProtocolBlank[];
}

export type ProtocolTone = "success" | "partial" | "fail" | "info";

export interface ProtocolMessage {
  tone: ProtocolTone;
  text: string;
}

/* ---------- Стол ---------- */

export type DeskPanelId = "tasks" | "evidence" | "protocol" | "reference";

export interface QueryBudget {
  /** Сколько запросов осталось */
  left: number;
  /** Сколько было всего (для шкалы) */
  total?: number;
}
