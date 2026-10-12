/**
 * Гибкие типы валидации: cell_value, column_values, rows_match, not.
 * Проверяют результат так, чтобы засчитывался любой корректный запрос:
 * с любыми алиасами, лишними столбцами и порядком строк (если он не важен).
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { Database } from "sql.js";
import { createDatabase, executeQuery } from "@/engine/database";
import { validate, normalizeCell, cellsEqual } from "@/engine/validator";
import type { ValidationRule } from "@/types/mission";

let db: Database;

const check = (rule: ValidationRule, sql: string) => validate(rule, executeQuery(db, sql), db);

beforeAll(async () => {
  db = await createDatabase();
  db.run(`
    CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT, city TEXT, salary REAL);
    INSERT INTO people VALUES
      (1, 'Анна Лебедева', 'Северск', 120.5),
      (2, 'Борис Ёлкин', 'Северск', 80),
      (3, 'Вера Котова', 'Южный', 95.25),
      (4, 'Глеб Орлов', NULL, 80);
  `);
});

describe("normalizeCell / cellsEqual", () => {
  it("число и числовая строка равны", () => {
    expect(normalizeCell(47)).toBe(normalizeCell("47"));
    expect(normalizeCell(47.0)).toBe(normalizeCell("47.00"));
  });

  it("строки без учёта регистра и ё", () => {
    expect(normalizeCell(" Ёлкин ")).toBe(normalizeCell("елкин"));
  });

  it("NULL не равен пустой строке", () => {
    expect(normalizeCell(null)).not.toBe(normalizeCell(""));
  });

  it("допуск для чисел", () => {
    expect(cellsEqual(98.6, 98.61)).toBe(true);
    expect(cellsEqual(98.6, 98.7)).toBe(false);
    expect(cellsEqual(98.6, 98.7, 0.5)).toBe(true);
  });
});

describe("cell_value", () => {
  const rule: ValidationRule = { type: "cell_value", value: 4 };

  it("COUNT(*) с любым алиасом", () => {
    expect(check(rule, "SELECT COUNT(*) FROM people").passed).toBe(true);
    expect(check(rule, "SELECT COUNT(*) AS total FROM people").passed).toBe(true);
  });

  it("неверное число → fail", () => {
    expect(check(rule, "SELECT COUNT(*) FROM people WHERE city = 'Северск'").passed).toBe(false);
  });

  it("ограничение по столбцу", () => {
    const named: ValidationRule = { type: "cell_value", value: "Вера Котова", columns: ["name"] };
    expect(check(named, "SELECT name FROM people").passed).toBe(true);
    expect(check(named, "SELECT name AS who FROM people").passed).toBe(false);
  });

  it("строка без учёта регистра", () => {
    expect(check({ type: "cell_value", value: "вера котова" }, "SELECT name FROM people").passed).toBe(true);
  });

  it("средняя зарплата с округлением игрока", () => {
    const avg: ValidationRule = { type: "cell_value", value: 93.94, tolerance: 0.01 };
    expect(check(avg, "SELECT ROUND(AVG(salary), 2) FROM people").passed).toBe(true);
    expect(check(avg, "SELECT AVG(salary) FROM people").passed).toBe(true);
  });
});

describe("column_values", () => {
  const northerners: ValidationRule = {
    type: "column_values",
    columns: ["name"],
    referenceQuery: "SELECT name FROM people WHERE city = 'Северск'",
  };

  it("те же значения → pass, лишние столбцы не мешают", () => {
    expect(check(northerners, "SELECT id, name, salary FROM people WHERE city = 'Северск'").passed).toBe(true);
  });

  it("лишняя строка → fail с понятным сообщением", () => {
    const out = check(northerners, "SELECT name FROM people WHERE salary >= 80");
    expect(out.passed).toBe(false);
    expect(out.message).toContain("лишних значений: 2");
  });

  it("столбец с другим именем находится по содержимому", () => {
    expect(check(northerners, "SELECT name AS suspect FROM people WHERE city = 'Северск'").passed).toBe(true);
  });

  it("явный список values", () => {
    const rule: ValidationRule = { type: "column_values", values: ["Южный", "Северск"], columns: ["city"] };
    expect(check(rule, "SELECT DISTINCT city FROM people WHERE city IS NOT NULL").passed).toBe(true);
  });

  it("ordered: порядок важен", () => {
    const rule: ValidationRule = {
      type: "column_values",
      columns: ["name"],
      referenceQuery: "SELECT name FROM people ORDER BY salary DESC, name",
      ordered: true,
    };
    expect(check(rule, "SELECT name FROM people ORDER BY salary DESC, name").passed).toBe(true);
    const wrong = check(rule, "SELECT name FROM people ORDER BY salary ASC, name");
    expect(wrong.passed).toBe(false);
    expect(wrong.message).toContain("порядок");
  });

  it("superset: нужные значения среди прочих", () => {
    const rule: ValidationRule = { type: "column_values", values: ["Анна Лебедева"], mode: "superset" };
    expect(check(rule, "SELECT name FROM people").passed).toBe(true);
  });

  it("subset: только допустимые значения", () => {
    const rule: ValidationRule = { type: "column_values", values: ["Анна Лебедева", "Борис Ёлкин"], mode: "subset", columns: ["name"] };
    expect(check(rule, "SELECT name FROM people WHERE id = 1").passed).toBe(true);
    expect(check(rule, "SELECT name FROM people").passed).toBe(false);
  });

  it("пустой результат → fail", () => {
    const out = check(northerners, "SELECT name FROM people WHERE 0");
    expect(out.passed).toBe(false);
    expect(out.message).toContain("ни одной строки");
  });
});

describe("rows_match", () => {
  const byCity: ValidationRule = {
    type: "rows_match",
    referenceQuery: "SELECT city, COUNT(*) AS cnt FROM people WHERE city IS NOT NULL GROUP BY city",
  };

  it("любой алиас для агрегата и любой порядок столбцов", () => {
    expect(check(byCity, "SELECT COUNT(*), city FROM people WHERE city IS NOT NULL GROUP BY city").passed).toBe(true);
    expect(check(byCity, "SELECT city AS c, COUNT(id) AS n FROM people WHERE city IS NOT NULL GROUP BY 1").passed).toBe(true);
  });

  it("лишние столбцы допустимы", () => {
    expect(
      check(byCity, "SELECT city, COUNT(*) AS cnt, SUM(salary) FROM people WHERE city IS NOT NULL GROUP BY city").passed
    ).toBe(true);
  });

  it("лишняя группа NULL → fail про число строк", () => {
    const out = check(byCity, "SELECT city, COUNT(*) FROM people GROUP BY city");
    expect(out.passed).toBe(false);
    expect(out.message).toContain("больше");
  });

  it("ordered: сообщает о неверном порядке", () => {
    const rule: ValidationRule = {
      type: "rows_match",
      referenceQuery: "SELECT name, salary FROM people ORDER BY salary DESC, name",
      ordered: true,
    };
    expect(check(rule, "SELECT name, salary FROM people ORDER BY salary DESC, name").passed).toBe(true);
    const out = check(rule, "SELECT name, salary FROM people ORDER BY name");
    expect(out.passed).toBe(false);
    expect(out.message).toContain("ORDER BY");
  });

  it("неверные значения → fail", () => {
    const out = check(byCity, "SELECT city, COUNT(*) + 1 FROM people WHERE city IS NOT NULL GROUP BY city");
    expect(out.passed).toBe(false);
  });
});

describe("not", () => {
  it("проваливается, если ложный след в результате", () => {
    const rule: ValidationRule = {
      type: "not",
      rule: { type: "cell_value", value: "Глеб Орлов" },
      message: "Орлов здесь ни при чём — проверьте условие.",
    };
    expect(check(rule, "SELECT name FROM people WHERE city IS NOT NULL").passed).toBe(true);
    const out = check(rule, "SELECT name FROM people");
    expect(out.passed).toBe(false);
    expect(out.message).toContain("Орлов");
  });
});
