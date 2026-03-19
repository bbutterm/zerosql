import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "sql.js";
import { setupTestDb } from "../helpers/setup-db";
import { executeQuery, getTableSchema, getForeignKeys } from "@/engine/database";

let db: Database;

beforeEach(async () => {
  db = await setupTestDb();
});

afterEach(() => {
  db.close();
});

describe("executeQuery", () => {
  it("SELECT возвращает columns, rows, rowCount", () => {
    const result = executeQuery(db, "SELECT id, name FROM suspects LIMIT 3");
    expect(result.error).toBeNull();
    expect(result.columns).toEqual(["id", "name"]);
    expect(result.rowCount).toBe(3);
    expect(result.rows).toHaveLength(3);
  });

  it("пустой результат: rowCount=0, columns=[]", () => {
    const result = executeQuery(db, "SELECT * FROM suspects WHERE id = 999");
    expect(result.error).toBeNull();
    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it("ошибочный SQL возвращает error, пустые массивы", () => {
    const result = executeQuery(db, "SELECTTTT broken");
    expect(result.error).toBeTruthy();
    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it("multi-statement возвращает последний результат", () => {
    const result = executeQuery(
      db,
      "SELECT 1 AS a; SELECT id, name FROM suspects LIMIT 2"
    );
    expect(result.error).toBeNull();
    expect(result.columns).toEqual(["id", "name"]);
    expect(result.rowCount).toBe(2);
  });

  it("DDL/DML без результата не вызывает ошибку", () => {
    const result = executeQuery(
      db,
      "CREATE TABLE IF NOT EXISTS _test_tmp (id INTEGER)"
    );
    expect(result.error).toBeNull();
    expect(result.rowCount).toBe(0);
  });

  it("executionTimeMs >= 0", () => {
    const result = executeQuery(db, "SELECT * FROM suspects");
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });
});

describe("getTableSchema", () => {
  it("возвращает 8 таблиц с столбцами", () => {
    const schema = getTableSchema(db);
    expect(schema).toHaveLength(8);
    const names = schema.map((t) => t.name).sort();
    expect(names).toContain("suspects");
    expect(names).toContain("crimes");
    expect(names).toContain("transactions");
  });

  it("suspects имеет PK id и NOT NULL name", () => {
    const schema = getTableSchema(db);
    const suspects = schema.find((t) => t.name === "suspects")!;
    const idCol = suspects.columns.find((c) => c.name === "id")!;
    expect(idCol.pk).toBe(true);
    const nameCol = suspects.columns.find((c) => c.name === "name")!;
    expect(nameCol.notnull).toBe(true);
  });
});

describe("getForeignKeys", () => {
  it("возвращает FK для таблиц со ссылками", () => {
    const fks = getForeignKeys(db);
    expect(fks.length).toBeGreaterThan(0);

    const crimesFk = fks.find(
      (fk) => fk.from === "crimes" && fk.fromColumn === "location_id"
    );
    expect(crimesFk).toBeDefined();
    expect(crimesFk!.to).toBe("locations");
    expect(crimesFk!.toColumn).toBe("id");
  });
});
