/**
 * Прогресс по задачам дела v2: основные задачи по порядку (не больше одной за
 * запрос), дополнительные — на каждом запросе, обратная связь только на попытки.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { Database } from "sql.js";
import { createDatabase, executeQuery } from "@/engine/database";
import {
  checkCaseProgress,
  isCaseObjectivesDone,
  activeObjective,
  mainObjectives,
  optionalObjectives,
} from "@/engine/case-runner";
import type { QueryResult } from "@/types/database";
import { makeCase, objective, PEOPLE_SQL } from "../helpers/case-fixture";

let db: Database;
const run = (sql: string) => executeQuery(db, sql);
const ids = (progress: { completed: { objectiveId: string }[] }) => progress.completed.map((c) => c.objectiveId);

beforeAll(async () => {
  db = await createDatabase();
  db.run(PEOPLE_SQL);
});

describe("activeObjective / isCaseObjectivesDone", () => {
  const caseDef = makeCase();

  it("активна самая ранняя невыполненная основная задача", () => {
    expect(activeObjective(caseDef, new Set())?.id).toBe("obj-all");
    expect(activeObjective(caseDef, new Set(["obj-all"]))?.id).toBe("obj-north");
  });

  it("дополнительные задачи никогда не активны", () => {
    expect(activeObjective(caseDef, new Set(["obj-all", "obj-north"]))).toBeNull();
  });

  it("порядок берётся из order, а не из порядка объявления", () => {
    const shuffled = makeCase({ objectives: [...caseDef.objectives].reverse() });
    expect(activeObjective(shuffled, new Set())?.id).toBe("obj-all");
    expect(mainObjectives(shuffled).map((o) => o.id)).toEqual(["obj-all", "obj-north"]);
    expect(optionalObjectives(shuffled).map((o) => o.id)).toEqual(["obj-extra"]);
  });

  it("дело готово, когда выполнены все основные — дополнительные не нужны", () => {
    expect(isCaseObjectivesDone(caseDef, new Set())).toBe(false);
    expect(isCaseObjectivesDone(caseDef, new Set(["obj-all"]))).toBe(false);
    expect(isCaseObjectivesDone(caseDef, new Set(["obj-all", "obj-north"]))).toBe(true);
    expect(isCaseObjectivesDone(caseDef, new Set(["obj-extra"]))).toBe(false);
  });

  it("дело без основных задач готово сразу", () => {
    const onlyOptional = makeCase({ objectives: [objective({ id: "x", order: 1, optional: true })] });
    expect(isCaseObjectivesDone(onlyOptional, new Set())).toBe(true);
    expect(activeObjective(onlyOptional, new Set())).toBeNull();
  });
});

describe("checkCaseProgress: основные задачи", () => {
  const caseDef = makeCase();

  it("засчитывает текущую задачу и возвращает её вывод, улику и сцену", () => {
    const progress = checkCaseProgress(caseDef, run("SELECT id, name FROM people"), db, new Set());
    expect(progress.completed).toEqual([
      {
        objectiveId: "obj-all",
        message: "Готово: obj-all",
        evidence: { id: "ev.c03.list", title: "Список", text: "Все сотрудники", kind: "record" },
        sceneAfter: "found",
      },
    ]);
    expect(progress.activeFeedback).toBeNull();
  });

  it("без улики и сцены — поля не появляются", () => {
    const progress = checkCaseProgress(
      caseDef,
      run("SELECT name FROM people WHERE city = 'Северск'"),
      db,
      new Set(["obj-all"])
    );
    expect(progress.completed).toEqual([{ objectiveId: "obj-north", message: "Готово: obj-north" }]);
  });

  it("следующую задачу нельзя закрыть раньше текущей", () => {
    // Этот запрос решает obj-north, но активна obj-all
    const progress = checkCaseProgress(caseDef, run("SELECT name FROM people WHERE city = 'Северск'"), db, new Set());
    expect(progress.completed).toEqual([]);
    expect(progress.activeFeedback).toBe("Ожидалось 4 записей, получено 2.");
  });

  it("за один запрос закрывается не больше одной основной задачи", () => {
    const both = makeCase({
      objectives: [
        objective({ id: "a", order: 1, validation: { type: "row_count", expected: 1, comparison: "gte" } }),
        objective({ id: "b", order: 2, validation: { type: "row_count", expected: 1, comparison: "gte" } }),
      ],
    });
    const result = run("SELECT * FROM people");
    expect(ids(checkCaseProgress(both, result, db, new Set()))).toEqual(["a"]);
    expect(ids(checkCaseProgress(both, result, db, new Set(["a"])))).toEqual(["b"]);
    expect(ids(checkCaseProgress(both, result, db, new Set(["a", "b"])))).toEqual([]);
  });

  it("выполненные задачи не засчитываются повторно", () => {
    const done = new Set(["obj-all", "obj-north", "obj-extra"]);
    const progress = checkCaseProgress(caseDef, run("SELECT * FROM people"), db, done);
    expect(progress.completed).toEqual([]);
    expect(progress.activeFeedback).toBeNull();
  });
});

describe("checkCaseProgress: дополнительные задачи", () => {
  const caseDef = makeCase();

  it("проверяются на любом запросе, даже до основной задачи", () => {
    const progress = checkCaseProgress(caseDef, run("SELECT salary FROM people WHERE id = 3"), db, new Set());
    expect(ids(progress)).toEqual(["obj-extra"]);
    expect(progress.completed[0].optional).toBe(true);
    expect(progress.completed[0].evidence?.id).toBe("ev.c03.salary");
    // Основная задача не пройдена — обратная связь по ней остаётся
    expect(progress.activeFeedback).toBe("Ожидалось 4 записей, получено 1.");
  });

  it("основная и дополнительная могут закрыться одним запросом: сначала основная", () => {
    const progress = checkCaseProgress(caseDef, run("SELECT * FROM people"), db, new Set());
    expect(ids(progress)).toEqual(["obj-all", "obj-extra"]);
    expect(progress.completed[0].optional).toBeUndefined();
  });

  it("несколько дополнительных закрываются одним запросом независимо от order", () => {
    const many = makeCase({
      objectives: [
        objective({ id: "main", order: 1, validation: { type: "row_count", expected: 100, comparison: "eq" } }),
        objective({ id: "o1", order: 5, optional: true, validation: { type: "cell_value", value: "Южный" } }),
        objective({ id: "o2", order: 1, optional: true, validation: { type: "cell_value", value: 120.5 } }),
        objective({ id: "o3", order: 2, optional: true, validation: { type: "cell_value", value: "Москва" } }),
      ],
    });
    const progress = checkCaseProgress(many, run("SELECT * FROM people"), db, new Set());
    expect(ids(progress)).toEqual(["o1", "o2"]);
    expect(ids(checkCaseProgress(many, run("SELECT * FROM people"), db, new Set(["o1"])))).toEqual(["o2"]);
  });

  it("после выполнения всех основных дополнительные всё ещё засчитываются", () => {
    const progress = checkCaseProgress(caseDef, run("SELECT 95.25 AS x"), db, new Set(["obj-all", "obj-north"]));
    expect(ids(progress)).toEqual(["obj-extra"]);
    expect(progress.activeFeedback).toBeNull();
  });
});

describe("checkCaseProgress: ошибки и обратная связь", () => {
  const caseDef = makeCase();

  it("запрос с ошибкой ничего не закрывает и молчит", () => {
    const result = run("SELECT * FROM nowhere");
    expect(result.error).not.toBeNull();
    expect(checkCaseProgress(caseDef, result, db, new Set())).toEqual({ completed: [], activeFeedback: null });
  });

  it("заблокированный guard'ом запрос (ошибка без строк) тоже молчит", () => {
    const denied: QueryResult = {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      error: "[ДОСТУП ЗАПРЕЩЁН]",
      errorKind: "locked_table",
    };
    expect(checkCaseProgress(caseDef, denied, db, new Set())).toEqual({ completed: [], activeFeedback: null });
  });

  it("результат без столбцов (например, после UPDATE) — не попытка, без обратной связи", () => {
    const noColumns: QueryResult = { columns: [], rows: [], rowCount: 0, executionTimeMs: 0, error: null };
    expect(checkCaseProgress(caseDef, noColumns, db, new Set()).activeFeedback).toBeNull();
  });

  it("пустой результат со столбцами — попытка, обратная связь есть", () => {
    const progress = checkCaseProgress(caseDef, run("SELECT * FROM people WHERE 0"), db, new Set());
    expect(progress.completed).toEqual([]);
    expect(progress.activeFeedback).toBe("Ожидалось 4 записей, получено 0.");
  });

  it("сообщение валидатора для column_values доходит до игрока", () => {
    const progress = checkCaseProgress(caseDef, run("SELECT name FROM people"), db, new Set(["obj-all"]));
    expect(progress.activeFeedback).toBe("Не совпадает: лишних значений: 2.");
  });

  it("NULL и числовые строки в результатах не ломают проверку", () => {
    const nulls = makeCase({
      objectives: [objective({ id: "n", order: 1, validation: { type: "cell_value", value: 80, columns: ["salary"] } })],
    });
    expect(ids(checkCaseProgress(nulls, run("SELECT NULL AS city, '80' AS salary"), db, new Set()))).toEqual(["n"]);
    expect(ids(checkCaseProgress(nulls, run("SELECT NULL AS salary"), db, new Set()))).toEqual([]);
  });

  it("сломанное custom-правило не роняет игру", () => {
    const broken = makeCase({
      objectives: [
        objective({
          id: "boom",
          order: 1,
          validation: {
            type: "custom",
            check: () => {
              throw new Error("boom");
            },
          },
        }),
        objective({
          id: "boom-opt",
          order: 2,
          optional: true,
          validation: {
            type: "custom",
            check: () => {
              throw new Error("boom");
            },
          },
        }),
      ],
    });
    const progress = checkCaseProgress(broken, run("SELECT 1"), db, new Set());
    expect(progress.completed).toEqual([]);
    expect(progress.activeFeedback).toMatch(/Сообщите разработчику/);
  });

  it("сломанный эталонный запрос даёт понятное сообщение", () => {
    const badRef = makeCase({
      objectives: [objective({ id: "r", order: 1, validation: { type: "rows_match", referenceQuery: "SELECT * FROM nope" } })],
    });
    expect(checkCaseProgress(badRef, run("SELECT 1"), db, new Set()).activeFeedback).toMatch(/эталонном/);
  });
});
