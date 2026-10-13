import { describe, it, expect } from "vitest";
import { extractReferencedTables, checkTableAccess, checkSqlPolicy, analyzeSql } from "@/engine/table-guard";

describe("extractReferencedTables", () => {
  it("извлекает таблицу из FROM", () => {
    expect(extractReferencedTables("SELECT * FROM suspects")).toEqual(["suspects"]);
  });

  it("извлекает таблицу из JOIN", () => {
    const tables = extractReferencedTables(
      "SELECT * FROM crimes JOIN crime_suspects ON crimes.id = crime_suspects.crime_id"
    );
    expect(tables).toContain("crimes");
    expect(tables).toContain("crime_suspects");
  });

  it("извлекает таблицу из INSERT INTO", () => {
    expect(extractReferencedTables("INSERT INTO suspects VALUES (1)")).toEqual(["suspects"]);
  });

  it("извлекает таблицу из UPDATE", () => {
    expect(extractReferencedTables("UPDATE suspects SET name = 'x'")).toEqual(["suspects"]);
  });

  it("case-insensitive ключевые слова", () => {
    expect(extractReferencedTables("select * from suspects")).toEqual(["suspects"]);
    expect(extractReferencedTables("SELECT * From Suspects")).toEqual(["suspects"]);
  });

  it("несколько таблиц без дупликатов", () => {
    const tables = extractReferencedTables(
      "SELECT * FROM suspects JOIN crimes ON 1=1 JOIN suspects ON 1=1"
    );
    expect(tables).toContain("suspects");
    expect(tables).toContain("crimes");
    // Set-based — no duplicates
    expect(tables.filter((t) => t === "suspects")).toHaveLength(1);
  });

  it("приводит имена к lowercase", () => {
    expect(extractReferencedTables("SELECT * FROM Suspects")).toEqual(["suspects"]);
  });
});

describe("checkTableAccess", () => {
  it("unlockedTables=null → всё разрешено", () => {
    const r = checkTableAccess("SELECT * FROM transactions", null);
    expect(r.allowed).toBe(true);
  });

  it("sqlite_master всегда разрешена", () => {
    const r = checkTableAccess("SELECT * FROM sqlite_master", ["suspects"]);
    expect(r.allowed).toBe(true);
  });

  it("разрешённая таблица → allowed:true", () => {
    const r = checkTableAccess("SELECT * FROM suspects", ["suspects", "crimes"]);
    expect(r.allowed).toBe(true);
  });

  it("заблокированная таблица → allowed:false + имя", () => {
    const r = checkTableAccess("SELECT * FROM transactions", ["suspects", "crimes"]);
    expect(r.allowed).toBe(false);
    expect(r.blockedTable).toBe("transactions");
  });

  it("case-insensitive сравнение таблиц", () => {
    const r = checkTableAccess("SELECT * FROM Suspects", ["suspects"]);
    expect(r.allowed).toBe(true);
  });

  it("блокирует при JOIN с недоступной таблицей", () => {
    const r = checkTableAccess(
      "SELECT * FROM suspects JOIN communications ON 1=1",
      ["suspects", "crimes"]
    );
    expect(r.allowed).toBe(false);
    expect(r.blockedTable).toBe("communications");
  });
});

