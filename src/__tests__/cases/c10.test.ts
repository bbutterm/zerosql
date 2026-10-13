/**
 * Дело № 10 «Копирка» (case-10-kopirka): контент, эталоны, ловушки,
 * протокол, ветки импорта и посаженные факты разд. 8.4 библии.
 *
 * TECH_SPEC разд. 5: мир генерируется один раз, каждая задача проходит
 * своим эталоном по порядку, альтернативой и не проходит правдоподобными
 * ошибками; эталоны укладываются в таблицы и понятия дела.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Database } from "sql.js";
import {
  checkCaseProgress,
  checkProtocol,
  collectEvidenceIds,
  executeSQL,
  exportWorld,
  generateWorld,
  mainObjectives,
  openCaseDatabase,
  optionalObjectives,
  scanSeenOptions,
  validateCaseContent,
  type CaseDef,
  type CaseObjective,
  type QueryResult,
} from "@/engine";
import { IRINA_ANCHORS } from "@/engine/world/plants/c10";
import { cases, characters, getCase, handbookByCase } from "@/data";

const CASE_ID = "case-10-kopirka";
const c10 = getCase(CASE_ID) as CaseDef;
/** Ветка без Тохи (Мельник импортирует старым ридером, 37 дублей) */
const NO_TOKHA = { tokha_turned: false } as const;
const TOKHA = { tokha_turned: true } as const;

/** Запросы игрока в Д9 (28.12, WS-03): из них патч c10.frame ставит подставные правки */
const D9_QUERIES = ["11:01:00", "11:02:00", "11:03:00", "11:05:00", "11:06:00", "11:10:00", "11:11:00"].map((t) => `2026-12-28 ${t}`);

let start: Database;
let db: Database;
let dbTokha: Database;
let genMs = 0;

/** База дела после алиби, чистки, импорта диска и копирки (как в игре после 10.2) */
async function afterImport(bytes: Uint8Array, flags: Record<string, unknown>): Promise<Database> {
  return openCaseDatabase(bytes, {
    clock: "2026-12-31 10:41:00",
    tables: c10.tables,
    patches: [
      "p0.player",
      { id: "c10.frame", params: { queries: D9_QUERIES.map((loggedAt) => ({ loggedAt, sql: "SELECT 1" })) } },
      { id: "c10.rollback", params: { flags, clock: "2026-12-31 09:12:00" } },
      { id: "ws07.removed", params: { flags, clock: "2026-12-31 09:12:00" } },
      { id: "c10.purge", params: { clock: "2026-12-31 10:30:00" } },
      { id: "c10.import", params: { flags, clock: "2026-12-31 10:40:00" } },
      { id: "late.nina_carbon", params: { flags, clock: "2026-12-31 10:40:00" } },
    ],
  });
}

beforeAll(async () => {
  const t0 = performance.now();
  const world = await generateWorld();
  genMs = performance.now() - t0;
  // История прошлых дел: запросы игрока в Д9 лежат в query_log (их пишет стор)
  for (const at of D9_QUERIES) {
    world.run(
      "INSERT INTO main.query_log (logged_at, login, terminal, query_text, rows_returned, status, case_id) VALUES (?, 'nol', 'WS-03', ?, 1, 'ok', 'case-09-matryoshka')",
      [at, `SELECT * FROM company_owners; -- ${at}`]
    );
  }
  const bytes = exportWorld(world);
  world.close();
  start = await openCaseDatabase(bytes, {
    clock: "2026-12-31 09:00:00",
    tables: c10.tables,
    patches: ["p0.player", { id: "c10.frame", params: { queries: D9_QUERIES.map((loggedAt) => ({ loggedAt, sql: "SELECT 1" })) } }],
  });
  db = await afterImport(bytes, NO_TOKHA);
  dbTokha = await afterImport(bytes, TOKHA);
}, 60_000);

afterAll(() => {
  start?.close();
  db?.close();
  dbTokha?.close();
});

