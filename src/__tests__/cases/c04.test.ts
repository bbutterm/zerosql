/**
 * Дело № 04 «Мёртвая душа» (case-04-mertvaya-dusha): контент, эталоны,
 * ловушки, протокол и посаженные факты разд. 8.4 (блок «Д4») — по TECH_SPEC, разд. 5.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { Database } from "sql.js";
import {
  availableOptions,
  checkCaseProgress,
  checkProtocol,
  collectEvidenceIds,
  executeSQL,
  isCaseObjectivesDone,
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
import { C04_ANSWERS, GROMOV_STAFF, TEST_LOGIN, TYPO_STAFF } from "@/engine/world/plants/c04";
import * as F from "@/engine/world/facts";
import { sharedWorld, one, rows } from "../world/helpers";

const CASE_ID = "case-04-mertvaya-dusha";

let world: Database;
let bytes: Uint8Array;
/** База дела на старте часов (10:00) и на потолке (13:00) */
let db: Database;
let dbCap: Database;
let c04: CaseDef;

const openAt = (clock: string) =>
  openCaseDatabase(bytes, {
    clock,
    tables: c04.tables,
    patches: [{ id: "p0.player", params: { playerName: "Северов" } }],
  });

beforeAll(async () => {
  ({ db: world, bytes } = await sharedWorld());
  c04 = getCase(CASE_ID) as CaseDef;
  db = await openAt(c04.date);
  dbCap = await openAt(c04.clock?.cap as string);
}, 60_000);

const run = (sql: string, base: Database = db): QueryResult => executeSQL(base, sql, c04.tables);

const objective = (id: string): CaseObjective => {
  const o = c04.objectives.find((x) => x.id === id);
  if (!o) throw new Error(`нет задачи ${id}`);
  return o;
};

/** Основные задачи раньше этой; для дополнительных — все основные */
function doneBefore(id: string): Set<string> {
  const o = objective(id);
  if (o.optional) return new Set(mainObjectives(c04).map((m) => m.id));
  return new Set(mainObjectives(c04).filter((m) => m.order < o.order).map((m) => m.id));
}

function passes(id: string, sql: string, base: Database = db): boolean {
  const result = run(sql, base);
  return checkCaseProgress(c04, result, base, doneBefore(id)).completed.some((c) => c.objectiveId === id);
}

const CHAIN = "FROM staff s JOIN zags_deaths z ON z.person_id = s.person_id";

// ------------------------------------------------------------------ альтернативы и ошибки