describe("analyzeSql: обходы и сложные запросы", () => {
  const locked = ["suspects", "crimes"];

  it.each([
    ["comma-join", "SELECT * FROM suspects, org_members"],
    ["comma после JOIN ... ON", "SELECT * FROM suspects s JOIN crimes c ON s.id = c.id, org_members"],
    ["кавычки", 'SELECT * FROM "org_members"'],
    ["квадратные скобки", "SELECT * FROM [org_members]"],
    ["бэктики", "SELECT * FROM `org_members`"],
    ["схема main.", "SELECT * FROM main.org_members"],
    ["комментарий вплотную", "SELECT * FROM/**/org_members"],
    ["подзапрос", "SELECT * FROM suspects WHERE id IN (SELECT suspect_id FROM org_members)"],
    ["CTE с закрытой таблицей", "WITH x AS (SELECT * FROM org_members) SELECT * FROM x"],
    ["NATURAL JOIN", "SELECT * FROM suspects NATURAL JOIN org_members"],
    ["скалярный подзапрос", "SELECT (SELECT COUNT(*) FROM org_members) AS n"],
  ])("блокирует: %s", (_, sql) => {
    const r = checkTableAccess(sql, locked);
    expect(r.allowed).toBe(false);
    expect(r.blockedTable).toBe("org_members");
  });

  it.each([
    ["имя таблицы в строке", "SELECT * FROM suspects WHERE name = 'from org_members'"],
    ["имя таблицы в комментарии", "SELECT * FROM suspects -- JOIN org_members\n"],
    ["блочный комментарий", "SELECT * FROM suspects /* FROM org_members */"],
    ["CTE-имя не считается таблицей", "WITH wanted AS (SELECT * FROM suspects) SELECT * FROM wanted"],
    ["несколько CTE", "WITH a AS (SELECT 1), b(x) AS (SELECT 2) SELECT * FROM a, b"],
    ["рекурсивный CTE", "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 5) SELECT * FROM n"],
    ["IS DISTINCT FROM", "SELECT * FROM suspects WHERE status IS NOT DISTINCT FROM 'x'"],
    ["табличная функция", "SELECT * FROM suspects, json_each('[1,2]')"],
    ["sqlite_schema", "SELECT sql FROM sqlite_schema"],
    ["подзапрос в FROM с алиасом", "SELECT * FROM (SELECT * FROM crimes) AS c, suspects s"],
  ])("пропускает: %s", (_, sql) => {
    expect(checkTableAccess(sql, locked).allowed).toBe(true);
  });

  it("CTE-имена возвращаются отдельно", () => {
    const a = analyzeSql("WITH a AS (SELECT * FROM crimes) SELECT * FROM a JOIN suspects ON 1");
    expect(a.ctes).toEqual(["a"]);
    expect(a.tables.sort()).toEqual(["crimes", "suspects"]);
  });
});

describe("checkSqlPolicy: только чтение", () => {
  const policy = { unlockedTables: ["suspects"] };

  it.each([
    ["DELETE FROM suspects", "DELETE"],
    ["UPDATE suspects SET name = 'x'", "UPDATE"],
    ["INSERT INTO suspects (id) VALUES (999)", "INSERT"],
    ["DROP TABLE suspects", "DROP"],
    ["CREATE TABLE notes (x)", "CREATE"],
    ["ALTER TABLE suspects ADD COLUMN x", "ALTER"],
    ["WITH x AS (SELECT 1) DELETE FROM suspects", "DELETE"],
    ["SELECT 1; DELETE FROM suspects", "DELETE"],
  ])("блокирует %s", (sql, keyword) => {
    const r = checkSqlPolicy(sql, policy);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("read_only");
    expect(r.blockedKeyword).toBe(keyword);
  });

  it.each([
    "SELECT * FROM suspects",
    "  -- комментарий\n select 1",
    "WITH x AS (SELECT 1) SELECT * FROM x",
    "VALUES (1), (2)",
    "EXPLAIN QUERY PLAN SELECT * FROM suspects",
    "PRAGMA table_info(suspects)",
    "SELECT 1; SELECT 2;",
  ])("пропускает чтение: %s", (sql) => {
    expect(checkSqlPolicy(sql, policy).allowed).toBe(true);
  });

  it("allowWrites снимает ограничение", () => {
    expect(checkSqlPolicy("DELETE FROM suspects", { ...policy, allowWrites: true }).allowed).toBe(true);
  });

  it("закрытая таблица в SELECT → locked_table", () => {
    const r = checkSqlPolicy("SELECT * FROM crimes", policy);
    expect(r.reason).toBe("locked_table");
  });
});
