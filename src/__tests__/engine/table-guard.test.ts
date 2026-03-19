import { describe, it, expect } from "vitest";
import { extractReferencedTables, checkTableAccess } from "@/engine/table-guard";

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