const ALTERNATIVES: Record<string, string[]> = {
  o4_1: [
    "SELECT * FROM staff s LEFT JOIN persons p ON s.person_id = p.id WHERE p.id IS NULL;",
    "SELECT st.full_name FROM staff AS st LEFT JOIN persons AS pp ON pp.id = st.person_id WHERE pp.full_name IS NULL ORDER BY st.full_name;",
    "SELECT s.login, s.person_id, p.id AS card FROM staff s LEFT JOIN persons p ON p.id = s.person_id WHERE p.id IS NULL",
  ],
  o4_2: [
    "SELECT l.* FROM logins l LEFT JOIN staff s ON l.staff_id = s.id WHERE s.id IS NULL;",
    "SELECT login FROM logins WHERE staff_id IS NULL;",
    "SELECT l.login, s.full_name FROM logins l LEFT JOIN staff s ON s.id = l.staff_id WHERE s.full_name IS NULL ORDER BY l.created_at",
  ],
  o4_2b: [
    "SELECT * FROM audit_log WHERE row_id = 'zero';",
    "SELECT a.ts, a.login, a.workstation, a.old_value, a.new_value FROM audit_log a JOIN logins l ON l.login = a.row_id WHERE l.staff_id IS NULL;",
    "SELECT ts, login FROM audit_log WHERE table_name = 'logins' AND field = 'enabled' AND row_id = 'zero' AND new_value = '1';",
  ],
  o4_3: [
    "SELECT st.login, st.full_name, st.position, st.fired_at, zd.died_at, zd.act_no FROM zags_deaths zd JOIN staff st ON st.person_id = zd.person_id ORDER BY zd.died_at;",
    "SELECT s.*, z.* FROM staff s JOIN zags_deaths z ON s.person_id = z.person_id;",
  ],
  o4_4: [
    "SELECT s.login, COUNT(a.ts) AS n FROM zags_deaths z JOIN staff s ON s.person_id = z.person_id LEFT JOIN audit_log a ON a.login = s.login AND a.ts > z.died_at GROUP BY s.login;",
    `SELECT s.login, COUNT(a.id), COALESCE(MAX(a.ts), 'нет действий') ${CHAIN} LEFT JOIN audit_log a ON a.login = s.login AND a.ts > z.died_at GROUP BY s.login`,
    `SELECT s.login, COUNT(*) AS total, COUNT(a.id) AS after_death ${CHAIN} LEFT JOIN audit_log a ON a.login = s.login AND a.ts > z.died_at GROUP BY s.login`,
  ],
  o4_4b: [
    `SELECT s.login, COUNT(a.id), IFNULL(MAX(a.ts), 'нет действий') AS last_ts ${CHAIN} LEFT JOIN audit_log a ON a.login = s.login AND a.ts > z.died_at GROUP BY s.login ORDER BY s.login DESC`,
    `SELECT s.full_name, s.login, z.died_at, COUNT(a.id) AS n, COALESCE(MAX(a.ts), 'нет действий') AS last ${CHAIN} LEFT JOIN audit_log a ON a.login = s.login AND a.ts > z.died_at GROUP BY s.full_name, s.login, z.died_at`,
  ],
  o4_5: [
    "SELECT a.* FROM audit_log a JOIN staff s ON s.login = a.login JOIN zags_deaths z ON z.person_id = s.person_id WHERE a.ts > z.died_at AND a.action <> 'DELETE' ORDER BY a.ts DESC;",
    "SELECT ts, workstation, action, table_name, row_id, field, old_value, new_value FROM audit_log WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00' AND action <> 'DELETE' ORDER BY ts;",
    "SELECT ts, action, table_name, row_id, field, old_value, new_value FROM audit_log WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00' AND action IN ('UPDATE', 'INSERT', 'EXPORT') ORDER BY ts",
  ],
};

