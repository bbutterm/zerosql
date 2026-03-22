/**
 * Миссия 8: "Тени порта — Босс" (ФИНАЛ)
 * 4 цели, SQL: EXISTS, UNION, вложенные подзапросы
 * unlockedTables: все 8
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "sql.js";
import { setupTestDb } from "../helpers/setup-db";
import { executeQuery } from "@/engine/database";
import { validate } from "@/engine/validator";
import { checkObjectives, isMissionComplete } from "@/engine/mission-runner";
import { checkTableAccess } from "@/engine/table-guard";
import { bossMission } from "@/data/missions";

let db: Database;

beforeEach(async () => {
  db = await setupTestDb();
});

afterEach(() => {
  db.close();
});

describe("Миссия 8 — Босс (финал): проходимость", () => {
  // ═══ Цель 1: obj-org-criminals ═══

  describe("obj-org-criminals: члены BASE с преступлениями (EXISTS)", () => {
    const obj = bossMission.objectives.find((o) => o.id === "obj-org-criminals")!;

    it("EXISTS по crime_suspects → 10 строк с name и rank → pass", () => {
      const sql = `
        SELECT s.name, o.rank, o.department
        FROM suspects s
        JOIN org_members o ON s.id = o.suspect_id
        WHERE EXISTS (SELECT 1 FROM crime_suspects cs WHERE cs.suspect_id = s.id)
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(10);
      expect(result.columns).toContain("name");
      expect(result.columns).toContain("rank");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("все члены (12) без EXISTS → fail", () => {
      const sql = `
        SELECT s.name, o.rank, o.department
        FROM suspects s JOIN org_members o ON s.id = o.suspect_id
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(12);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });

    it("альтернатива: IN вместо EXISTS → тоже pass", () => {
      const sql = `
        SELECT s.name, o.rank, o.department
        FROM suspects s
        JOIN org_members o ON s.id = o.suspect_id
        WHERE s.id IN (SELECT DISTINCT suspect_id FROM crime_suspects)
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(10);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });
  });

  // ═══ Цель 2: obj-voronov-network ═══

  describe("obj-voronov-network: досье Воронова (UNION)", () => {
    const obj = bossMission.objectives.find((o) => o.id === "obj-voronov-network")!;

    it("UNION преступлений + переговоров → 5 строк → pass", () => {
      const sql = `
        SELECT 'преступление' AS источник, c.type AS детали
        FROM crimes c
        JOIN crime_suspects cs ON c.id = cs.crime_id
        WHERE cs.suspect_id = 1
        UNION
        SELECT 'переговоры', content
        FROM communications
        WHERE from_suspect_id = 1
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(5);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("только преступления (2) → fail", () => {
      const sql = `
        SELECT c.type AS детали
        FROM crimes c JOIN crime_suspects cs ON c.id = cs.crime_id
        WHERE cs.suspect_id = 1
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(2);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Цель 3: obj-boss-proof ═══

  describe("obj-boss-proof: доказательство босса", () => {
    const obj = bossMission.objectives.find((o) => o.id === "obj-boss-proof")!;

    it("rank='босс' + EXISTS crimes + EXISTS transactions → 1 строка: Воронов → pass", () => {
      const sql = `
        SELECT s.name, o.rank
        FROM suspects s
        JOIN org_members o ON s.id = o.suspect_id
        WHERE o.rank = 'босс'
        AND EXISTS (SELECT 1 FROM crime_suspects cs WHERE cs.suspect_id = s.id)
        AND EXISTS (SELECT 1 FROM transactions t WHERE t.suspect_id = s.id AND t.suspicious = 1)
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(1);
      expect(result.rows[0][result.columns.indexOf("name")]).toBe("Воронов Игорь Петрович");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("без фильтра по rank → больше 1 строки → fail", () => {
      const sql = `
        SELECT s.name, o.rank
        FROM suspects s
        JOIN org_members o ON s.id = o.suspect_id
        WHERE EXISTS (SELECT 1 FROM crime_suspects cs WHERE cs.suspect_id = s.id)
        AND EXISTS (SELECT 1 FROM transactions t WHERE t.suspect_id = s.id AND t.suspicious = 1)
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBeGreaterThan(1);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Цель 4: obj-final-report ═══

  describe("obj-final-report: финальный отчёт", () => {
    const obj = bossMission.objectives.find((o) => o.id === "obj-final-report")!;

    it("JOIN crimes + locations + COUNT suspects, ORDER BY severity → 8 строк с district → pass", () => {
      const sql = `
        SELECT c.type, c.severity, l.district, COUNT(cs.suspect_id) AS suspect_count
        FROM crimes c
        JOIN locations l ON c.location_id = l.id
        JOIN crime_suspects cs ON c.id = cs.crime_id
        GROUP BY c.id
        ORDER BY c.severity DESC
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(8);
      expect(result.columns).toContain("district");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("без locations (нет district) → fail", () => {
      const sql = `
        SELECT c.type, c.severity, COUNT(cs.suspect_id) AS cnt
        FROM crimes c JOIN crime_suspects cs ON c.id = cs.crime_id
        GROUP BY c.id ORDER BY c.severity DESC
      `;
      const result = executeQuery(db, sql);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Контроль доступа ═══

  describe("table access", () => {
    it("все 8 таблиц доступны", () => {
      for (const table of bossMission.unlockedTables!) {
        expect(
          checkTableAccess(`SELECT * FROM ${table}`, bossMission.unlockedTables!).allowed
        ).toBe(true);
      }
    });
  });

  // ═══ Полный прогон ═══

  describe("полный прогон 4 целей", () => {
    it("проходит все 4 цели последовательно", () => {
      const completed = new Set<string>();

      // Цель 1: EXISTS
      const r1 = executeQuery(db, `
        SELECT s.name, o.rank, o.department
        FROM suspects s JOIN org_members o ON s.id = o.suspect_id
        WHERE EXISTS (SELECT 1 FROM crime_suspects cs WHERE cs.suspect_id = s.id)
      `);
      const o1 = checkObjectives(bossMission, r1, db, completed);
      expect(o1).toHaveLength(1);
      expect(o1[0].objectiveId).toBe("obj-org-criminals");
      expect(o1[0].outcome.passed).toBe(true);
      completed.add(o1[0].objectiveId);

      // Цель 2: UNION
      const r2 = executeQuery(db, `
        SELECT 'преступление' AS источник, c.type AS детали
        FROM crimes c JOIN crime_suspects cs ON c.id = cs.crime_id
        WHERE cs.suspect_id = 1
        UNION
        SELECT 'переговоры', content FROM communications WHERE from_suspect_id = 1
      `);
      const o2 = checkObjectives(bossMission, r2, db, completed);
      expect(o2).toHaveLength(1);
      expect(o2[0].objectiveId).toBe("obj-voronov-network");
      expect(o2[0].outcome.passed).toBe(true);
      completed.add(o2[0].objectiveId);

      // Цель 3: boss proof
      const r3 = executeQuery(db, `
        SELECT s.name, o.rank
        FROM suspects s JOIN org_members o ON s.id = o.suspect_id
        WHERE o.rank = 'босс'
        AND EXISTS (SELECT 1 FROM crime_suspects cs WHERE cs.suspect_id = s.id)
        AND EXISTS (SELECT 1 FROM transactions t WHERE t.suspect_id = s.id AND t.suspicious = 1)
      `);
      const o3 = checkObjectives(bossMission, r3, db, completed);
      expect(o3).toHaveLength(1);
      expect(o3[0].objectiveId).toBe("obj-boss-proof");
      expect(o3[0].outcome.passed).toBe(true);
      completed.add(o3[0].objectiveId);

      // Цель 4: финальный отчёт
      const r4 = executeQuery(db, `
        SELECT c.type, c.severity, l.district, COUNT(cs.suspect_id) AS suspect_count
        FROM crimes c
        JOIN locations l ON c.location_id = l.id
        JOIN crime_suspects cs ON c.id = cs.crime_id
        GROUP BY c.id
        ORDER BY c.severity DESC
      `);
      const o4 = checkObjectives(bossMission, r4, db, completed);
      expect(o4).toHaveLength(1);
      expect(o4[0].objectiveId).toBe("obj-final-report");
      expect(o4[0].outcome.passed).toBe(true);
      completed.add(o4[0].objectiveId);

      expect(isMissionComplete(bossMission, completed)).toBe(true);
    });
  });
});
