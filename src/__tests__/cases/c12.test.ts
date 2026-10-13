/**
 * Дело № 11 «Первое солнце» (case-12-pervoe-solntse): контент, эталоны,
 * ловушки, допрос Гранина, обвинения, живые события и посаженные факты
 * разд. 8.4 библии.
 *
 * TECH_SPEC разд. 5: мир генерируется один раз, каждая задача проходит
 * эталоном по порядку и альтернативой, не проходит правдоподобными
 * ошибками; эталоны укладываются в таблицы дела и белый список записи.
 *
 * Диск Нины (sokol_stage_*) и копирку наполняет посадка c10. Пока она —
 * заглушка, тест кладёт в staging минимальный снимок по разд. 5.10 / 8.4
 * (11 пропавших объяснений, 6 стёртых примет, законные расхождения) —
 * только если после импорта staging пуст.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Database } from "sql.js";
import {
  applyStoryPatch,
  checkAccusation,
  checkCaseProgress,
  collectEvidenceIds,
  dueEvents,
  executeSQL,
  exportWorld,
  generateWorld,
  mainObjectives,
  openCaseDatabase,
  presentMatches,
  setGameClock,
  validateCaseContent,
  type CaseDef,
  type CaseObjective,
  type EvidencePresent,
  type PinnedCard,
  type QueryResult,
  type ValidationContext,
} from "@/engine";
import { cases, characters, getCase } from "@/data";

const CASE_ID = "case-12-pervoe-solntse";
const c12 = getCase(CASE_ID) as CaseDef;
const START = "2027-01-11 11:30:00";
const MISSING = [1187, 1342, 1468, 1590, 1723, 1856, 1914, 2033, 2071, 2072, 2098];
const GHOST_MARKS = [2214, 1288, 1471, 2650, 3015, 3390];
const FORGED = [5203, 5204, 5207];
const OPEN_PATCHES = ["late.bank_statements", "late.nina_carbon", "c10.import", "late.drafts", "late.publication"];

let bytes: Uint8Array;
let db: Database;
let genMs = 0;
let fixture = false;

// ------------------------------------------------------------------ база дела

const scalar = (on: Database, sql: string): unknown => on.exec(sql)[0]?.values[0]?.[0] ?? null;

/** Снимок «Сокола» на 30.09.2016 для staging, если посадка c10 его ещё не кладёт */
function ensureDisk(on: Database): boolean {
  if (Number(scalar(on, "SELECT COUNT(*) FROM main.sokol_stage_statements")) > 0) return false;
  on.run(`INSERT INTO main.sokol_stage_statements (id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text)
    SELECT id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text FROM main.statements
    WHERE taken_at < '2016-10-01' AND id NOT IN (${FORGED.join(", ")})`);
  const otherCase = String(scalar(on, "SELECT id FROM main.cases WHERE id LIKE '15-%' AND id <> '15-0219' ORDER BY id LIMIT 1"));
  for (const id of MISSING) {
    const sazonov = id === 2071 || id === 2072;
    on.run("INSERT INTO main.sokol_stage_statements (id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
      id, sazonov ? "15-0219" : otherCase, id === 2071 ? 3312 : null, id === 2071 ? "Ким Д. С." : id === 2072 ? "Ким С. А." : "свидетель",
      "2015-02-20 02:00:00", "Ратников Л. Б.", "Шустова Н. Ф.", id === 2071 ? "Машину столкнули в воду у причала" : "объяснение",
    ]);
  }
  on.run(`INSERT INTO main.sokol_stage_persons (id, last_name, first_name, patronymic, birth_date, special_marks, death_date)
    SELECT id, last_name, first_name, patronymic, birth_date, special_marks, death_date FROM main.persons
    WHERE id < 4000 AND birth_date < '2016-01-01'`);
  for (const id of GHOST_MARKS) {
    on.run("UPDATE main.sokol_stage_persons SET special_marks = ? WHERE id = ?", [
      id === 2214 ? "нет ногтевой фаланги безымянного пальца левой руки" : `шрам, особая примета ${id}`, id,
    ]);
  }
  // 21 законное расхождение: приметы поменялись после 2016 года
  on.run(`UPDATE main.sokol_stage_persons SET special_marks = coalesce(special_marks || '; ', '') || 'по записи 2016 года'
    WHERE id IN (SELECT id FROM main.sokol_stage_persons WHERE id NOT IN (${GHOST_MARKS.join(", ")}) ORDER BY id LIMIT 21)`);
  if (Number(scalar(on, "SELECT COUNT(*) FROM main.nina_carbon")) === 0) {
    on.run(`INSERT INTO main.nina_carbon (id, doc_reg_no, person_text, typed_at_text, text) VALUES
      (1, 3312, 'Ким Д. С.', '20.02.2015', 'Машину столкнули в воду у причала'),
      (2, 3313, 'Ким С. А.', '20.02.2015', 'Видел свет у причала'),
      (3, 3320, 'свидетель', '21.02.2015', 'объяснение'),
      (4, 3322, 'свидетель', '21.02.2015', 'объяснение')`);
  }
  return true;
}