const MISTAKES: Record<string, string[]> = {
  o4_1: [
    // INNER JOIN выбрасывает сирот ещё до WHERE
    "SELECT s.id, s.full_name, s.person_id FROM staff s JOIN persons p ON p.id = s.person_id WHERE p.id IS NULL;",
    "SELECT s.id, s.full_name FROM staff s LEFT JOIN persons p ON p.id = s.person_id WHERE p.id = NULL;",
    "SELECT s.id, s.full_name FROM staff s LEFT JOIN persons p ON p.id = s.person_id;",
    // столбец, пустой и у настоящих карточек, — ложные сироты
    "SELECT s.id, s.full_name FROM staff s LEFT JOIN persons p ON p.id = s.person_id WHERE p.death_date IS NULL;",
  ],
  o4_2: [
    "SELECT l.login FROM logins l LEFT JOIN staff s ON s.id = l.staff_id WHERE s.id = NULL;",
    "SELECT l.login FROM logins l WHERE l.enabled = 0;",
    // не та сторона: сотрудники без логина
    "SELECT s.login FROM staff s LEFT JOIN logins l ON l.staff_id = s.id WHERE l.login IS NULL;",
    "SELECT l.login FROM logins l LEFT JOIN staff s ON s.id = l.staff_id WHERE l.enabled = 1 AND s.id IS NULL;",
  ],
  o4_2b: [
    // кто правил и что правили — разные столбцы
    "SELECT ts, login, workstation, field, old_value, new_value FROM audit_log WHERE table_name = 'logins' AND login = 'zero';",
    "SELECT * FROM audit_log WHERE login = 'i.valts' ORDER BY id DESC LIMIT 5;",
    "SELECT * FROM logins WHERE login = 'zero';",
  ],
  o4_3: [
    "SELECT s.login, s.full_name, s.position, s.fired_at, z.died_at FROM staff s JOIN zags_deaths z ON z.person_id = s.id;",
    // ПБД вместо ЗЕРКАЛА: полиция death_date не заполнила
    "SELECT s.login, s.full_name, s.position, s.fired_at, p.death_date FROM staff s JOIN persons p ON p.id = s.person_id WHERE p.death_date IS NOT NULL;",
    `SELECT s.login, s.full_name, s.position, s.fired_at, z.died_at ${CHAIN} WHERE s.fired_at < z.died_at;`,
    "SELECT login, full_name, position, fired_at FROM staff WHERE fired_at IS NOT NULL;",
  ],
  o4_4: [
    // COUNT(*) даёт Громову 1
    `SELECT s.login, COUNT(*) ${CHAIN} LEFT JOIN audit_log a ON a.login = s.login AND a.ts > z.died_at GROUP BY s.login;`,
    // условие в WHERE — и Громов исчезает
    `SELECT s.login, COUNT(a.id) ${CHAIN} LEFT JOIN audit_log a ON a.login = s.login WHERE a.ts > z.died_at GROUP BY s.login;`,
    `SELECT s.login, COUNT(a.id) ${CHAIN} JOIN audit_log a ON a.login = s.login AND a.ts > z.died_at GROUP BY s.login;`,
    `SELECT s.login, COUNT(a.id) ${CHAIN} LEFT JOIN audit_log a ON a.login = s.login GROUP BY s.login;`,
  ],
  o4_4b: [
    `SELECT s.login, COUNT(a.id), COALESCE(MAX(a.id), 'нет действий') ${CHAIN} LEFT JOIN audit_log a ON a.login = s.login AND a.ts > z.died_at GROUP BY s.login;`,
    `SELECT s.login, COUNT(a.id), MAX(a.ts) ${CHAIN} LEFT JOIN audit_log a ON a.login = s.login AND a.ts > z.died_at GROUP BY s.login;`,
    `SELECT s.login, COUNT(*), COALESCE(MAX(a.ts), 'нет действий') ${CHAIN} LEFT JOIN audit_log a ON a.login = s.login AND a.ts > z.died_at GROUP BY s.login;`,
  ],
  o4_5: [
    // id — порядок репликации, а не время
    `SELECT a.ts, a.workstation, a.action, a.table_name, a.row_id, a.field, a.old_value, a.new_value ${CHAIN} JOIN audit_log a ON a.login = s.login AND a.ts > z.died_at WHERE s.login = 'i.valts' AND a.action <> 'DELETE' ORDER BY a.id;`,
    `SELECT a.ts, a.action, a.row_id ${CHAIN} JOIN audit_log a ON a.login = s.login AND a.ts > z.died_at WHERE s.login = 'i.valts' ORDER BY a.ts;`,
    "SELECT ts, action, row_id FROM audit_log WHERE login = 'i.valts' AND action <> 'DELETE' ORDER BY ts;",
    `SELECT a.ts, a.action, a.row_id ${CHAIN} JOIN audit_log a ON a.login = s.login AND a.ts > z.died_at WHERE a.action <> 'DELETE' ORDER BY a.id DESC LIMIT 1;`,
  ],
};

/** Ключевые слова из более поздних дел (строгая лестница, разд. 4.1, п. 8) */
const FUTURE_KEYWORDS = [
  "EXISTS", "CASE", "WITH", "UNION", "EXCEPT", "INTERSECT", "OVER", "PARTITION", "DATE", "DATETIME", "STRFTIME",
  "JULIANDAY", "UNIXEPOCH", "SUBSTR", "LENGTH", "REPLACE", "INSERT", "UPDATE", "DELETE", "RECURSIVE", "RIGHT", "FULL",
];
const keywordsOf = (sql: string): string[] =>
  (sql.replace(/'(?:[^']|'')*'/g, "''").match(/[A-Za-z_]+/g) ?? []).map((w) => w.toUpperCase());

// ==================================================================== контент

