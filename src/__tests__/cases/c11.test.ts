/**
 * Интерлюдия «Черновик» (case-11-chernovik): контент, черновики разд. 8.4,
 * эталоны DML по порядку, альтернативы, ловушки и сцены разд. 5.11 / М25.
 *
 * TECH_SPEC разд. 5: мир генерируется один раз; каждая задача проходит своим
 * эталоном по порядку, альтернативой и не проходит правдоподобными ошибками.
 * Задачи И проверяют состояние таблиц (table_state / view_match), поэтому
 * каждая проверка идёт на свежей базе дела, доведённой эталонами до нужной задачи.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Database } from "sql.js";
import {
  checkCaseProgress,
  collectEvidenceIds,
  executeSQL,
  exportWorld,
  flagsMatch,
  generateWorld,
  getSchema,
  lintSql,
  mainObjectives,
  openCaseDatabase,
  validateCaseContent,
  type CaseDef,
  type CaseObjective,
  type FlagValue,
  type QueryResult,
} from "@/engine";
import { cases, characters, getCase } from "@/data";
import { DRAFT, DRAFT_AT } from "@/engine/world/plants/c11";
import { FORGED_STATEMENTS, GUARD_SQUAD_2015, STATEMENTS_MISSING_IN_PBD } from "@/engine/world/facts";

const CASE_ID = "case-11-chernovik";
const c11 = getCase(CASE_ID) as CaseDef;
const START = "2026-12-31 23:00:00";
const FINGER = "отсутствует ногтевая фаланга 4-го пальца левой кисти";

let bytes: Uint8Array;
let db: Database;

/**
 * Диск Нины (sokol_stage_*) наполняет дело 10 (plants/README.md: c10 late).
 * Пока c10 — заглушка, тест кладёт минимальный снимок сам: 62 объяснения
 * 15-0219 (60 из ПБД + 2071 и 2072) и снимок persons с приметой 2214 и
 * наряда 2015 года. После слияния с c10 таблицы уже полны — фикстура молчит.
 */
function seedStageIfEmpty(world: Database): void {
  const n = (sql: string) => Number(world.exec(sql)[0].values[0][0]);
  if (n("SELECT COUNT(*) FROM main.sokol_stage_statements") === 0) {
    world.run(
      `INSERT INTO main.sokol_stage_statements (id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text)
       SELECT id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text
       FROM main.statements WHERE case_id = '15-0219' AND id NOT IN (${FORGED_STATEMENTS.join(", ")})`
    );
    world.run(
      `INSERT INTO main.sokol_stage_statements (id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text) VALUES
       (2071, '15-0219', 3312, 'Ким Д. С., 13 л.', '2015-02-20 01:40:00', 'майор Ратников Л. Б.', 'Шустова Н. Ф.',
        '…две машины без фар, одну столкнули в воду… потом дядя с усами пришёл к нам, держался за косяк, у него на пальце кусочка не было. Он сказал папе — это прожектора…'),
       (2072, '15-0219', NULL, 'Ким С. А.', '2015-02-20 02:10:00', 'майор Ратников Л. Б.', 'Шустова Н. Ф.',
        'Видел свет у причала; потом пришёл старший охраны стройки, сказал — прожектора.'),
       (1187, '15-0102', NULL, 'Орлов А. В.', '2015-01-12 10:00:00', 'капитан Дьячков Е. М.', 'Шустова Н. Ф.', 'Объяснение по другому делу.')`
    );
  }
  if (n("SELECT COUNT(*) FROM main.sokol_stage_persons") === 0) {
    world.run(
      `INSERT INTO main.sokol_stage_persons (id, last_name, first_name, patronymic, birth_date, special_marks, death_date)
       SELECT id, last_name, first_name, patronymic, birth_date, special_marks, death_date
       FROM main.persons WHERE id <= 4000 ORDER BY id`
    );
    world.run("UPDATE main.sokol_stage_persons SET special_marks = ? WHERE id = 2214", [FINGER]);
    world.run(`UPDATE main.sokol_stage_persons SET special_marks = 'шрам на шее' WHERE id IN (${GUARD_SQUAD_2015.join(", ")})`);
  }
}

async function caseDb(flags: Record<string, FlagValue> = {}): Promise<Database> {
  return openCaseDatabase(bytes, {
    clock: START,
    tables: c11.tables,
    writable: c11.writableTables,
    patches: [{ id: "c10.import", params: { flags } }, { id: "late.drafts", params: { flags } }],
  });
}

