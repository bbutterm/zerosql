/**
 * Миссия 3: "Тени порта — Деньги"
 * 3 цели, SQL: SUM, WHERE, AND, GROUP BY
 * unlockedTables: suspects, crimes, crime_suspects, communications, transactions
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "sql.js";
import { setupTestDb } from "../helpers/setup-db";
import { executeQuery } from "@/engine/database";
import { validate } from "@/engine/validator";
import { checkObjectives, isMissionComplete } from "@/engine/mission-runner";
import { checkTableAccess } from "@/engine/table-guard";
import { moneyTrailMission } from "@/data/missions";

let db: Database;

beforeEach(async () => {
  db = await setupTestDb();
});

afterEach(() => {
  db.close();
});

describe("Миссия 3 — Деньги: проходимость", () => {
  // ─── Цель 1: obj-suspicious-transactions ──────────────

  describe("obj-suspicious-transactions: подозрительные транзакции", () => {
    const obj = moneyTrailMission.objectives.find((o) => o.id === "obj-suspicious-transactions")!;

    it("SELECT * FROM transactions WHERE suspicious = 1 → >= 5 строк → pass", () => {
      const result = executeQuery(db, "SELECT * FROM transactions WHERE suspicious = 1");
      expect(result.rowCount).toBeGreaterThanOrEqual(5);
      expect(result.columns).toContain("amount");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("точное количество suspicious=1: 12", () => {
      const result = executeQuery(
        db,
        "SELECT COUNT(*) FROM transactions WHERE suspicious = 1"
      );
      expect(Number(result.rows[0][0])).toBe(12);
    });

    it("без столбца amount → fail", () => {
      const result = executeQuery(
        db,
        "SELECT id, suspect_id, suspicious FROM transactions WHERE suspicious = 1"
      );
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ─── Цель 2: obj-money-trail ──────────────────────────

  describe("obj-money-trail: транзакции Воронова", () => {
    const obj = moneyTrailMission.objectives.find((o) => o.id === "obj-money-trail")!;

    it("в seed 2 транзакции с suspect_id=1 AND suspicious=1", () => {
      const result = executeQuery(
        db,
        "SELECT * FROM transactions WHERE suspect_id = 1 AND suspicious = 1"
      );
      expect(result.rowCount).toBe(2);
    });

    it("запрос по подсказке проходит валидацию (rowCount >= 2)", () => {
      const result = executeQuery(
        db,
        "SELECT * FROM transactions WHERE suspect_id = 1 AND suspicious = 1"
      );
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("workaround: поиск по account name VORONOV → 4 строки → pass", () => {
      const sql = `
        SELECT * FROM transactions
        WHERE (from_account LIKE '%VORONOV%' OR to_account LIKE '%VORONOV%')
        AND suspicious = 1
      `;
      const result = executeQuery(db, sql);
      // IDs: 1 (from VORONOV), 6 (to VORONOV), 8 (to VORONOV), 13 (to VORONOV)
      expect(result.rowCount).toBe(4);
      expect(result.columns).toContain("amount");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });
  });

  // ─── Цель 3: obj-total-amount ─────────────────────────

  describe("obj-total-amount: сумма транзакций Воронова", () => {
    const obj = moneyTrailMission.objectives.find((o) => o.id === "obj-total-amount")!;

    it("SUM(amount) WHERE suspect_id = 1 AND suspicious = 1 → число > 0 → pass", () => {
      const result = executeQuery(
        db,
        "SELECT SUM(amount) FROM transactions WHERE suspect_id = 1 AND suspicious = 1"
      );
      expect(result.rowCount).toBe(1);
      expect(Number(result.rows[0][0])).toBe(7500000);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("workaround SUM по account name → тоже pass", () => {
      const sql = `
        SELECT SUM(amount) FROM transactions
        WHERE (from_account LIKE '%VORONOV%' OR to_account LIKE '%VORONOV%')
        AND suspicious = 1
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBe(1);
      expect(Number(result.rows[0][0])).toBeGreaterThan(0);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("rowCount != 1 → fail", () => {
      // suspect_id=1 has 3 transactions total (IDs 1, 11, 13) — rowCount=3 fails
      const result = executeQuery(
        db,
        "SELECT amount FROM transactions WHERE suspect_id = 1"
      );
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ─── Контроль доступа ─────────────────────────────────

  describe("table access", () => {
    it("transactions — разрешена", () => {
      expect(
        checkTableAccess("SELECT * FROM transactions", moneyTrailMission.unlockedTables!).allowed
      ).toBe(true);
    });

    it("все 5 таблиц доступны", () => {
      for (const table of moneyTrailMission.unlockedTables!) {
        expect(
          checkTableAccess(`SELECT * FROM ${table}`, moneyTrailMission.unlockedTables!).allowed
        ).toBe(true);
      }
    });

    it("org_members — заблокирована (не в unlockedTables)", () => {
      const r = checkTableAccess("SELECT * FROM org_members", moneyTrailMission.unlockedTables!);
      expect(r.allowed).toBe(false);
    });
  });

  // ─── Полный прогон по подсказкам ─────────────────────

  describe("полный прогон 3 целей по подсказкам", () => {
    it("проходит все 3 цели последовательно", () => {
      const completed = new Set<string>();

      // Цель 1: suspicious transactions
      const r1 = executeQuery(db, "SELECT * FROM transactions WHERE suspicious = 1");
      const o1 = checkObjectives(moneyTrailMission, r1, db, completed);
      expect(o1).toHaveLength(1);
      expect(o1[0].objectiveId).toBe("obj-suspicious-transactions");
      completed.add(o1[0].objectiveId);

      // Цель 2: Voronov's transactions (по подсказке)
      const r2 = executeQuery(
        db,
        "SELECT * FROM transactions WHERE suspect_id = 1 AND suspicious = 1"
      );
      const o2 = checkObjectives(moneyTrailMission, r2, db, completed);
      expect(o2).toHaveLength(1);
      expect(o2[0].objectiveId).toBe("obj-money-trail");
      completed.add(o2[0].objectiveId);

      // Цель 3: total amount
      const r3 = executeQuery(
        db,
        "SELECT SUM(amount) FROM transactions WHERE suspect_id = 1 AND suspicious = 1"
      );
      const o3 = checkObjectives(moneyTrailMission, r3, db, completed);
      expect(o3).toHaveLength(1);
      expect(o3[0].objectiveId).toBe("obj-total-amount");
      completed.add(o3[0].objectiveId);

      expect(isMissionComplete(moneyTrailMission, completed)).toBe(true);
    });
  });
});