// ------------------------------------------------------------------ помощники

const objective = (id: string): CaseObjective => {
  const o = c10.objectives.find((x) => x.id === id);
  if (!o) throw new Error(`нет задачи ${id}`);
  return o;
};

const run = (sql: string, on: Database = db): QueryResult => executeSQL(on, sql, c10.tables);

function rowsOf(sql: string, on: Database = db): unknown[][] {
  const r = run(sql, on);
  if (r.error) throw new Error(`${r.error}\n${sql}`);
  return r.rows;
}
const one = (sql: string, on: Database = db): unknown => rowsOf(sql, on)[0]?.[0];

/** Задачи, выполненные к моменту, когда активна данная */
function doneBefore(o: CaseObjective, flags: Record<string, boolean>): Set<string> {
  const mains = mainObjectives(c10, flags);
  if (o.optional) return new Set(mains.map((m) => m.id));
  return new Set(mains.filter((m) => m.order < o.order).map((m) => m.id));
}

/** Засчитывает ли запрос задачу (если она активна) */
function passes(id: string, sql: string, on: Database = db, flags: Record<string, boolean> = NO_TOKHA): boolean {
  const o = objective(id);
  const result = run(sql, on);
  expect(result.error, `${id}: ${result.error}\n${sql}`).toBeNull();
  const progress = checkCaseProgress(c10, result, on, doneBefore(o, flags), { flags });
  return progress.completed.some((c) => c.objectiveId === id);
}

// ------------------------------------------------------------------ контент

describe("контент дела", () => {
  it("validateCaseContent: проблем нет", () => {
    expect(validateCaseContent(c10, characters, collectEvidenceIds(cases))).toEqual([]);
  });

  it("мир генерируется за разумное время", () => {
    expect(genMs).toBeLessThan(15_000);
  });

  it("каркас по библии: 31.12 09:00, потолок 13:00, минута на запрос, новые таблицы Д10", () => {
    expect(c10.date).toBe("2026-12-31 09:00");
    expect(c10.clock?.cap).toBe("2026-12-31 13:00");
    expect(c10.minutesPerQuery).toBe(1);
    expect(c10.act).toBe(3);
    expect(c10.newTables).toEqual(["attachments", "evidence_registry", "nina_carbon", "arch16_persons", "arch16_statements", "arch16_registry"]);
    expect(c10.concepts).toEqual(["h.is_not", "h.snapshot_diff", "h.strings", "h.group_concat", "h.glob_hex", "h.legacy_dates", "w.homoglyphs", "w.sokol16"]);
    for (const t of c10.tables) expect(t.startsWith("sokol_stage_"), t).toBe(false);
  });

  it("чистка после 10.1: часы прыгают на 10:30, импорт и копирка — после сцены 10.2", () => {
    const purge = c10.events?.find((e) => e.id === "purge");
    expect(purge?.after?.objective).toBe("o10_1d");
    expect(purge?.clockTo).toBe("2026-12-31 10:30");
    expect(purge?.patch).toBe("c10.purge");
    expect(objective("o10_2").sceneAfter).toBe("tin");
    expect(c10.events?.find((e) => e.id === "import")).toMatchObject({ after: { scene: "tin" }, patch: "c10.import" });
    expect(c10.events?.find((e) => e.id === "carbon")).toMatchObject({ after: { scene: "tin" }, patch: "late.nina_carbon" });
  });

  it("10.2б есть только без Тохи; ★ — латиница и закладки Ирины", () => {
    expect(mainObjectives(c10, NO_TOKHA).map((o) => o.id)).toEqual(["o10_1", "o10_1d", "o10_2", "o10_2b", "o10_3", "o10_4", "o10_5"]);
    expect(mainObjectives(c10, TOKHA).map((o) => o.id)).toEqual(["o10_1", "o10_1d", "o10_2", "o10_3", "o10_4", "o10_5"]);
    expect(optionalObjectives(c10).map((o) => o.id)).toEqual(["o10_s1", "o10_s2"]);
  });

  it("реплики библии стоят на своих местах (разд. 3.1, М20–М22)", () => {
    const line = (id: string) => c10.scenes.flatMap((s) => s.lines).find((l) => l.id === id);
    expect(line("c10.tin.002")?.text).toBe("Ирочка велела — только тому, кто её прочтёт.");
    expect(line("c10.tin.007")?.text).toBe("Вот же упрямая девка…");
    expect(line("c10.reading.020")?.text).toBe("Он знал, что я не вру?");
    expect(line("c10.alibi_ally.002")?.text).toBe("Убедительно. Пока.");
    const reading = c10.scenes.find((s) => s.id === "reading");
    expect(reading?.choices?.map((c) => c.flag)).toEqual(["dasha_truth=knew", "dasha_truth=feared"]);
  });

  it("реплики озвучиваемы: не длиннее 220 знаков, без родовых форм прошедшего времени игрока", () => {
    const player = /\b(ты|я)\s+\S+(л|ла)\b/i;
    for (const s of c10.scenes) {
      for (const l of s.lines) {
        expect(l.text.length, l.id).toBeLessThanOrEqual(220);
        if (l.speaker === "player") expect(player.test(l.text), l.id).toBe(false);
      }
    }
  });
});

