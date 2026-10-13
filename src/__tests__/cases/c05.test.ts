/**
 * Дело № 05 «Номер 3312» (case-05-nomer-3312): контент, эталоны, ловушки,
 * предсказание, протокол и посаженные факты разд. 8.4 (блок «Д5») — по
 * TECH_SPEC, разд. 5.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { Database } from "sql.js";
import {
  availableOptions,
  checkCaseProgress,
  checkProtocol,
  collectEvidenceIds,
  executeSQL,
  getSchema,
  isCaseObjectivesDone,
  lintSql,
  mainObjectives,
  openCaseDatabase,
  scanSeen,
  scanSeenOptions,
  validateCaseContent,
  type CaseDef,
  type CaseObjective,
  type QueryResult,
} from "@/engine";
import { cases, characters, getCase, handbookById } from "@/data";
import { C05 } from "@/engine/world/plants/c05";
import { sharedWorld, one, rows } from "../world/helpers";

const CASE_ID = "case-05-nomer-3312";

let world: Database;
let bytes: Uint8Array;
/** База дела на старте часов (02:40) и на потолке (06:00) */
let db: Database;
let dbCap: Database;
let c05: CaseDef;

const openAt = (clock: string) =>
  openCaseDatabase(bytes, {
    clock,
    tables: c05.tables,
    patches: [{ id: "p0.player", params: { playerName: "Северов" } }],
  });

beforeAll(async () => {
  ({ db: world, bytes } = await sharedWorld());
  c05 = getCase(CASE_ID) as CaseDef;
  db = await openAt(c05.date);
  dbCap = await openAt(c05.clock?.cap as string);
}, 60_000);

const run = (sql: string, base: Database = db): QueryResult => executeSQL(base, sql, c05.tables);

const objective = (id: string): CaseObjective => {
  const o = c05.objectives.find((x) => x.id === id);
  if (!o) throw new Error(`нет задачи ${id}`);
  return o;
};

function doneBefore(id: string): Set<string> {
  const o = objective(id);
  if (o.optional) return new Set(mainObjectives(c05).map((m) => m.id));
  return new Set(mainObjectives(c05).filter((m) => m.order < o.order).map((m) => m.id));
}

function passes(id: string, sql: string, base: Database = db): boolean {
  const result = run(sql, base);
  const progress = checkCaseProgress(c05, result, base, doneBefore(id));
  return progress.completed.some((c) => c.objectiveId === id);
}

// ------------------------------------------------------------------ альтернативы и ошибки

const NOT_IN_TRAP =
  "SELECT reg_no + 1 AS gap FROM doc_registry WHERE year = 2015 AND reg_no + 1 NOT IN (SELECT reg_no FROM doc_registry WHERE year = 2015) AND reg_no < (SELECT MAX(reg_no) FROM doc_registry WHERE year = 2015);";
const SCALAR_TRAP =
  "SELECT * FROM cases WHERE id = (SELECT case_id FROM doc_registry WHERE year = 2015 AND reg_no BETWEEN 3309 AND 3315);";