beforeAll(async () => {
  const world = await generateWorld();
  seedStageIfEmpty(world);
  bytes = exportWorld(world);
  world.close();
  db = await caseDb();
}, 60_000);

afterAll(() => {
  db?.close();
});

// ------------------------------------------------------------------ помощники

const objective = (id: string): CaseObjective => {
  const o = c11.objectives.find((x) => x.id === id);
  if (!o) throw new Error(`нет задачи ${id}`);
  return o;
};

const ORDER = mainObjectives(c11).map((o) => o.id);

function views(on: Database): string[] {
  const res = on.exec("SELECT name FROM main.sqlite_master WHERE type = 'view' AND name NOT LIKE 'arch16_%'");
  return res.length === 0 ? [] : res[0].values.map((r) => String(r[0]));
}

function run(on: Database, sql: string): QueryResult {
  return executeSQL(on, sql, c11.tables, {
    writableTables: c11.writableTables,
    allowViews: c11.allowViews,
    playerViews: views(on),
  });
}

function scalar(on: Database, sql: string): unknown {
  const res = on.exec(sql);
  return res.length === 0 ? null : res[0].values[0][0];
}

/** Задача засчитана этим запросом (предыдущие — уже выполнены) */
function passes(on: Database, id: string, sql: string): boolean {
  const before = ORDER.slice(0, ORDER.indexOf(id));
  const result = run(on, sql);
  if (result.error) return false;
  return checkCaseProgress(c11, result, on, new Set(before)).completed.some((c) => c.objectiveId === id);
}

/** Свежая база дела, доведённая эталонами до задачи id */
async function upTo(id: string, flags: Record<string, FlagValue> = {}): Promise<Database> {
  const on = await caseDb(flags);
  for (const prev of ORDER.slice(0, ORDER.indexOf(id))) {
    if (!passes(on, prev, objective(prev).solution)) throw new Error(`эталон ${prev} не прошёл`);
  }
  return on;
}

async function check(id: string, sql: string): Promise<{ ok: boolean; result: QueryResult; on: Database }> {
  const on = await upTo(id);
  const before = ORDER.slice(0, ORDER.indexOf(id));
  const result = run(on, sql);
  const ok = !result.error && checkCaseProgress(c11, result, on, new Set(before)).completed.some((c) => c.objectiveId === id);
  return { ok, result, on };
}

async function expectPass(id: string, sql: string): Promise<void> {
  const { ok, result, on } = await check(id, sql);
  on.close();
  expect(result.error ?? null, `${id}: ${sql}`).toBeNull();
  expect(ok, `${id}: ${sql}`).toBe(true);
}

async function expectFail(id: string, sql: string): Promise<QueryResult> {
  const { ok, result, on } = await check(id, sql);
  on.close();
  expect(ok, `${id}: ${sql}`).toBe(false);
  return result;
}

// ==================================================================== контент