async function caseDb(clock = START): Promise<Database> {
  const on = await openCaseDatabase(bytes, { clock, tables: c12.tables, writable: c12.writableTables, patches: OPEN_PATCHES });
  fixture = ensureDisk(on) || fixture;
  return on;
}

beforeAll(async () => {
  const t0 = performance.now();
  const world = await generateWorld();
  genMs = performance.now() - t0;
  bytes = exportWorld(world);
  world.close();
  db = await caseDb();
}, 60_000);

afterAll(() => db?.close());

// ------------------------------------------------------------------ помощники

const objective = (id: string): CaseObjective => {
  const o = c12.objectives.find((x) => x.id === id);
  if (!o) throw new Error(`нет задачи ${id}`);
  return o;
};

function run(sql: string, on: Database = db): QueryResult {
  return executeSQL(on, sql, c12.tables, { writableTables: c12.writableTables, allowViews: true, playerViews: ["evidence_package"] });
}

function rows(sql: string, on: Database = db): unknown[][] {
  const r = run(sql, on);
  if (r.error) throw new Error(`${r.error}\n${sql}`);
  return r.rows;
}

function doneBefore(o: CaseObjective, flags: ValidationContext["flags"] = {}): Set<string> {
  const mains = mainObjectives(c12, flags);
  if (o.optional) return new Set(mains.filter((m) => m.order < 5).map((m) => m.id));
  return new Set(mains.filter((m) => m.order < o.order).map((m) => m.id));
}

/** Засчитывает ли запрос задачу; запрос с ошибкой не засчитывается */
function passes(id: string, sql: string, on: Database, ctx: ValidationContext = {}): boolean {
  const o = objective(id);
  const result = run(sql, on);
  if (result.error) return false;
  const progress = checkCaseProgress(c12, result, on, doneBefore(o, ctx.flags), ctx);
  return progress.completed.some((c) => c.objectiveId === id);
}

let cardSeq = 0;
function cards(sql: string, table: string, on: Database = db): PinnedCard[] {
  const r = run(sql, on);
  if (r.error) throw new Error(r.error);
  return r.rows.map((values) => ({ id: `card-${++cardSeq}`, columns: r.columns, values: values as PinnedCard["values"], table }));
}

function timed<T>(fn: () => T): T {
  const t0 = performance.now();
  const out = fn();
  expect(performance.now() - t0).toBeLessThan(1000);
  return out;
}

// ------------------------------------------------------------------ контент

describe("Д11: контент", () => {
  it("мир генерируется быстро, дело открывается с поздними таблицами", () => {
    expect(genMs).toBeLessThan(15_000);
    expect(Number(scalar(db, "SELECT COUNT(*) FROM sqlite_master WHERE name IN ('publication_source', 'publication', 'arch16_statements', 'arch16_persons', 'arch16_registry')"))).toBe(5);
  });

  it("validateCaseContent: проблем нет", () => {
    expect(validateCaseContent(c12, characters, collectEvidenceIds(cases))).toEqual([]);
  });

  it("порядок задач, часы, белый список записи", () => {
    expect(mainObjectives(c12, {}).map((o) => o.id)).toEqual(["o11_2", "o11_3", "o11_4", "o11_5", "o11_6", "o11_7"]);
    expect(mainObjectives(c12, { recipient: "sk" }).map((o) => o.id)).toEqual(["o11_2", "o11_3", "o11_4", "o11_5", "o11_7"]);
    expect(mainObjectives(c12, { recipient: "sk", package_sent: true }).map((o) => o.id)).toEqual(["o11_2", "o11_3", "o11_4", "o11_5"]);
    expect(c12.minutesPerQuery).toBe(3);
    expect(c12.clock?.cap).toBe("2027-01-11 13:00");
    expect(c12.writableTables).toEqual(["statements", "persons", "evidence_registry", "publication"]);
    expect(c12.newTables).toEqual(["publication_source", "publication"]);
  });

  it("реплики короткие, у игрока нет родовых форм", () => {
    const player = c12.scenes.flatMap((s) => (s.choices ?? []).map((c) => c.say ?? c.text));
    for (const t of player) expect(t, t).not.toMatch(/\b(я|ты)\s+\S+(л|ла)\b|готов[аы]?\b/i);
    for (const s of c12.scenes) for (const l of s.lines) expect(l.text.length, l.id).toBeLessThanOrEqual(220);
  });

  it("М1: повтор первого запроса — реплики Нины c12.replay.001 и .002", () => {
    const replay = c12.scenes.find((s) => s.id === "replay");
    expect(replay?.lines.find((l) => l.id === "c12.replay.001")?.speaker).toBe("nina");
    expect(replay?.lines.find((l) => l.id === "c12.replay.002")?.text).toContain("Прости, голубчик");
  });
});

// ------------------------------------------------------------------ посаженные факты разд. 8.4

