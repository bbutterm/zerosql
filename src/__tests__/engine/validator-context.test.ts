/**
 * Новые типы валидации (GAME_DESIGN, разд. 6.14, п. 6): table_state,
 * view_match, pin, seen, slot — и контекст стола (ValidationContext),
 * который передаётся четвёртым аргументом в validate() / checkCaseProgress().
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { createDatabase, executeQuery } from "@/engine/database";
import { validate } from "@/engine/validator";
import { checkCaseProgress, activeObjective, isCaseObjectivesDone, mainObjectives } from "@/engine/case-runner";
import { checkSecrets } from "@/engine/secrets";
import type { PinnedCard, ValidationContext } from "@/types/case";
import type { ValidationRule } from "@/types/mission";
import { makeCase, objective } from "../helpers/case-fixture";

let db: Database;
const run = (sql: string) => executeQuery(db, sql);
const ok = run.bind(null);

beforeEach(async () => {
  db = await createDatabase();
  db.run(`
    CREATE TABLE statements (id INTEGER PRIMARY KEY, case_id TEXT, text TEXT, status TEXT);
    CREATE TABLE arch16_statements (id INTEGER PRIMARY KEY, case_id TEXT, text TEXT);
    INSERT INTO arch16_statements VALUES (2071, '15-0219', 'Фары под водой'), (2072, '15-0219', 'Видела машину'), (2073, '15-0220', 'Ничего');
    INSERT INTO statements VALUES (2073, '15-0220', 'Ничего', 'активна');
  `);
});

const card = (id: string, columns: string[], values: PinnedCard["values"], patch: Partial<PinnedCard> = {}): PinnedCard => ({
  id,
  columns,
  values,
  ...patch,
});

const MISSING = "SELECT COUNT(*) AS пропавших FROM arch16_statements a WHERE a.id NOT IN (SELECT id FROM statements)";

describe("table_state", () => {
  const rule: ValidationRule = { type: "table_state", query: MISSING, rule: { type: "cell_value", value: 0 } };

  it("до восстановления — не проходит, после INSERT … SELECT — проходит", () => {
    expect(validate(rule, ok("SELECT 1"), db).passed).toBe(false);
    const insert = run("INSERT INTO statements(id, case_id, text, status) SELECT id, case_id, text, 'восстановлено' FROM arch16_statements WHERE id NOT IN (SELECT id FROM statements)");
    expect(validate(rule, insert, db).passed).toBe(true);
  });

  it("проверяется состояние базы, а не результат игрока", () => {
    run("INSERT INTO statements SELECT id, case_id, text, 'x' FROM arch16_statements WHERE id <> 2073");
    // Результат игрока ничего не содержит — но состояние верное
    expect(validate(rule, ok("SELECT 'не важно'"), db).passed).toBe(true);
  });

  it("составное состояние: все вернулись и помечены", () => {
    run("INSERT INTO statements SELECT id, case_id, text, 'восстановлено' FROM arch16_statements WHERE id <> 2073");
    const state: ValidationRule = {
      type: "compound",
      successMessage: "Готово",
      rules: [
        rule,
        {
          type: "table_state",
          query: "SELECT id FROM statements WHERE status = 'восстановлено'",
          rule: { type: "column_values", values: [2071, 2072] },
        },
      ],
    };
    expect(validate(state, ok("SELECT 1"), db).passed).toBe(true);
  });

  it("ошибка в эталонном запросе — честное сообщение", () => {
    const broken: ValidationRule = { type: "table_state", query: "SELECT * FROM nope", rule: { type: "row_count", expected: 0, comparison: "eq" } };
    expect(validate(broken, ok("SELECT 1"), db).message).toMatch(/эталонном запросе/);
  });

  it("запрос игрока с ошибкой — не проходит", () => {
    expect(validate(rule, run("SELEC 1"), db).passed).toBe(false);
  });
});

describe("view_match", () => {
  const REF = "SELECT id, case_id FROM arch16_statements WHERE case_id = '15-0219'";

  it("нет представления — подсказка с CREATE VIEW", () => {
    const outcome = validate({ type: "view_match", view: "child_words", referenceQuery: REF }, ok("SELECT 1"), db);
    expect(outcome.passed).toBe(false);
    expect(outcome.message).toContain("CREATE VIEW child_words");
  });

  it("содержимое совпадает с эталоном — с любыми алиасами и лишними столбцами", () => {
    run("CREATE VIEW child_words AS SELECT case_id AS дело, id AS номер, text FROM arch16_statements WHERE case_id = '15-0219'");
    expect(validate({ type: "view_match", view: "child_words", referenceQuery: REF }, ok("SELECT 1"), db).passed).toBe(true);
  });

  it("лишние строки — не проходит, с объяснением", () => {
    run("CREATE VIEW child_words AS SELECT id, case_id FROM arch16_statements");
    const outcome = validate({ type: "view_match", view: "child_words", referenceQuery: REF }, ok("SELECT 1"), db);
    expect(outcome.passed).toBe(false);
    expect(outcome.message).toMatch(/^В представлении «child_words»: строк больше/);
  });

  it("правило над содержимым", () => {
    run("CREATE VIEW child_words AS SELECT id FROM arch16_statements WHERE case_id = '15-0219'");
    const rule: ValidationRule = { type: "view_match", view: "CHILD_WORDS", rule: { type: "row_count", expected: 2, comparison: "eq" } };
    expect(validate(rule, ok("SELECT 1"), db).passed).toBe(true);
  });
});

describe("pin", () => {
  const plate = card("c1", ["plate", "read_at", "camera_id"], ["К404ТО", "2026-11-18 23:34:00", 22], { table: "plate_reads", sourceClass: "dorset" });
  const audit = card("c2", ["kusp_no", "ts", "login"], [4518, "2026-11-19 02:10:00", "burtsev"], { table: "audit_log", sourceClass: "pbd" });
  const ghost = card("c3", ["plate"], ["К404ТО"], { table: "plate_reads", sourceClass: "mirror_siyanie", stamp: "ghost" });

  const node: ValidationRule = {
    type: "pin",
    where: { all: [{ column: "plate", eq: "к404то" }, { column: "read_at", between: ["2026-11-18 23:00:00", "2026-11-18 23:59:59"] }] },
  };

  it("карточка засчитывается по содержимому", () => {
    expect(validate(node, ok("SELECT 1"), db, { pins: [plate] }).passed).toBe(true);
    expect(validate(node, ok("SELECT 1"), db, { pins: [audit] }).passed).toBe(false);
  });

  it("без контекста не проходит", () => {
    expect(validate(node, ok("SELECT 1"), db).passed).toBe(false);
  });

  it("min и разные классы источников; призрак не считается", () => {
    const twoSources: ValidationRule = {
      type: "pin",
      where: { any: [{ column: "plate", eq: "К404ТО" }, { column: "kusp_no", eq: 4518 }] },
      min: 2,
      sources: 2,
    };
    expect(validate(twoSources, ok("SELECT 1"), db, { pins: [plate, audit] }).passed).toBe(true);
    const sameSource = validate(twoSources, ok("SELECT 1"), db, { pins: [plate, { ...plate, id: "c9" }] });
    expect(sameSource.passed).toBe(false);
    expect(sameSource.message).toBe("Независимых источников: 1 из 2.");
    expect(validate(twoSources, ok("SELECT 1"), db, { pins: [plate, ghost] }).passed).toBe(false);
    expect(validate({ ...twoSources, includeGhosts: true }, ok("SELECT 1"), db, { pins: [plate, ghost] }).passed).toBe(true);
  });

  it("фильтр по таблице и классу источника", () => {
    expect(validate({ type: "pin", where: { table: "audit_log" } }, ok("SELECT 1"), db, { pins: [plate, audit] }).passed).toBe(true);
    expect(validate({ type: "pin", where: { sourceClass: ["bank"] } }, ok("SELECT 1"), db, { pins: [plate, audit] }).passed).toBe(false);
  });
});

describe("seen", () => {
  const ctx: ValidationContext = { seen: new Set(["Вальц Ирина Петровна", "-38000", "2026-11-18 23:34:00", "3"]) };

  it("text по умолчанию; нормализация", () => {
    expect(validate({ type: "seen", value: "вальц ирина петровна" }, ok("SELECT 1"), db, ctx).passed).toBe(true);
    expect(validate({ type: "seen", value: "Гранин" }, ok("SELECT 1"), db, ctx).passed).toBe(false);
  });

  it("number по модулю, datetime по точности", () => {
    expect(validate({ type: "seen", value: 38000, kind: "number" }, ok("SELECT 1"), db, ctx).passed).toBe(true);
    expect(validate({ type: "seen", value: "2026-11-18", kind: "datetime", precision: "day" }, ok("SELECT 1"), db, ctx).passed).toBe(true);
    expect(validate({ type: "seen", value: "2026-11-19", kind: "datetime", precision: "day" }, ok("SELECT 1"), db, ctx).passed).toBe(false);
  });

  it("без реестра — не проходит, своё сообщение", () => {
    const outcome = validate({ type: "seen", value: 3, message: "Сначала найди его." }, ok("SELECT 1"), db);
    expect(outcome).toEqual({ passed: false, message: "Сначала найди его." });
  });
});

describe("slot", () => {
  it("слот «Перекрыть» — одно из значений", () => {
    const rule: ValidationRule = { type: "slot", slot: "block", value: ["Лестница Б, 1 эт.", "Лестница Б, Б0"] };
    expect(validate(rule, ok("SELECT 1"), db, { slots: { block: "лестница б, б0" } }).passed).toBe(true);
    expect(validate(rule, ok("SELECT 1"), db, { slots: { block: "КПП-1" } }).passed).toBe(false);
    expect(validate(rule, ok("SELECT 1"), db, { slots: { block: " " } }).message).toBe("Слот не заполнен.");
  });

  it("слот протокола с типом number", () => {
    const rule: ValidationRule = { type: "slot", slot: "amount", value: 300000, kind: "number" };
    expect(validate(rule, ok("SELECT 1"), db, { slots: { amount: "−300000" } }).passed).toBe(true);
  });
});

describe("контекст проходит через compound / any_of / not", () => {
  const ctx: ValidationContext = { slots: { who: "Бурцев" } };
  const slot: ValidationRule = { type: "slot", slot: "who", value: "Бурцев" };

  it("compound и any_of", () => {
    expect(validate({ type: "compound", rules: [slot], successMessage: "ok" }, ok("SELECT 1"), db, ctx).passed).toBe(true);
    expect(validate({ type: "any_of", rules: [{ type: "row_count", expected: 9, comparison: "eq" }, slot], successMessage: "ok" }, ok("SELECT 1"), db, ctx).passed).toBe(true);
  });

  it("not", () => {
    expect(validate({ type: "not", rule: slot, message: "Не он" }, ok("SELECT 1"), db, ctx).passed).toBe(false);
    expect(validate({ type: "not", rule: slot, message: "Не он" }, ok("SELECT 1"), db).passed).toBe(true);
  });
});

describe("checkCaseProgress с контекстом и условными задачами", () => {
  const caseDef = makeCase({
    tables: ["statements"],
    newTables: [],
    objectives: [
      objective({ id: "o1", order: 1, validation: { type: "pin", where: { all: [{ column: "plate", eq: "К404ТО" }] } } }),
      objective({ id: "o2", order: 2, validation: { type: "row_count", expected: 1, comparison: "eq" } }),
      objective({ id: "o2b", order: 3, when: { tokha_turned: false }, validation: { type: "row_count", expected: 1, comparison: "eq" } }),
      objective({ id: "o6", order: 4, when: { addressee: ["alla", "both"] }, validation: { type: "row_count", expected: 1, comparison: "eq" } }),
      objective({ id: "star", order: 99, optional: true, validation: { type: "seen", value: "zero" } }),
    ],
  });
  const plate = card("c1", ["plate"], ["К404ТО"]);

  it("pin-задача засчитывается по доске из контекста", () => {
    expect(checkCaseProgress(caseDef, ok("SELECT 1"), db, new Set()).completed).toEqual([]);
    const progress = checkCaseProgress(caseDef, ok("SELECT 1"), db, new Set(), { pins: [plate] });
    expect(progress.completed.map((c) => c.objectiveId)).toEqual(["o1"]);
  });

  it("доп. задача по реестру увиденного", () => {
    const progress = checkCaseProgress(caseDef, ok("SELECT 1"), db, new Set(["o1"]), { seen: new Set(["ZERO"]) });
    expect(progress.completed.map((c) => c.objectiveId)).toEqual(["o2", "star"]);
  });

  it("условные задачи: when по флагам; отсутствующий флаг = false", () => {
    expect(mainObjectives(caseDef).map((o) => o.id)).toEqual(["o1", "o2", "o2b"]);
    expect(mainObjectives(caseDef, { tokha_turned: true }).map((o) => o.id)).toEqual(["o1", "o2"]);
    expect(mainObjectives(caseDef, { addressee: "alla" }).map((o) => o.id)).toEqual(["o1", "o2", "o2b", "o6"]);
  });

  it("невыполнимая по флагам задача не нужна для закрытия дела", () => {
    const done = new Set(["o1", "o2"]);
    expect(isCaseObjectivesDone(caseDef, done)).toBe(false);
    expect(activeObjective(caseDef, done)?.id).toBe("o2b");
    expect(isCaseObjectivesDone(caseDef, done, { tokha_turned: true })).toBe(true);
    const progress = checkCaseProgress(caseDef, ok("SELECT 1"), db, done, { flags: { tokha_turned: true } });
    expect(progress.completed).toEqual([]);
    expect(progress.activeFeedback).toBeNull();
  });
});

describe("checkSecrets с контекстом", () => {
  it("тайник по реестру увиденного", () => {
    const secrets = [{ id: "secret.zero", title: "", text: "", trigger: { type: "seen", value: "zero" } as ValidationRule }];
    expect(checkSecrets(secrets, ok("SELECT 1"), db, new Set(), null)).toEqual([]);
    expect(checkSecrets(secrets, ok("SELECT 1"), db, new Set(), null, { seen: new Set(["zero"]) })).toEqual(["secret.zero"]);
  });
});