describe("И: контент дела", () => {
  it("validateCaseContent → пусто", () => {
    expect(validateCaseContent(c11, characters, collectEvidenceIds(cases))).toEqual([]);
  });

  it("карточка дела по библии: 31.12 23:00 → 01.01 00:30, без минут за запрос, tutorial, акт III", () => {
    expect(c11.order).toBe(11);
    expect(c11.act).toBe(3);
    expect(c11.difficulty).toBe("tutorial");
    expect(c11.date).toBe("2026-12-31 23:00");
    expect(c11.minutesPerQuery).toBe(0);
    expect(c11.clock?.cap).toBe("2027-01-01 00:30");
    expect(c11.protocol).toBeUndefined();
    expect(c11.concepts).toEqual(["h.transactions", "h.insert_select", "h.update", "h.delete", "h.view", "w.evidence"]);
  });

  it("запись — только в draft_*, представления разрешены; диск Нины открыт", () => {
    expect(c11.writableTables).toEqual(["draft_statements", "draft_persons", "draft_publication"]);
    expect(c11.newTables).toEqual(["draft_statements", "draft_persons", "draft_publication"]);
    expect(c11.allowViews).toBe(true);
    for (const t of ["arch16_statements", "arch16_persons", "statements", "persons"]) expect(c11.tables).toContain(t);
  });

  it("задачи И.1–И.4 по порядку; у каждой ≥3 подсказок голосами, улики ev.c11.*", () => {
    expect(ORDER).toEqual(["i1", "i1b", "i2", "i3", "i4"]);
    for (const o of c11.objectives) {
      expect(o.hints.length, o.id).toBeGreaterThanOrEqual(3);
      for (const h of o.hints) expect(h.by, o.id).toBeTruthy();
      if (o.evidence) expect(o.evidence.id).toMatch(/^ev\.c11\./);
    }
  });

  it("живые события: черновики патчем после вступления, ровно один помощник на любой ветке", () => {
    const drafts = c11.events?.find((e) => e.id === "drafts");
    expect(drafts).toMatchObject({ after: { scene: "intro" }, patch: "late.drafts" });
    const helpers = (c11.events ?? []).filter((e) => e.id.startsWith("helper_"));
    for (const tokha of [true, false]) {
      for (const melnik of [undefined, "blackmail", "reported"]) {
        const flags: Record<string, FlagValue> = { tokha_turned: tokha, ...(melnik ? { melnik } : {}) };
        const hit = helpers.filter((e) => flagsMatch(e.when, flags)).map((e) => e.scene);
        const expected = tokha ? "helper_tokha" : melnik === "reported" ? "helper_nina" : "helper_melnik";
        expect(hit, JSON.stringify(flags)).toEqual([expected]);
      }
    }
    const sms = c11.events?.find((e) => e.id === "valentina");
    expect(flagsMatch(sms?.when, { valentina_warned: true })).toBe(true);
    expect(flagsMatch(sms?.when, {})).toBe(false);
  });

  it("М25: реплика c11.draft.014 — Нина про девочку в газете", () => {
    const draft = c11.scenes.find((s) => s.id === "draft");
    const line = draft?.lines.find((l) => l.id === "c11.draft.014");
    expect(line).toMatchObject({ speaker: "nina", text: "А вот девочку из газеты убери. Ей с этим жить." });
    const texts = draft?.lines.map((l) => l.text).join("\n") ?? "";
    expect(texts).toContain("Улики не удаляют, голубчик.");
    expect(texts).toContain("Из газеты — можно. Из дела — никогда.");
    expect(texts).toContain("DELETE FROM draft_statements WHERE person_text LIKE 'Ким Д%';");
  });

  it("финал: куранты, звонок Ратникова, «С Новым годом, Ноль»", () => {
    const all = c11.scenes.flatMap((s) => s.lines);
    expect(all.some((l) => l.speaker === "ratnikov" && l.id.startsWith("c11.chimes."))).toBe(true);
    expect(all.some((l) => l.speaker === "dasha" && l.text === "С Новым годом, Ноль.")).toBe(true);
    expect(all.some((l) => l.speaker === "valentina" && l.text === "Спасибо, что сказали. Я буду там.")).toBe(true);
    expect(all.some((l) => l.speaker === "granin" && l.id.startsWith("c11.tv."))).toBe(true);
  });

  it("реплики озвучиваемые: ≤ 220 символов", () => {
    for (const l of c11.scenes.flatMap((s) => s.lines)) expect(l.text.length, l.id).toBeLessThanOrEqual(220);
  });
});

// ==================================================================== черновики (разд. 8.4)