describe("Д11: факты мира", () => {
  it("ночь 10.01: «Бастион» О114РБ на камере 2 ровно дважды — 01:58 и 02:31", () => {
    expect(rows("SELECT camera_id, read_at FROM plate_reads WHERE plate = 'О114РБ' AND read_at >= '2027-01-10' ORDER BY read_at"))
      .toEqual([[2, "2027-01-10 01:58:00"], [2, "2027-01-10 02:31:00"]]);
  });

  it("ровно одно аварийное открытие серверной: 10.01 02:09, пропуск не приложен", () => {
    expect(rows("SELECT ts, door, direction FROM door_access WHERE badge_id IS NULL")).toEqual([["2027-01-10 02:09:00", "Серверная", "вход"]]);
    expect(rows("SELECT COUNT(*) FROM door_access WHERE door = 'Серверная' AND ts BETWEEN '2027-01-10 00:00:00' AND '2027-01-10 05:59:59'")).toEqual([[1]]);
  });

  it("02:12 — сеанс a.lykov переключён на nol с WS-07; 02:14 — единственная выгрузка журнала nol", () => {
    expect(rows("SELECT ts, login, workstation, action, old_value, new_value FROM audit_log WHERE action = 'SESSION' AND ts >= '2027-01-10'"))
      .toEqual([["2027-01-10 02:12:00", "a.lykov", "WS-07", "SESSION", "a.lykov", "nol"]]);
    expect(rows("SELECT logged_at, query_text FROM query_log WHERE login = 'nol' AND terminal <> 'WS-03' ORDER BY logged_at")).toEqual([
      ["2026-12-22 02:47:19", "SELECT * FROM statements WHERE case_id = '15-0219'"],
      ["2027-01-10 02:14:00", "SELECT * FROM query_log WHERE login = 'nol'"],
    ]);
  });

  it("лента Бурцева: четыре строки G-0412, других проходов 11.01 нет", () => {
    const capDb = db;
    setGameClock(capDb, "2027-01-11 13:00:00");
    try {
      expect(rows("SELECT ts, badge_id, door FROM door_access WHERE ts >= '2027-01-11' ORDER BY ts")).toEqual([
        ["2027-01-11 12:14:00", "G-0412", "КПП-1"],
        ["2027-01-11 12:20:00", "G-0412", "Лестница Б, 1 эт."],
        ["2027-01-11 12:26:00", "G-0412", "Лестница Б, Б0"],
        ["2027-01-11 12:32:00", "G-0412", "Б0, тамбур серверной"],
      ]);
      expect(rows("SELECT COUNT(*) FROM door_access WHERE note LIKE '%Бурцев%'")).toEqual([[1]]);
    } finally {
      setGameClock(capDb, START);
    }
    expect(rows("SELECT COUNT(*) FROM door_access WHERE badge_id = 'G-0412'")).toEqual([[0]]);
  });

  it("publication_source: 60 строк; нельзя называть ровно 7, 19 (Ким Д. С.) и 12, 33 (Шпаков)", () => {
    expect(rows("SELECT COUNT(*) FROM publication_source")).toEqual([[60]]);
    expect(rows("SELECT COUNT(*) FROM publication")).toEqual([[0]]);
    expect(rows("SELECT id, person_text FROM publication_source WHERE source_role = 'информатор' OR date(person_birth_date, '+18 years') > date(ts) ORDER BY id"))
      .toEqual([[7, "Ким Д. С."], [12, "Шпаков Г. И."], [19, "Ким Д. С."], [33, "Шпаков Г. И."]]);
    expect(rows("SELECT DISTINCT person_birth_date, source_role FROM publication_source WHERE person_id = 3071")).toEqual([["2001-06-14", "свидетель"]]);
  });

  it("i.valts стёр приметы ровно шести людям, первым — Бурцеву 19.11 02:10", () => {
    const r = rows("SELECT CAST(row_id AS INTEGER), ts FROM audit_log WHERE login = 'i.valts' AND table_name = 'persons' AND field = 'special_marks' ORDER BY ts");
    expect(r.map((x) => x[0]).sort()).toEqual([...GHOST_MARKS].sort());
    expect(r[0]).toEqual([2214, "2026-11-19 02:10:00"]);
  });

  it("migration_jobs 17–20: удаления 12:20 / 12:40 / 13:00 и финализация под nol", () => {
    expect(rows("SELECT id, run_at, target, responsible_login FROM migration_jobs WHERE id >= 17 ORDER BY id")).toEqual([
      [17, "2027-01-11 12:20:00", "sokol_stage_registry", "nol"],
      [18, "2027-01-11 12:40:00", "sokol_stage_statements", "nol"],
      [19, "2027-01-11 13:00:00", "sokol_stage_persons", "nol"],
      [20, "2027-01-11 13:00:00", "Сокол → ПБД", "nol"],
    ]);
  });

  it("одиннадцати объяснений нет в ПБД, подделки 5203, 5204, 5207 — в деле 15-0219", () => {
    expect(rows(`SELECT COUNT(*) FROM statements WHERE id IN (${MISSING.join(", ")})`)).toEqual([[0]]);
    expect(rows(`SELECT id FROM statements WHERE case_id = '15-0219' AND id IN (${FORGED.join(", ")}) ORDER BY id`)).toEqual(FORGED.map((x) => [x]));
  });
});