// ------------------------------------------------------------------ эталоны

const ALTERNATIVES: Record<string, string[]> = {
  o10_1: [
    `SELECT a.id, q.terminal, q.logged_at
     FROM query_log q
     JOIN audit_log a ON a.login = q.login
      AND a.workstation = 'WS-07' AND q.terminal = 'WS-03'
      AND abs(strftime('%s', a.ts) - strftime('%s', q.logged_at)) <= 90
     WHERE q.login = 'nol' AND a.ts LIKE '2026-12-28%'`,
  ],
  o10_1d: [
    "SELECT ts, badge_id, door, direction FROM door_access WHERE door = 'Серверная' AND badge_id LIKE 'B-9000'",
  ],
  o10_2: [
    `SELECT group_concat(b, '') AS послание
     FROM (SELECT substr(new_value, 1, 1) AS b FROM audit_log
           WHERE login = 'i.valts' AND field = 'last_name' AND date(ts) = '2026-11-17' AND ts < '2026-11-17 02:00:00'
           ORDER BY ts)`,
    `SELECT group_concat(substr(new_value, 1, 1), ' ' ORDER BY ts) FROM audit_log
     WHERE login = 'i.valts' AND field = 'last_name' AND ts LIKE '2026-11-17 01:%'`,
  ],
  o10_2b: ["SELECT COUNT(DISTINCT id) AS n FROM arch16_statements"],
  o10_3: [
    "SELECT * FROM arch16_statements a WHERE NOT EXISTS (SELECT 1 FROM statements s WHERE s.id = a.id)",
    "SELECT DISTINCT id, case_id, person_text FROM arch16_statements WHERE id NOT IN (SELECT id FROM statements)",
  ],
  o10_4: [
    `SELECT a.id, a.full_name, a.special_marks, p.special_marks
     FROM arch16_persons a JOIN persons p USING (id)
     WHERE p.special_marks != a.special_marks OR (p.special_marks IS NULL) <> (a.special_marks IS NULL)`,
  ],
  o10_5: [
    `SELECT s.id, s.person_text, s.doc_reg_no, r.doc_type
     FROM statements s
     LEFT JOIN arch16_statements a ON a.id = s.id
     LEFT JOIN arch16_registry r ON r.reg_no = s.doc_reg_no AND r.year = 2015
     WHERE s.case_id = '15-0219' AND a.id IS NULL`,
  ],
  o10_s1: [
    "SELECT plate, read_at FROM plate_reads WHERE plate GLOB '*[ABCEHKMOPTXY]*'",
  ],
  o10_s2: ["SELECT * FROM attachments WHERE note_no IS NOT NULL"],
};

