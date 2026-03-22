/**
 * Миссия 6: "Тени порта — Хронология"
 * 4 цели, SQL: ORDER BY, BETWEEN, AS, julianday()
 * unlockedTables: все 8
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "sql.js";
import { setupTestDb } from "../helpers/setup-db";
import { executeQuery } from "@/engine/database";
import { validate } from "@/engine/validator";
import { checkObjectives, isMissionComplete } from "@/engine/mission-runner";
import { checkTableAccess } from "@/engine/table-guard";
import { timelineMission } from "@/data/missions";

let db: Database;

beforeEach(async () => {
  db = await setupTestDb();
});

afterEach(() => {
  db.close();
});

describe("Миссия 6 — Хронология: проходимость", () => {
  // ═══ Цель 1: obj-crimes-timeline ═══

  describe("obj-crimes-timeline: хронология преступлений", () => {
    const obj = timelineMission.objectives.find((o) => o.id === "obj-crimes-timeline")!;

    it("ORDER BY date_committed → 8 строк с type → pass", () => {
      const result = executeQuery(db, "SELECT type, date_committed FROM crimes ORDER BY date_committed ASC");
      expect(result.rowCount).toBe(8);
      expect(result.columns).toContain("type");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("с алиасами AS тип → тоже pass", () => {
      const result = executeQuery(db, "SELECT type AS тип, date_committed AS дата FROM crimes ORDER BY date_committed");
      expect(result.rowCount).toBe(8);
      expect(result.columns).toContain("тип");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("фильтр (не 8 строк) → fail", () => {
      const result = executeQuery(db, "SELECT type FROM crimes WHERE severity > 5");
      expect(result.rowCount).toBeLessThan(8);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Цель 2: obj-crimes-jan-feb ═══

  describe("obj-crimes-jan-feb: преступления янв-фев 2024", () => {
    const obj = timelineMission.objectives.find((o) => o.id === "obj-crimes-jan-feb")!;

    it("BETWEEN '2024-01-01' AND '2024-02-28' → 5 строк → pass", () => {
      const result = executeQuery(
        db,
        "SELECT * FROM crimes WHERE date_committed BETWEEN '2024-01-01' AND '2024-02-28'"
      );
      expect(result.rowCount).toBe(5);
      expect(result.columns).toContain("date_committed");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("все преступления (8) → fail", () => {
      const result = executeQuery(db, "SELECT * FROM crimes");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Цель 3: obj-murder-comms ═══

  describe("obj-murder-comms: сообщения перед убийством", () => {
    const obj = timelineMission.objectives.find((o) => o.id === "obj-murder-comms")!;

    it("BETWEEN + LIKE '%Сеть%' → 2 строки → pass", () => {
      const sql = `
        SELECT c.content, c.timestamp, s.name
        FROM communications c
        JOIN suspects s ON c.from_suspect_id = s.id
        WHERE c.timestamp BETWEEN '2024-02-27' AND '2024-03-02'
        AND c.content LIKE '%Сеть%'
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(2);
      expect(result.columns).toContain("content");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("все сообщения (12) → fail (не 2 строки)", () => {
      const result = executeQuery(db, "SELECT * FROM communications");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Цель 4: obj-crime-report-delay ═══

  describe("obj-crime-report-delay: задержка обнаружения", () => {
    const obj = timelineMission.objectives.find((o) => o.id === "obj-crime-report-delay")!;

    it("julianday разница → 8 строк с date_committed и date_reported → pass", () => {
      const sql = `
        SELECT type, date_committed, date_reported,
               CAST(julianday(date_reported) - julianday(date_committed) AS INTEGER) AS days_delay
        FROM crimes
        ORDER BY days_delay DESC
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(8);
      expect(result.columns).toContain("date_committed");
      expect(result.columns).toContain("date_reported");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("без date_committed → fail", () => {
      const result = executeQuery(db, "SELECT type, date_reported FROM crimes");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Контроль доступа ═══

  describe("table access", () => {
    it("все 8 таблиц доступны", () => {
      for (const table of timelineMission.unlockedTables!) {
        expect(
          checkTableAccess(`SELECT * FROM ${table}`, timelineMission.unlockedTables!).allowed
        ).toBe(true);
      }
    });
  });

  // ═══ Полный прогон ═══

  describe("полный прогон 4 целей", () => {
    it("проходит все 4 цели последовательно", () => {
      const completed = new Set<string>();

      // Цель 1: хронология
      const r1 = executeQuery(db, "SELECT type, date_committed FROM crimes ORDER BY date_committed");
      const o1 = checkObjectives(timelineMission, r1, db, completed);
      expect(o1).toHaveLength(1);
      expect(o1[0].objectiveId).toBe("obj-crimes-timeline");
      expect(o1[0].outcome.passed).toBe(true);
      completed.add(o1[0].objectiveId);

      // Цель 2: янв-фев 2024
      const r2 = executeQuery(db, "SELECT * FROM crimes WHERE date_committed BETWEEN '2024-01-01' AND '2024-02-28'");
      const o2 = checkObjectives(timelineMission, r2, db, completed);
      expect(o2).toHaveLength(1);
      expect(o2[0].objectiveId).toBe("obj-crimes-jan-feb");
      expect(o2[0].outcome.passed).toBe(true);
      completed.add(o2[0].objectiveId);

      // Цель 3: сообщения перед убийством
      const r3 = executeQuery(db, `
        SELECT c.content, c.timestamp
        FROM communications c
        WHERE c.timestamp BETWEEN '2024-02-27' AND '2024-03-02'
        AND c.content LIKE '%Сеть%'
      `);
      const o3 = checkObjectives(timelineMission, r3, db, completed);
      expect(o3).toHaveLength(1);
      expect(o3[0].objectiveId).toBe("obj-murder-comms");
      expect(o3[0].outcome.passed).toBe(true);
      completed.add(o3[0].objectiveId);

      // Цель 4: задержка обнаружения
      const r4 = executeQuery(db, `
        SELECT type, date_committed, date_reported,
               julianday(date_reported) - julianday(date_committed) AS days
        FROM crimes ORDER BY days DESC
      `);
      const o4 = checkObjectives(timelineMission, r4, db, completed);
      expect(o4).toHaveLength(1);
      expect(o4[0].objectiveId).toBe("obj-crime-report-delay");
      expect(o4[0].outcome.passed).toBe(true);
      completed.add(o4[0].objectiveId);

      expect(isMissionComplete(timelineMission, completed)).toBe(true);
    });
  });
});
