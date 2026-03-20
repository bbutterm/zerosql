/**
 * Миссия 0: Туториал — "Первый день в участке"
 * 3 цели, SQL: SELECT, WHERE, COUNT
 * unlockedTables: suspects, crimes
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "sql.js";
import { setupTestDb } from "../helpers/setup-db";
import { executeQuery } from "@/engine/database";
import { validate } from "@/engine/validator";
import { checkObjectives, isMissionComplete } from "@/engine/mission-runner";
import { checkTableAccess } from "@/engine/table-guard";
import { tutorialMission } from "@/data/missions";

let db: Database;

beforeEach(async () => {
  db = await setupTestDb();
});

afterEach(() => {
  db.close();
});

describe("Миссия 0 — Туториал: проходимость", () => {
  // ─── Цель 1: obj-list-suspects ────────────────────────

  describe("obj-list-suspects: список подозреваемых", () => {
    const obj = tutorialMission.objectives.find((o) => o.id === "obj-list-suspects")!;

    it("SELECT * FROM suspects → 15 строк → pass", () => {
      const result = executeQuery(db, "SELECT * FROM suspects");
      expect(result.rowCount).toBe(15);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("14 строк → fail", () => {
      const result = executeQuery(db, "SELECT * FROM suspects LIMIT 14");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ─── Цель 2: obj-wanted ───────────────────────────────

  describe("obj-wanted: подозреваемые в розыске", () => {
    const obj = tutorialMission.objectives.find((o) => o.id === "obj-wanted")!;

    it("SELECT * FROM suspects WHERE status = 'в розыске' → pass (exact_match)", () => {
      const result = executeQuery(db, "SELECT * FROM suspects WHERE status = 'в розыске'");
      expect(result.rowCount).toBe(3);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("другой порядок столбцов (SELECT id, name, ...) → fail (column count differs)", () => {
      const result = executeQuery(
        db,
        "SELECT id, name, status FROM suspects WHERE status = 'в розыске'"
      );
      const outcome = validate(obj.validation, result, db);
      // exact_match сравнивает column count с SELECT * (10 col) — 3 col != 10 col → fail
      expect(outcome.passed).toBe(false);
    });
  });

  // ─── Цель 3: obj-count-crimes ─────────────────────────

  describe("obj-count-crimes: количество открытых дел", () => {
    const obj = tutorialMission.objectives.find((o) => o.id === "obj-count-crimes")!;

    it("SELECT COUNT(*) FROM crimes WHERE status = 'открыто' → 6 → pass", () => {
      const result = executeQuery(
        db,
        "SELECT COUNT(*) FROM crimes WHERE status = 'открыто'"
      );
      expect(result.rowCount).toBe(1);
      expect(Number(result.rows[0][0])).toBe(6);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("значение != 6 → fail", () => {
      const result = executeQuery(
        db,
        "SELECT COUNT(*) FROM crimes WHERE status = 'в процессе'"
      );
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ─── Контроль доступа ─────────────────────────────────

  describe("table access", () => {
    it("suspects и crimes — разрешены", () => {
      expect(checkTableAccess("SELECT * FROM suspects", tutorialMission.unlockedTables!).allowed).toBe(true);
      expect(checkTableAccess("SELECT * FROM crimes", tutorialMission.unlockedTables!).allowed).toBe(true);
    });

    it("communications — заблокирована", () => {
      const r = checkTableAccess("SELECT * FROM communications", tutorialMission.unlockedTables!);
      expect(r.allowed).toBe(false);
      expect(r.blockedTable).toBe("communications");
    });

    it("transactions — заблокирована", () => {
      const r = checkTableAccess("SELECT * FROM transactions", tutorialMission.unlockedTables!);
      expect(r.allowed).toBe(false);
    });
  });

  // ─── Полный последовательный прогон ────────────────────

  describe("полный прогон всех 3 целей", () => {
    it("проходит все цели последовательно через checkObjectives", () => {
      const completed = new Set<string>();

      // Цель 1: list suspects
      const r1 = executeQuery(db, "SELECT * FROM suspects");
      const o1 = checkObjectives(tutorialMission, r1, db, completed);
      expect(o1).toHaveLength(1);
      expect(o1[0].objectiveId).toBe("obj-list-suspects");
      expect(o1[0].outcome.passed).toBe(true);
      completed.add(o1[0].objectiveId);

      // Цель 2: wanted
      const r2 = executeQuery(db, "SELECT * FROM suspects WHERE status = 'в розыске'");
      const o2 = checkObjectives(tutorialMission, r2, db, completed);
      expect(o2).toHaveLength(1);
      expect(o2[0].objectiveId).toBe("obj-wanted");
      completed.add(o2[0].objectiveId);

      // Цель 3: count crimes
      const r3 = executeQuery(db, "SELECT COUNT(*) FROM crimes WHERE status = 'открыто'");
      const o3 = checkObjectives(tutorialMission, r3, db, completed);
      expect(o3).toHaveLength(1);
      expect(o3[0].objectiveId).toBe("obj-count-crimes");
      completed.add(o3[0].objectiveId);

      expect(isMissionComplete(tutorialMission, completed)).toBe(true);
    });
  });
});