const WRONG: Record<string, string[]> = {
  o10_1: [
    // без окна по времени: каждая правка в паре со всеми запросами
    `SELECT a.id, q.terminal FROM audit_log a JOIN query_log q ON q.login = a.login AND q.terminal <> a.workstation
     WHERE a.login = 'nol' AND date(a.ts) = '2026-12-28'`,
    // julianday в днях: «<= 90» — это три месяца, а не полторы минуты
    `SELECT a.id, q.terminal FROM audit_log a JOIN query_log q ON q.login = a.login AND q.terminal <> a.workstation
      AND abs(julianday(q.logged_at) - julianday(a.ts)) <= 90
     WHERE a.login = 'nol' AND date(a.ts) = '2026-12-28'`,
    // одни правки без запросов — пары с WS-03 нет
    "SELECT id, ts, workstation FROM audit_log WHERE login = 'nol' AND date(ts) = '2026-12-28'",
  ],
  o10_1d: [
    "SELECT * FROM door_access WHERE badge_id = 'B-9000'",
    "SELECT * FROM door_access WHERE door = 'Серверная'",
  ],
  o10_2: [
    // ловушка: id — порядок репликации, выходит «НИСПУИРОСН»
    `SELECT group_concat(substr(new_value, 1, 1), '' ORDER BY id) FROM audit_log
     WHERE login = 'i.valts' AND field = 'last_name' AND ts BETWEEN '2026-11-17 01:00:00' AND '2026-11-17 02:00:00'`,
    // позиции с нуля: substr(s, 0, 1) — пустая строка
    `SELECT group_concat(substr(new_value, 0, 1), '' ORDER BY ts) FROM audit_log
     WHERE login = 'i.valts' AND field = 'last_name' AND ts BETWEEN '2026-11-17 01:00:00' AND '2026-11-17 02:00:00'`,
    // целые фамилии вместо первых букв
    `SELECT group_concat(new_value, ', ' ORDER BY ts) FROM audit_log
     WHERE login = 'i.valts' AND field = 'last_name' AND ts LIKE '2026-11-17%'`,
  ],
  o10_2b: [
    "SELECT COUNT(*) FROM arch16_statements",
    "SELECT COUNT(DISTINCT id) FROM arch16_statements WHERE case_id = '15-0219'",
  ],
  o10_3: [
    "SELECT a.* FROM arch16_statements a LEFT JOIN statements s ON s.id = a.id WHERE s.id = NULL",
    // направление перепутано: это появившееся, а не пропавшее
    "SELECT s.* FROM statements s LEFT JOIN arch16_statements a ON a.id = s.id WHERE a.id IS NULL",
    "SELECT a.* FROM arch16_statements a JOIN statements s ON s.id = a.id WHERE a.text <> s.text",
  ],
  o10_4: [
    // ловушка: != теряет NULL — 21 вместо 27
    "SELECT p.id, a.special_marks, p.special_marks FROM persons p JOIN arch16_persons a ON a.id = p.id WHERE p.special_marks != a.special_marks",
    "SELECT p.id FROM persons p JOIN arch16_persons a ON a.id = p.id WHERE p.special_marks IS NULL AND a.special_marks IS NOT NULL",
  ],
  o10_5: [
    // NOT IN по столбцу с NULL: ничего
    "SELECT s.id FROM statements s WHERE s.case_id = '15-0219' AND s.id NOT IN (SELECT doc_reg_no FROM arch16_statements)",
    // без дела: в ПБД много строк 2026 года, которых на диске быть не могло
    "SELECT s.id FROM statements s WHERE NOT EXISTS (SELECT 1 FROM arch16_statements a WHERE a.id = s.id)",
    // наоборот: пропавшие по делу Сазонова
    "SELECT a.id FROM arch16_statements a WHERE a.case_id = '15-0219' AND NOT EXISTS (SELECT 1 FROM statements s WHERE s.id = a.id)",
  ],
  o10_s1: [
    "SELECT plate FROM plate_reads WHERE plate GLOB '*[a-z]*'",
    "SELECT plate FROM plate_reads WHERE plate LIKE '%K%'",
  ],
  o10_s2: [
    "SELECT * FROM attachments WHERE note_no > 2",
    "SELECT * FROM attachments WHERE author_login = 'nol'",
  ],
};