describe("Д4: контент дела", () => {
  it("validateCaseContent → пусто", () => {
    expect(validateCaseContent(c04, characters, collectEvidenceIds(cases))).toEqual([]);
  });

  it("карточка дела по библии: 11.12 10:00, 1 мин/запрос, потолок 13:00, таблицы", () => {
    expect(c04.order).toBe(4);
    expect(c04.act).toBe(1);
    expect(c04.difficulty).toBe("medium");
    expect(c04.date).toBe("2026-12-11 10:00");
    expect(c04.minutesPerQuery).toBe(1);
    expect(c04.clock?.cap).toBe("2026-12-11 13:00");
    expect(c04.newTables).toEqual(["logins", "workstations", "audit_log", "zags_deaths", "query_log"]);
    for (const t of c04.newTables ?? []) expect(c04.tables).toContain(t);
    expect(mainObjectives(c04).map((o) => o.id)).toEqual(["o4_1", "o4_2", "o4_3", "o4_4", "o4_5"]);
    expect(c04.objectives.filter((o) => o.optional).map((o) => o.id)).toEqual(["o4_2b", "o4_4b"]);
  });

  it("у каждой задачи 4 подсказки голосами, улика и эталон; concept — статья справочника", () => {
    for (const o of c04.objectives) {
      expect(o.hints.length, o.id).toBe(4);
      for (const h of o.hints) expect(h.by, o.id).toBeDefined();
      expect(o.hints[0].line, o.id).toBe(`hint.c04_${o.id}.001`);
      expect(o.evidence?.id, o.id).toMatch(/^ev\.c04\./);
      expect(handbookById.has(o.concept as string), o.id).toBe(true);
    }
    for (const id of c04.concepts) expect(handbookById.has(id), id).toBe(true);
  });

  it("реплики библии на месте", () => {
    const all = c04.scenes.flatMap((s) => s.lines);
    const said = (speaker: string, text: string) => all.some((l) => l.speaker === speaker && l.text === text);
    expect(said("melnik", "Коллеги, синхронизируемся: сироты, дубли, рассинхрон.")).toBe(true);
    expect(said("tokha", "Мой косяк, щас поправлю.")).toBe(true);
    expect(said("ratnikov", "Не хотел, чтобы тебе за столом мёртвой каждую минуту об этом думалось.")).toBe(true);
    for (const t of [
      "Запись. Восемнадцатое ноября, вечер.",
      "Если ты это слушаешь — значит, сидишь за моим столом.",
      "Остальные записи заперты. Ключ — строка, на которой я стояла.",
      "Ладно. Дальше.",
    ]) expect(said("irina", t), t).toBe(true);
    // тон разговора с Ратниковым — флаг доверия
    const talk = c04.scenes.find((s) => s.id === "talk");
    expect(talk?.choices?.map((c) => c.flag)).toEqual(["ratnikov_trust+1", "ratnikov_trust-1"]);
  });

  it("реплики озвучиваемы: ≤ 160 знаков, без цифр у персонажей; без родовых форм к игроку", () => {
    const END = "(?=$|[\\s.,!?…»:;)])";
    const youPast = new RegExp(`(^|[\\s,«(—])ты\\s+(\\S+\\s+)?[а-яё]+(л|ла|лся|лась)${END}`, "i");
    const iPast = new RegExp(`(^|[\\s,«(—])я\\s+(\\S+\\s+)?[а-яё]+(л|ла|лся|лась)${END}`, "i");
    const shortAdj = new RegExp(`(^|[\\s,«(—])(готов|готова|рад|рада|должен|должна|уверен|уверена)${END}`, "i");
    for (const scene of c04.scenes) {
      for (const l of scene.lines) {
        expect(l.text.length, l.id).toBeLessThanOrEqual(160);
        if (l.speaker !== "narrator") expect(/\d/.test(l.text), `${l.id}: цифры в озвучке`).toBe(false);
        expect(youPast.test(l.text), l.id).toBe(false);
      }
      for (const ch of scene.choices ?? []) for (const re of [youPast, iPast, shortAdj]) expect(re.test(ch.text), ch.id).toBe(false);
    }
    for (const o of c04.objectives) expect(/\d/.test(o.hints[0].text), o.id).toBe(false);
  });
});

// ==================================================================== эталоны