describe("И: черновики разд. 8.4", () => {
  it("draft_statements: 200 строк, все 63 строки 15-0219 из statements, без пропавших и дублей", () => {
    expect(scalar(db, "SELECT COUNT(*) FROM draft_statements")).toBe(DRAFT.statements);
    expect(scalar(db, "SELECT COUNT(DISTINCT id) FROM draft_statements")).toBe(DRAFT.statements);
    expect(scalar(db, "SELECT COUNT(*) FROM draft_statements WHERE case_id = '15-0219'")).toBe(63);
    expect(
      scalar(db, "SELECT COUNT(*) FROM main.statements s WHERE s.case_id = '15-0219' AND s.id NOT IN (SELECT id FROM draft_statements)")
    ).toBe(0);
    expect(scalar(db, `SELECT COUNT(*) FROM draft_statements WHERE id IN (${FORGED_STATEMENTS.join(", ")})`)).toBe(3);
    expect(scalar(db, `SELECT COUNT(*) FROM draft_statements WHERE id IN (${STATEMENTS_MISSING_IN_PBD.join(", ")})`)).toBe(0);
    expect(scalar(db, "SELECT COUNT(*) FROM draft_statements WHERE case_id IS NOT '15-0219'")).toBe(137);
  });

  it("draft_statements — точная копия строк statements, позже старта дела строк нет", () => {
    const same = scalar(
      db,
      `SELECT COUNT(*) FROM draft_statements d JOIN main.statements s ON s.id = d.id
       WHERE d.case_id IS s.case_id AND d.doc_reg_no IS s.doc_reg_no AND d.person_id IS s.person_id
         AND d.person_text IS s.person_text AND d.taken_at IS s.taken_at AND d.taken_by IS s.taken_by
         AND d.typed_by IS s.typed_by AND d.text IS s.text AND d.status IS s.status`
    );
    expect(same).toBe(DRAFT.statements);
    expect(scalar(db, `SELECT COUNT(*) FROM draft_statements WHERE taken_at > '${DRAFT_AT}'`)).toBe(0);
  });

  it("draft_persons: 100 копий persons, в том числе 2214 с обнулённой приметой", () => {
    expect(scalar(db, "SELECT COUNT(*) FROM draft_persons")).toBe(DRAFT.persons);
    expect(scalar(db, "SELECT special_marks IS NULL FROM draft_persons WHERE id = 2214")).toBe(1);
    expect(scalar(db, "SELECT full_name FROM draft_persons WHERE id = 2214")).toBe("Бурцев Валерий Николаевич");
    const same = scalar(
      db,
      `SELECT COUNT(*) FROM draft_persons d JOIN main.persons p ON p.id = d.id
       WHERE d.full_name IS p.full_name AND d.birth_date IS p.birth_date AND d.special_marks IS p.special_marks
         AND d.death_date IS p.death_date AND d.created_at IS p.created_at`
    );
    expect(same).toBe(DRAFT.persons);
    // UPDATE без WHERE заметен: у части карточек примета не NULL
    expect(Number(scalar(db, "SELECT COUNT(*) FROM draft_persons WHERE special_marks IS NOT NULL"))).toBeGreaterThanOrEqual(20);
  });

  it("на диске у 2214 примета есть — её и возвращает И.2", () => {
    expect(scalar(db, "SELECT special_marks IS NOT NULL FROM arch16_persons WHERE id = 2214")).toBe(1);
  });

  it("draft_publication: 50 строк; 7 и 19 — Ким Д. С. 13 лет, 12 и 33 — Шпаков, информатор", () => {
    expect(scalar(db, "SELECT COUNT(*) FROM draft_publication")).toBe(DRAFT.publication);
    const kim = db.exec(
      "SELECT id, person_id, person_text, person_birth_date, source_role, ts FROM draft_publication WHERE id IN (7, 19) ORDER BY id"
    )[0].values;
    expect(kim).toEqual([
      [7, 3071, "Ким Д. С.", "2001-06-14", "свидетель", "2015-02-20 01:40:00"],
      [19, 3071, "Ким Д. С.", "2001-06-14", "свидетель", "2015-02-20 01:55:00"],
    ]);
    const shpakov = db.exec("SELECT id, person_text, source_role FROM draft_publication WHERE id IN (12, 33) ORDER BY id")[0].values;
    expect(shpakov).toEqual([
      [12, "Шпаков Г. И.", "информатор"],
      [33, "Шпаков Г. И.", "информатор"],
    ]);
  });

  it("ровно четыре строки — несовершеннолетние на дату показаний или информаторы: 7, 12, 19, 33", () => {
    const ids = db.exec(
      "SELECT id FROM draft_publication WHERE source_role = 'информатор' OR date(person_birth_date, '+18 years') > date(ts) ORDER BY id"
    )[0].values.map((r) => r[0]);
    expect(ids).toEqual([7, 12, 19, 33]);
    expect(scalar(db, "SELECT COUNT(*) FROM draft_publication WHERE source_role = 'информатор'")).toBe(2);
    // взрослая Даша-оперативница в черновике тоже есть: удалять по имени нельзя
    expect(Number(scalar(db, "SELECT COUNT(*) FROM draft_publication WHERE person_text LIKE 'Ким Д%'"))).toBe(3);
  });

  it("ts различны, порядок id не совпадает с порядком ts", () => {
    expect(scalar(db, "SELECT COUNT(DISTINCT ts) FROM draft_publication")).toBe(DRAFT.publication);
    const byId = db.exec("SELECT ts FROM draft_publication ORDER BY id")[0].values.map((r) => r[0]);
    const byTs = [...byId].sort();
    expect(byId).not.toEqual(byTs);
  });

  it("черновики одинаковы на любой ветке (tokha_turned, melnik)", async () => {
    const dump = (on: Database) =>
      JSON.stringify(
        ["draft_statements", "draft_persons", "draft_publication"].map((t) => on.exec(`SELECT * FROM ${t} ORDER BY id`)[0].values)
      );
    const base = dump(db);
    for (const flags of [{ tokha_turned: true }, { melnik: "reported" }] as Record<string, FlagValue>[]) {
      const other = await caseDb(flags);
      expect(dump(other), JSON.stringify(flags)).toBe(base);
      other.close();
    }
  });

  it("И.1 на диске находит ровно двоих: 2071 и 2072", () => {
    const ids = db.exec(
      "SELECT id FROM arch16_statements WHERE case_id = '15-0219' AND id NOT IN (SELECT id FROM draft_statements) ORDER BY id"
    )[0].values.map((r) => r[0]);
    expect(ids).toEqual([2071, 2072]);
  });
});