const ALTERNATIVES: Record<string, string[]> = {
  o5_1: [
    "SELECT reg_no + 1 FROM doc_registry WHERE year = 2015 AND reg_no + 1 NOT IN (SELECT reg_no FROM doc_registry WHERE year = 2015 AND reg_no IS NOT NULL) AND reg_no < (SELECT MAX(reg_no) FROM doc_registry WHERE year = 2015);",
    // ★ «Изящество»: self-anti-join на LEFT JOIN
    "SELECT d.reg_no + 1 AS missing FROM doc_registry d LEFT JOIN doc_registry x ON x.year = 2015 AND x.reg_no = d.reg_no + 1 WHERE d.year = 2015 AND d.reg_no IS NOT NULL AND x.id IS NULL AND d.reg_no <> (SELECT MAX(reg_no) FROM doc_registry);",
  ],
  o5_1b: [
    "SELECT * FROM doc_registry WHERE year = 2015 AND reg_no IN (4470, 4472);",
    "SELECT * FROM cases WHERE id = '15-0310';",
  ],
  o5_2: [
    "SELECT * FROM doc_registry WHERE reg_no >= 3309 AND reg_no <= 3315 ORDER BY reg_no;",
    "SELECT reg_no AS n, note FROM doc_registry WHERE year = 2015 AND reg_no IN (3311, 3313);",
  ],
  o5_3: [
    "SELECT c.* FROM cases c JOIN doc_registry d ON d.case_id = c.id WHERE d.year = 2015 AND d.reg_no = 3311;",
    "SELECT * FROM cases WHERE id = '15-0219';",
    "SELECT title, applicant_text, investigator, status FROM cases WHERE id IN (SELECT case_id FROM doc_registry WHERE reg_no = 3313);",
  ],
  o5_4: [
    "SELECT ROUND(100.0 * SUM(CASE WHEN registered_by = 'Шустова Н. Ф.' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct FROM doc_registry WHERE year = 2015;",
    "SELECT AVG(CASE WHEN registered_by = 'Шустова Н. Ф.' THEN 1.0 ELSE 0 END) AS share FROM doc_registry;",
  ],
  o5_5: [
    "SELECT id, full_name FROM persons WHERE id = (SELECT father_id FROM persons WHERE id = 4127);",
    "SELECT f.full_name FROM persons p JOIN persons f ON f.id = p.father_id WHERE p.id = 4127;",
  ],
  o5_5b: [
    "SELECT * FROM persons WHERE id = 1389;",
    "SELECT full_name, prev_last_name FROM persons WHERE id IN (SELECT mother_id FROM persons WHERE id = 4127);",
  ],
};

const MISTAKES: Record<string, string[]> = {
  o5_1: [
    // ловушка Д5: NOT IN по столбцу с NULL → ноль строк
    NOT_IN_TRAP,
    // номер после последнего — не пропуск
    "SELECT d.reg_no + 1 FROM doc_registry d WHERE d.year = 2015 AND NOT EXISTS (SELECT 1 FROM doc_registry x WHERE x.year = 2015 AND x.reg_no = d.reg_no + 1);",
    // соседи пропусков вместо самих пропусков
    "SELECT reg_no FROM doc_registry WHERE year = 2015 AND reg_no NOT IN (SELECT reg_no - 1 FROM doc_registry WHERE year = 2015 AND reg_no IS NOT NULL);",
  ],
  o5_1b: [
    "SELECT id, title FROM cases WHERE id IN (SELECT id FROM doc_registry WHERE year = 2015 AND reg_no BETWEEN 4470 AND 4472);",
    "SELECT * FROM doc_registry WHERE year = 2015 AND reg_no = 4471;",
    "SELECT * FROM doc_registry WHERE year = 2015 AND reg_no BETWEEN 3309 AND 3315;",
  ],
  o5_2: [
    "SELECT * FROM doc_registry WHERE year = 2015 AND reg_no BETWEEN 3315 AND 3309;",
    "SELECT * FROM doc_registry WHERE year = 2015 AND reg_no = 3312;",
    "SELECT * FROM doc_registry WHERE year = 2015;",
  ],
  o5_3: [
    // скалярный подзапрос молча берёт первую строку — чужое дело
    SCALAR_TRAP,
    "SELECT * FROM cases WHERE id IN (SELECT case_id FROM doc_registry WHERE year = 2015 AND reg_no BETWEEN 3309 AND 3315);",
    "SELECT title, investigator FROM cases WHERE id = '15-0219';",
  ],
  o5_4: [
    // целочисленное деление → 0
    "SELECT ROUND(SUM(CASE WHEN registered_by = 'Шустова Н. Ф.' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) AS pct FROM doc_registry WHERE year = 2015;",
    // COUNT считает и нули → 100
    "SELECT ROUND(100.0 * COUNT(CASE WHEN registered_by = 'Шустова Н. Ф.' THEN 1 ELSE 0 END) / COUNT(*), 1) FROM doc_registry;",
    // голые счётчики без доли
    "SELECT registered_by, COUNT(*) FROM doc_registry GROUP BY registered_by;",
  ],
  o5_5: [
    "SELECT id, full_name FROM persons WHERE id = (SELECT mother_id FROM persons WHERE id = 4127);",
    "SELECT * FROM persons WHERE father_id = 4127;",
    "SELECT * FROM persons WHERE id = 1389;",
  ],
  o5_5b: [
    "SELECT id, full_name, prev_last_name FROM persons WHERE id = (SELECT father_id FROM persons WHERE id = 4127);",
    "SELECT full_name, prev_last_name FROM persons WHERE id = 4127;",
  ],
};