describe("Д4: эталоны проходят по порядку", () => {
  it("каждый эталон засчитывает свою задачу — на старте и на потолке часов", () => {
    for (const base of [db, dbCap]) {
      const completed = new Set<string>();
      for (const o of [...mainObjectives(c04), ...c04.objectives.filter((x) => x.optional)]) {
        const result = run(o.solution, base);
        expect(result.error, `${o.id}: ${result.error}`).toBeNull();
        const ids = checkCaseProgress(c04, result, base, completed).completed.map((c) => c.objectiveId);
        expect(ids, o.id).toContain(o.id);
        expect(ids.filter((id) => !objective(id).optional).length, o.id).toBeLessThanOrEqual(1);
        for (const id of ids) completed.add(id);
      }
      expect(isCaseObjectivesDone(c04, completed)).toBe(true);
    }
  });

  it("эталоны дают одинаковый результат на 10:00 и на 13:00", () => {
    for (const o of c04.objectives) expect(run(o.solution, dbCap).rows, o.id).toEqual(run(o.solution).rows);
  });

  it("эталоны проходят table-guard дела; строгая лестница; < 1 с", () => {
    for (const o of c04.objectives) {
      const t0 = performance.now();
      const r = executeSQL(db, o.solution, c04.tables);
      expect(performance.now() - t0, o.id).toBeLessThan(1000);
      expect(r.error, o.id).toBeNull();
      expect(r.errorKind, o.id).toBeUndefined();
      expect(keywordsOf(o.solution).filter((w) => FUTURE_KEYWORDS.includes(w)), o.id).toEqual([]);
      expect(keywordsOf(o.solution).filter((w) => w === "SELECT").length, `${o.id}: подзапрос`).toBe(1);
    }
    expect(executeSQL(db, "SELECT * FROM cron_jobs", c04.tables).error).not.toBeNull();
  });

  it("предсказания: ответ равен числу строк запроса", () => {
    for (const o of c04.objectives.filter((x) => x.prediction)) {
      const p = o.prediction as NonNullable<CaseObjective["prediction"]>;
      expect(run(p.sql ?? o.solution).rowCount, o.id).toBe(p.answer);
    }
    expect(c04.objectives.filter((x) => x.prediction).map((o) => o.id)).toEqual(["o4_1", "o4_4"]);
  });
});

describe("Д4: альтернативные формулировки засчитываются", () => {
  for (const [id, list] of Object.entries(ALTERNATIVES)) {
    it.each(list)(`${id}: %s`, (sql) => {
      expect(run(sql).error).toBeNull();
      expect(passes(id, sql)).toBe(true);
    });
  }
});

