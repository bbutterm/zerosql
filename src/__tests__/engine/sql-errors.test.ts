import { describe, it, expect, beforeAll } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import { explainSqlError, closestMatch, levenshtein } from "@/engine/sql-errors";

let db: Database;

/** Берём настоящие сообщения SQLite, чтобы тесты ловили смену формата */
function errorOf(sql: string): string {
  try {
    db.exec(sql);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error(`Запрос не упал: ${sql}`);
}

const ctx = {
  tables: ["suspects", "calls"],
  columns: ["id", "name", "status", "caller_id", "started_at"],
};

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run("CREATE TABLE suspects (id INTEGER, name TEXT, status TEXT); CREATE TABLE calls (id INTEGER, caller_id INTEGER, started_at TEXT);");
});

describe("explainSqlError — реальные сообщения SQLite", () => {
  it("опечатка в имени таблицы → предложение", () => {
    const help = explainSqlError(errorOf("SELECT * FROM suspect"), ctx);
    expect(help.title).toBe("Нет такой таблицы");
    expect(help.suggestion).toContain("suspects");
  });

  it("опечатка в имени столбца → предложение", () => {
    const help = explainSqlError(errorOf("SELECT nmae FROM suspects"), ctx);
    expect(help.title).toBe("Нет такого столбца");
    expect(help.suggestion).toContain("name");
  });

  it("опечатка в столбце с псевдонимом сохраняет псевдоним", () => {
    const help = explainSqlError(errorOf("SELECT s.statu FROM suspects s"), ctx);
    expect(help.suggestion).toContain("s.status");
  });

  it("кириллица без кавычек → совет про кавычки", () => {
    const help = explainSqlError(errorOf("SELECT * FROM suspects WHERE status = розыск"), ctx);
    expect(help.title).toBe("Текст без кавычек");
    expect(help.suggestion).toContain("'розыск'");
  });

  it("опечатка в ключевом слове", () => {
    const help = explainSqlError(errorOf("SELEC * FROM suspects"), ctx);
    expect(help.title).toBe("Опечатка в ключевом слове");
    expect(help.suggestion).toContain("SELECT");
  });

  it("лишняя запятая перед FROM", () => {
    const help = explainSqlError(errorOf("SELECT id, name, FROM suspects"), ctx);
    expect(help.title).toBe("Ошибка перед FROM");
  });

  it("неверный порядок WHERE / GROUP BY", () => {
    const help = explainSqlError(errorOf("SELECT status, COUNT(*) FROM suspects GROUP BY status WHERE id > 1"), ctx);
    expect(help.title).toBe("Нарушен порядок частей запроса");
  });

  it("оборванный запрос", () => {
    expect(explainSqlError(errorOf("SELECT * FROM suspects WHERE"), ctx).title).toBe("Запрос оборван");
  });

  it("незакрытая кавычка", () => {
    expect(explainSqlError(errorOf("SELECT * FROM suspects WHERE name = 'Иван"), ctx).title).toBe("Непонятный символ");
  });

  it("неоднозначный столбец в JOIN", () => {
    const help = explainSqlError(errorOf("SELECT id FROM suspects JOIN calls ON 1"), ctx);
    expect(help.title).toBe("Неоднозначный столбец");
  });

  it("агрегат в WHERE → совет про HAVING", () => {
    const help = explainSqlError(errorOf("SELECT status FROM suspects WHERE COUNT(*) > 1"), ctx);
    expect(help.title).toBe("Агрегат не на своём месте");
    expect(help.suggestion).toContain("HAVING");
  });

  it("оконная функция в WHERE → совет про CTE", () => {
    const help = explainSqlError(errorOf("SELECT * FROM suspects WHERE ROW_NUMBER() OVER () = 1"), ctx);
    expect(help.title).toBe("Оконная функция не на своём месте");
  });

  it("ORDER BY по несуществующему номеру", () => {
    expect(explainSqlError(errorOf("SELECT id FROM suspects ORDER BY 3"), ctx).title).toBe("Номер столбца вне диапазона");
  });

  it("подзапрос с двумя столбцами в IN", () => {
    const help = explainSqlError(errorOf("SELECT * FROM suspects WHERE id IN (SELECT id, caller_id FROM calls)"), ctx);
    expect(help.title).toBe("Подзапрос вернул несколько столбцов");
  });

  it("UNION с разным числом столбцов", () => {
    const help = explainSqlError(errorOf("SELECT id FROM suspects UNION SELECT id, caller_id FROM calls"), ctx);
    expect(help.title).toContain("UNION");
  });

  it("функция из MySQL → замена для SQLite", () => {
    const help = explainSqlError(errorOf("SELECT YEAR(started_at) FROM calls"), ctx);
    expect(help.title).toBe("Нет такой функции");
    expect(help.explanation).toContain("strftime");
  });

  it("неверное число аргументов", () => {
    expect(explainSqlError(errorOf("SELECT substr() FROM suspects"), ctx).title).toBe("Неверное число аргументов");
  });

  it("LIMIT строкой", () => {
    expect(explainSqlError(errorOf("SELECT * FROM suspects LIMIT 'x'"), ctx).title).toBe("Несовпадение типов");
  });

  it("неизвестная ошибка → общий ответ", () => {
    expect(explainSqlError("something odd", ctx).title).toBe("Ошибка выполнения");
  });

  it("не подсказывает имена закрытых таблиц", () => {
    const help = explainSqlError("no such table: org_member", { tables: ["suspects"] });
    expect(help.suggestion).not.toContain("org_members");
  });
});

describe("closestMatch / levenshtein", () => {
  it("levenshtein базовые случаи", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("не предлагает слишком далёкие слова", () => {
    expect(closestMatch("xyz", ["suspects"])).toBeNull();
  });

  it("не предлагает точное совпадение", () => {
    expect(closestMatch("name", ["name"])).toBeNull();
  });
});
