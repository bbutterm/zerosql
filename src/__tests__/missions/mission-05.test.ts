/**
 * Миссия 5: "Тени порта — Организация"
 * 4 цели, SQL: ORDER BY, DISTINCT, IN, NOT IN
 * unlockedTables: все 8 (первое использование org_members)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "sql.js";
import { setupTestDb } from "../helpers/setup-db";
import { executeQuery } from "@/engine/database";
import { validate } from "@/engine/validator";
import { checkObjectives, isMissionComplete } from "@/engine/mission-runner";
import { checkTableAccess } from "@/engine/table-guard";
import { orgMission } from "@/data/missions";

let db: Database;

beforeEach(async () => {
  db = await setupTestDb();
});

afterEach(() => {
  db.close();
});

describe("Миссия 5 — Организация: проходимость", () => {
  // ═══ Цель 1: obj-org-members-list ═══

  describe("obj-org-members-list: список членов с рангами", () => {
    const obj = orgMission.objectives.find((o) => o.id === "obj-org-members-list")!;

    it("JOIN org_members + suspects ORDER BY joined_date → 12 строк → pass", () => {
      const sql = `
        SELECT s.name, o.rank, o.joined_date
        FROM suspects s
        JOIN org_members o ON s.id = o.suspect_id
        ORDER BY o.joined_date ASC
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(12);
      expect(result.columns).toContain("name");
      expect(result.columns).toContain("rank");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("без столбца rank → fail", () => {
      const result = executeQuery(db, "SELECT s.name FROM suspects s JOIN org_members o ON s.id = o.suspect_id");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Цель 2: obj-distinct-ranks ═══

  describe("obj-distinct-ranks: уникальные ранги", () => {
    const obj = orgMission.objectives.find((o) => o.id === "obj-distinct-ranks")!;

    it("SELECT DISTINCT rank → 4 строки → pass", () => {
      const result = executeQuery(db, "SELECT DISTINCT rank FROM org_members");
      expect(result.rowCount).toBe(4);
      expect(result.columns).toContain("rank");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("SELECT rank (без DISTINCT) → 12 строк → fail", () => {
      const result = executeQuery(db, "SELECT rank FROM org_members");
      expect(result.rowCount).toBe(12);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Цель 3: obj-finance-dept ═══

  describe("obj-finance-dept: финансовый отдел", () => {
    const obj = orgMission.objectives.find((o) => o.id === "obj-finance-dept")!;

    it("WHERE department = 'финансы' → 4 строки с name → pass", () => {
      const sql = `
        SELECT s.name, o.rank, o.department
        FROM suspects s
        JOIN org_members o ON s.id = o.suspect_id
        WHERE o.department = 'финансы'
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(4);
      expect(result.columns).toContain("name");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("другой отдел → не 4 строки → fail", () => {
      const sql = `
        SELECT s.name, o.rank, o.department
        FROM suspects s
        JOIN org_members o ON s.id = o.suspect_id
        WHERE o.department = 'силовой'
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(3);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Цель 4: obj-not-in-org ═══

  describe("obj-not-in-org: подозреваемые вне BASE", () => {
    const obj = orgMission.objectives.find((o) => o.id === "obj-not-in-org")!;

    it("NOT IN (SELECT suspect_id FROM org_members) → 3 строки → pass", () => {
      const sql = `
        SELECT name FROM suspects
        WHERE id NOT IN (SELECT suspect_id FROM org_members)
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(3);
      expect(result.columns).toContain("name");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("все подозреваемые (15) → fail", () => {
      const result = executeQuery(db, "SELECT name FROM suspects");
      expect(result.rowCount).toBe(15);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ═══ Контроль доступа ═══

  describe("table access", () => {
    it("все 8 таблиц доступны", () => {
      for (const table of orgMission.unlockedTables!) {
        expect(
          checkTableAccess(`SELECT * FROM ${table}`, orgMission.unlockedTables!).allowed
        ).toBe(true);
      }
    });

    it("org_members — доступна (впервые)", () => {
      expect(
        checkTableAccess("SELECT * FROM org_members", orgMission.unlockedTables!).allowed
      ).toBe(true);
    });
  });

  // ═══ Полный прогон ═══

  describe("полный прогон 4 целей", () => {
    it("проходит все 4 цели последовательно", () => {
      const completed = new Set<string>();

      // Цель 1: список членов
      const r1 = executeQuery(db, `
        SELECT s.name, o.rank, o.joined_date
        FROM suspects s JOIN org_members o ON s.id = o.suspect_id
        ORDER BY o.joined_date
      `);
      const o1 = checkObjectives(orgMission, r1, db, completed);
      expect(o1).toHaveLength(1);
      expect(o1[0].objectiveId).toBe("obj-org-members-list");
      expect(o1[0].outcome.passed).toBe(true);
      completed.add(o1[0].objectiveId);

      // Цель 2: уникальные ранги
      const r2 = executeQuery(db, "SELECT DISTINCT rank FROM org_members");
      const o2 = checkObjectives(orgMission, r2, db, completed);
      expect(o2).toHaveLength(1);
      expect(o2[0].objectiveId).toBe("obj-distinct-ranks");
      expect(o2[0].outcome.passed).toBe(true);
      completed.add(o2[0].objectiveId);

      // Цель 3: финансовый отдел
      const r3 = executeQuery(db, `
        SELECT s.name, o.rank, o.department
        FROM suspects s JOIN org_members o ON s.id = o.suspect_id
        WHERE o.department = 'финансы'
      `);
      const o3 = checkObjectives(orgMission, r3, db, completed);
      expect(o3).toHaveLength(1);
      expect(o3[0].objectiveId).toBe("obj-finance-dept");
      expect(o3[0].outcome.passed).toBe(true);
      completed.add(o3[0].objectiveId);

      // Цель 4: не в организации
      const r4 = executeQuery(db, `
        SELECT name FROM suspects
        WHERE id NOT IN (SELECT suspect_id FROM org_members)
      `);
      const o4 = checkObjectives(orgMission, r4, db, completed);
      expect(o4).toHaveLength(1);
      expect(o4[0].objectiveId).toBe("obj-not-in-org");
      expect(o4[0].outcome.passed).toBe(true);
      completed.add(o4[0].objectiveId);

      expect(isMissionComplete(orgMission, completed)).toBe(true);
    });
  });
});
