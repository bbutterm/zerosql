import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import type { QueryResult, TableInfo, ForeignKey } from "@/types/database";

let db: Database | null = null;
let initPromise: Promise<Database> | null = null;

export async function getDatabase(): Promise<Database> {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = initSqlJs({
    locateFile: () => "/sql-wasm.wasm",
  }).then((SQL) => {
    db = new SQL.Database();
    return db;
  });

  return initPromise;
}

export function executeQuery(database: Database, sql: string): QueryResult {
  const start = performance.now();
  try {
    const results = database.exec(sql);
    const elapsed = performance.now() - start;

    if (results.length === 0) {
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: Math.round(elapsed * 100) / 100,
        error: null,
      };
    }

    const last = results[results.length - 1];
    return {
      columns: last.columns,
      rows: last.values,
      rowCount: last.values.length,
      executionTimeMs: Math.round(elapsed * 100) / 100,
      error: null,
    };
  } catch (e) {
    const elapsed = performance.now() - start;
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: Math.round(elapsed * 100) / 100,
      error: e instanceof Error ? e.message : String(e),
    };
  }
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
            pk: Number(pk) === 1,
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

let _SQL: SqlJsStatic | null = null;

export async function importDatabase(data: Uint8Array): Promise<Database> {
  if (!_SQL) {
    _SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
  }
  return new _SQL.Database(data);
}
