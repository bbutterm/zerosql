export interface SqlErrorHelp {
  title: string;
  explanation: string;
  suggestion?: string;
}

export type QueryErrorKind = "sql" | "locked_table" | "read_only";

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  executionTimeMs: number;
  error: string | null;
  /** Тип ошибки: синтаксис/выполнение SQLite или сюжетный запрет */
  errorKind?: QueryErrorKind;
  /** Объяснение ошибки на русском для игрока */
  errorHelp?: SqlErrorHelp;
  /** Результат обрезан по MAX_RESULT_ROWS */
  truncated?: boolean;
}

export interface ColumnInfo {
  name: string;
  type: string;
  pk: boolean;
  notnull: boolean;
}

export interface ForeignKey {
  from: string;       // table name
  fromColumn: string;
  to: string;         // referenced table
  toColumn: string;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
}
