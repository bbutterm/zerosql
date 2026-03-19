export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  executionTimeMs: number;
  error: string | null;
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
