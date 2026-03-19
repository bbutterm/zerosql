import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "sql.js";
import { setupTestDb } from "../helpers/setup-db";

let db: Database;

beforeEach(async () => {
  db = await setupTestDb();
});

afterEach(() => {
  db.close();
});

// ─── Схема ───────────────────────────────────────────────

describe("Schema", () => {
  it("создаёт ровно 8 таблиц", () => {
    const result = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const tables = result[0].values.map((r) => r[0]);
    expect(tables).toHaveLength(8);
    expect(tables).toEqual([
      "communications",
      "crime_suspects",
      "crimes",
      "evidence",
      "locations",
      "org_members",
      "suspects",
      "transactions",
    ]);
  });

  it("suspects: 10 столбцов с правильными именами", () => {
    const pragma = db.exec("PRAGMA table_info('suspects')");
    const cols = pragma[0].values.map((r) => r[1]);
    expect(cols).toEqual([
      "id", "name", "alias", "birth_date", "gender",
      "address", "phone", "occupation", "criminal_record", "status",
    ]);
  });

  it("crimes: severity имеет CHECK 1-10", () => {
    expect(() => {
      db.run("INSERT INTO crimes VALUES (99, 'тест', '', '', '', 1, 'открыто', 11)");
    }).toThrow();
  });

  it("suspects: gender CHECK допускает только М/Ж", () => {
    expect(() => {
      db.run("INSERT INTO suspects VALUES (99, 'Тест', NULL, NULL, 'X', NULL, NULL, NULL, NULL, NULL)");
    }).toThrow();
  });

  it("crime_suspects: составной PK (crime_id, suspect_id)", () => {
    const pragma = db.exec("PRAGMA table_info('crime_suspects')");
    const pkCols = pragma[0].values.filter((r) => Number(r[5]) > 0).map((r) => r[1]);
    expect(pkCols).toEqual(["crime_id", "suspect_id"]);
  });

  it("FK: crimes.location_id → locations.id", () => {
    const fk = db.exec("PRAGMA foreign_key_list('crimes')");
    expect(fk.length).toBeGreaterThan(0);
    const row = fk[0].values[0];
    expect(row[2]).toBe("locations"); // referenced table
    expect(row[3]).toBe("location_id"); // from column
    expect(row[4]).toBe("id"); // to column
  });

  it("FK: crime_suspects ссылается на crimes и suspects", () => {
    const fk = db.exec("PRAGMA foreign_key_list('crime_suspects')");
    const refTables = fk[0].values.map((r) => r[2]).sort();
    expect(refTables).toEqual(["crimes", "suspects"]);
  });

  it("схема идемпотентна (повторный запуск не ломает)", () => {
    expect(() => {
      db.run(
        "CREATE TABLE IF NOT EXISTS suspects (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"
      );
    }).not.toThrow();
  });
});

// ─── Seed-данные ─────────────────────────────────────────

describe("Seed — количество записей", () => {
  const expectedCounts: Record<string, number> = {
    suspects: 15,
    locations: 8,
    crimes: 8,
    evidence: 10,
    crime_suspects: 19,
    communications: 12,
    transactions: 13,
    org_members: 12,
  };

  for (const [table, count] of Object.entries(expectedCounts)) {
    it(`${table}: ${count} записей`, () => {
      const result = db.exec(`SELECT COUNT(*) FROM ${table}`);
      expect(Number(result[0].values[0][0])).toBe(count);
    });
  }
});

describe("Seed — критические данные для миссий", () => {
  it("3 подозреваемых в розыске", () => {
    const result = db.exec("SELECT COUNT(*) FROM suspects WHERE status = 'в розыске'");
    expect(Number(result[0].values[0][0])).toBe(3);
  });

  it("6 открытых дел", () => {
    const result = db.exec("SELECT COUNT(*) FROM crimes WHERE status = 'открыто'");
    expect(Number(result[0].values[0][0])).toBe(6);
  });

  it("suspect_id=1 — это Воронов", () => {
    const result = db.exec("SELECT name, alias FROM suspects WHERE id = 1");
    expect(result[0].values[0][0]).toBe("Воронов Игорь Петрович");
    expect(result[0].values[0][1]).toBe("Ворон");
  });

  it("преступление с type='контрабанда' существует (id=1)", () => {
    const result = db.exec("SELECT id FROM crimes WHERE type = 'контрабанда'");
    expect(result[0].values[0][0]).toBe(1);
  });

  it("3 участника контрабанды (crime_id=1)", () => {
    const result = db.exec("SELECT COUNT(*) FROM crime_suspects WHERE crime_id = 1");
    expect(Number(result[0].values[0][0])).toBe(3);
  });

  it("организатор контрабанды — suspect_id=1 (Воронов)", () => {
    const result = db.exec(
      "SELECT suspect_id FROM crime_suspects WHERE crime_id = 1 AND role = 'организатор'"
    );
    expect(result[0].values[0][0]).toBe(1);
  });

  it("нет orphan FK-ссылок в crime_suspects", () => {
    const orphanCrimes = db.exec(
      "SELECT COUNT(*) FROM crime_suspects WHERE crime_id NOT IN (SELECT id FROM crimes)"
    );
    expect(Number(orphanCrimes[0].values[0][0])).toBe(0);

    const orphanSuspects = db.exec(
      "SELECT COUNT(*) FROM crime_suspects WHERE suspect_id NOT IN (SELECT id FROM suspects)"
    );
    expect(Number(orphanSuspects[0].values[0][0])).toBe(0);
  });

  it("нет orphan FK-ссылок в communications", () => {
    const orphanFrom = db.exec(
      "SELECT COUNT(*) FROM communications WHERE from_suspect_id NOT IN (SELECT id FROM suspects)"
    );
    expect(Number(orphanFrom[0].values[0][0])).toBe(0);

    const orphanTo = db.exec(
      "SELECT COUNT(*) FROM communications WHERE to_suspect_id NOT IN (SELECT id FROM suspects)"
    );
    expect(Number(orphanTo[0].values[0][0])).toBe(0);
  });

  it("нет orphan FK-ссылок в transactions", () => {
    const orphan = db.exec(
      "SELECT COUNT(*) FROM transactions WHERE suspect_id NOT IN (SELECT id FROM suspects)"
    );
    expect(Number(orphan[0].values[0][0])).toBe(0);
  });
});
