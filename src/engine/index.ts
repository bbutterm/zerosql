/**
 * Engine Facade — единая точка входа в ядро ZeroSQL.
 * Оборачивает внутренние модули, логику не меняет.
 */

import type { Database } from "sql.js";
import { getDatabase, executeQuery, getTableSchema, getForeignKeys as _getForeignKeys } from "./database";
import { SCHEMA_SQL } from "./schema";
import { SEED_SQL } from "./seed";
import { checkTableAccess } from "./table-guard";
import { checkObjectives, isMissionComplete as _isMissionComplete } from "./mission-runner";

import type { QueryResult, TableInfo, ForeignKey } from "@/types/database";
import type { Mission, ValidationOutcome } from "@/types/mission";
import type { ObjectiveResult } from "./mission-runner";

// --- Re-export types for external consumers ---
export type { QueryResult, TableInfo, ForeignKey } from "@/types/database";
export type { Mission, ValidationOutcome } from "@/types/mission";
export type { ObjectiveResult } from "./mission-runner";

// --- Facade functions ---

/** Создаёт БД, накатывает schema + seed, возвращает всё что нужно стору */
export async function initEngine(): Promise<{
  db: Database;
  schema: TableInfo[];
  foreignKeys: ForeignKey[];
}> {
  const db = await getDatabase();
  executeQuery(db, SCHEMA_SQL);

  // Seed only if tables are empty (idempotent)
  const check = executeQuery(db, "SELECT COUNT(*) as c FROM suspects");
  if (check.rows.length === 0 || (check.rows[0][0] as number) === 0) {
    executeQuery(db, SEED_SQL);
  }

  const schema = getTableSchema(db);
  const foreignKeys = _getForeignKeys(db);
  return { db, schema, foreignKeys };
}

/** Проверка доступа + выполнение SQL в одном вызове */
export function executeSQL(
  db: Database,
  sql: string,
  unlockedTables: string[] | null
): QueryResult {
  const access = checkTableAccess(sql, unlockedTables);
  if (!access.allowed) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      error: `[ДОСТУП ЗАПРЕЩЁН] Таблица «${access.blockedTable}» ещё не разблокирована. Продолжайте расследование — новые данные откроются в следующих делах.`,
    };
  }
  return executeQuery(db, sql);
}

/** Проверка целей миссии — прокси к mission-runner */
export function checkMissionProgress(
  mission: Mission,
  result: QueryResult,
  db: Database,
  completedObjectives: Set<string>
): ObjectiveResult[] {
  return checkObjectives(mission, result, db, completedObjectives);
}

/** Завершена ли миссия — прокси к mission-runner */
export function isMissionComplete(
  mission: Mission,
  completedObjectives: Set<string>
): boolean {
  return _isMissionComplete(mission, completedObjectives);
}

/** Схема таблиц для UI */
export function getSchema(db: Database): TableInfo[] {
  return getTableSchema(db);
}

/** FK-связи для UI */
export function getForeignKeys(db: Database): ForeignKey[] {
  return _getForeignKeys(db);
}