// ------------------------------------------------------------------ 11.1 «Где он?»

describe("11.1 «Где он?»", () => {
  const sol = objective("o11_1").solution;
  const at = async (clock: string, fn: (on: Database) => void) => {
    const on = await caseDb(clock);
    try {
      fn(on);
    } finally {
      on.close();
    }
  };

  it("12:21 — эталон и альтернатива проходят (лестница Б, 1 эт.)", async () => {
    await at("2027-01-11 12:21:00", (on) => {
      expect(timed(() => passes("o11_1", sol, on))).toBe(true);
      expect(passes("o11_1", "SELECT * FROM door_access WHERE badge_id = 'G-0412' AND ts = (SELECT MAX(ts) FROM door_access WHERE badge_id = 'G-0412')", on)).toBe(true);
    });
  });

  it("12:27 — проходит с «Лестница Б, Б0»; ошибки: ORDER BY по возрастанию и вся лента", async () => {
    await at("2027-01-11 12:27:00", (on) => {
      expect(rows(sol, on)[0]).toContain("Лестница Б, Б0");
      expect(passes("o11_1", sol, on)).toBe(true);
      expect(passes("o11_1", "SELECT ts, door FROM door_access WHERE badge_id = 'G-0412' ORDER BY ts LIMIT 1", on)).toBe(false);
      expect(passes("o11_1", "SELECT ts, badge_id, door FROM door_access WHERE badge_id = 'G-0412' ORDER BY ts DESC", on)).toBe(false);
    });
  });

  it("до 12:20 он ещё на КПП-1 — задача не проходит; после 12:32 — тоже", async () => {
    await at("2027-01-11 12:15:00", (on) => expect(passes("o11_1", sol, on)).toBe(false));
    await at("2027-01-11 12:33:00", (on) => expect(passes("o11_1", sol, on)).toBe(false));
  });

  it("исходы: лестница — выбор в сцене block, дверь — событие 12:32 без флага", () => {
    const block = c12.scenes.find((s) => s.id === "block");
    expect(block?.choices?.find((c) => c.goto === "stairs")?.flag).toBe("burtsev_caught=лестница");
    expect(c12.scenes.find((s) => s.id === "door")?.choices?.[0].flag).toBe("burtsev_caught=дверь");
    const base = { queryCount: 21, fired: new Set<string>(), completed: new Set<string>(), endedScenes: new Set<string>(), breaks: {} };
    expect(dueEvents(c12, { ...base, now: "2027-01-11 12:32:00", flags: {} }).map((e) => e.id)).toContain("e_door");
    expect(dueEvents(c12, { ...base, now: "2027-01-11 12:32:00", flags: { burtsev_caught: "лестница" } }).map((e) => e.id)).not.toContain("e_door");
  });
});

// ------------------------------------------------------------------ М23: удаления по расписанию