/** Уровень 4 («Тетрадь Ирины»): ровно одна ошибка — и задача не засчитывается */
const CHEAT_SHEETS: Record<string, string> = {
  o5_1: NOT_IN_TRAP,
  o5_1b: "SELECT id, title, applicant_text, investigator FROM cases WHERE id IN (SELECT id FROM doc_registry WHERE year = 2015 AND reg_no BETWEEN 4470 AND 4472);",
  o5_2: "SELECT reg_no, registered_at, doc_type, case_id, registered_by, note FROM doc_registry WHERE year = 2015 AND reg_no BETWEEN 3315 AND 3309 ORDER BY reg_no;",
  o5_3: SCALAR_TRAP,
  o5_4: "SELECT ROUND(SUM(CASE WHEN registered_by = 'Шустова Н. Ф.' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) AS pct FROM doc_registry WHERE year = 2015;",
  o5_5: "SELECT id, full_name FROM persons WHERE id = (SELECT mother_id FROM persons WHERE id = 4127);",
  o5_5b: "SELECT id, full_name, prev_last_name FROM persons WHERE id = (SELECT father_id FROM persons WHERE id = 4127);",
};

/** Примеры МИРЫ (уровень 2) — на других таблицах */
const MIRA_EXAMPLES: [string, string][] = [
  ["o5_1", "SELECT l.login, l.role FROM logins l WHERE NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = l.staff_id)"],
  ["o5_1b", "SELECT full_name, position FROM staff WHERE id IN (SELECT staff_id FROM logins WHERE enabled = 0)"],
  ["o5_2", "SELECT * FROM incidents WHERE kusp_no BETWEEN 4514 AND 4519 ORDER BY kusp_no"],
  ["o5_3", "SELECT full_name, position FROM staff WHERE id = (SELECT staff_id FROM logins WHERE login = 'k.melnik')"],
  ["o5_4", "SELECT CASE WHEN enabled = 1 THEN 'включён' ELSE 'отключён' END AS state, COUNT(*) FROM logins GROUP BY state"],
  ["o5_5", "SELECT full_name, birth_date FROM persons WHERE id = (SELECT mother_id FROM persons WHERE id = 3612)"],
  ["o5_5b", "SELECT full_name, birth_date FROM persons WHERE id = (SELECT mother_id FROM persons WHERE id = 3612)"],
];

/** Ключевые слова из более поздних дел (строгая лестница, разд. 4.1, п. 8) */
const FUTURE_KEYWORDS = [
  "WITH", "RECURSIVE", "UNION", "EXCEPT", "INTERSECT", "OVER", "PARTITION", "WINDOW",
  "STRFTIME", "JULIANDAY", "DATETIME", "DATE", "TIME", "UNIXEPOCH", "SQRT", "ABS",
  "INSERT", "UPDATE", "DELETE", "REPLACE", "CREATE", "DROP", "VIEW", "BEGIN", "COMMIT", "ROLLBACK",
];

function keywordsOf(sql: string): string[] {
  const bare = sql.replace(/'(?:[^']|'')*'/g, "''");
  return (bare.match(/[A-Za-z_]+/g) ?? []).map((w) => w.toUpperCase());
}

// ==================================================================== контент

