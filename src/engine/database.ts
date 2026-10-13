import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import type { QueryResult, TableInfo, ForeignKey } from "@/types/database";
import { registerUnicodeFunctions } from "./sql-functions";

/**
 * Предел строк в результате. Защищает вкладку от зависания, если игрок
 * случайно соберёт декартово произведение больших таблиц: SQLite отдаёт
 * строки лениво, и мы просто перестаём их читать.
 */
export const MAX_RESULT_ROWS = 5000;

let sqlPromise: Promise<SqlJsStatic> | null = null;

/** Адрес wasm в браузере: лежит в /public (scripts/sync-wasm.mjs) */
let wasmUrl = "/sql-wasm.wasm";

/**
 * Переопределяет адрес sql-wasm.wasm (например, воркер с другим basePath).
 * Действует до первой загрузки sql.js.
 */
export function setSqlWasmUrl(url: string): void {
  wasmUrl = url;
}

/** Браузер: вкладка или Web Worker (в воркере window нет, а wasm всё равно лежит в /public) */
function inBrowser(): boolean {
  return typeof window !== "undefined" || typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== "undefined";
}

/** Загружает sql.js один раз на поток */
export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    // В браузере wasm лежит в /public, в Node (тесты, скрипты) sql.js находит его сам
    const url = wasmUrl;
    const options = inBrowser() ? { locateFile: () => url } : undefined;
    sqlPromise = initSqlJs(options).catch((e) => {
      sqlPromise = null;
      throw e;
    });
  }
  return sqlPromise;
}

/** Новая пустая БД с Unicode-версиями LIKE / lower / upper */
export async function createDatabase(data?: Uint8Array): Promise<Database> {
  const SQL = await loadSqlJs();
  const db = new SQL.Database(data);
  registerUnicodeFunctions(db);
  return db;
}

function elapsedSince(start: number): number {
  return Math.round((performance.now() - start) * 100) / 100;
}

export function executeQuery(
  database: Database,
  sql: string,
  maxRows: number = MAX_RESULT_ROWS
): QueryResult {
  const start = performance.now();
  let columns: string[] = [];
  let rows: unknown[][] = [];
  let truncated = false;

  try {
    for (const stmt of database.iterateStatements(sql)) {
      try {
        const stmtColumns = stmt.getColumnNames();
        const stmtRows: unknown[][] = [];
        let cut = false;
        while (stmt.step()) {
          if (stmtRows.length >= maxRows) {
            cut = true;
            break;
          }
          stmtRows.push(stmt.get());
        }
        // Как и раньше, результатом считается последняя инструкция, вернувшая столбцы
        if (stmtColumns.length > 0) {
          columns = stmtColumns;
          rows = stmtRows;
          truncated = cut;
        }
      } finally {
        stmt.free();
      }
    }
  } catch (e) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: elapsedSince(start),
      error: e instanceof Error ? e.message : String(e),
      errorKind: "sql",
    };
  }

  return {
    columns,
    rows,
    rowCount: rows.length,
    executionTimeMs: elapsedSince(start),
    error: null,
    ...(truncated ? { truncated: true } : {}),
  };
}

export function getTableSchema(database: Database): TableInfo[] {
  const tables = database.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  if (tables.length === 0) return [];

  return tables[0].values.map(([name]) => {
    const pragma = database.exec(`PRAGMA table_info('${name}')`);
    const columns =
      pragma.length > 0
        ? pragma[0].values.map(([, colName, colType, notNull, , pk]) => ({
            name: String(colName),
            type: String(colType),
            pk: Number(pk) > 0,
            notnull: Number(notNull) === 1,
          }))
        : [];
    return { name: String(name), columns };
  });
}

export function getForeignKeys(database: Database): ForeignKey[] {
  const tables = database.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  );
  if (tables.length === 0) return [];

  const fks: ForeignKey[] = [];
  for (const [tableName] of tables[0].values) {
    const pragma = database.exec(`PRAGMA foreign_key_list('${tableName}')`);
    if (pragma.length > 0) {
      for (const row of pragma[0].values) {
        // row: [id, seq, table, from, to, ...]
        fks.push({
          from: String(tableName),
          fromColumn: String(row[3]),
          to: String(row[2]),
          toColumn: String(row[4]),
        });
      }
    }
  }
  return fks;
}

export function exportDatabase(database: Database): Uint8Array {
  return database.export();
}