describe("М23 «Схема тает»", () => {
  const base = { queryCount: 10, fired: new Set<string>(), completed: new Set<string>(), endedScenes: new Set<string>(), breaks: {} };
  const patchesAt = (now: string, flags: Record<string, string | boolean> = {}) =>
    dueEvents(c12, { ...base, now, flags }).map((e) => e.patch).filter(Boolean);

  it("обычная ветка: 12:20 реестр, 12:40 объяснения, 13:00 карточки и финализация", () => {
    expect(patchesAt("2027-01-11 12:19:00")).not.toContain("c12.drop.registry");
    expect(patchesAt("2027-01-11 12:20:00")).toContain("c12.drop.registry");
    expect(patchesAt("2027-01-11 12:40:00")).toContain("c12.drop.statements");
    expect(patchesAt("2027-01-11 13:00:00")).toEqual(expect.arrayContaining(["c12.drop.persons", "c12.finalize", "c12.voice"]));
  });

  it("melnik = blackmail: удаления сдвинуты на 12:32 и 12:52", () => {
    expect(patchesAt("2027-01-11 12:31:00", { melnik: "blackmail" })).not.toContain("c12.drop.registry");
    expect(patchesAt("2027-01-11 12:32:00", { melnik: "blackmail" })).toContain("c12.drop.registry");
    expect(patchesAt("2027-01-11 12:51:00", { melnik: "blackmail" })).not.toContain("c12.drop.statements");
    expect(patchesAt("2027-01-11 12:52:00", { melnik: "blackmail" })).toContain("c12.drop.statements");
  });

  it("на старте: publication_source и попытка чистки plate_reads К404ТО — строки «Дорсети» остаются", () => {
    expect(patchesAt(START)).toEqual(["late.publication", "c12.plate_purge_attempt"]);
    const before = rows("SELECT COUNT(*) FROM plate_reads WHERE plate = 'К404ТО'");
    applyStoryPatch(db, "c12.plate_purge_attempt");
    expect(rows("SELECT COUNT(*) FROM plate_reads WHERE plate = 'К404ТО'")).toEqual(before);
    expect(Number(before[0][0])).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------ 11.2 и 11.3: восстановление

describe("11.2 «Верни удалённое»", () => {
  const sol = objective("o11_2").solution;

  it("предсказание: анти-джойн архива против ПБД — 11 строк", () => {
    const p = objective("o11_2").prediction!;
    expect(rows(p.sql!).length).toBe(p.answer);
  });

  it("эталон возвращает все 11 id; INSERT OR IGNORE и NOT EXISTS — тоже", async () => {
    for (const sql of [
      sol,
      "INSERT OR IGNORE INTO statements (id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text, status) SELECT id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text, 'восстановлено' FROM arch16_statements",
      "INSERT INTO statements (id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text, status) SELECT a.id, a.case_id, a.doc_reg_no, a.person_text, a.taken_at, a.taken_by, a.typed_by, a.text, 'восстановлено' FROM arch16_statements a WHERE NOT EXISTS (SELECT 1 FROM statements s WHERE s.id = a.id)",
    ]) {
      const on = await caseDb();
      expect(timed(() => passes("o11_2", sql, on)), sql).toBe(true);
      expect(rows(`SELECT COUNT(*) FROM statements WHERE id IN (${MISSING.join(", ")})`, on)).toEqual([[11]]);
      on.close();
    }
  });

  it("ошибки: INSERT без анти-джойна (UNIQUE), только дело 15-0219, SELECT без вставки", async () => {
    const on = await caseDb();
    expect(passes("o11_2", "INSERT INTO statements (id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text, status) SELECT id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text, 'восстановлено' FROM arch16_statements", on)).toBe(false);
    expect(passes("o11_2", "SELECT a.* FROM arch16_statements a WHERE a.id NOT IN (SELECT id FROM statements)", on)).toBe(false);
    expect(passes("o11_2", "INSERT INTO statements (id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text, status) SELECT id, case_id, doc_reg_no, person_text, taken_at, taken_by, typed_by, text, 'восстановлено' FROM arch16_statements WHERE case_id = '15-0219' AND id NOT IN (SELECT id FROM statements)", on)).toBe(false);
    on.close();
  });

  it("провал без тупика: после удаления arch16_statements задача закрывается копиркой Нины", async () => {
    const on = await caseDb("2027-01-11 12:40:00");
    expect(passes("o11_2", "SELECT * FROM nina_carbon", on)).toBe(false);
    applyStoryPatch(on, "c12.drop.statements");
    expect(Number(scalar(on, "SELECT COUNT(*) FROM sqlite_master WHERE name = 'arch16_statements'"))).toBe(0);
    expect(passes("o11_2", "SELECT * FROM nina_carbon", on)).toBe(true);
    expect(passes("o11_2", "SELECT * FROM nina_carbon WHERE doc_reg_no <> 3312", on)).toBe(false);
    on.close();
  });
});

describe("11.3 «Верни стёртое и пометь подлоги»", () => {
  const sol = objective("o11_3").solution;
  const restore = objective("o11_2").solution;
  const ghostIds = "SELECT CAST(row_id AS INTEGER) FROM audit_log WHERE login = 'i.valts' AND table_name = 'persons' AND field = 'special_marks'";
  const markForged = "UPDATE statements SET status = 'подлог' WHERE case_id = '15-0219' AND id NOT IN (SELECT id FROM arch16_statements)";

  async function restored(): Promise<Database> {
    const on = await caseDb();
    expect(run(restore, on).error).toBeNull();
    return on;
  }

  it("до правок: законных расхождений примет больше нуля, стёртых — шесть", () => {
    const legal = Number(scalar(db, `SELECT COUNT(*) FROM persons p JOIN arch16_persons a ON a.id = p.id WHERE p.special_marks IS NOT a.special_marks AND p.id NOT IN (${ghostIds})`));
    expect(legal).toBeGreaterThan(0);
    if (fixture) expect(legal).toBe(21);
    expect(rows(`SELECT COUNT(*) FROM persons p JOIN arch16_persons a ON a.id = p.id WHERE p.special_marks IS NOT a.special_marks AND p.id IN (${ghostIds})`)).toEqual([[6]]);
  });

  it("эталон: контрольный запрос → 0, палец Бурцева вернулся, подделки помечены, законное не тронуто; V засчитана", async () => {
    const on = await restored();
    expect(timed(() => passes("o11_3", sol, on))).toBe(true);
    expect(rows("SELECT special_marks FROM persons WHERE id = 2214", on)[0][0]).toEqual(rows("SELECT special_marks FROM arch16_persons WHERE id = 2214", on)[0][0]);
    expect(rows(`SELECT id FROM statements WHERE status = 'подлог' ORDER BY id`, on)).toEqual(FORGED.map((x) => [x]));
    expect(passes("o11_3v", objective("o11_3v").solution, on)).toBe(true);
    expect(rows(objective("o11_3v").solution, on)).toEqual([[0]]);
    on.close();
  });

  it("альтернатива: EXISTS по аудиту, транзакция с COMMIT", async () => {
    const on = await restored();
    const alt = `BEGIN; UPDATE persons SET special_marks = (SELECT a.special_marks FROM arch16_persons a WHERE a.id = persons.id) WHERE EXISTS (SELECT 1 FROM audit_log l WHERE l.login = 'i.valts' AND l.field = 'special_marks' AND l.table_name = 'persons' AND l.row_id = CAST(persons.id AS TEXT)); UPDATE statements SET status = 'подлог' WHERE id IN (SELECT s.id FROM statements s LEFT JOIN arch16_statements a ON a.id = s.id WHERE s.case_id = '15-0219' AND a.id IS NULL); COMMIT;`;
    expect(passes("o11_3", alt, on)).toBe(true);
    on.close();
  });

  it("ошибки: забыты подлоги; ловушка «!=» с NULL; откат всех 27; «подлог» на всё, чего нет в архиве", async () => {
    let on = await restored();
    expect(passes("o11_3", `UPDATE persons SET special_marks = (SELECT a.special_marks FROM arch16_persons a WHERE a.id = persons.id) WHERE id IN (${ghostIds})`, on)).toBe(false);
    on.close();

    on = await restored();
    expect(passes("o11_3", `UPDATE persons SET special_marks = (SELECT a.special_marks FROM arch16_persons a WHERE a.id = persons.id) WHERE special_marks != (SELECT a.special_marks FROM arch16_persons a WHERE a.id = persons.id); ${markForged}`, on)).toBe(false);
    on.close();

    on = await restored();
    const all = run(`UPDATE persons SET special_marks = (SELECT a.special_marks FROM arch16_persons a WHERE a.id = persons.id) WHERE id IN (SELECT a.id FROM arch16_persons a WHERE a.special_marks IS NOT persons.special_marks); ${markForged}`, on);
    expect(all.error).toBeNull();
    const progress = checkCaseProgress(c12, all, on, doneBefore(objective("o11_3")), {});
    expect(progress.completed.map((c) => c.objectiveId)).not.toContain("o11_3");
    expect(progress.activeFeedback ?? "").toBe("");
    on.close();

    on = await restored();
    expect(passes("o11_3", `UPDATE persons SET special_marks = (SELECT a.special_marks FROM arch16_persons a WHERE a.id = persons.id) WHERE id IN (${ghostIds}); UPDATE statements SET status = 'подлог' WHERE id NOT IN (SELECT id FROM arch16_statements)`, on)).toBe(false);
    on.close();
  });

  it("провал без тупика: после удаления объяснений хватает примет и аудита", async () => {
    const on = await caseDb("2027-01-11 12:40:00");
    applyStoryPatch(on, "c12.drop.statements");
    expect(passes("o11_3", `UPDATE persons SET special_marks = (SELECT a.special_marks FROM arch16_persons a WHERE a.id = persons.id) WHERE id IN (${ghostIds})`, on)).toBe(true);
    expect(passes("o11_3v", objective("o11_3v").solution, on)).toBe(false);
    on.close();
  });
});

// ------------------------------------------------------------------ 11.4 пакет

describe("11.4 «Два источника на каждый узел»", () => {
  const sol = objective("o11_4").solution;
  const NODES: [string, string, string][] = [
    ["N1", "ПБД", "Сокол-2016"], ["N2", "Сокол-2016", "копирка"], ["N3", "Сокол-2016", "ПБД"],
    ["N4", "архив ГС", "оператор"], ["N5", "ЗЕРКАЛО: город", "гидропост"], ["N6", "Дорсеть", "ПБД"],
    ["N7", "ПБД", "банк"], ["N8", "ЗЕРКАЛО: Сияние", "банк"], ["N9", "ЗЕРКАЛО: город", "банк"],
  ];

  /** Пины игрока так, как их пишет движок: строка evidence_registry на карточку */
  function pinBoard(on: Database, full = true): void {
    const ins = (node: string, cls: string, status = "активна") =>
      on.run("INSERT INTO evidence_registry (pinned_at, pinned_by, node, card_title, source_table, source_class, key_json, value_hash, status) VALUES ('2027-01-11 11:40:00', 'nol', ?, ?, 't', ?, '{}', 'h', ?)", [node, `${node} · ${cls}`, cls, status]);
    for (const [node, a, b] of NODES) {
      ins(node, a);
      if (full || node !== "N9") ins(node, b);
    }
    ins("N1", "ЗЕРКАЛО: город", "призрак");
    ins("Квартиры Шубина и Мирошник", "ЗЕРКАЛО: город");
    ins("Займ Тохи", "банк");
    ins("Займ Тохи", "банк");
  }

  it("эталон и CTE-альтернатива проходят; без DISTINCT, без статуса и без HAVING — нет", async () => {
    const wrong = [
      "CREATE VIEW evidence_package AS SELECT e.node, e.source_class, e.card_title, e.key_json FROM evidence_registry e WHERE e.status = 'активна' AND e.node IN (SELECT node FROM evidence_registry WHERE status = 'активна' GROUP BY node HAVING COUNT(source_class) >= 2)",
      "CREATE VIEW evidence_package AS SELECT e.node, e.source_class, e.card_title, e.key_json FROM evidence_registry e WHERE e.node IN (SELECT node FROM evidence_registry GROUP BY node HAVING COUNT(DISTINCT source_class) >= 2)",
      "CREATE VIEW evidence_package AS SELECT node, source_class, card_title, key_json FROM evidence_registry WHERE status = 'активна' AND node IS NOT NULL",
    ];
    const good = [
      sol,
      "CREATE VIEW evidence_package AS WITH ok AS (SELECT node FROM evidence_registry WHERE status = 'активна' GROUP BY node HAVING COUNT(DISTINCT source_class) > 1) SELECT e.* FROM evidence_registry e JOIN ok ON ok.node = e.node WHERE e.status = 'активна'",
    ];
    for (const [sql, expected] of [...good.map((s) => [s, true] as const), ...wrong.map((s) => [s, false] as const)]) {
      const on = await caseDb();
      pinBoard(on);
      expect(timed(() => passes("o11_4", sql, on)), sql).toBe(expected);
      on.close();
    }
  });

  it("A: девять узлов из девяти — флаг final_board; без второго источника у N9 — нет", async () => {
    for (const full of [true, false]) {
      const on = await caseDb();
      pinBoard(on, full);
      expect(run(sol, on).error).toBeNull();
      expect(passes("o11_4a", "SELECT * FROM evidence_package", on)).toBe(full);
      on.close();
    }
    expect(c12.scenes.find((s) => s.id === "board_full")?.choices?.[0].flag).toBe("final_board");
  });
});

// ------------------------------------------------------------------ 11.5 Гранин и Бурцев

describe("11.5 допрос Гранина и обвинение", () => {
  const graninCards = () => [
    ...cards("SELECT * FROM gs_phonebook WHERE ext = '2-14'", "gs_phonebook"),
    ...cards("SELECT id, doc_no, signed_at, signed_by_person_id FROM construction_docs WHERE doc_no = 'ПД-117/изм.3'", "construction_docs"),
  ];
  const burtsevCards = () => [
    ...cards("SELECT * FROM plate_reads WHERE plate = 'К404ТО' ORDER BY read_at LIMIT 1", "plate_reads"),
    ...cards("SELECT id, full_name, birth_date FROM persons WHERE id = 2214", "persons"),
  ];
  const sol = objective("o11_5").solution;

  it("эталон-запрос сам даёт строку на обоих; с двумя карточками на каждого задача проходит", () => {
    const r = rows(sol);
    expect(r.length).toBe(1);
    expect(r[0]).toEqual(expect.arrayContaining(["2-14", 1001, "+7 900 000-22-14"]));
    const pins = [...graninCards(), ...burtsevCards()];
    expect(timed(() => passes("o11_5", sol, db, { pins }))).toBe(true);
    expect(passes("o11_5", "SELECT 1", db, { pins: [...cards(sol, "gs_comms_2015"), ...cards("SELECT * FROM persons WHERE id IN (1001, 2214)", "persons")] })).toBe(true);
  });

  it("ошибки: одна карточка на Бурцева; карточки-призраки не считаются", () => {
    expect(passes("o11_5", sol, db, { pins: [...graninCards(), ...burtsevCards().slice(0, 1)] })).toBe(false);
    const ghosts = burtsevCards().map((c) => ({ ...c, stamp: "ghost" as const }));
    expect(passes("o11_5", sol, db, { pins: [...graninCards(), ...ghosts] })).toBe(false);
  });

  it("обвинения: верные принимаются с двумя карточками, ложные — нет", () => {
    const [granin, burtsev] = c12.accusations!;
    expect(rows("SELECT full_name FROM persons WHERE id IN (1001, 2214) ORDER BY id")).toEqual([[granin.answer], [burtsev.answer]]);
    expect(checkAccusation(granin, granin.answer, graninCards()).outcome).toBe("accepted");
    expect(checkAccusation(burtsev, burtsev.answer, burtsevCards()).outcome).toBe("accepted");
    expect(checkAccusation(burtsev, burtsev.answer, burtsevCards().slice(0, 1)).outcome).toBe("weak_evidence");
    expect(checkAccusation(granin, "Ратников Лев Борисович", graninCards()).outcome).not.toBe("accepted");
  });

  it("допрос: пробои по живым запросам (М24, .020 с двумя карточками, .024, .028)", () => {
    const scene = c12.scenes.find((s) => s.id === "int_granin")!;
    const present = (line: string): EvidencePresent => scene.interrogation!.points.find((p) => p.line === line)!.present!;
    expect(scene.interrogation?.breakSteps[0]).toBe("smug");

    const exportRow = cards("SELECT logged_at, terminal, query_text FROM query_log WHERE login = 'nol' AND terminal <> 'WS-03' ORDER BY logged_at", "query_log");
    expect(presentMatches(present("c12.int_granin.019"), { cards: exportRow.slice(-1) })).toBe(true);
    expect(presentMatches(present("c12.int_granin.019"), { cards: exportRow.slice(0, 1) })).toBe(false);
    expect(presentMatches(present("c12.int_granin.019"), { cards: cards("SELECT * FROM door_access WHERE badge_id IS NULL", "door_access") })).toBe(true);

    const sms = cards("SELECT * FROM gs_comms_2015 WHERE from_ext = '2-14' AND kind = 'sms' AND text LIKE '%ПРИЧАЛУ%'", "gs_comms_2015");
    const book = cards("SELECT * FROM gs_phonebook WHERE ext = '2-14'", "gs_phonebook");
    expect(sms.length).toBe(1);
    expect(presentMatches(present("c12.int_granin.020"), { cards: [...sms, ...book] })).toBe(true);
    expect(presentMatches(present("c12.int_granin.020"), { cards: sms })).toBe(false);
    expect(presentMatches(present("c12.int_granin.020"), { cards: cards(sol, "gs_comms_2015") })).toBe(true);

    expect(presentMatches(present("c12.int_granin.024"), { cards: cards("SELECT * FROM construction_docs WHERE doc_no = 'ПД-117/изм.3'", "construction_docs") })).toBe(true);
    expect(presentMatches(present("c12.int_granin.024"), { cards: cards("SELECT * FROM construction_docs WHERE doc_no = 'ПД-117'", "construction_docs") })).toBe(false);
    expect(presentMatches(present("c12.int_granin.024"), { evidenceIds: ["ev.c06.outfall_moved"] })).toBe(true);
  });

  it("исход допроса ставит granin_broken и ведёт к отправке пакета (K, R)", () => {
    expect(c12.scenes.find((s) => s.id === "int_granin_done")?.choices?.[0]).toMatchObject({ flag: "granin_broken", goto: "package" });
    expect(c12.scenes.find((s) => s.id === "int_granin_closed")?.next).toBe("package");
    const r = c12.scenes.find((s) => s.id === "package_r")!.choices!.map((c) => c.flag);
    expect(r).toEqual(expect.arrayContaining(["recipient=prosecutor", "recipient=sk", "recipient=alla", "recipient=sk_alla", "recipient=deal"]));
  });
});

// ------------------------------------------------------------------ 11.6 публикация

describe("11.6 «Собери публикацию»", () => {
  const ALLA = { recipient: "alla" } as const;
  const sol = objective("o11_6").solution;
  const redact = objective("o11_6r").solution;

  it("эталон и альтернатива со списком столбцов проходят; SELECT без вставки — нет", async () => {
    for (const [sql, expected] of [
      [sol, true],
      ["INSERT INTO publication (id, person_id, person_text, person_birth_date, source_role, ts, place, what, source_class) SELECT id, person_id, person_text, person_birth_date, source_role, ts, place, what, source_class FROM publication_source", true],
      ["SELECT * FROM publication_source", false],
    ] as const) {
      const on = await caseDb();
      expect(timed(() => passes("o11_6", sql, on, { flags: ALLA })), sql).toBe(expected);
      on.close();
    }
  });

  it("редактура: эталон ставит redacted; только информаторы, «Ким%» и сравнение с датой рождения — нет", async () => {
    for (const [sql, expected] of [
      [redact, true],
      ["DELETE FROM publication WHERE person_id = 2307 OR (person_birth_date IS NOT NULL AND date(ts) < date(person_birth_date, '+18 years'))", true],
      ["DELETE FROM publication WHERE source_role = 'информатор'", false],
      ["DELETE FROM publication WHERE source_role = 'информатор' OR person_text LIKE 'Ким%'", false],
      ["DELETE FROM publication WHERE source_role = 'информатор' OR person_birth_date > '2008-01-01'", false],
    ] as const) {
      const on = await caseDb();
      expect(run(sol, on).error).toBeNull();
      expect(passes("o11_6r", sql, on, { flags: ALLA }), sql).toBe(expected);
      on.close();
    }
    expect(c12.scenes.find((s) => s.id === "redacted")?.choices?.[0].flag).toBe("redacted");
  });

  it("задача 11.6 существует только для адресата с Аллой (или пока адресат не выбран)", () => {
    expect(mainObjectives(c12, ALLA).map((o) => o.id)).toContain("o11_6");
    expect(mainObjectives(c12, { recipient: "sk_alla" }).map((o) => o.id)).toContain("o11_6");
    expect(mainObjectives(c12, { recipient: "prosecutor" }).map((o) => o.id)).not.toContain("o11_6");
  });
});

// ------------------------------------------------------------------ table guard и лестница понятий

describe("Д11: эталоны", () => {
  it("каждый эталон пропускает table-guard дела и не трогает чужие таблицы", async () => {
    const on = await caseDb("2027-01-11 12:27:00");
    for (const o of c12.objectives) {
      const r = run(o.solution, on);
      expect(r.error, `${o.id}: ${r.error}`).toBeNull();
    }
    on.close();
  });

  it("запись вне белого списка и DDL кроме представлений запрещены", () => {
    expect(run("UPDATE audit_log SET login = 'x' WHERE id = 1").error).not.toBeNull();
    expect(run("DELETE FROM publication_source").error).not.toBeNull();
    expect(run("DROP TABLE statements").error).not.toBeNull();
  });
});