describe("Д5: контент дела", () => {
  it("validateCaseContent → пусто", () => {
    expect(validateCaseContent(c05, characters, collectEvidenceIds(cases))).toEqual([]);
  });

  it("карточка дела по библии: 15.12 02:40, 1 мин/запрос, часы стоят на 03:11 до 5.1, потолок 06:00", () => {
    expect(c05.order).toBe(5);
    expect(c05.act).toBe(2);
    expect(c05.difficulty).toBe("medium");
    expect(c05.date).toBe("2026-12-15 02:40");
    expect(c05.minutesPerQuery).toBe(1);
    expect(c05.clock?.cap).toBe("2026-12-15 06:00");
    expect(c05.clock?.holds).toEqual([
      { at: "2026-12-15 03:11", until: { objective: "o5_1" }, resumeAt: "2026-12-15 03:12:30" },
    ]);
    expect(c05.newTables).toEqual(["doc_registry", "cases", "statements"]);
    for (const t of c05.newTables ?? []) expect(c05.tables).toContain(t);
    expect(mainObjectives(c05).map((o) => o.id)).toEqual(["o5_1", "o5_2", "o5_3", "o5_4", "o5_5"]);
    expect(c05.objectives.filter((o) => o.optional).map((o) => o.id)).toEqual(["o5_1b", "o5_5b"]);
    expect(c05.events?.find((e) => e.id === "zero_0312")).toMatchObject({ atTime: "2026-12-15 03:12:30", scene: "night_0312" });
  });

  it("у каждой задачи 4 подсказки голосами, улика и эталон; concept — статья справочника", () => {
    for (const o of c05.objectives) {
      expect(o.hints.length, o.id).toBe(4);
      for (const h of o.hints) expect(h.by, o.id).toBeDefined();
      expect(o.hints[0].line, o.id).toBe(`hint.c05_${o.id}.001`);
      expect(o.hints[3].by, o.id).toBe("irina");
      expect(o.evidence?.id, o.id).toMatch(/^ev\.c05\./);
      expect(o.solution.trim(), o.id).not.toBe("");
      expect(handbookById.has(o.concept as string), o.id).toBe(true);
    }
    for (const id of c05.concepts) expect(handbookById.has(id), id).toBe(true);
  });

  it("реплики библии стоят на своих id", () => {
    const line = (id: string) => c05.scenes.flatMap((s) => s.lines).find((l) => l.id === id);
    expect(line("c05.intro.008")).toMatchObject({ speaker: "tokha", text: "О, хороший у тебя в пятницу LEFT JOIN был, чистенький." });
    expect(line("c05.talk.004")).toMatchObject({ speaker: "nina", text: "Не помню я, голубчик, столько лет." });
    expect(line("c05.nina.009")).toMatchObject({ speaker: "nina", text: "Девочка говорила. Я печатала." });
    expect(line("c05.nina.010")).toMatchObject({ speaker: "nina", text: "Больше не спрашивай, голубчик." });
    expect(line("c05.morning.003")).toMatchObject({ speaker: "dasha", text: "Слышь, а кто у тебя в журнале в три ночи шарился?" });
    expect(line("c05.gaps.002")?.text).toContain("Валька-практикантка");
    expect(line("c05.rec02.003")?.text).toBe("Три-три-один-два. В бумажном журнале у Нины — та же дыра.");
  });

  it("примеры справочника Д5 выполняются на данных мира и не пусты", () => {
    for (const id of c05.concepts) {
      const example = handbookById.get(id)?.example ?? "";
      const statements = example
        .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
        .split(";").map((s) => s.trim()).filter(Boolean);
      expect(statements.length, id).toBeGreaterThan(0);
      for (const sql of statements) {
        const r = run(sql);
        expect(r.error, `${id}: ${sql}`).toBeNull();
        expect(r.rowCount, `${id}: ${sql}`).toBeGreaterThan(0);
      }
    }
  });

  it("беседа с Ниной: одно предъявление, пробой — карточкой 3313", () => {
    const talk = c05.scenes.find((s) => s.id === "talk");
    expect(talk?.interrogation?.mode).toBe("talk");
    expect(talk?.interrogation?.breakSteps).toEqual(["neutral", "scared", "ashamed"]);
    const present = talk?.interrogation?.points.find((p) => p.present)?.present;
    expect(present?.correct).toEqual(["ev.c05.scheme_3313"]);
    expect(present?.success).toBe("nina");
    expect(objective("o5_4").sceneAfter).toBe("talk");
  });

  it("реплики озвучиваемы: ≤ 160 знаков, без цифр у персонажей; к игроку и у игрока — без родовых форм", () => {
    const END = "(?=$|[\\s.,!?…»:;)])";
    const youPast = new RegExp(`(^|[\\s,«(—])ты\\s+(\\S+\\s+)?[а-яё]+(л|ла|лся|лась)${END}`, "i");
    const iPast = new RegExp(`(^|[\\s,«(—])я\\s+(\\S+\\s+)?[а-яё]+(л|ла|лся|лась)${END}`, "i");
    const shortAdj = new RegExp(`(^|[\\s,«(—])(готов|готова|рад|рада|должен|должна|уверен|уверена)${END}`, "i");
    for (const scene of c05.scenes) {
      for (const l of scene.lines) {
        expect(l.text.length, l.id).toBeLessThanOrEqual(160);
        if (l.speaker !== "narrator") expect(/\d/.test(l.text), `${l.id}: цифры в озвучке`).toBe(false);
        expect(youPast.test(l.text), `${l.id}: «ты …л(а)»`).toBe(false);
      }
      for (const ch of scene.choices ?? []) {
        for (const re of [youPast, iPast, shortAdj]) expect(re.test(ch.text), ch.id).toBe(false);
      }
    }
    for (const o of c05.objectives) {
      expect(/\d/.test(o.hints[0].text), `${o.id}: цифры в озвучиваемой наводке`).toBe(false);
    }
  });
});

