import { describe, it, expect, beforeAll } from "vitest";
import type { Database } from "sql.js";
import { createDatabase, executeQuery } from "@/engine/database";
import { likePatternToRegExp } from "@/engine/sql-functions";

let db: Database;

const scalar = (sql: string) => executeQuery(db, sql).rows[0]?.[0];

beforeAll(async () => {
  db = await createDatabase();
});

describe("Unicode LIKE / lower / upper", () => {
  it("LIKE не различает регистр кириллицы", () => {
    expect(scalar("SELECT 'Груз' LIKE '%груз%'")).toBe(1);
    expect(scalar("SELECT 'ГРУЗ' LIKE 'груз'")).toBe(1);
  });

  it("LIKE по-прежнему работает для латиницы и шаблона _", () => {
    expect(scalar("SELECT 'abc' LIKE 'A_C'")).toBe(1);
    expect(scalar("SELECT 'abcd' LIKE 'a_c'")).toBe(0);
  });

  it("NOT LIKE", () => {
    expect(scalar("SELECT 'Груз' NOT LIKE '%груз%'")).toBe(0);
  });

  it("LIKE с NULL даёт NULL", () => {
    expect(scalar("SELECT NULL LIKE 'a'")).toBeNull();
  });

  it("LIKE ... ESCAPE", () => {
    expect(scalar("SELECT '100%' LIKE '100!%' ESCAPE '!'")).toBe(1);
    expect(scalar("SELECT '1000' LIKE '100!%' ESCAPE '!'")).toBe(0);
  });

  it("спецсимволы регулярных выражений экранируются", () => {
    expect(scalar("SELECT 'a.b' LIKE 'a.b'")).toBe(1);
    expect(scalar("SELECT 'axb' LIKE 'a.b'")).toBe(0);
    expect(scalar("SELECT '(x)' LIKE '(%)'")).toBe(1);
  });

  it("многострочные значения", () => {
    expect(scalar("SELECT 'строка\nещё' LIKE '%ещё'")).toBe(1);
  });

  it("lower/upper работают с кириллицей", () => {
    expect(scalar("SELECT lower('ГРУЗ Ё')")).toBe("груз ё");
    expect(scalar("SELECT upper('груз')")).toBe("ГРУЗ");
  });

  it("LIKE работает в WHERE по таблице", () => {
    db.run("CREATE TABLE notes (t TEXT); INSERT INTO notes VALUES ('Встреча в Порту'), ('склад'), ('ПОРТ');");
    expect(scalar("SELECT COUNT(*) FROM notes WHERE t LIKE '%порт%'")).toBe(2);
  });

  it("кэш шаблонов возвращает тот же RegExp", () => {
    expect(likePatternToRegExp("%a%")).toBe(likePatternToRegExp("%a%"));
  });
});