describe("задачи", () => {
  it("эталоны засчитываются по порядку (ветка без Тохи)", () => {
    const done = new Set<string>();
    for (const o of mainObjectives(c10, NO_TOKHA)) {
      const result = run(o.solution);
      expect(result.error, `${o.id}: ${result.error}`).toBeNull();
      const progress = checkCaseProgress(c10, result, db, done, { flags: NO_TOKHA });
      expect(progress.completed.map((c) => c.objectiveId), o.id).toContain(o.id);
      done.add(o.id);
    }
    expect(done.size).toBe(7);
  });

  it("эталоны засчитываются по порядку и на ветке с Тохой (без 10.2б)", () => {
    const done = new Set<string>();
    for (const o of mainObjectives(c10, TOKHA)) {
      const result = run(o.solution, dbTokha);
      const progress = checkCaseProgress(c10, result, dbTokha, done, { flags: TOKHA });
      expect(progress.completed.map((c) => c.objectiveId), o.id).toContain(o.id);
      done.add(o.id);
    }
  });

  it("алиби решается на старте дела, до чистки и импорта", () => {
    expect(passes("o10_1", objective("o10_1").solution, start)).toBe(true);
    expect(passes("o10_1d", objective("o10_1d").solution, start)).toBe(true);
  });

  it("★ засчитываются своим эталоном", () => {
    for (const o of optionalObjectives(c10)) expect(passes(o.id, o.solution), o.id).toBe(true);
  });

  it.each(Object.entries(ALTERNATIVES))("альтернативные верные запросы засчитываются: %s", (id, sqls) => {
    for (const sql of sqls) expect(passes(id, sql), `${id}: ${sql}`).toBe(true);
  });

  it.each(Object.entries(WRONG))("правдоподобные ошибки не засчитываются: %s", (id, sqls) => {
    expect(sqls.length).toBeGreaterThanOrEqual(2);
    for (const sql of sqls) expect(passes(id, sql), `${id}: ${sql}`).toBe(false);
  });

  it("подсказки уровня 4 содержат ровно одну ошибку: их запрос не засчитывается", () => {
    for (const o of c10.objectives) {
      const last = o.hints[o.hints.length - 1];
      expect(last.by, o.id).toBe("nina");
      const sql = last.text.slice(last.text.indexOf("\n") + 1);
      expect(passes(o.id, sql), `${o.id}: ${sql}`).toBe(false);
    }
  });

  it("эталоны проходят table-guard с таблицами дела, staging закрыт", () => {
    for (const o of c10.objectives) {
      const result = executeSQL(db, o.solution, c10.tables);
      expect(result.errorKind, o.id).toBeUndefined();
      expect(result.error, o.id).toBeNull();
    }
    for (const closed of ["sokol_stage_statements", "sokol_stage_persons", "draft_statements"]) {
      expect(executeSQL(db, `SELECT * FROM ${closed} LIMIT 1`, c10.tables).error, closed).not.toBeNull();
    }
  });

  it("эталоны не используют понятий из будущих дел (строгая лестница)", () => {
    const FUTURE = /\b(INSERT|UPDATE|DELETE|CREATE|BEGIN|COMMIT|ROLLBACK|REPLACE\s+INTO)\b/i;
    for (const o of mainObjectives(c10, NO_TOKHA)) expect(FUTURE.exec(o.solution)?.[0], o.id).toBeUndefined();
  });

  it("каждый эталон выполняется быстрее 1 с", () => {
    for (const o of c10.objectives) {
      const t0 = performance.now();
      run(o.solution);
      expect(performance.now() - t0, o.id).toBeLessThan(1000);
    }
  });

  it("примеры справочника выполняются на мире дела", () => {
    for (const e of handbookByCase.c10) {
      const result = run(e.example);
      expect(result.error, `${e.id}: ${result.error}`).toBeNull();
      expect(result.rowCount, e.id).toBeGreaterThan(0);
    }
  });
});

