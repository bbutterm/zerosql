import type { Database } from "sql.js";
import type { QueryResult, TableInfo } from "@/types/database";
import { executeQuery } from "./database";
import { checkSqlPolicy, describePolicyViolation, type AccessCheck, type SqlPolicy } from "./table-guard";
import { explainSqlError } from "./sql-errors";

/**
 * Запрос игрока: политика доступа + выполнение + объяснение ошибки.
 * Один код на всех: фасад (executeSQL) и рантайм дела (воркер и
 * внутрипроцессная реализация EngineClient).
 */

export interface ExecuteOptions {
  /**
   * Белый список записи (CaseDef.writableTables): INSERT/UPDATE/DELETE/REPLACE
   * только в эти таблицы, плюс BEGIN/COMMIT/ROLLBACK. Пуст — только чтение.
   */
  writableTables?: readonly string[];
  /** CREATE VIEW / DROP VIEW своих представлений (CaseDef.allowViews) */
  allowViews?: boolean;
  /** Представления, созданные игроком (viewChanges): их можно читать и удалять */
  playerViews?: readonly string[];
  /**
   * v1: разрешить любую запись и DDL. Запреты ATTACH, PRAGMA и main./temp. действуют всегда.
   * @deprecated v2 передаёт writableTables / allowViews.
   */
  allowWrites?: boolean;
  /** Схема для подсказок в ошибках (только доступные игроку таблицы) */
  schema?: TableInfo[];
}

/** Политика запросов игрока из параметров executeSQL */
export function playerPolicy(unlockedTables: string[] | null, options: ExecuteOptions = {}): SqlPolicy {
  return {
    unlockedTables,
    allowWrites: options.allowWrites,
    writableTables: options.writableTables,
    allowViews: options.allowViews,
    playerViews: options.playerViews,
  };
}

/** Результат отказа политики: «ОТКАЗАНО», «ТОЛЬКО ЧТЕНИЕ», «ЗАПРЕЩЕНО» */
export function deniedResult(access: AccessCheck, policy: SqlPolicy): QueryResult {
  return { columns: [], rows: [], rowCount: 0, executionTimeMs: 0, ...describePolicyViolation(access, policy) };
}

/** Объяснение ошибки SQLite по доступным игроку таблицам и столбцам (дописывается в result) */
export function explainResultError(result: QueryResult, unlockedTables: readonly string[] | null, schema: readonly TableInfo[] = []): QueryResult {
  if (result.error) {
    const visible = schema.filter((t) => unlockedTables === null || unlockedTables.includes(t.name));
    result.errorHelp = explainSqlError(result.error, {
      tables: visible.map((t) => t.name),
      columns: visible.flatMap((t) => t.columns.map((c) => c.name)),
    });
  }
  return result;
}

/** Проверка доступа + выполнение SQL в одном вызове. Ошибки — в QueryResult, не исключения */
export function executeSQL(
  db: Database,
  sql: string,
  unlockedTables: string[] | null,
  options: ExecuteOptions = {}
): QueryResult {
  const policy = playerPolicy(unlockedTables, options);
  const access = checkSqlPolicy(sql, policy);
  if (!access.allowed) return deniedResult(access, policy);
  return explainResultError(executeQuery(db, sql), unlockedTables, options.schema);
}
