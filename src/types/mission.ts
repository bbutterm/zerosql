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
  | { type: "any_of"; rules: ValidationRule[]; successMessage: string };

export interface ValidationOutcome {
  passed: boolean;
  message: string;
}