// ==================================================================== эталоны

describe("И: эталоны по порядку", () => {
  it("каждая задача проходит своим эталоном, по одной за запрос", async () => {
    const on = await caseDb();
    const done = new Set<string>();
    for (const id of ORDER) {
      const o = objective(id);
      const t0 = performance.now();
      const result = run(on, o.solution);
      expect(performance.now() - t0, id).toBeLessThan(1000);
      expect(result.error ?? null, id).toBeNull();
      const progress = checkCaseProgress(c11, result, on, done);
      expect(progress.completed.map((c) => c.objectiveId), id).toEqual([id]);
      done.add(id);
    }
    // итог: 200 объяснений, примета 2214 возвращена, 46 строк публикации, витрина
    expect(scalar(on, "SELECT COUNT(*) FROM draft_statements")).toBe(200);
    expect(scalar(on, "SELECT special_marks FROM draft_persons WHERE id = 2214")).toBe(
      scalar(on, "SELECT special_marks FROM arch16_persons WHERE id = 2214")
    );
    expect(scalar(on, "SELECT COUNT(*) FROM draft_publication")).toBe(46);
    expect(scalar(on, "SELECT COUNT(*) FROM draft_package")).toBe(46);
    on.close();
  });

  it("эталоны проходят на ветке без Тохи и на ветке с Тохой", async () => {
    for (const flags of [{ tokha_turned: true }, { tokha_turned: false, melnik: "blackmail" }] as Record<string, FlagValue>[]) {
      const on = await upTo("i4", flags);
      expect(passes(on, "i4", objective("i4").solution), JSON.stringify(flags)).toBe(true);
      on.close();
    }
  });

  it("эталоны укладываются в доступ дела: только таблицы И, запись — только в draft_*", async () => {
    const on = await caseDb();
    for (const id of ORDER) {
      const result = run(on, objective(id).solution);
      expect(result.errorKind ?? null, id).not.toBe("access");
      expect(result.error ?? null, id).toBeNull();
    }
    on.close();
    const denied = run(db, "UPDATE persons SET special_marks = NULL WHERE id = 2214");
    expect(denied.error).toBeTruthy();
    const ddl = run(db, "CREATE TABLE draft_copy (id INTEGER)");
    expect(ddl.error).toBeTruthy();
  });

  it("строгая лестница: в эталонах только понятия, пройденные к И", () => {
    const allowed = new Set([
      "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "AS", "ORDER", "BY", "COUNT", "INSERT", "INTO",
      "UPDATE", "SET", "DELETE", "CREATE", "VIEW", "BEGIN", "ROLLBACK", "DATE",
    ]);
    for (const o of c11.objectives) {
      const bare = o.solution.replace(/'(?:[^']|'')*'/g, "''");
      const words = (bare.match(/\b[A-Z_]{2,}\b/g) ?? []).filter((w) => w === w.toUpperCase());
      for (const w of words) expect(allowed.has(w), `${o.id}: ${w}`).toBe(true);
    }
  });
});

// ==================================================================== альтернативы и ловушки

