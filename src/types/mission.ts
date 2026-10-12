import type { QueryResult } from "./database";

export interface Mission {
  id: string;
  title: string;
  subtitle: string;
  briefing: string;
  objectives: Objective[];
  hints: string[];
  unlockCondition?: string;
  narrativeOnComplete: string;
  difficulty: "tutorial" | "easy" | "medium" | "hard";
  sqlConcepts: string[];
  unlockedTables?: string[]; // if set, only these tables are shown unlocked; null/undefined = all
}

export interface Objective {
  id: string;
  description: string;
  hint?: string;
  validation: ValidationRule;
  storyReward?: string;
  order: number;
}

export type CellValue = string | number | null;

export type ValidationRule =
  | { type: "row_count"; expected: number; comparison: "eq" | "gte" | "lte" }
  | { type: "contains_columns"; columns: string[] }
  | { type: "contains_value"; column: string; value: unknown }
  | { type: "exact_match"; referenceQuery: string }
  | { type: "custom"; check: (result: QueryResult) => ValidationOutcome }
  | { type: "requires_column"; column: string; minRows?: number }
  | { type: "contains_substring"; column: string; substring: string }
  | { type: "value_check"; row: number; col: number; comparison: "eq" | "gt" | "gte" | "lt" | "lte"; expected: number }
  | { type: "compound"; rules: ValidationRule[]; successMessage: string }
  | { type: "any_of"; rules: ValidationRule[]; successMessage: string }
  /**
   * Любая ячейка результата (или ячейка одного из перечисленных столбцов) равна value.
   * Числа сравниваются с допуском tolerance (по умолчанию 0.01), строки — без учёта регистра.
   */
  | { type: "cell_value"; value: CellValue; columns?: string[]; tolerance?: number }
  /**
   * Значения столбца совпадают с эталоном (списком values или первым столбцом referenceQuery).
   * Столбец ищется по именам из columns; если ни одно имя не найдено — по содержимому любого столбца.
   * mode: equal — те же значения; superset — эталон входит в результат; subset — результат входит в эталон.
   * ordered: сравнивать последовательность (для заданий на ORDER BY).
   */
  | {
      type: "column_values";
      columns?: string[];
      values?: CellValue[];
      referenceQuery?: string;
      mode?: "equal" | "superset" | "subset";
      ordered?: boolean;
    }
  /**
   * Строки совпадают с эталонным запросом по его столбцам. Лишние столбцы игрока допустимы.
   * Столбец эталона ищется в результате игрока по имени (или алиасам), затем — по совпадению значений.
   */
  | { type: "rows_match"; referenceQuery: string; ordered?: boolean; aliases?: Record<string, string[]> }
  /** Инверсия правила — например, «в результате не должно быть ложного следа» */
  | { type: "not"; rule: ValidationRule; message: string };

export interface ValidationOutcome {
  passed: boolean;
  message: string;
}