// ------------------------------------------------------------------ протокол

describe("протокол", () => {
  const protocol = () => {
    if (!c10.protocol) throw new Error("нет протокола");
    return c10.protocol;
  };

  it("каждый ответ находится в результатах эталонов (scanSeenOptions)", () => {
    const seen = new Set<string>();
    for (const o of mainObjectives(c10, NO_TOKHA)) for (const v of scanSeenOptions(protocol(), run(o.solution))) seen.add(v);
    for (const blank of protocol().blanks) expect(seen.has(blank.answer), `${blank.id}: ${blank.answer}`).toBe(true);
  });

  it("и на ветке с Тохой ответы те же и видны", () => {
    const seen = new Set<string>();
    for (const o of mainObjectives(c10, TOKHA)) for (const v of scanSeenOptions(protocol(), run(o.solution, dbTokha))) seen.add(v);
    for (const blank of protocol().blanks) expect(seen.has(blank.answer), `${blank.id}: ${blank.answer}`).toBe(true);
  });

  it("верные ответы подтверждаются, ловушка «!=» и ложные люди — нет", () => {
    const answers = Object.fromEntries(protocol().blanks.map((b) => [b.id, b.answer]));
    expect(checkProtocol(protocol(), answers, new Set()).solved).toBe(true);

    const trap = { ...answers, changed: "21", ghost: "Лапина Галина Петровна" };
    const check = checkProtocol(protocol(), trap, new Set());
    expect(check.solved).toBe(false);
    expect(check.confirmed).toEqual(["missing", "regno", "erased"]);

    const bad = { ...answers, missing: "37", regno: "3320", erased: "Сазонов Пётр Ильич" };
    expect(checkProtocol(protocol(), bad, new Set()).confirmed).toEqual([]);
  });
});

// ------------------------------------------------------------------ посаженные факты