describe("И.1 «Репетиция переноса»", () => {
  it("альтернатива: NOT EXISTS", async () => {
    await expectPass(
      "i1",
      `BEGIN;
       INSERT INTO draft_statements (id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text, status)
       SELECT a.id, a.case_id, a.doc_reg_no, a.person_text, a.taken_at, a.taken_by, a.typed_by, a.text, 'восстановлено'
       FROM arch16_statements a
       WHERE a.case_id = '15-0219' AND NOT EXISTS (SELECT 1 FROM draft_statements d WHERE d.id = a.id);`
    );
  });

  it("альтернатива: LEFT JOIN … IS NULL и проверка числа строк отдельным SELECT", async () => {
    await expectPass(
      "i1",
      `BEGIN;
       INSERT INTO draft_statements (id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text, status)
       SELECT a.id, a.case_id, a.doc_reg_no, a.person_text, a.taken_at, a.taken_by, a.typed_by, a.text, 'восстановлено'
       FROM arch16_statements a LEFT JOIN draft_statements d ON d.id = a.id
       WHERE a.case_id = '15-0219' AND d.id IS NULL;
       SELECT COUNT(*) FROM draft_statements;`
    );
  });

  it("ловушка разд. 7.2: SELECT a.* без списка столбцов — 10 столбцов против 8", async () => {
    const r = await expectFail(
      "i1",
      "INSERT INTO draft_statements SELECT a.* FROM arch16_statements a WHERE a.case_id = '15-0219' AND a.id NOT IN (SELECT id FROM draft_statements);"
    );
    expect(r.error).toContain("table draft_statements has 10 columns but 8 values were supplied");
  });

  it("ошибка: перенесены все пропавшие, а не только дело 15-0219", async () => {
    await expectFail(
      "i1",
      `INSERT INTO draft_statements (id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text, status)
       SELECT id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text, 'восстановлено'
       FROM arch16_statements WHERE id NOT IN (SELECT id FROM draft_statements);`
    );
  });

  it("ошибка: без статуса 'восстановлено'", async () => {
    await expectFail(
      "i1",
      `INSERT INTO draft_statements (id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text)
       SELECT id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text
       FROM arch16_statements WHERE case_id = '15-0219' AND id NOT IN (SELECT id FROM draft_statements);`
    );
  });

  it("ошибка: просто посчитать, ничего не вставив", async () => {
    await expectFail("i1", "SELECT COUNT(*) FROM arch16_statements WHERE case_id = '15-0219'");
  });
});

describe("И.1б «Откат»", () => {
  it("альтернатива: ROLLBACK и сразу проверка", async () => {
    await expectPass("i1b", "ROLLBACK; SELECT COUNT(*) AS строк FROM draft_statements;");
  });

  it("ошибка: COMMIT вместо ROLLBACK", async () => {
    await expectFail("i1b", "COMMIT;");
  });

  it("ошибка: посчитать, не откатив", async () => {
    await expectFail("i1b", "SELECT COUNT(*) FROM draft_statements");
  });
});

describe("И.2 «Верни одну примету»", () => {
  it("альтернатива: в транзакции и с COMMIT", async () => {
    await expectPass(
      "i2",
      `BEGIN;
       UPDATE draft_persons SET special_marks = (SELECT special_marks FROM arch16_persons WHERE id = 2214) WHERE id = 2214;
       COMMIT;`
    );
  });

  it("альтернатива: проверка приметы SELECT'ом в том же запуске", async () => {
    await expectPass(
      "i2",
      `UPDATE draft_persons
       SET special_marks = (SELECT a.special_marks FROM arch16_persons a WHERE a.id = draft_persons.id)
       WHERE id IN (SELECT id FROM draft_persons WHERE full_name = 'Бурцев Валерий Николаевич');
       SELECT id, full_name, special_marks FROM draft_persons WHERE id = 2214;`
    );
  });

  it("ловушка: UPDATE без WHERE переписывает все сто карточек — реплика Нины про BEGIN", async () => {
    const on = await upTo("i2");
    const result = run(on, "UPDATE draft_persons SET special_marks = (SELECT a.special_marks FROM arch16_persons a WHERE a.id = draft_persons.id);");
    expect(result.error ?? null).toBeNull();
    const progress = checkCaseProgress(c11, run(on, "SELECT id, special_marks FROM draft_persons WHERE id = 2214"), on, new Set(["i1", "i1b"]));
    expect(progress.completed).toEqual([]);
    expect(progress.activeFeedback).toContain("сначала BEGIN");
    on.close();
  });

  it("ошибка: a.id = id — подзапрос не связан со строкой", async () => {
    await expectFail(
      "i2",
      "UPDATE draft_persons SET special_marks = (SELECT a.special_marks FROM arch16_persons a WHERE a.id = id) WHERE id = 2214;"
    );
  });

  it("ошибка: запись в persons вместо черновика — нет допуска", async () => {
    const r = await expectFail("i2", "UPDATE persons SET special_marks = 'шрам' WHERE id = 2214;");
    expect(r.error).toBeTruthy();
  });
});

