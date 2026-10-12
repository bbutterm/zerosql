import type { Database } from "sql.js";
import type { QueryResult } from "@/types/database";

/**
 * Журнал запросов к архиву — сюжетная механика «твой собственный след».
 * В мире есть таблица query_log с запросами всех сотрудников (её может
 * заранее наполнить генератор мира). Каждый запрос игрока движок дописывает
 * туда же — и игрок может найти в журнале сам себя.
 *
 * Запись идёт напрямую подготовленной инструкцией, мимо guard'а «только
 * чтение»: писать в архив не может игрок, но может движок.
 *
 * Решение по заблокированным запросам: они тоже пишутся — со статусом
 * 'denied'. Настоящий аудит фиксирует и попытки доступа к закрытым данным,
 * и это может стать сюжетной зацепкой («кто-то лез в закрытую таблицу»).
 * Запросы с ошибкой SQL пишутся со статусом 'error'. Пустой ввод не пишется.
 *
 * Порядок вызова: сначала выполнить запрос и проверить задачи/тайники, потом
 * писать в журнал. Иначе эталонные запросы к query_log увидят строку текущего
 * запроса, а результат игрока — нет, и проверка разойдётся на одну строку.
 */

export const QUERY_LOG_TABLE = "query_log";

/** Предел длины query_text (в символах), чтобы журнал не раздувался */
export const QUERY_TEXT_MAX = 2000;

export const QUERY_LOG_SQL = `CREATE TABLE IF NOT EXISTS ${QUERY_LOG_TABLE} (
  id INTEGER PRIMARY KEY,
  logged_at TEXT,
  login TEXT,
  terminal TEXT,
  query_text TEXT,
  rows_returned INTEGER,
  status TEXT
)`;

export type QueryLogStatus = "ok" | "error" | "denied";

/** Кто и откуда выполняет запрос */
export interface QueryLogMeta {
  /** Игровое время 'YYYY-MM-DD HH:MM' */
  loggedAt: string;
  login: string;
  terminal: string;
}

export interface PlayerQueryEntry extends QueryLogMeta {
  /** Текст запроса как его набрал игрок */
  sql: string;
  rowsReturned: number;
  /** Запрос выполнен без ошибок */
  ok: boolean;
  /** Запрос заблокирован политикой доступа (закрытая таблица, только чтение) */
  denied?: boolean;
}

/** Создаёт query_log, если генератор мира её не создал */
export function ensureQueryLog(db: Database): void {
  db.run(QUERY_LOG_SQL);
}

/** Статус записи журнала по результату executeSQL */
export function queryLogStatus(result: QueryResult): QueryLogStatus {
  if (!result.error) return "ok";
  return result.errorKind === "locked_table" || result.errorKind === "read_only" ? "denied" : "error";
}

/** Обрезает текст по QUERY_TEXT_MAX символов, не разрывая суррогатные пары */
function capText(text: string): string {
  if (text.length <= QUERY_TEXT_MAX) return text;
  return Array.from(text).slice(0, QUERY_TEXT_MAX).join("");
}

/**
 * Дописывает запрос игрока в query_log (создаёт таблицу при необходимости).
 * Возвращает id новой строки или null, если запрос пустой и не записан.
 */
export function logPlayerQuery(db: Database, entry: PlayerQueryEntry): number | null {
  const text = capText(entry.sql.trim());
  if (text === "") return null;

  const status: QueryLogStatus = entry.denied ? "denied" : entry.ok ? "ok" : "error";
  const rows = status === "ok" && Number.isFinite(entry.rowsReturned) ? Math.max(0, Math.floor(entry.rowsReturned)) : 0;

  ensureQueryLog(db);
  const stmt = db.prepare(
    `INSERT INTO ${QUERY_LOG_TABLE} (logged_at, login, terminal, query_text, rows_returned, status) VALUES (?, ?, ?, ?, ?, ?)`
  );
  try {
    stmt.run([entry.loggedAt, entry.login, entry.terminal, text, rows, status]);
  } finally {
    stmt.free();
  }
  const id = db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0];
  return typeof id === "number" ? id : Number(id);
}

/** Запись в журнал прямо по результату executeSQL: статус и число строк берутся из него */
export function logQueryResult(db: Database, meta: QueryLogMeta, sql: string, result: QueryResult): number | null {
  const status = queryLogStatus(result);
  return logPlayerQuery(db, {
    ...meta,
    sql,
    rowsReturned: result.rowCount,
    ok: status === "ok",
    denied: status === "denied",
  });
}