describe("посаженные факты (разд. 8.4)", () => {
  it("attachments: ровно девять якорей Ирины 201–209 с записями 2–10, всего 40 строк", () => {
    expect(one("SELECT COUNT(*) FROM attachments")).toBe(40);
    const anchors = rowsOf("SELECT id, table_name, row_key_json, created_at, note_no FROM attachments WHERE author_login = 'i.valts' ORDER BY id");
    expect(anchors).toEqual(IRINA_ANCHORS.map((a) => [a.id, a.table, JSON.stringify(a.key), a.at, a.note]));
    expect(one("SELECT COUNT(*) FROM attachments WHERE note_no IS NOT NULL")).toBe(9);
  });

  it("подставные правки 28.12: все с WS-07, каждая в паре с запросом WS-03; B-9000 в серверной — ноль", () => {
    const edits = rowsOf("SELECT id FROM audit_log WHERE login = 'nol' AND workstation = 'WS-07' AND ts LIKE '2026-12-28%'", start);
    expect(edits.length).toBe(6);
    const paired = rowsOf(
      `SELECT DISTINCT a.id FROM audit_log a JOIN query_log q ON q.login = a.login AND q.terminal = 'WS-03'
        AND abs(unixepoch(q.logged_at) - unixepoch(a.ts)) BETWEEN 20 AND 40
       WHERE a.login = 'nol' AND a.workstation = 'WS-07'`,
      start
    );
    expect(paired.length).toBe(6);
    expect(one("SELECT COUNT(*) FROM door_access WHERE badge_id = 'B-9000' AND door = 'Серверная'", start)).toBe(0);
    expect(one("SELECT COUNT(*) FROM door_access WHERE badge_id = 'B-9000'", start)).toBeGreaterThan(0);
  });

  it("акростих: по времени «СПРОСИНИНУ», по id — «НИСПУИРОСН»", () => {
    const base = "FROM audit_log WHERE login = 'i.valts' AND field = 'last_name' AND ts BETWEEN '2026-11-17 01:00:00' AND '2026-11-17 02:00:00'";
    expect(one(`SELECT group_concat(substr(new_value, 1, 1), '' ORDER BY ts) ${base}`)).toBe("СПРОСИНИНУ");
    expect(one(`SELECT group_concat(substr(new_value, 1, 1), '' ORDER BY id) ${base}`)).toBe("НИСПУИРОСН");
  });

  it("диск: 1 100 объяснений (без Тохи — ещё 37 дублей), 1 500 жителей, том журнала в 1 000 номеров", () => {
    expect(rowsOf("SELECT COUNT(*), COUNT(DISTINCT id) FROM arch16_statements")[0]).toEqual([1137, 1100]);
    expect(rowsOf("SELECT COUNT(*), COUNT(DISTINCT id) FROM arch16_statements", dbTokha)[0]).toEqual([1100, 1100]);
    // дубли — только строки, которые и так есть в ПБД, и не дело Сазонова
    expect(
      one(`SELECT COUNT(*) FROM (SELECT id FROM arch16_statements GROUP BY id HAVING COUNT(*) > 1) d
           WHERE d.id IN (SELECT id FROM statements WHERE case_id <> '15-0219')`)
    ).toBe(37);
    expect(one("SELECT COUNT(*) FROM arch16_persons")).toBe(1500);
    expect(one("SELECT COUNT(*) FROM arch16_registry")).toBe(1000);
    expect(one("SELECT COUNT(*) FROM arch16_persons WHERE id = 4301")).toBe(0);
  });

  it("пропали ровно 11 объяснений; № 3312 — Даша, 20.02.2015 01:40, Ратников и Шустова", () => {
    const missing = rowsOf("SELECT a.id FROM arch16_statements a LEFT JOIN statements s ON s.id = a.id WHERE s.id IS NULL ORDER BY a.id").map((r) => r[0]);
    expect(missing).toEqual([1187, 1342, 1468, 1590, 1723, 1856, 1914, 2033, 2071, 2072, 2098]);
    expect(rowsOf("SELECT case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by FROM arch16_statements WHERE id = 2071")[0]).toEqual([
      "15-0219", 3312, "Ким Д. С., 13 л.", "2015-02-20 01:40:00", "майор Ратников Л. Б.", "Шустова Н. Ф.",
    ]);
    expect(String(one("SELECT text FROM arch16_statements WHERE id = 2071"))).toContain("на пальце кусочка не было");
    expect(rowsOf("SELECT case_id, person_text FROM arch16_statements WHERE id = 2072")[0]).toEqual(["15-0219", "Ким С. А."]);
    expect(one("SELECT COUNT(*) FROM arch16_registry WHERE year = 2015 AND reg_no = 3312")).toBe(0);
  });

  it("приметы: 27 расхождений через IS NOT, 21 через !=, ровно шесть стёрты до NULL", () => {
    const join = "FROM persons p JOIN arch16_persons a ON a.id = p.id";
    expect(one(`SELECT COUNT(*) ${join} WHERE p.special_marks IS NOT a.special_marks`)).toBe(27);
    expect(one(`SELECT COUNT(*) ${join} WHERE p.special_marks != a.special_marks`)).toBe(21);
    const erased = rowsOf(`SELECT p.id ${join} WHERE p.special_marks IS NULL AND a.special_marks IS NOT NULL ORDER BY p.id`).map((r) => r[0]);
    expect(erased).toEqual([1288, 1471, 2214, 2650, 3015, 3390]);
    expect(one(`SELECT COUNT(*) ${join} WHERE p.special_marks IS NOT NULL AND a.special_marks IS NULL`)).toBe(0);
    expect(one("SELECT special_marks FROM arch16_persons WHERE id = 2214")).toBe("отсутствует ногтевая фаланга 4-го пальца левой кисти");
  });

  it("подделки: ровно три строки 15-0219 без пары на диске; Кравец — мёртвая душа", () => {
    const forged = rowsOf(
      "SELECT s.id, s.person_id, s.doc_reg_no FROM statements s WHERE s.case_id = '15-0219' AND NOT EXISTS (SELECT 1 FROM arch16_statements a WHERE a.id = s.id) ORDER BY s.id"
    );
    expect(forged).toEqual([[5203, 4301, 3320], [5204, 3550, 3320], [5207, 2588, 3322]]);
    expect(one("SELECT created_at FROM persons WHERE id = 4301")).toBe("2026-11-20 02:22:00");
    expect(one("SELECT COUNT(*) FROM registrations WHERE person_id = 4301")).toBe(0);
    expect(one("SELECT COUNT(*) FROM phones WHERE person_id = 4301")).toBe(0);
    expect(one("SELECT COUNT(*) FROM employment WHERE person_id = 4301")).toBe(0);
    expect(rowsOf("SELECT reg_no, reg_date, doc_type, case_id FROM arch16_registry WHERE year = 2015 AND reg_no IN (3320, 3322) ORDER BY reg_no")).toEqual([
      [3320, "21.02.2015", "запрос в ГИБДД", "15-0219"],
      [3322, "21.02.2015", "рапорт о ДТП", "15-0219"],
    ]);
  });

  it("журнал «Сокола»: текстовая сортировка ставит март раньше февраля", () => {
    expect(one("SELECT reg_date FROM arch16_registry ORDER BY reg_date LIMIT 1")).toMatch(/^0\d\.03\.2015$/);
    const iso = "substr(reg_date, 7, 4) || '-' || substr(reg_date, 4, 2) || '-' || substr(reg_date, 1, 2)";
    expect(one(`SELECT min(${iso}) FROM arch16_registry`)).toBe("2015-02-16");
    expect(one(`SELECT max(${iso}) FROM arch16_registry`)).toBe("2015-03-03");
  });

  it("копирка: четыре копии, среди них 3312 и Ким С. А.", () => {
    expect(one("SELECT COUNT(*) FROM nina_carbon")).toBe(4);
    expect(one("SELECT COUNT(*) FROM nina_carbon WHERE doc_reg_no = 3312")).toBe(1);
    expect(one("SELECT COUNT(*) FROM nina_carbon WHERE person_text = 'Ким С. А.'")).toBe(1);
  });

  it("★ латиница: ровно 17 считываний к Д10, среди них K372OK", () => {
    expect(one("SELECT COUNT(*) FROM plate_reads WHERE plate GLOB '*[A-Z]*'")).toBe(17);
    expect(one("SELECT COUNT(*) FROM plate_reads WHERE plate = 'K372OK'")).toBe(1);
  });

  it("откат и чистка: правки 28.12 вернулись, а «Сияние» стёрло платёж 300 000", () => {
    expect(one("SELECT COUNT(*) FROM audit_log WHERE new_value LIKE 'откат:%'")).toBe(6);
    expect(one("SELECT registered_at FROM doc_registry WHERE year = 2015 AND reg_no = 3313")).toBe("2015-02-20 01:55:00");
    expect(one("SELECT COUNT(*) FROM statements WHERE case_id = '15-0219' AND status = 'отозвано'")).toBe(0);
    expect(one("SELECT COUNT(*) FROM transactions WHERE amount = 300000 AND ts LIKE '2026-11-20%'")).toBe(0);
  });
});