// ==================================================================== эталоны

describe("Д5: эталоны проходят по порядку", () => {
  it("каждый эталон засчитывает свою задачу — на старте и на потолке часов", () => {
    for (const base of [db, dbCap]) {
      const completed = new Set<string>();
      for (const o of [...c05.objectives].sort((a, b) => a.order - b.order)) {
        const result = run(o.solution, base);
        expect(result.error, `${o.id}: ${result.error}`).toBeNull();
        const progress = checkCaseProgress(c05, result, base, completed);
        const ids = progress.completed.map((c) => c.objectiveId);
        expect(ids, o.id).toContain(o.id);
        expect(ids.filter((id) => !objective(id).optional).length, o.id).toBeLessThanOrEqual(1);
        for (const id of ids) completed.add(id);
      }
      expect(isCaseObjectivesDone(c05, completed)).toBe(true);
    }
  });

  it("эталоны дают одинаковый результат на 02:40 и на 06:00", () => {
    for (const o of c05.objectives) {
      expect(run(o.solution, dbCap).rows, o.id).toEqual(run(o.solution, db).rows);
    }
  });

  it("эталоны проходят table-guard дела; закрытые таблицы — отказ", () => {
    for (const o of c05.objectives) {
      const r = executeSQL(db, o.solution, c05.tables);
      expect(r.error, o.id).toBeNull();
      expect(r.errorKind, o.id).toBeUndefined();
    }
    expect(executeSQL(db, "SELECT * FROM construction_docs", c05.tables).error).not.toBeNull();
    expect(executeSQL(db, "SELECT * FROM sokol_stage_registry", c05.tables).error).not.toBeNull();
  });

  it("строгая лестница: в эталонах нет понятий Д6 и дальше", () => {
    for (const o of c05.objectives) {
      expect(keywordsOf(o.solution).filter((w) => FUTURE_KEYWORDS.includes(w)), o.id).toEqual([]);
    }
  });

  it("каждый эталон выполняется быстрее 1 с", () => {
    for (const o of c05.objectives) {
      const t0 = performance.now();
      const r = run(o.solution);
      expect(performance.now() - t0, o.id).toBeLessThan(1000);
      expect(r.truncated, o.id).toBeUndefined();
    }
  });
});

describe("Д5: альтернативные формулировки засчитываются", () => {
  for (const [id, list] of Object.entries(ALTERNATIVES)) {
    it.each(list)(`${id}: %s`, (sql) => {
      expect(run(sql).error).toBeNull();
      expect(passes(id, sql)).toBe(true);
    });
  }
});

