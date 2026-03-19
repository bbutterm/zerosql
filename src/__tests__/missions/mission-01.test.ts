/**
 * Миссия 1: "Тени порта — Связи"
 * 3 цели, SQL: JOIN, WHERE, AND
 * unlockedTables: suspects, crimes, crime_suspects
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "sql.js";
import { setupTestDb } from "../helpers/setup-db";
import { executeQuery } from "@/engine/database";
import { validate } from "@/engine/validator";
import { checkObjectives, isMissionComplete } from "@/engine/mission-runner";
import { checkTableAccess } from "@/engine/table-guard";
import { firstCaseMission } from "@/data/missions/mission-01-first-case";

let db: Database;

beforeEach(async () => {
  db = await setupTestDb();
});

afterEach(() => {
  db.close();
});

describe("Миссия 1 — Связи: проходимость", () => {
  // ─── Цель 1: obj-crime-details ────────────────────────

  describe("obj-crime-details: найти контрабанду", () => {
    const obj = firstCaseMission.objectives.find((o) => o.id === "obj-crime-details")!;

    it("SELECT * FROM crimes WHERE type = 'контрабанда' → pass", () => {
      const result = executeQuery(db, "SELECT * FROM crimes WHERE type = 'контрабанда'");
      expect(result.rowCount).toBe(1);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("SELECT * FROM crimes (все дела) → тоже pass (contains_value)", () => {
      const result = executeQuery(db, "SELECT * FROM crimes");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });
  });

  // ─── Цель 2: obj-suspects-in-crime ────────────────────

  describe("obj-suspects-in-crime: участники контрабанды", () => {
    const obj = firstCaseMission.objectives.find((o) => o.id === "obj-suspects-in-crime")!;

    it("SELECT * FROM crime_suspects WHERE crime_id = 1 → 3 строки с role → pass", () => {
      const result = executeQuery(db, "SELECT * FROM crime_suspects WHERE crime_id = 1");
      expect(result.rowCount).toBe(3);
      expect(result.columns).toContain("role");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("без столбца role → fail", () => {
      const result = executeQuery(
        db,
        "SELECT crime_id, suspect_id FROM crime_suspects WHERE crime_id = 1"
      );
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });

    it("rowCount != 3 → fail", () => {
      const result = executeQuery(db, "SELECT * FROM crime_suspects WHERE crime_id = 1 LIMIT 1");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ─── Цель 3: obj-find-organizer ───────────────────────

  describe("obj-find-organizer: имя организатора", () => {
    const obj = firstCaseMission.objectives.find((o) => o.id === "obj-find-organizer")!;

    it("JOIN crime_suspects + suspects → pass (Воронов)", () => {
      const sql = `
        SELECT s.name, cs.role
        FROM crime_suspects cs
        JOIN suspects s ON cs.suspect_id = s.id
        WHERE cs.crime_id = 1 AND cs.role = 'организатор'
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(1);
      expect(String(result.rows[0][0])).toBe("Воронов Игорь Петрович");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("все участники с именами → тоже pass (contains_value)", () => {
      const sql = `
        SELECT s.name, cs.role
        FROM crime_suspects cs
        JOIN suspects s ON cs.suspect_id = s.id
        WHERE cs.crime_id = 1
      `;
      const result = executeQuery(db, sql);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });
  });

  // ─── Контроль доступа ─────────────────────────────────

  describe("table access", () => {
    it("suspects, crimes, crime_suspects — разрешены", () => {
      const tables = firstCaseMission.unlockedTables!;
      expect(checkTableAccess("SELECT * FROM suspects", tables).allowed).toBe(true);
      expect(checkTableAccess("SELECT * FROM crimes", tables).allowed).toBe(true);
      expect(checkTableAccess("SELECT * FROM crime_suspects", tables).allowed).toBe(true);
    });

    it("communications — заблокирована", () => {
      const r = checkTableAccess("SELECT * FROM communications", firstCaseMission.unlockedTables!);
      expect(r.allowed).toBe(false);
    });

    it("transactions — заблокирована", () => {
      const r = checkTableAccess("SELECT * FROM transactions", firstCaseMission.unlockedTables!);
      expect(r.allowed).toBe(false);
    });
  });

  // ─── Полный прогон ─────────────────────────────────────

  describe("полный прогон всех 3 целей", () => {
    it("проходит все цели последовательно", () => {
      const completed = new Set<string>();

      // Цель 1
      const r1 = executeQuery(db, "SELECT * FROM crimes WHERE type = 'контрабанда'");
      const o1 = checkObjectives(firstCaseMission, r1, db, completed);
      expect(o1).toHaveLength(1);
      expect(o1[0].objectiveId).toBe("obj-crime-details");
      completed.add(o1[0].objectiveId);

      // Цель 2
      const r2 = executeQuery(db, "SELECT * FROM crime_suspects WHERE crime_id = 1");
      const o2 = checkObjectives(firstCaseMission, r2, db, completed);
      expect(o2).toHaveLength(1);
      expect(o2[0].objectiveId).toBe("obj-suspects-in-crime");
      completed.add(o2[0].objectiveId);

      // Цель 3
      const r3 = executeQuery(
        db,
        `SELECT s.name, cs.role FROM crime_suspects cs
         JOIN suspects s ON cs.suspect_id = s.id
         WHERE cs.crime_id = 1 AND cs.role = 'организатор'`
      );
      const o3 = checkObjectives(firstCaseMission, r3, db, completed);
      expect(o3).toHaveLength(1);
      expect(o3[0].objectiveId).toBe("obj-find-organizer");
      completed.add(o3[0].objectiveId);

      expect(isMissionComplete(firstCaseMission, completed)).toBe(true);
    });
  });
});