describe("Д4: правдоподобные ошибки не засчитываются", () => {
  for (const [id, list] of Object.entries(MISTAKES)) {
    it.each(list)(`${id}: %s`, (sql) => {
      expect(run(sql).error).toBeNull();
      expect(passes(id, sql)).toBe(false);
    });
  }

  it("ошибок ≥ 2 и альтернатив ≥ 1 на задачу", () => {
    for (const o of c04.objectives) {
      expect(MISTAKES[o.id]?.length ?? 0, o.id).toBeGreaterThanOrEqual(2);
      expect(ALTERNATIVES[o.id]?.length ?? 0, o.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("тетрадь Ирины (уровень 4): запрос с одной ошибкой выполняется и задачу не решает", () => {
    for (const o of c04.objectives) {
      const sql = /(SELECT .*?;)/.exec(o.hints[3].text)?.[1] as string;
      expect(sql, o.id).toBeDefined();
      expect(run(sql).error, o.id).toBeNull();
      expect(passes(o.id, sql), o.id).toBe(false);
    }
  });

  it("примеры МИРЫ (уровень 2) выполняются и задачу не решают", () => {
    for (const o of c04.objectives) {
      const sql = /(SELECT .*?)(?:\. См\.|$)/.exec(o.hints[1].text)?.[1] as string;
      expect(sql, o.id).toBeDefined();
      const r = run(sql);
      expect(r.error, `${o.id}: ${sql}`).toBeNull();
      expect(passes(o.id, sql), o.id).toBe(false);
    }
  });

  it("ловушки дела: COUNT(*) даёт Громову 1, WHERE теряет Громова, ORDER BY id даёт 19.11", () => {
    const star = run(MISTAKES.o4_4[0]);
    expect(star.rows).toContainEqual(["p.gromov", 1]);
    expect(run(MISTAKES.o4_4[1]).rows).toEqual([["i.valts", 214]]);
    const last = run("SELECT ts FROM audit_log WHERE login = 'i.valts' ORDER BY id DESC LIMIT 1").rows[0][0];
    expect(String(last).startsWith("2026-11-19")).toBe(true);
    expect(run("SELECT MAX(ts) FROM audit_log WHERE login = 'i.valts'").rows[0][0]).toBe(C04_ANSWERS.lastAction);
  });
});

// ==================================================================== протокол

describe("Д4: протокол «Вальц И. П. — …»", () => {
  const protocol = () => c04.protocol as NonNullable<CaseDef["protocol"]>;
  const seen = () => {
    const options = new Set<string>();
    const values = new Set<string>();
    for (const o of mainObjectives(c04)) {
      const r = run(o.solution);
      for (const v of scanSeenOptions(protocol(), r)) options.add(v);
      for (const v of scanSeen(r)) values.add(v);
    }
    return { options, values };
  };
  const answers = () => Object.fromEntries(protocol().blanks.map((b) => [b.id, b.answer]));

  it("пропуски по библии: text, text, number, text, text", () => {
    expect(protocol().blanks.map((b) => b.kind)).toEqual(["text", "text", "number", "text", "text"]);
    expect(answers()).toEqual({
      position: C04_ANSWERS.position, login: C04_ANSWERS.login, actions: "214",
      old_time: C04_ANSWERS.oldReportedAt, new_time: C04_ANSWERS.newReportedAt,
    });
  });

  it("ответы находятся scanSeenOptions в результатах основных эталонов; каждый вариант можно увидеть", () => {
    const { options, values } = seen();
    for (const b of protocol().blanks) {
      expect(options.has(b.answer), b.id).toBe(true);
      expect(availableOptions(b, values), b.id).toEqual(b.options);
    }
  });

  it("верные ответы подтверждаются; ложные — нет", () => {
    const ok = checkProtocol(protocol(), answers(), new Set());
    expect(ok.solved).toBe(true);
    const wrong = checkProtocol(protocol(), { ...answers(), actions: "234" }, new Set());
    expect(wrong.solved).toBe(false);
    const swapped = checkProtocol(protocol(), { ...answers(), old_time: C04_ANSWERS.newReportedAt, new_time: C04_ANSWERS.oldReportedAt }, new Set());
    expect(swapped.solved).toBe(false);
    const gromov = checkProtocol(protocol(), { ...answers(), login: "p.gromov", actions: "0" }, new Set());
    expect(gromov.solved).toBe(false);
  });
});

// ==================================================================== посаженные факты

describe("Д4: посаженные факты (разд. 8.4, блок «Д4»)", () => {
  it("staff 64 — Громов П. А., 1550, p.gromov, уволен 2020-01-15", () => {
    expect(rows(world, "SELECT person_id, full_name, login, fired_at FROM staff WHERE id = 64")).toEqual([
      [F.PERSON.gromov, "Громов П. А.", "p.gromov", "2020-01-15"],
    ]);
    expect(GROMOV_STAFF.id).toBe(64);
    expect(one(world, "SELECT COUNT(*) FROM staff WHERE login = 'p.gromov'")).toBe(1);
  });

  it("ровно четыре сотрудника без карточки — опечатки 23/57/91/133, настоящие карточки есть", () => {
    expect(rows(db, "SELECT s.id, s.person_id FROM staff s LEFT JOIN persons p ON p.id = s.person_id WHERE p.id IS NULL ORDER BY s.id"))
      .toEqual(F.STAFF_TYPOS.map((t) => [t.staffId, t.typo]));
    for (const s of TYPO_STAFF) {
      expect(one(world, "SELECT COUNT(*) FROM persons WHERE id = ?", [s.personId]), String(s.personId)).toBe(1);
      expect(one(world, "SELECT COUNT(*) FROM staff WHERE person_id = ?", [s.personId]), String(s.personId)).toBe(0);
    }
  });

  it("logins: test1 и zero — единственные сироты; p.gromov отключён, i.valts — нет", () => {
    expect(rows(db, "SELECT l.login FROM logins l LEFT JOIN staff s ON s.id = l.staff_id WHERE s.id IS NULL ORDER BY l.login"))
      .toEqual([["test1"], ["zero"]]);
    expect(rows(world, "SELECT staff_id, role, created_at, created_by, enabled, last_login_at FROM logins WHERE login = 'test1'"))
      .toEqual([[null, TEST_LOGIN.role, TEST_LOGIN.created_at, TEST_LOGIN.created_by, 0, TEST_LOGIN.last_login_at]]);
    expect(rows(db, "SELECT staff_id, role, created_at, created_by, enabled, last_login_at FROM logins WHERE login = 'zero'"))
      .toEqual([[null, "service", "2015-03-01 00:00:00", "system", 1, "2026-12-11 03:12:00"]]);
    expect(rows(world, "SELECT staff_id, enabled FROM logins WHERE login = 'p.gromov'")).toEqual([[64, 0]]);
    expect(rows(world, "SELECT staff_id, enabled FROM logins WHERE login = 'i.valts'")).toEqual([[118, 1]]);
  });

  it("ЗАГС: в штате умерли ровно двое — Вальц и Громов; в ПБД death_date у них пуста", () => {
    expect(rows(db, `SELECT s.login, z.act_no, z.died_at ${CHAIN} ORDER BY s.login`)).toEqual([
      ["i.valts", "А-2026-0911", "2026-11-18 23:10:00"],
      ["p.gromov", "А-2019-0402", "2019-06-02 04:30:00"],
    ]);
    expect(rows(world, "SELECT death_date FROM persons WHERE id IN (4127, 1550)")).toEqual([[null], [null]]);
  });

  it("аудит к 11.12: 214 действий i.valts после смерти (180 DELETE + 34), у Громова 0; так же на 13:00", () => {
    for (const base of [db, dbCap]) {
      expect(rows(base, "SELECT action = 'DELETE', COUNT(*) FROM audit_log WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00' GROUP BY 1 ORDER BY 1"))
        .toEqual([[0, C04_ANSWERS.nonDelete], [1, 180]]);
      expect(one(base, "SELECT COUNT(*) FROM audit_log WHERE login = 'p.gromov'")).toBe(0);
    }
  });

  it("ключевые строки М5: 2214 обнулена 19.11 02:10, КУСП 4518 23:52 → 22:40, 4127 убрана 21.11 02:31; всё с WS-07", () => {
    expect(rows(db, "SELECT ts, row_id, old_value, new_value FROM audit_log WHERE login = 'i.valts' AND field = 'special_marks' AND row_id = '2214'"))
      .toEqual([["2026-11-19 02:10:00", "2214", "[ПДн скрыто]", null]]);
    expect(rows(db, "SELECT ts, table_name, row_id, old_value, new_value FROM audit_log WHERE login = 'i.valts' AND field = 'reported_at'"))
      .toEqual([["2026-11-20 02:14:00", "incidents", "1615", C04_ANSWERS.oldReportedAt, C04_ANSWERS.newReportedAt]]);
    expect(one(db, "SELECT kusp_no FROM incidents WHERE id = 1615")).toBe(4518);
    expect(rows(db, "SELECT ts, old_value, new_value FROM audit_log WHERE login = 'i.valts' AND table_name = 'incident_persons'"))
      .toEqual([["2026-11-21 02:31:00", "4127", null]]);
    expect(rows(db, "SELECT DISTINCT workstation FROM audit_log WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00'")).toEqual([["WS-07"]]);
  });

  it("★ zero включила Ирина 16.11 22:41 с WS-03 — единственная правка строки zero", () => {
    expect(rows(db, "SELECT ts, login, workstation, field, old_value, new_value FROM audit_log WHERE row_id = 'zero'"))
      .toEqual([["2026-11-16 22:41:00", "i.valts", "WS-03", "enabled", "0", "1"]]);
  });

  it("Мельник — ложный след: сотни легальных UPDATE с WS-IT-01; WS-07 — в серверной Б0-11", () => {
    expect(Number(one(db, "SELECT COUNT(*) FROM audit_log WHERE login = 'k.melnik' AND action = 'UPDATE' AND workstation = 'WS-IT-01'"))).toBeGreaterThan(450);
    expect(one(db, "SELECT room FROM workstations WHERE id = 'WS-07'")).toBe("Б0-11");
  });
});