describe("И.3 «Из газеты — можно» (М25)", () => {
  it("альтернатива: возраст через julianday", async () => {
    await expectPass(
      "i3",
      `DELETE FROM draft_publication
       WHERE source_role = 'информатор'
          OR (julianday(ts) - julianday(person_birth_date)) / 365.25 < 18;`
    );
  });

  it("альтернатива: в транзакции, через IN (SELECT …), с проверкой", async () => {
    await expectPass(
      "i3",
      `BEGIN;
       DELETE FROM draft_publication WHERE id IN (
         SELECT id FROM draft_publication
         WHERE source_role = 'информатор' OR date(person_birth_date, '+18 years') > date(ts));
       SELECT COUNT(*) FROM draft_publication;`
    );
  });

  it("ловушка: возраст на сегодня, а не на дату показаний — девочка остаётся", async () => {
    await expectFail(
      "i3",
      "DELETE FROM draft_publication WHERE source_role = 'информатор' OR date(person_birth_date, '+18 years') > date('now');"
    );
  });

  it("ошибка: удаление по имени задевает взрослую Дашу-оперативницу", async () => {
    await expectFail("i3", "DELETE FROM draft_publication WHERE person_text LIKE 'Ким Д%' OR source_role = 'информатор';");
  });

  it("ошибка: только информаторы", async () => {
    await expectFail("i3", "DELETE FROM draft_publication WHERE source_role = 'информатор';");
  });

  it("М25: DELETE из draft_statements — реплика Нины «Улики не удаляют», запрос не блокируется", () => {
    const sql = "DELETE FROM draft_statements WHERE person_text LIKE 'Ким Д%';";
    const warnings = lintSql(sql, getSchema(db), { db });
    expect(warnings.map((w) => w.rule)).toContain("no_delete");
    expect(warnings.find((w) => w.rule === "no_delete")?.lineId).toBe("bark.nina_no_delete.001");
    const publication = lintSql("DELETE FROM draft_publication WHERE id = 7;", getSchema(db), { db });
    expect(publication.map((w) => w.rule)).not.toContain("no_delete");
  });
});

describe("И.4 «Витрина»", () => {
  it("альтернатива: список столбцов у представления и id как тай-брейк", async () => {
    await expectPass(
      "i4",
      `CREATE VIEW draft_package (ts, place, what, source_class) AS
       SELECT ts, place, what, source_class FROM draft_publication ORDER BY ts, id;`
    );
  });

  it("альтернатива: лишний неперсональный столбец (id) и SELECT из витрины", async () => {
    const on = await upTo("i4");
    const created = run(on, "CREATE VIEW draft_package AS SELECT id, ts, place, what, source_class FROM draft_publication ORDER BY ts;");
    expect(created.error ?? null).toBeNull();
    const shown = run(on, "SELECT * FROM draft_package");
    expect(shown.error ?? null).toBeNull();
    expect(shown.rowCount).toBe(46);
    expect(checkCaseProgress(c11, shown, on, new Set(ORDER.slice(0, 4))).completed.map((c) => c.objectiveId)).toEqual(["i4"]);
    on.close();
  });

  it("ошибка: без ORDER BY — строки идут по id, а не по времени", async () => {
    await expectFail("i4", "CREATE VIEW draft_package AS SELECT ts, place, what, source_class FROM draft_publication;");
  });

  it("ошибка: SELECT * — в витрине персональные столбцы", async () => {
    await expectFail("i4", "CREATE VIEW draft_package AS SELECT * FROM draft_publication ORDER BY ts;");
  });

  it("ошибка: другое имя представления", async () => {
    await expectFail("i4", "CREATE VIEW package AS SELECT ts, place, what, source_class FROM draft_publication ORDER BY ts;");
  });
});