describe("Д5: правдоподобные ошибки не засчитываются", () => {
  for (const [id, list] of Object.entries(MISTAKES)) {
    it.each(list)(`${id}: %s`, (sql) => {
      expect(passes(id, sql)).toBe(false);
    });
  }

  it("ошибок не меньше двух на задачу, альтернатив — не меньше одной", () => {
    for (const o of c05.objectives) {
      expect(MISTAKES[o.id]?.length ?? 0, o.id).toBeGreaterThanOrEqual(2);
      expect(ALTERNATIVES[o.id]?.length ?? 0, o.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("«Тетрадь Ирины» (уровень 4) — с одной ошибкой и не засчитывается", () => {
    for (const o of c05.objectives) {
      const sheet = CHEAT_SHEETS[o.id];
      expect(sheet, o.id).toBeDefined();
      expect(o.hints[3].text, o.id).toContain(sheet);
      expect(passes(o.id, sheet), o.id).toBe(false);
    }
  });

  it("примеры МИРЫ (уровень 2) выполняются, не пусты и задачу сами не решают", () => {
    for (const [id, sql] of MIRA_EXAMPLES) {
      expect(objective(id).hints[1].text, id).toContain(sql);
      const r = run(sql);
      expect(r.error, id).toBeNull();
      expect(r.rowCount, id).toBeGreaterThan(0);
      expect(passes(id, sql), id).toBe(false);
    }
  });

  it("ловушка Д5: NOT IN по столбцу с NULL → 0 строк, линтер предупреждает; IS NOT NULL лечит", () => {
    expect(run(NOT_IN_TRAP).rowCount).toBe(0);
    expect(lintSql(NOT_IN_TRAP, getSchema(db), { db }).map((w) => w.rule)).toContain("not_in_null");
    expect(run(ALTERNATIVES.o5_1[0]).rows.map((r) => r[0])).toEqual([3312, 4471]);
  });

  it("ловушка скалярного подзапроса: несколько строк — молча первая, чужое дело", () => {
    const r = run(SCALAR_TRAP);
    expect(r.rowCount).toBe(1);
    expect(r.rows[0][0]).not.toBe("15-0219");
  });

  it("предсказание «Сколько строк вернёт NOT IN?» сходится с базой", () => {
    const p = objective("o5_1").prediction;
    expect(p).toBeDefined();
    expect(run(p?.sql as string).rowCount).toBe(p?.answer);
    expect(p?.answer).toBe(0);
  });
});

// ==================================================================== протокол

describe("Д5: протокол «Пропущен № … по делу …»", () => {
  const protocol = () => c05.protocol as NonNullable<CaseDef["protocol"]>;
  const seenFromSolutions = () => {
    const options = new Set<string>();
    const values = new Set<string>();
    for (const o of c05.objectives) {
      const r = run(o.solution);
      for (const v of scanSeenOptions(protocol(), r)) options.add(v);
      for (const v of scanSeen(r)) values.add(v);
    }
    return { options, values };
  };

  it("пропуски по библии: number, text, person, text, text", () => {
    expect(protocol().blanks.map((b) => [b.id, b.kind])).toEqual([
      ["reg", "number"], ["case", "text"], ["missing", "person"], ["investigator", "text"], ["applicant", "text"],
    ]);
    expect(protocol().blanks.map((b) => b.answer)).toEqual([
      C05.answers.reg, C05.answers.caseId, C05.answers.missing, C05.answers.investigator, C05.answers.applicant,
    ]);
  });

  it("ответы находятся scanSeenOptions в результатах эталонов", () => {
    const { options } = seenFromSolutions();
    for (const blank of protocol().blanks) expect(options.has(blank.answer), blank.id).toBe(true);
  });

  it("каждый вариант (в том числе ложный) можно увидеть в эталонах дела", () => {
    const { values } = seenFromSolutions();
    for (const blank of protocol().blanks) {
      expect(availableOptions(blank, values), blank.id).toEqual(blank.options);
    }
  });

  it("верные ответы подтверждаются; пачка из трёх; ложные — нет", () => {
    const right = {
      reg: C05.answers.reg, case: C05.answers.caseId, missing: C05.answers.missing,
      investigator: C05.answers.investigator, applicant: C05.answers.applicant,
    };
    const ok = checkProtocol(protocol(), right, new Set());
    expect(ok.solved).toBe(true);
    expect([...ok.newlyConfirmed].sort()).toEqual(Object.keys(right).sort());

    const twoRight = checkProtocol(protocol(), {
      ...right, reg: "4471", investigator: "капитан Дьячков Е. М.", applicant: "Тарасов Г. Н.",
    }, new Set());
    expect(twoRight.solved).toBe(false);
    expect(twoRight.newlyConfirmed).toEqual([]);

    const oneWrong = checkProtocol(protocol(), { ...right, missing: "Вальц Ирина Петровна" }, new Set());
    expect(oneWrong.solved).toBe(false);
    expect(oneWrong.newlyConfirmed).not.toContain("missing");
  });
});

// ==================================================================== посаженные факты

describe("Д5: посаженные факты (разд. 8.4, блок «Д5»)", () => {
  it("в журнале 2015 года ровно два пропуска: 3312 (ночь 20.02) и 4471 (10.03)", () => {
    const gaps = rows(world, `SELECT d.reg_no + 1 FROM doc_registry d WHERE d.year = 2015
      AND NOT EXISTS (SELECT 1 FROM doc_registry x WHERE x.year = 2015 AND x.reg_no = d.reg_no + 1)
      AND d.reg_no < (SELECT MAX(reg_no) FROM doc_registry WHERE year = 2015)`).map((r) => r[0]);
    expect(gaps).toEqual([...C05.gaps]);
    const around = (n: number) => rows(world, "SELECT registered_at FROM doc_registry WHERE year = 2015 AND reg_no IN (?, ?) ORDER BY reg_no", [n - 1, n + 1]).map((r) => String(r[0]));
    expect(around(3312)).toEqual(["2015-02-20 01:05:00", "2015-02-20 01:55:00"]);
    const coffee = around(4471);
    expect(coffee[0] < C05.coffeeAt && C05.coffeeAt < coffee[1]).toBe(true);
    expect(coffee.every((t) => t.startsWith("2015-03-10"))).toBe(true);
  });

  it("5 850 строк, 12 черновиков с reg_no NULL, номера уникальны", () => {
    expect(one(world, "SELECT COUNT(*) FROM doc_registry")).toBe(5850);
    expect(one(world, "SELECT COUNT(*) FROM doc_registry WHERE reg_no IS NULL")).toBe(12);
    expect(one(world, "SELECT COUNT(*) - COUNT(DISTINCT reg_no) FROM doc_registry WHERE reg_no IS NOT NULL")).toBe(0);
  });

  it("ровно 61 % документов квартала — на Шустову Н. Ф.", () => {
    const share = Number(one(world, "SELECT 100.0 * SUM(CASE WHEN registered_by = 'Шустова Н. Ф.' THEN 1 ELSE 0 END) / COUNT(*) FROM doc_registry WHERE year = 2015"));
    expect(Math.abs(share - 61)).toBeLessThan(0.5);
  });

  it("соседи 3312: рапорт 3311 и схема 3313 по делу 15-0219; 3320 и 3322 — «объяснение» 21.02", () => {
    expect(rows(world, "SELECT reg_no, doc_type, case_id, registered_by, note FROM doc_registry WHERE year = 2015 AND reg_no IN (3311, 3313) ORDER BY reg_no")).toEqual([
      [3311, "рапорт о выезде", "15-0219", "Шустова Н. Ф.", "выезд на Береговую, 4 по сообщению Ким С. А."],
      [3313, "схема места происшествия", "15-0219", "Шустова Н. Ф.", "составлена несовершеннолетней Ким Д. С., 13 л., к объяснению № 3312"],
    ]);
    expect(rows(world, "SELECT reg_no, doc_type, case_id, substr(registered_at, 1, 10) FROM doc_registry WHERE year = 2015 AND reg_no IN (3320, 3322) ORDER BY reg_no")).toEqual([
      [3320, "объяснение", "15-0219", "2015-02-21"],
      [3322, "объяснение", "15-0219", "2015-02-21"],
    ]);
  });

  it("ложный след 4471: соседи 4470 и 4472 — кража велосипеда 15-0310, 4472 «взамен испорченного»", () => {
    expect(rows(world, "SELECT reg_no, case_id, registered_by FROM doc_registry WHERE year = 2015 AND reg_no IN (4470, 4472) ORDER BY reg_no")).toEqual([
      [4470, C05.bikeCase, "Шустова Н. Ф."],
      [4472, C05.bikeCase, C05.intern],
    ]);
    expect(one(world, "SELECT title FROM cases WHERE id = ?", [C05.bikeCase])).toBe(C05.bikeTitle);
    expect(one(world, "SELECT COUNT(*) FROM doc_registry WHERE registered_by = ?", [C05.intern])).toBe(1);
  });

  it("дело 15-0219 — единственное о Сазонове: заявитель, следователь, приостановлено 20.05.2015", () => {
    expect(rows(world, "SELECT id, title, opened_at, applicant_text, investigator, status, status_at FROM cases WHERE title LIKE '%Сазонов%'")).toEqual([
      ["15-0219", "Безвестное исчезновение Сазонова Петра Ильича", "2015-02-19 23:20:00", "Сазонова В. С. (жена)", "майор Ратников Л. Б.", "приостановлено", "2015-05-20"],
    ]);
    expect(one(world, "SELECT COUNT(*) FROM cases")).toBe(600);
  });

  it("«Петровна»: 4127 → отец 1388, мать 1389 (прежняя фамилия «Сазонова» — у единственной)", () => {
    expect(rows(world, "SELECT id, full_name, father_id, mother_id FROM persons WHERE id = 4127")).toEqual([[4127, "Вальц Ирина Петровна", 1388, 1389]]);
    expect(one(world, "SELECT full_name FROM persons WHERE id = 1388")).toBe("Сазонов Пётр Ильич");
    expect(rows(world, "SELECT id, full_name FROM persons WHERE prev_last_name = 'Сазонова'")).toEqual([[1389, "Вальц Валентина Сергеевна"]]);
    expect(one(world, "SELECT COUNT(*) FROM persons WHERE full_name = 'Сазонов Пётр Ильич'")).toBe(1);
  });

  it("объяснений по 15-0219 — 63: 60 настоящих и подделки 5203, 5204, 5207", () => {
    expect(one(world, "SELECT COUNT(*) FROM statements WHERE case_id = '15-0219'")).toBe(63);
    expect(rows(world, "SELECT id FROM statements WHERE case_id = '15-0219' AND id IN (5203, 5204, 5207) ORDER BY id").map((r) => r[0])).toEqual([5203, 5204, 5207]);
  });

  it("migration_jobs 9: заливка sokol_stage_registry → doc_registry в ночь на 15.12, 01:30, под k.melnik", () => {
    const row = rows(world, "SELECT * FROM migration_jobs WHERE id = 9")[0].map(String).join(" | ");
    expect(row).toContain("2026-12-15 01:30:00");
    expect(row).toContain("k.melnik");
    expect(row).toContain("doc_registry");
  });

  it("заливка — в ночь 14→15: после записки Ратникова в ночи (14.12 вечером), до старта Д5; брифинг говорит то же", () => {
    const load = String(one(world, "SELECT run_at FROM migration_jobs WHERE id = 9"));
    const cleanup = String(one(world, "SELECT run_at FROM migration_jobs WHERE id = 10"));
    const note = (c05.night?.beats ?? []).flatMap((b) => ("scene" in b && /^night_(soft|hard)$/.test(b.scene) && b.at ? [b.at] : []));
    expect(note.length).toBe(2);
    for (const at of note) expect(load > at).toBe(true);
    expect(load < c05.date).toBe(true);
    // Staging чистят, когда заливка завершена: c05.sealed.002 «05:40. Заливка завершена»
    expect(cleanup).toBe("2026-12-15 05:40:00");
    expect(c05.briefing).toContain("в ночь на 15.12 с 01:30");
  });
});
