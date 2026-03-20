/**
 * Миссия 4: "Тени порта — Улики"
 * 4 цели, SQL: JOIN, WHERE, подзапросы
 * unlockedTables: suspects, crimes, crime_suspects, communications, transactions, evidence, locations
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "sql.js";
import { setupTestDb } from "../helpers/setup-db";
import { executeQuery } from "@/engine/database";
import { validate } from "@/engine/validator";
import { checkObjectives, isMissionComplete } from "@/engine/mission-runner";
import { checkTableAccess } from "@/engine/table-guard";
import { evidenceMission } from "@/data/missions";

let db: Database;

beforeEach(async () => {
  db = await setupTestDb();
});

afterEach(() => {
  db.close();
});

describe("Миссия 4 — Улики: проходимость", () => {
  // ═══ Цель 1: obj-all-evidence ═══

  describe("obj-all-evidence: все вещдоки", () => {
    const obj = evidenceMission.objectives.find((o) => o.id === "obj-all-evidence")!;

    it("SELECT * FROM evidence → 10 строк → pass", () => {
      const result = executeQuery(db, "SELECT * FROM evidence");
      expect(result.rowCount).toBe(10);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("фильтр по crime_id → не 10 строк → fail", () => {
      const result = executeQuery(db, "SELECT * FROM evidence WHERE crime_id = 1");
      expect(result.rowCount).toBe(2);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Цель 2: obj-smuggling-evidence ═══

  describe("obj-smuggling-evidence: улики по контрабанде", () => {
    const obj = evidenceMission.objectives.find((o) => o.id === "obj-smuggling-evidence")!;

    it("подзапрос через crimes → 2 строки с description → pass", () => {
      const result = executeQuery(
        db,
        "SELECT * FROM evidence WHERE crime_id IN (SELECT id FROM crimes WHERE type = 'контрабанда')"
      );
      expect(result.rowCount).toBe(2);
      expect(result.columns).toContain("description");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("прямой WHERE crime_id = 1 → тоже pass", () => {
      const result = executeQuery(db, "SELECT * FROM evidence WHERE crime_id = 1");
      expect(result.rowCount).toBe(2);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("без столбца description → fail", () => {
      const result = executeQuery(
        db,
        "SELECT id, crime_id, type FROM evidence WHERE crime_id = 1"
      );
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });

    it("другое дело (crime_id = 2) → 1 строка, не 2 → fail", () => {
      const result = executeQuery(db, "SELECT * FROM evidence WHERE crime_id = 2");
      expect(result.rowCount).toBe(1);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Цель 3: obj-evidence-locations ═══

  describe("obj-evidence-locations: улики + места", () => {
    const obj = evidenceMission.objectives.find((o) => o.id === "obj-evidence-locations")!;

    it("JOIN evidence → crimes → locations → 10 строк с district → pass", () => {
      const sql = `
        SELECT e.*, l.name AS location_name, l.district
        FROM evidence e
        JOIN crimes c ON e.crime_id = c.id
        JOIN locations l ON c.location_id = l.id
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(10);
      expect(result.columns).toContain("district");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("без JOIN — нет столбца district → fail", () => {
      const result = executeQuery(db, "SELECT * FROM evidence");
      expect(result.columns).not.toContain("district");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Цель 4: obj-port-evidence ═══

  describe("obj-port-evidence: улики из порта", () => {
    const obj = evidenceMission.objectives.find((o) => o.id === "obj-port-evidence")!;

    it("подзапрос с district = 'Порт' → 5 строк → pass", () => {
      const sql = `
        SELECT e.* FROM evidence e
        WHERE crime_id IN (
          SELECT c.id FROM crimes c
          JOIN locations l ON c.location_id = l.id
          WHERE l.district = 'Порт'
        )
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(5);
      expect(result.columns).toContain("description");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("альтернатива: JOIN с WHERE district → тоже pass", () => {
      const sql = `
        SELECT e.description, e.type, e.found_at
        FROM evidence e
        JOIN crimes c ON e.crime_id = c.id
        JOIN locations l ON c.location_id = l.id
        WHERE l.district = 'Порт'
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(5);
      expect(result.columns).toContain("description");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("все улики (10) → не 5 → fail", () => {
      const result = executeQuery(db, "SELECT * FROM evidence");
      expect(result.rowCount).toBe(10);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });

    it("только контрабанда (2) → не 5 → fail", () => {
      const result = executeQuery(db, "SELECT * FROM evidence WHERE crime_id = 1");
      expect(result.rowCount).toBe(2);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Контроль доступа ═══

  describe("table access", () => {
    it("все 7 разблокированных таблиц доступны", () => {
      for (const table of evidenceMission.unlockedTables!) {
        expect(
          checkTableAccess(`SELECT * FROM ${table}`, evidenceMission.unlockedTables!).allowed
        ).toBe(true);
      }
    });

    it("evidence — доступна", () => {
      expect(
        checkTableAccess("SELECT * FROM evidence", evidenceMission.unlockedTables!).allowed
      ).toBe(true);
    });

    it("locations — доступна", () => {
      expect(
        checkTableAccess("SELECT * FROM locations", evidenceMission.unlockedTables!).allowed
      ).toBe(true);
    });

    it("org_members — заблокирована", () => {
      const r = checkTableAccess("SELECT * FROM org_members", evidenceMission.unlockedTables!);
      expect(r.allowed).toBe(false);
    });
  });

  // ═══ Полный прогон ═══

  describe("полный прогон 4 целей", () => {
    it("проходит все 4 цели последовательно", () => {
      const completed = new Set<string>();

      // Цель 1: все вещдоки
      const r1 = executeQuery(db, "SELECT * FROM evidence");
      const o1 = checkObjectives(evidenceMission, r1, db, completed);
      expect(o1).toHaveLength(1);
      expect(o1[0].objectiveId).toBe("obj-all-evidence");
      expect(o1[0].outcome.passed).toBe(true);
      completed.add(o1[0].objectiveId);

      // Цель 2: улики по контрабанде
      const r2 = executeQuery(
        db,
        "SELECT * FROM evidence WHERE crime_id IN (SELECT id FROM crimes WHERE type = 'контрабанда')"
      );
      const o2 = checkObjectives(evidenceMission, r2, db, completed);
      expect(o2).toHaveLength(1);
      expect(o2[0].objectiveId).toBe("obj-smuggling-evidence");
      expect(o2[0].outcome.passed).toBe(true);
      completed.add(o2[0].objectiveId);

      // Цель 3: улики + места (JOIN)
      const r3 = executeQuery(
        db,
        `SELECT e.*, l.name AS location_name, l.district
         FROM evidence e
         JOIN crimes c ON e.crime_id = c.id
         JOIN locations l ON c.location_id = l.id`
      );
      const o3 = checkObjectives(evidenceMission, r3, db, completed);
      expect(o3).toHaveLength(1);
      expect(o3[0].objectiveId).toBe("obj-evidence-locations");
      expect(o3[0].outcome.passed).toBe(true);
      completed.add(o3[0].objectiveId);

      // Цель 4: улики из порта (подзапрос)
      const r4 = executeQuery(
        db,
        `SELECT e.* FROM evidence e
         WHERE crime_id IN (
           SELECT c.id FROM crimes c
           JOIN locations l ON c.location_id = l.id
           WHERE l.district = 'Порт'
         )`
      );
      const o4 = checkObjectives(evidenceMission, r4, db, completed);
      expect(o4).toHaveLength(1);
      expect(o4[0].objectiveId).toBe("obj-port-evidence");
      expect(o4[0].outcome.passed).toBe(true);
      completed.add(o4[0].objectiveId);

      expect(isMissionComplete(evidenceMission, completed)).toBe(true);
    });
  });
});
