/**
 * Engine Facade — единая точка входа в ядро ZeroSQL.
 * Оборачивает внутренние модули, логику не меняет.
 */

import type { Database } from "sql.js";
import { createDatabase, executeQuery, getTableSchema, getForeignKeys as _getForeignKeys } from "./database";
import { SCHEMA_SQL } from "./schema";
import { SEED_SQL } from "./seed";
import { checkSqlPolicy } from "./table-guard";
import { explainSqlError } from "./sql-errors";
import { checkObjectives, isMissionComplete as _isMissionComplete } from "./mission-runner";

import type { QueryResult, TableInfo, ForeignKey } from "@/types/database";
import type { Mission } from "@/types/mission";
import type { ObjectiveResult } from "./mission-runner";

// --- Re-export types for external consumers ---
export type { QueryResult, TableInfo, ForeignKey, SqlErrorHelp, QueryErrorKind } from "@/types/database";
export type { Mission, ValidationOutcome } from "@/types/mission";
export type { ObjectiveResult } from "./mission-runner";

// --- Facade functions ---

/** Создаёт БД, накатывает schema + seed, возвращает всё что нужно стору */
export async function initEngine(): Promise<{
  db: Database;
  schema: TableInfo[];
  foreignKeys: ForeignKey[];
}> {
  const db = await createDatabase();
  db.run(SCHEMA_SQL);
  db.run(SEED_SQL);

  const schema = getTableSchema(db);
  const foreignKeys = _getForeignKeys(db);
  return { db, schema, foreignKeys };
}

export interface ExecuteOptions {
  /** Разрешить INSERT/UPDATE/DELETE/DDL (по умолчанию архив только для чтения) */
  allowWrites?: boolean;
  /** Схема для подсказок в ошибках (только доступные игроку таблицы) */
  schema?: TableInfo[];
}

/** Проверка доступа + выполнение SQL в одном вызове. Ошибки — в QueryResult, не исключения */
export function executeSQL(
  db: Database,
  sql: string,
  unlockedTables: string[] | null,
  options: ExecuteOptions = {}
): QueryResult {
  const access = checkSqlPolicy(sql, { unlockedTables, allowWrites: options.allowWrites });
  if (!access.allowed) {
    const base = { columns: [], rows: [], rowCount: 0, executionTimeMs: 0 };
    if (access.reason === "read_only") {
      return {
        ...base,
        error: `[ТОЛЬКО ЧТЕНИЕ] Команда ${access.blockedKeyword} недоступна: архив нельзя изменять.`,
        errorKind: "read_only",
        errorHelp: {
          title: "Архив только для чтения",
          explanation: `Команды, меняющие данные или структуру (${access.blockedKeyword}), в этом деле запрещены — улики нельзя трогать.`,
          suggestion: "Используйте SELECT, чтобы найти нужное. Если очень хочется — WITH … SELECT тоже можно.",
        },
      };
    }
    return {
      ...base,
      error: `[ДОСТУП ЗАПРЕЩЁН] Таблица «${access.blockedTable}» ещё не разблокирована.`,
      errorKind: "locked_table",
      errorHelp: {
        title: "Доступ закрыт",
        explanation: `Таблица «${access.blockedTable}» пока засекречена.`,
        suggestion: "Продолжайте расследование — доступ к новым данным откроется по ходу дела.",
      },
    };
  }

  const result = executeQuery(db, sql);
  if (result.error) {
    const visible = (options.schema ?? []).filter(
      (t) => unlockedTables === null || unlockedTables.includes(t.name)
    );
    result.errorHelp = explainSqlError(result.error, {
      tables: visible.map((t) => t.name),
      columns: visible.flatMap((t) => t.columns.map((c) => c.name)),
    });
  }
  return result;
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
