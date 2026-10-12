/**
 * Журнал запросов query_log: движок пишет туда запросы игрока мимо
 * режима «только чтение», игрок может прочитать журнал обычным SELECT.
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { createDatabase, executeQuery } from "@/engine/database";
import {
  ensureQueryLog,
  logPlayerQuery,
  logQueryResult,
  queryLogStatus,
  QUERY_TEXT_MAX,
  type QueryLogMeta,
} from "@/engine/query-log";
import { executeSQL } from "@/engine";
import { PEOPLE_SQL } from "../helpers/case-fixture";

let db: Database;
const META: QueryLogMeta = { loggedAt: "2026-12-14 02:44", login: "a.novak", terminal: "АРХ-3" };
const logRows = () => executeQuery(db, "SELECT * FROM query_log ORDER BY id");

beforeEach(async () => {
  db = await createDatabase();
  db.run(PEOPLE_SQL);
});

describe("ensureQueryLog", () => {
  it("создаёт таблицу с нужными столбцами", () => {
    ensureQueryLog(db);
    expect(logRows().columns).toEqual([
      "id",
      "logged_at",
      "login",
      "terminal",
      "query_text",
      "rows_returned",
      "status",
    ]);
  });

  it("не трогает таблицу, которую уже заполнил генератор мира", () => {
    db.run(`
      CREATE TABLE query_log (id INTEGER PRIMARY KEY, logged_at TEXT, login TEXT, terminal TEXT,
        query_text TEXT, rows_returned INTEGER, status TEXT);
      INSERT INTO query_log VALUES (1, '2026-12-13 23:10', 'i.petrov', 'АРХ-1', 'SELECT 1', 1, 'ok');
    `);
    ensureQueryLog(db);
    ensureQueryLog(db);
    expect(logRows().rowCount).toBe(1);
    const id = logPlayerQuery(db, { ...META, sql: "SELECT 2", rowsReturned: 1, ok: true });
    expect(id).toBe(2);
  });
});

describe("logPlayerQuery", () => {
  it("пишет строку и возвращает её id; таблица создаётся сама", () => {
    const id = logPlayerQuery(db, { ...META, sql: "SELECT * FROM people", rowsReturned: 4, ok: true });
    expect(id).toBe(1);
    expect(logRows().rows).toEqual([[1, "2026-12-14 02:44", "a.novak", "АРХ-3", "SELECT * FROM people", 4, "ok"]]);
  });

  it("текст хранится как набран, но без пробелов по краям", () => {
    logPlayerQuery(db, { ...META, sql: "\n  select  name\nFROM people -- кто?\n  ", rowsReturned: 4, ok: true });
    expect(logRows().rows[0][4]).toBe("select  name\nFROM people -- кто?");
  });

  it("кавычки и инъекции хранятся буквально (подготовленная инструкция)", () => {
    const sql = "SELECT 'x'); DROP TABLE people; --";
    logPlayerQuery(db, { ...META, sql, rowsReturned: 0, ok: false });
    expect(logRows().rows[0][4]).toBe(sql);
    expect(executeQuery(db, "SELECT COUNT(*) FROM people").rows[0][0]).toBe(4);
  });

  it("длинный текст обрезается до QUERY_TEXT_MAX символов", () => {
    const sql = "SELECT '" + "я".repeat(QUERY_TEXT_MAX * 2) + "'";
    logPlayerQuery(db, { ...META, sql, rowsReturned: 1, ok: true });
    const stored = logRows().rows[0][4] as string;
    expect(stored).toHaveLength(QUERY_TEXT_MAX);
    expect(stored.startsWith("SELECT 'я")).toBe(true);
  });

  it("обрезка не разрывает суррогатные пары", () => {
    const sql = "🔎".repeat(QUERY_TEXT_MAX + 10);
    logPlayerQuery(db, { ...META, sql, rowsReturned: 0, ok: true });
    const stored = logRows().rows[0][4] as string;
    expect(Array.from(stored)).toHaveLength(QUERY_TEXT_MAX);
    expect(stored.endsWith("🔎")).toBe(true);
  });

  it("пустой запрос не пишется", () => {
    expect(logPlayerQuery(db, { ...META, sql: "   \n ", rowsReturned: 0, ok: true })).toBeNull();
    ensureQueryLog(db);
    expect(logRows().rowCount).toBe(0);
  });

  it("статусы ok / error / denied; у неуспешных rows_returned = 0", () => {
    logPlayerQuery(db, { ...META, sql: "SELECT 1", rowsReturned: 1, ok: true });
    logPlayerQuery(db, { ...META, sql: "SELEC 1", rowsReturned: 7, ok: false });
    logPlayerQuery(db, { ...META, sql: "SELECT * FROM vault", rowsReturned: 3, ok: false, denied: true });
    expect(logRows().rows.map((r) => [r[5], r[6]])).toEqual([
      [1, "ok"],
      [0, "error"],
      [0, "denied"],
    ]);
  });

  it("мусорное число строк → 0", () => {
    logPlayerQuery(db, { ...META, sql: "SELECT 1", rowsReturned: NaN, ok: true });
    logPlayerQuery(db, { ...META, sql: "SELECT 1", rowsReturned: -5, ok: true });
    expect(logRows().rows.map((r) => r[5])).toEqual([0, 0]);
  });
});

describe("queryLogStatus / logQueryResult с настоящим executeSQL", () => {
  it("успешный запрос", () => {
    const sql = "SELECT name FROM people";
    const result = executeSQL(db, sql, ["people"]);
    expect(queryLogStatus(result)).toBe("ok");
    logQueryResult(db, META, sql, result);
    expect(logRows().rows[0].slice(4)).toEqual([sql, 4, "ok"]);
  });

  it("ошибка SQL → error", () => {
    const result = executeSQL(db, "SELEC name FROM people", ["people"]);
    expect(queryLogStatus(result)).toBe("error");
  });

  it("закрытая таблица и запрет записи → denied (попытка тоже фиксируется)", () => {
    const locked = executeSQL(db, "SELECT * FROM people", []);
    expect(queryLogStatus(locked)).toBe("denied");
    const readOnly = executeSQL(db, "DELETE FROM people", ["people"]);
    expect(queryLogStatus(readOnly)).toBe("denied");
    logQueryResult(db, META, "DELETE FROM people", readOnly);
    expect(logRows().rows[0].slice(4)).toEqual(["DELETE FROM people", 0, "denied"]);
  });

  it("движок пишет в архив, хотя игроку он только для чтения", () => {
    ensureQueryLog(db);
    const write = executeSQL(db, "INSERT INTO query_log (login) VALUES ('hacker')", ["query_log"]);
    expect(write.errorKind).toBe("read_only");
    logQueryResult(db, META, "INSERT INTO query_log (login) VALUES ('hacker')", write);
    const rows = executeSQL(db, "SELECT login, status FROM query_log", ["query_log"]);
    expect(rows.rows).toEqual([["a.novak", "denied"]]);
  });

  it("игрок находит в журнале свои прошлые запросы", () => {
    for (const sql of ["SELECT 1", "SELECT name FROM people"]) {
      logQueryResult(db, META, sql, executeSQL(db, sql, ["people"]));
    }
    const mine = executeSQL(db, "SELECT query_text FROM query_log WHERE login = 'a.novak' ORDER BY id", ["query_log"]);
    expect(mine.rows).toEqual([["SELECT 1"], ["SELECT name FROM people"]]);
  });
});
