/**
 * Миссия 7: "Тени порта — Тупик"
 * 3 цели, SQL: LEFT JOIN, HAVING, CASE WHEN
 * unlockedTables: все 8
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "sql.js";
import { setupTestDb } from "../helpers/setup-db";
import { executeQuery } from "@/engine/database";
import { validate } from "@/engine/validator";
import { checkObjectives, isMissionComplete } from "@/engine/mission-runner";
import { checkTableAccess } from "@/engine/table-guard";
import { deadendMission } from "@/data/missions";

let db: Database;

beforeEach(async () => {
  db = await setupTestDb();
});

afterEach(() => {
  db.close();
});

describe("Миссия 7 — Тупик: проходимость", () => {
  // ═══ Цель 1: obj-left-join-suspects ═══

  describe("obj-left-join-suspects: подозреваемые без преступлений", () => {
    const obj = deadendMission.objectives.find((o) => o.id === "obj-left-join-suspects")!;

    it("LEFT JOIN + IS NULL → 4 строки → pass", () => {
      const sql = `
        SELECT s.name
        FROM suspects s
        LEFT JOIN crime_suspects cs ON s.id = cs.suspect_id
        WHERE cs.crime_id IS NULL
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(4);
      expect(result.columns).toContain("name");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("обычный JOIN (без LEFT) → 0 «чистых» → fail", () => {
      const sql = `
        SELECT s.name
        FROM suspects s
        JOIN crime_suspects cs ON s.id = cs.suspect_id
        WHERE cs.crime_id IS NULL
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(0);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });

    it("все подозреваемые (15) → fail", () => {
      const result = executeQuery(db, "SELECT name FROM suspects");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Цель 2: obj-crime-count-having ═══

  describe("obj-crime-count-having: рецидивисты (HAVING)", () => {
    const obj = deadendMission.objectives.find((o) => o.id === "obj-crime-count-having")!;

    it("GROUP BY + HAVING COUNT(*) > 1 → 7 строк → pass", () => {
      const sql = `
        SELECT s.name, COUNT(*) AS crime_count
        FROM suspects s
        JOIN crime_suspects cs ON s.id = cs.suspect_id
        GROUP BY s.id
        HAVING COUNT(*) > 1
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(7);
      expect(result.columns).toContain("name");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("без HAVING (все с преступлениями) → 11 строк → fail", () => {
      const sql = `
        SELECT s.name, COUNT(*) AS crime_count
        FROM suspects s
        JOIN crime_suspects cs ON s.id = cs.suspect_id
        GROUP BY s.id
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(11);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Цель 3: obj-threat-level ═══

  describe("obj-threat-level: классификация угроз (CASE WHEN)", () => {
    const obj = deadendMission.objectives.find((o) => o.id === "obj-threat-level")!;

    it("CASE WHEN по COUNT → 15 строк с threat_level включая 'высокий' → pass", () => {
      const sql = `
        SELECT s.name,
               COUNT(cs.crime_id) AS crimes,
               CASE
                 WHEN COUNT(cs.crime_id) = 0 THEN 'нет данных'
                 WHEN COUNT(cs.crime_id) = 1 THEN 'низкий'
                 WHEN COUNT(cs.crime_id) = 2 THEN 'средний'
                 ELSE 'высокий'
               END AS threat_level
        FROM suspects s
        LEFT JOIN crime_suspects cs ON s.id = cs.suspect_id
        GROUP BY s.id
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(15);
      expect(result.columns).toContain("threat_level");
      // Быков (id=3) — 3 преступления → высокий
      const threatLevels = result.rows.map((r) => r[result.columns.indexOf("threat_level")]);
      expect(threatLevels).toContain("высокий");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("без столбца threat_level → fail", () => {
      const result = executeQuery(db, "SELECT name FROM suspects");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });

    it("не 15 строк (только с преступлениями) → fail", () => {
      const sql = `
        SELECT s.name,
               CASE WHEN COUNT(*) >= 3 THEN 'высокий' ELSE 'другой' END AS threat_level
        FROM suspects s
        JOIN crime_suspects cs ON s.id = cs.suspect_id
        GROUP BY s.id
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(11);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Контроль доступа ═══

  describe("table access", () => {
    it("все 8 таблиц доступны", () => {
      for (const table of deadendMission.unlockedTables!) {
        expect(
          checkTableAccess(`SELECT * FROM ${table}`, deadendMission.unlockedTables!).allowed
        ).toBe(true);
      }
    });
  });

  // ═══ Полный прогон ═══

  describe("полный прогон 3 целей", () => {
    it("проходит все 3 цели последовательно", () => {
      const completed = new Set<string>();

      // Цель 1: LEFT JOIN
      const r1 = executeQuery(db, `
        SELECT s.name FROM suspects s
        LEFT JOIN crime_suspects cs ON s.id = cs.suspect_id
        WHERE cs.crime_id IS NULL
      `);
      const o1 = checkObjectives(deadendMission, r1, db, completed);
      expect(o1).toHaveLength(1);
      expect(o1[0].objectiveId).toBe("obj-left-join-suspects");
      expect(o1[0].outcome.passed).toBe(true);
      completed.add(o1[0].objectiveId);

      // Цель 2: HAVING
      const r2 = executeQuery(db, `
        SELECT s.name, COUNT(*) AS cnt
        FROM suspects s JOIN crime_suspects cs ON s.id = cs.suspect_id
        GROUP BY s.id HAVING COUNT(*) > 1
      `);
      const o2 = checkObjectives(deadendMission, r2, db, completed);
      expect(o2).toHaveLength(1);
      expect(o2[0].objectiveId).toBe("obj-crime-count-having");
      expect(o2[0].outcome.passed).toBe(true);
      completed.add(o2[0].objectiveId);

      // Цель 3: CASE WHEN
      const r3 = executeQuery(db, `
        SELECT s.name,
               CASE
                 WHEN COUNT(cs.crime_id) = 0 THEN 'нет данных'
                 WHEN COUNT(cs.crime_id) = 1 THEN 'низкий'
                 WHEN COUNT(cs.crime_id) = 2 THEN 'средний'
                 ELSE 'высокий'
               END AS threat_level
        FROM suspects s
        LEFT JOIN crime_suspects cs ON s.id = cs.suspect_id
        GROUP BY s.id
      `);
      const o3 = checkObjectives(deadendMission, r3, db, completed);
      expect(o3).toHaveLength(1);
      expect(o3[0].objectiveId).toBe("obj-threat-level");
      expect(o3[0].outcome.passed).toBe(true);
      completed.add(o3[0].objectiveId);

      expect(isMissionComplete(deadendMission, completed)).toBe(true);
    });
  });
});
