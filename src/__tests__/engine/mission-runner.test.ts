import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "sql.js";
import { setupTestDb } from "../helpers/setup-db";
import { checkObjectives, isMissionComplete } from "@/engine/mission-runner";
import type { Mission } from "@/types/mission";
import type { QueryResult } from "@/types/database";

let db: Database;

beforeEach(async () => {
  db = await setupTestDb();
});

afterEach(() => {
  db.close();
});

// Мини-миссия для тестов runner-логики
const testMission: Mission = {
  id: "test-mission",
  title: "Test",
  subtitle: "",
  briefing: "",
  objectives: [
    {
      id: "obj-1",
      description: "First",
      order: 1,
      validation: { type: "row_count", expected: 15, comparison: "eq" },
      storyReward: "Награда за первую цель",
    },
    {
      id: "obj-2",
      description: "Second",
      order: 2,
      validation: { type: "row_count", expected: 3, comparison: "eq" },
    },
    {
      id: "obj-3",
      description: "Third",
      order: 3,
      validation: {
        type: "custom",
        check: (r) => ({
          passed: r.rowCount === 6,
          message: r.rowCount === 6 ? "ok" : "wrong",
        }),
      },
    },
  ],
  hints: [],
  narrativeOnComplete: "",
  difficulty: "tutorial",
  sqlConcepts: [],
};

function makeResult(rowCount: number): QueryResult {
  return {
    columns: ["id"],
    rows: Array.from({ length: rowCount }, (_, i) => [i]),
    rowCount,
    executionTimeMs: 0,
    error: null,
  };
}

describe("checkObjectives", () => {
  it("пропускает уже завершённые цели", () => {
    const completed = new Set(["obj-1"]);
    // rowCount=3 should match obj-2 (the next one)
    const results = checkObjectives(testMission, makeResult(3), db, completed);
    expect(results).toHaveLength(1);
    expect(results[0].objectiveId).toBe("obj-2");
    expect(results[0].outcome.passed).toBe(true);
  });

  it("проверяет цели по порядку (order)", () => {
    // obj-1 expects 15 rows — sending 3 should NOT match obj-1 but stop
    const results = checkObjectives(testMission, makeResult(3), db, new Set());
    expect(results).toHaveLength(0); // obj-1 didn't pass, stopped
  });

  it("завершает максимум 1 цель за вызов", () => {
    // rowCount=15 matches obj-1, but obj-2 expects 3 — should only complete obj-1
    const results = checkObjectives(testMission, makeResult(15), db, new Set());
    expect(results).toHaveLength(1);
    expect(results[0].objectiveId).toBe("obj-1");
  });

  it("возвращает [] когда ничего нового не завершено", () => {
    const results = checkObjectives(testMission, makeResult(999), db, new Set());
    expect(results).toHaveLength(0);
  });

  it("storyReward перезаписывает сообщение валидатора", () => {
    const results = checkObjectives(testMission, makeResult(15), db, new Set());
    expect(results[0].outcome.message).toBe("Награда за первую цель");
  });

  it("без storyReward используется сообщение валидатора", () => {
    const completed = new Set(["obj-1"]);
    const results = checkObjectives(testMission, makeResult(3), db, completed);
    // obj-2 has no storyReward — should use validator message
    expect(results[0].outcome.message).toContain("Отличная работа");
  });
});

describe("isMissionComplete", () => {
  it("true когда все цели завершены", () => {
    const completed = new Set(["obj-1", "obj-2", "obj-3"]);
    expect(isMissionComplete(testMission, completed)).toBe(true);
  });

  it("false если хоть одна цель не завершена", () => {
    const completed = new Set(["obj-1", "obj-3"]);
    expect(isMissionComplete(testMission, completed)).toBe(false);
  });

  it("false при пустом наборе", () => {
    expect(isMissionComplete(testMission, new Set())).toBe(false);
  });
});
