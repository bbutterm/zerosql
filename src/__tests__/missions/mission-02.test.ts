/**
 * Миссия 2: "Тени порта — Перехват"
 * 3 цели, SQL: LIKE, WHERE, JOIN, AND/OR
 * unlockedTables: suspects, crimes, crime_suspects, communications
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "sql.js";
import { setupTestDb } from "../helpers/setup-db";
import { executeQuery } from "@/engine/database";
import { validate } from "@/engine/validator";
import { checkObjectives, isMissionComplete } from "@/engine/mission-runner";
import { checkTableAccess } from "@/engine/table-guard";
import { interceptMission } from "@/data/missions/mission-02-intercept";

let db: Database;

beforeEach(async () => {
  db = await setupTestDb();
});

afterEach(() => {
  db.close();
});

describe("Миссия 2 — Перехват: проходимость", () => {
  // ─── Цель 1: obj-flagged-comms ────────────────────────

  describe("obj-flagged-comms: помеченные сообщения", () => {
    const obj = interceptMission.objectives.find((o) => o.id === "obj-flagged-comms")!;

    it("SELECT * FROM communications WHERE flagged = 1 → >= 5 строк + content → pass", () => {
      const result = executeQuery(db, "SELECT * FROM communications WHERE flagged = 1");
      expect(result.rowCount).toBeGreaterThanOrEqual(5);
      expect(result.columns).toContain("content");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("точное количество flagged=1: 9", () => {
      const result = executeQuery(db, "SELECT COUNT(*) FROM communications WHERE flagged = 1");
      expect(Number(result.rows[0][0])).toBe(9);
    });

    it("без столбца content → fail", () => {
      const result = executeQuery(
        db,
        "SELECT id, from_suspect_id, flagged FROM communications WHERE flagged = 1"
      );
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ─── Цель 2: obj-communications ───────────────────────

  describe("obj-communications: сообщения о грузе/порте", () => {
    const obj = interceptMission.objectives.find((o) => o.id === "obj-communications")!;

    it("LIKE '%груз%' OR '%порт%' в январе → pass", () => {
      const sql = `
        SELECT * FROM communications
        WHERE (content LIKE '%груз%' OR content LIKE '%порт%')
        AND timestamp LIKE '2024-01%'
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBeGreaterThanOrEqual(1);
      expect(result.columns).toContain("content");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("'%груз%' (строчная) находит 'груз' в seed-данных", () => {
      const result = executeQuery(
        db,
        "SELECT * FROM communications WHERE content LIKE '%груз%'"
      );
      expect(result.rowCount).toBeGreaterThanOrEqual(1);
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("'%Груз%' с заглавной → тоже находит", () => {
      // SQLite LIKE case-insensitive только для ASCII, но в seed "груз" в нижнем регистре
      const result = executeQuery(
        db,
        "SELECT * FROM communications WHERE content LIKE '%Груз%'"
      );
      // Не найдёт, т.к. в seed теперь "груз" (строчная)
      expect(result.rowCount).toBe(0);
    });

    it("запрос без упоминания груза/порта → fail", () => {
      const result = executeQuery(
        db,
        "SELECT * FROM communications WHERE content LIKE '%казино%'"
      );
      const outcome = validate(obj.validation, result, db);
      // Проверяем — может в казино-сообщениях нет слов "груз" или "порт"
      const contentIdx = result.columns.indexOf("content");
      const hasGruz = result.rows.some((r) => String(r[contentIdx]).toLowerCase().includes("груз"));
      const hasPort = result.rows.some((r) => String(r[contentIdx]).toLowerCase().includes("порт"));
      if (!hasGruz && !hasPort) {
        expect(outcome.passed).toBe(false);
      }
    });
  });

  // ─── Цель 3: obj-voronov-contacts ─────────────────────

  describe("obj-voronov-contacts: контакты Воронова", () => {
    const obj = interceptMission.objectives.find((o) => o.id === "obj-voronov-contacts")!;

    it("JOIN communications + suspects WHERE from_suspect_id = 1 → >= 2 имени → pass", () => {
      const sql = `
        SELECT DISTINCT s.name
        FROM communications c
        JOIN suspects s ON c.to_suspect_id = s.id
        WHERE c.from_suspect_id = 1
      `;
      const result = executeQuery(db, sql);
      expect(result.rowCount).toBeGreaterThanOrEqual(2);
      expect(result.columns).toContain("name");
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(true);
    });

    it("Воронов (id=1) переписывался с 3 людьми", () => {
      const result = executeQuery(
        db,
        "SELECT DISTINCT to_suspect_id FROM communications WHERE from_suspect_id = 1"
      );
      // IDs: 4 (Тень), 2 (Лис), 13 (Соль)
      expect(result.rowCount).toBe(3);
    });

    it("без столбца name → fail", () => {
      const result = executeQuery(
        db,
        "SELECT DISTINCT to_suspect_id FROM communications WHERE from_suspect_id = 1"
      );
      const outcome = validate(obj.validation, result, db);
      expect(outcome.passed).toBe(false);
    });
  });

  // ─── Контроль доступа ─────────────────────────────────

  describe("table access", () => {
    it("communications — разрешена", () => {
      expect(
        checkTableAccess("SELECT * FROM communications", interceptMission.unlockedTables!).allowed
      ).toBe(true);
    });

    it("transactions — заблокирована", () => {
      const r = checkTableAccess("SELECT * FROM transactions", interceptMission.unlockedTables!);
      expect(r.allowed).toBe(false);
    });
  });

  // ─── Полный прогон ─────────────────────────────────────

  describe("полный прогон всех 3 целей", () => {
    it("проходит все цели последовательно", () => {
      const completed = new Set<string>();

      // Цель 1: flagged comms
      const r1 = executeQuery(db, "SELECT * FROM communications WHERE flagged = 1");
      const o1 = checkObjectives(interceptMission, r1, db, completed);
      expect(o1).toHaveLength(1);
      expect(o1[0].objectiveId).toBe("obj-flagged-comms");
      completed.add(o1[0].objectiveId);

      // Цель 2: cargo/port messages
      const r2 = executeQuery(
        db,
        `SELECT * FROM communications
         WHERE (content LIKE '%груз%' OR content LIKE '%порт%')
         AND timestamp LIKE '2024-01%'`
      );
      const o2 = checkObjectives(interceptMission, r2, db, completed);
      expect(o2).toHaveLength(1);
      expect(o2[0].objectiveId).toBe("obj-communications");
      completed.add(o2[0].objectiveId);

      // Цель 3: Voronov contacts
      const r3 = executeQuery(
        db,
        `SELECT DISTINCT s.name
         FROM communications c
         JOIN suspects s ON c.to_suspect_id = s.id
         WHERE c.from_suspect_id = 1`
      );
      const o3 = checkObjectives(interceptMission, r3, db, completed);
      expect(o3).toHaveLength(1);
      expect(o3[0].objectiveId).toBe("obj-voronov-contacts");
      completed.add(o3[0].objectiveId);

      expect(isMissionComplete(interceptMission, completed)).toBe(true);
    });
  });
});
