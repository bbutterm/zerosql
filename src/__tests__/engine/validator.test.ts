import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "sql.js";
import { setupTestDb } from "../helpers/setup-db";
import { validate } from "@/engine/validator";
import type { QueryResult } from "@/types/database";
import type { ValidationRule } from "@/types/mission";

let db: Database;

beforeEach(async () => {
  db = await setupTestDb();
});

afterEach(() => {
  db.close();
});

function makeResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    columns: ["id", "name"],
    rows: [[1, "test"]],
    rowCount: 1,
    executionTimeMs: 0.1,
    error: null,
    ...overrides,
  };
}

// ─── row_count ───────────────────────────────────────────

describe("row_count", () => {
  const rule = (expected: number, comparison: "eq" | "gte" | "lte"): ValidationRule => ({
    type: "row_count",
    expected,
    comparison,
  });

  it("eq: pass при точном совпадении", () => {
    const r = validate(rule(3, "eq"), makeResult({ rowCount: 3 }), db);
    expect(r.passed).toBe(true);
  });

  it("eq: fail при несовпадении", () => {
    const r = validate(rule(3, "eq"), makeResult({ rowCount: 5 }), db);
    expect(r.passed).toBe(false);
  });

  it("gte: pass при >=", () => {
    expect(validate(rule(3, "gte"), makeResult({ rowCount: 3 }), db).passed).toBe(true);
    expect(validate(rule(3, "gte"), makeResult({ rowCount: 5 }), db).passed).toBe(true);
  });

  it("gte: fail при <", () => {
    expect(validate(rule(3, "gte"), makeResult({ rowCount: 2 }), db).passed).toBe(false);
  });

  it("lte: pass при <=", () => {
    expect(validate(rule(3, "lte"), makeResult({ rowCount: 3 }), db).passed).toBe(true);
    expect(validate(rule(3, "lte"), makeResult({ rowCount: 1 }), db).passed).toBe(true);
  });

  it("lte: fail при >", () => {
    expect(validate(rule(3, "lte"), makeResult({ rowCount: 5 }), db).passed).toBe(false);
  });
});

// ─── error guard ─────────────────────────────────────────

describe("error guard", () => {
  it("result с error → всегда fail", () => {
    const errResult = makeResult({ error: "syntax error" });
    const r = validate({ type: "row_count", expected: 1, comparison: "eq" }, errResult, db);
    expect(r.passed).toBe(false);
    expect(r.message).toContain("ошибку");
  });
});

// ─── contains_columns ────────────────────────────────────

describe("contains_columns", () => {
  const rule = (columns: string[]): ValidationRule => ({
    type: "contains_columns",
    columns,
  });

  it("pass: все столбцы найдены", () => {
    const r = validate(rule(["id", "name"]), makeResult({ columns: ["id", "name", "alias"] }), db);
    expect(r.passed).toBe(true);
  });

  it("pass: case-insensitive", () => {
    const r = validate(rule(["ID", "Name"]), makeResult({ columns: ["id", "name"] }), db);
    expect(r.passed).toBe(true);
  });

  it("fail: отсутствующие столбцы", () => {
    const r = validate(rule(["id", "phone"]), makeResult({ columns: ["id", "name"] }), db);
    expect(r.passed).toBe(false);
    expect(r.message).toContain("phone");
  });
});

// ─── contains_value ──────────────────────────────────────

describe("contains_value", () => {
  const rule = (column: string, value: unknown): ValidationRule => ({
    type: "contains_value",
    column,
    value,
  });

  it("pass: значение найдено", () => {
    const r = validate(
      rule("name", "test"),
      makeResult({ columns: ["id", "name"], rows: [[1, "test"]] }),
      db
    );
    expect(r.passed).toBe(true);
  });

  it("pass: case-insensitive", () => {
    const r = validate(
      rule("name", "TEST"),
      makeResult({ columns: ["id", "name"], rows: [[1, "test"]] }),
      db
    );
    expect(r.passed).toBe(true);
  });

  it("fail: значение не найдено", () => {
    const r = validate(
      rule("name", "missing"),
      makeResult({ columns: ["id", "name"], rows: [[1, "test"]] }),
      db
    );
    expect(r.passed).toBe(false);
  });

  it("fail: столбец не найден", () => {
    const r = validate(
      rule("phone", "123"),
      makeResult({ columns: ["id", "name"], rows: [[1, "test"]] }),
      db
    );
    expect(r.passed).toBe(false);
    expect(r.message).toContain("phone");
  });
});

// ─── exact_match ─────────────────────────────────────────

describe("exact_match", () => {
  it("pass: одинаковые данные в другом порядке строк", () => {
    // Reference: SELECT * FROM suspects WHERE status = 'в розыске' returns 3 rows
    const ref = db.exec("SELECT * FROM suspects WHERE status = 'в розыске'");
    const reversedRows = [...ref[0].values].reverse();
    const result = makeResult({
      columns: ref[0].columns,
      rows: reversedRows,
      rowCount: reversedRows.length,
    });
    const r = validate(
      { type: "exact_match", referenceQuery: "SELECT * FROM suspects WHERE status = 'в розыске'" },
      result,
      db
    );
    expect(r.passed).toBe(true);
  });

  it("fail: разные данные", () => {
    const result = makeResult({
      columns: ["id", "name"],
      rows: [[999, "fake"]],
      rowCount: 1,
    });
    const r = validate(
      { type: "exact_match", referenceQuery: "SELECT * FROM suspects WHERE status = 'в розыске'" },
      result,
      db
    );
    expect(r.passed).toBe(false);
  });

  it("fail: разное количество столбцов", () => {
    const ref = db.exec("SELECT * FROM suspects WHERE status = 'в розыске'");
    const result = makeResult({
      columns: ["id", "name"], // only 2 columns vs 10 in reference
      rows: ref[0].values.map((r) => [r[0], r[1]]),
      rowCount: ref[0].values.length,
    });
    const r = validate(
      { type: "exact_match", referenceQuery: "SELECT * FROM suspects WHERE status = 'в розыске'" },
      result,
      db
    );
    expect(r.passed).toBe(false);
  });

  it("fail: ошибка в reference query → сообщает разработчику", () => {
    const r = validate(
      { type: "exact_match", referenceQuery: "SELECTTT broken" },
      makeResult(),
      db
    );
    expect(r.passed).toBe(false);
    expect(r.message).toContain("разработчику");
  });
});

// ─── custom ──────────────────────────────────────────────

describe("custom", () => {
  it("делегирует check-функции", () => {
    const rule: ValidationRule = {
      type: "custom",
      check: (result) => ({
        passed: result.rowCount === 42,
        message: result.rowCount === 42 ? "ok" : "nope",
      }),
    };
    expect(validate(rule, makeResult({ rowCount: 42 }), db).passed).toBe(true);
    expect(validate(rule, makeResult({ rowCount: 1 }), db).passed).toBe(false);
  });
});
