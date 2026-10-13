/**
 * Дело № 02 «Минус сорок один» (case-02-minus-41): контент, эталоны, ловушки,
 * протокол, допрос и посаженные факты разд. 8.4 (блок «Д2») — по TECH_SPEC, разд. 5.
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
import { presentMatches } from "@/engine/interrogation";
import type { PinnedCard } from "@/types/case";
import type { InterrogationDef } from "@/types/story";
import { cases, characters, getCase, handbookById } from "@/data";
import { C02_ACCOUNT, C02_ADDRESS, C02_FACTS, C02_FLAT, OLEG_SHORT, SAMOYLOVA_SHORT } from "@/engine/world/plants/c02";
import * as F from "@/engine/world/facts";
import { sharedWorld, one, rows } from "../world/helpers";

const CASE_ID = "case-02-minus-41";

let world: Database;
let bytes: Uint8Array;
/** База дела на старте часов (13:00) и на потолке (16:00) */
let db: Database;
let dbCap: Database;
let c02: CaseDef;

const openAt = (clock: string) =>
  openCaseDatabase(bytes, {
    clock,
    tables: c02.tables,
    patches: [{ id: "p0.player", params: { playerName: "Северов" } }],
  });

beforeAll(async () => {
  ({ db: world, bytes } = await sharedWorld());
  c02 = getCase(CASE_ID) as CaseDef;
  db = await openAt(c02.date);
  dbCap = await openAt(c02.clock?.cap as string);
}, 60_000);

const run = (sql: string, base: Database = db): QueryResult => executeSQL(base, sql, c02.tables);

const objective = (id: string): CaseObjective => {
  const o = c02.objectives.find((x) => x.id === id);
  if (!o) throw new Error(`нет задачи ${id}`);
  return o;
};

function doneBefore(id: string): Set<string> {
  const o = objective(id);
  if (o.optional) return new Set(mainObjectives(c02).map((m) => m.id));
  return new Set(mainObjectives(c02).filter((m) => m.order < o.order).map((m) => m.id));
}

function passes(id: string, sql: string, base: Database = db): boolean {
  const result = run(sql, base);
  const progress = checkCaseProgress(c02, result, base, doneBefore(id));
  return progress.completed.some((c) => c.objectiveId === id);
}

const feedback = (id: string, sql: string): string | null =>
  checkCaseProgress(c02, run(sql), db, doneBefore(id)).activeFeedback;

const ACC = `'${C02_ACCOUNT}'`;

const ALTERNATIVES: Record<string, string[]> = {
  o2_1: [
    "SELECT MIN(ts) AS cold_from FROM heat_readings WHERE flat_id = 'ШХ-12-31' AND temp_c < 12 AND temp_c <> -999;",
    "SELECT ts FROM heat_readings WHERE flat_id = 'ШХ-12-31' AND temp_c BETWEEN 0 AND 11.99 ORDER BY ts LIMIT 1;",
    "select min(ts) from heat_readings where address_id = 811 and temp_c > -999 and temp_c < 12",
  ],
  o2_2: [
    "SELECT MIN(temp_c) AS coldest FROM heat_readings WHERE flat_id = 'ШХ-12-31' AND temp_c > -999;",
    "SELECT temp_c, ts FROM heat_readings WHERE flat_id = 'ШХ-12-31' AND temp_c <> -999 ORDER BY temp_c LIMIT 1;",
    "SELECT ROUND(MIN(temp_c), 1) FROM heat_readings WHERE address_id = 811 AND temp_c IS NOT NULL AND temp_c > -100;",
  ],
  o2_3: [
    `SELECT counterparty, COUNT(*) FROM transactions WHERE account_id = ${ACC} GROUP BY counterparty HAVING COUNT(*) >= 12;`,
    `SELECT counterparty AS who, COUNT(*) AS n, SUM(amount) AS total FROM transactions WHERE account_id = ${ACC} AND amount > 0 GROUP BY counterparty HAVING n >= 12 ORDER BY total DESC;`,
  ],
  o2_4: [
    `SELECT counterparty, MIN(ts) AS first_pay, MAX(ts) AS last_pay FROM transactions WHERE account_id = ${ACC} AND amount > 0 GROUP BY counterparty HAVING COUNT(*) >= 12;`,
    `SELECT MAX(ts) AS last_pay, MIN(ts) AS first_pay, counterparty FROM transactions WHERE account_id = ${ACC} AND amount > 0 AND counterparty IN ('СФР', 'Фонд «Тёплый берег»') GROUP BY counterparty;`,
  ],
  o2_5: [
    `SELECT * FROM transactions WHERE account_id = ${ACC} AND amount < 0 AND ts >= '2026-12-06 23:00:00';`,
    `SELECT ts, amount, counterparty FROM transactions WHERE account_id = ${ACC} AND ts > '2026-12-06 22:50:00' AND amount < 0 ORDER BY ts;`,
    `SELECT ts, amount, counterparty FROM transactions WHERE account_id = ${ACC} AND ts >= '2026-12-07 00:00:00';`,
  ],
  o2_6: [
    "SELECT * FROM intercom_events WHERE address_id = 811 AND ts >= '2026-12-07 00:00:00';",
    "SELECT ts, key_owner, guest_name FROM intercom_events WHERE address_id = 811 AND ts LIKE '2026-12-07%' ORDER BY ts;",
    "SELECT ts, method, key_owner, guest_name FROM intercom_events WHERE address_id = 811 AND ts BETWEEN '2026-12-07 00:00:00' AND '2026-12-07 13:00:00';",
  ],
  o2_1b: [
    "SELECT COUNT(DISTINCT flat_id) FROM heat_readings;",
    "SELECT COUNT(DISTINCT address_id) AS flats FROM heat_readings;",
  ],
  o2_6b: [
    "SELECT * FROM intercom_events WHERE address_id = 811 AND code = '7741';",
    "SELECT ts, guest_name FROM intercom_events WHERE code = 7741 AND address_id = 811;",
  ],
  o2_7: [
    "SELECT * FROM delivery_orders WHERE courier_name = 'Пахомов О. В.' AND accepted_at >= '2026-12-07 00:00:00' ORDER BY accepted_at;",
    "SELECT accepted_at, delivered_at, drop_text FROM delivery_orders WHERE courier_person_id = 2589 AND accepted_at LIKE '2026-12-07%' ORDER BY accepted_at ASC;",
  ],
};

const MISTAKES: Record<string, string[]> = {
  o2_1: [
    // ловушка: сентинел −999 в 14:00
    "SELECT MIN(ts) FROM heat_readings WHERE flat_id = 'ШХ-12-31' AND temp_c < 12;",
    // все строки ниже +12, а не одна
    "SELECT ts FROM heat_readings WHERE flat_id = 'ШХ-12-31' AND temp_c < 12 AND temp_c > -999;",
    // MAX вместо MIN
    "SELECT MAX(ts) FROM heat_readings WHERE flat_id = 'ШХ-12-31' AND temp_c < 12 AND temp_c > -999;",
  ],
  o2_2: [
    "SELECT MIN(temp_c) FROM heat_readings WHERE flat_id = 'ШХ-12-31';",
    "SELECT MIN(temp_c) FROM heat_readings WHERE flat_id = 'ШХ-12-31' AND temp_c <> 999;",
    "SELECT AVG(temp_c) FROM heat_readings WHERE flat_id = 'ШХ-12-31' AND temp_c <> -999;",
  ],
  o2_3: [
    // ловушка: лидер по AVG без порога
    `SELECT counterparty, ROUND(AVG(amount)) AS avg_sum FROM transactions WHERE account_id = ${ACC} AND amount > 0 GROUP BY counterparty ORDER BY avg_sum DESC LIMIT 2;`,
    // без HAVING — все контрагенты
    `SELECT counterparty, COUNT(*) FROM transactions WHERE account_id = ${ACC} GROUP BY counterparty;`,
    // ё/е: LIKE '%Теплый%' — пусто
    `SELECT counterparty, COUNT(*) FROM transactions WHERE account_id = ${ACC} AND (counterparty = 'СФР' OR counterparty LIKE '%Теплый%') GROUP BY counterparty;`,
    // без счёта — весь город
    "SELECT counterparty, COUNT(*) FROM transactions WHERE amount > 0 GROUP BY counterparty HAVING COUNT(*) >= 12;",
  ],
  o2_4: [
    // возврат 07.09 вместо последнего поступления
    `SELECT counterparty, MIN(ts), MAX(ts) FROM transactions WHERE account_id = ${ACC} GROUP BY counterparty HAVING COUNT(*) >= 12;`,
    `SELECT counterparty, MIN(ts), MAX(ts) FROM transactions WHERE account_id = ${ACC} AND amount > 0 GROUP BY counterparty;`,
    `SELECT counterparty, MIN(ts) FROM transactions WHERE account_id = ${ACC} AND amount > 0 GROUP BY counterparty HAVING COUNT(*) >= 12;`,
  ],
  o2_5: [
    // дата вместо момента смерти — утренняя аптека
    `SELECT ts, amount, counterparty FROM transactions WHERE account_id = ${ACC} AND amount < 0 AND ts >= '2026-12-06';`,
    // поступления вместо списаний
    `SELECT ts, amount, counterparty FROM transactions WHERE account_id = ${ACC} AND amount > 0 AND ts >= '2026-12-06 23:00:00';`,
    // сравнение не в ту сторону — вся история до смерти
    `SELECT ts, amount, counterparty FROM transactions WHERE account_id = ${ACC} AND amount < 0 AND ts <= '2026-12-06 23:00:00';`,
    // дата не в ISO — вся история расходов
    `SELECT ts, amount, counterparty FROM transactions WHERE account_id = ${ACC} AND amount < 0 AND ts >= '06.12.2026 23:00';`,
  ],
  o2_6: [
    "SELECT ts, method, key_owner, guest_name FROM intercom_events WHERE address_id = 811 AND ts >= '07.12.2026';",
    "SELECT ts, method, key_owner, guest_name FROM intercom_events WHERE address_id = 811;",
    "SELECT ts, method, key_owner, guest_name FROM intercom_events WHERE ts >= '2026-12-07 00:00:00';",
  ],
  o2_1b: [
    "SELECT COUNT(flat_id) FROM heat_readings;",
    "SELECT DISTINCT flat_id FROM heat_readings;",
    "SELECT COUNT(*) FROM heat_readings;",
  ],
  o2_6b: [
    // ловушка ★: код 7741 в трёх домах
    "SELECT ts, code, guest_name FROM intercom_events WHERE code = '7741';",
    "SELECT ts, code, guest_name FROM intercom_events WHERE address_id = 811 AND method = 'гостевой код';",
  ],
  o2_7: [
    "SELECT accepted_at, delivered_at, drop_text FROM delivery_orders WHERE courier_name = 'Пахомов О.В.' AND accepted_at >= '2026-12-07 00:00:00' ORDER BY accepted_at;",
    "SELECT accepted_at, delivered_at FROM delivery_orders WHERE courier_name = 'Пахомов О. В.' AND accepted_at >= '2026-12-07 00:00:00' ORDER BY delivered_at DESC;",
    "SELECT accepted_at, delivered_at FROM delivery_orders WHERE courier_name = 'Пахомов О. В.' ORDER BY accepted_at;",
  ],
};

/** Уровень 4 («Ирочкина шпаргалка»): одна ошибка — и задача не засчитывается */
const CHEAT_SHEETS: Record<string, string> = {
  o2_1: "SELECT MIN(ts) FROM heat_readings WHERE flat_id = 'ШХ-12-31' AND temp_c < 12;",
  o2_2: "SELECT MIN(temp_c) FROM heat_readings WHERE flat_id = 'ШХ-12-31' AND temp_c <> 999;",
  o2_3: "SELECT counterparty, COUNT(*) AS n, ROUND(AVG(amount)) AS avg_sum FROM transactions WHERE account_id = 'ACC-30518' AND amount > 0 GROUP BY counterparty ORDER BY avg_sum DESC LIMIT 2;",
  o2_4: "SELECT counterparty, MIN(ts) AS first_pay, MAX(ts) AS last_pay FROM transactions WHERE account_id = 'ACC-30518' GROUP BY counterparty HAVING COUNT(*) >= 12;",
  o2_5: "SELECT ts, amount, counterparty FROM transactions WHERE account_id = 'ACC-30518' AND amount < 0 AND ts >= '2026-12-06';",
  o2_6: "SELECT ts, method, key_owner, guest_name FROM intercom_events WHERE address_id = 811 AND ts >= '07.12.2026';",
  o2_1b: "SELECT COUNT(flat_id) FROM heat_readings;",
  o2_6b: "SELECT ts, code, guest_name FROM intercom_events WHERE code = '7741';",
  o2_7: "SELECT accepted_at, delivered_at, drop_text FROM delivery_orders WHERE courier_name = 'Пахомов О.В.' AND accepted_at >= '2026-12-07 00:00:00' ORDER BY accepted_at;",
};

/** Ключевые слова из более поздних дел (строгая лестница, разд. 4.1, п. 8) */
const FUTURE_KEYWORDS = [
  "JOIN", "ON", "LEFT", "INNER", "COALESCE", "IFNULL", "EXISTS", "CASE", "WITH", "UNION", "EXCEPT", "INTERSECT",
  "OVER", "PARTITION", "DATE", "DATETIME", "STRFTIME", "JULIANDAY", "SUBSTR", "LENGTH", "REPLACE", "INSERT",
  "UPDATE", "DELETE",
];
const keywordsOf = (sql: string) =>
  (sql.replace(/'(?:[^']|'')*'/g, "''").match(/[A-Za-z_]+/g) ?? []).map((w) => w.toUpperCase());

// ==================================================================== контент

describe("Д2: контент дела", () => {
  it("validateCaseContent → пусто", () => {
    expect(validateCaseContent(c02, characters, collectEvidenceIds(cases))).toEqual([]);
  });

  it("карточка дела по библии: 07.12 13:00, 1 мин/запрос, потолок 16:00, четыре новые таблицы", () => {
    expect(c02.order).toBe(2);
    expect(c02.act).toBe(1);
    expect(c02.difficulty).toBe("easy");
    expect(c02.date).toBe("2026-12-07 13:00");
    expect(c02.minutesPerQuery).toBe(1);
    expect(c02.clock?.cap).toBe("2026-12-07 16:00");
    expect(c02.newTables).toEqual(["heat_readings", "transactions", "intercom_events", "delivery_orders"]);
    expect(c02.tables).toEqual([...(getCase("case-01-med") as CaseDef).tables, ...(c02.newTables ?? [])]);
    expect(mainObjectives(c02).map((o) => o.id)).toEqual(["o2_1", "o2_2", "o2_3", "o2_4", "o2_5", "o2_6"]);
    expect(c02.objectives.filter((o) => o.optional).map((o) => o.id)).toEqual(["o2_1b", "o2_6b", "o2_7"]);
  });

  it("у каждой задачи 4 подсказки голосами, улика ev.c02.*, эталон; понятия — статьи справочника", () => {
    for (const o of c02.objectives) {
      expect(o.hints.length, o.id).toBe(4);
      for (const h of o.hints) expect(h.by, o.id).toBeDefined();
      expect(o.hints[0].line, o.id).toBe(`hint.c02_${o.id}.001`);
      expect(/\d/.test(o.hints[0].text), `${o.id}: цифры в озвученной наводке`).toBe(false);
      expect(o.evidence?.id, o.id).toMatch(/^ev\.c02\./);
      expect(handbookById.has(o.concept as string), o.id).toBe(true);
    }
    for (const id of c02.concepts) expect(handbookById.has(id), id).toBe(true);
  });

  it("реплики библии стоят на своих id", () => {
    const line = (id: string) => c02.scenes.flatMap((s) => s.lines).find((l) => l.id === id);
    expect(line("c02.intro.003")?.text).toBe("Понимаешь, ни одного градуса впустую. «Глубина» греет город.");
    expect(line("c02.int_oleg.003")).toMatchObject({ speaker: "oleg_pakhomov", text: "Я к тёте неделю не заходил.", lie: true });
    expect(line("c02.int_oleg.004")?.text).toBe("Я с пяти утра заказы возил, без перерыва.");
    expect(line("c02.int_oleg.006")?.text).toBe("С карты кто-то украл.");
    expect(line("c02.int_oleg.009")?.text).toBe("Я вообще-то скорую вызывал.");
    expect(line("c02.fund.003")).toMatchObject({ speaker: "nina", text: "Касса на «Глубина-Строе». Ох." });
    expect(line("c02.outro.003")).toMatchObject({
      speaker: "ratnikov", emotion: "uneasy", text: "Закрывай, коллега. Её никто не убивал. Её просто перестали греть.",
    });
  });

  it("реплики озвучиваемы: ≤ 160 знаков, без цифр у персонажей, без родовых форм к игроку", () => {
    const END = "(?=$|[\\s.,!?…»:;)])";
    const youPast = new RegExp(`(^|[\\s,«(—])ты\\s+(\\S+\\s+)?[а-яё]+(л|ла|лся|лась)${END}`, "i");
    for (const scene of c02.scenes) {
      for (const l of scene.lines) {
        expect(l.text.length, l.id).toBeLessThanOrEqual(160);
        if (l.speaker !== "narrator") expect(/\d/.test(l.text), `${l.id}: цифры в озвучке`).toBe(false);
        expect(youPast.test(l.text), `${l.id}: «ты …л(а)»`).toBe(false);
      }
    }
  });

  it("допрос «Олег»: четыре утверждения библии, шаги neutral → angry → scared, живой запрос", () => {
    const scene = c02.scenes.find((s) => s.id === "int_oleg");
    const int = scene?.interrogation as InterrogationDef;
    expect(int.suspect).toBe("oleg_pakhomov");
    expect(int.liveQuery).toBe(true);
    expect(int.points.map((p) => p.line)).toEqual(["c02.int_oleg.003", "c02.int_oleg.004", "c02.int_oleg.006", "c02.int_oleg.009"]);
    expect([...new Set(int.breakSteps)]).toEqual(["neutral", "angry", "scared"]);
    const done = c02.scenes.find((s) => s.id === int.doneScene);
    expect(done?.lines.map((l) => l.text).slice(0, 2)).toEqual(["Она уже холодная была…", "Деньги ей больше не нужны были."]);
  });
});

// ==================================================================== эталоны

describe("Д2: эталоны проходят по порядку", () => {
  it("каждый эталон засчитывает свою задачу — на старте и на потолке часов", () => {
    for (const base of [db, dbCap]) {
      const completed = new Set<string>();
      for (const o of [...mainObjectives(c02), ...c02.objectives.filter((x) => x.optional)]) {
        const result = run(o.solution, base);
        expect(result.error, `${o.id}: ${result.error}`).toBeNull();
        const ids = checkCaseProgress(c02, result, base, completed).completed.map((c) => c.objectiveId);
        expect(ids, o.id).toContain(o.id);
        for (const id of ids) completed.add(id);
      }
      expect(isCaseObjectivesDone(c02, completed)).toBe(true);
    }
  });

  it("эталоны дают одинаковый результат на 13:00 и на 16:00", () => {
    for (const o of c02.objectives) expect(run(o.solution, dbCap).rows, o.id).toEqual(run(o.solution).rows);
  });

  it("эталоны проходят table-guard дела; persons и accounts закрыты", () => {
    for (const o of c02.objectives) {
      const r = executeSQL(db, o.solution, c02.tables);
      expect(r.error, o.id).toBeNull();
      expect(r.errorKind, o.id).toBeUndefined();
    }
    expect(executeSQL(db, "SELECT * FROM persons WHERE id = 2588", c02.tables).error).not.toBeNull();
    expect(executeSQL(db, "SELECT * FROM accounts", c02.tables).error).not.toBeNull();
  });

  it("строгая лестница: в эталонах нет понятий позже Д2", () => {
    for (const o of c02.objectives) expect(keywordsOf(o.solution).filter((w) => FUTURE_KEYWORDS.includes(w)), o.id).toEqual([]);
  });

  it("каждый эталон быстрее 1 с", () => {
    for (const o of c02.objectives) {
      const t0 = performance.now();
      run(o.solution);
      expect(performance.now() - t0, o.id).toBeLessThan(1000);
    }
  });

  it("предсказания: ответ равен числу строк запроса", () => {
    for (const o of c02.objectives.filter((x) => x.prediction)) {
      const p = o.prediction as NonNullable<CaseObjective["prediction"]>;
      expect(run(p.sql ?? o.solution).rowCount, o.id).toBe(p.answer);
    }
  });
});

describe("Д2: альтернативы засчитываются", () => {
  for (const [id, list] of Object.entries(ALTERNATIVES)) {
    it.each(list)(`${id}: %s`, (sql) => {
      expect(run(sql).error).toBeNull();
      expect(passes(id, sql)).toBe(true);
    });
  }
});

describe("Д2: правдоподобные ошибки не засчитываются", () => {
  for (const [id, list] of Object.entries(MISTAKES)) {
    it.each(list)(`${id}: %s`, (sql) => {
      expect(passes(id, sql)).toBe(false);
    });
  }

  it("ошибок ≥ 2 и альтернатив ≥ 1 на задачу; шпаргалка — с одной ошибкой и не проходит", () => {
    for (const o of c02.objectives) {
      expect(MISTAKES[o.id]?.length ?? 0, o.id).toBeGreaterThanOrEqual(2);
      expect(ALTERNATIVES[o.id]?.length ?? 0, o.id).toBeGreaterThanOrEqual(1);
      expect(o.hints[3].text, o.id).toContain(CHEAT_SHEETS[o.id]);
      expect(passes(o.id, CHEAT_SHEETS[o.id]), o.id).toBe(false);
    }
  });

  it("примеры МИРЫ (уровень 2) выполняются, непусты и задачу не решают", () => {
    for (const o of c02.objectives) {
      const sql = o.hints[1].text.match(/Пример: (SELECT .+?)\. См\./)?.[1];
      expect(sql, o.id).toBeDefined();
      const r = run(sql as string);
      expect(r.error, `${o.id}: ${r.error}`).toBeNull();
      expect(r.rowCount, o.id).toBeGreaterThan(0);
      expect(passes(o.id, sql as string), o.id).toBe(false);
    }
  });

  it("ловушки дела объясняются: сентинел, лидер по AVG, возврат фонда, аптека до смерти", () => {
    expect(feedback("o2_1", MISTAKES.o2_1[0])).toMatch(/−999/);
    expect(feedback("o2_2", MISTAKES.o2_2[0])).toMatch(/не температура/);
    expect(feedback("o2_3", MISTAKES.o2_3[0])).toMatch(/COUNT/);
    expect(feedback("o2_4", MISTAKES.o2_4[0])).toMatch(/возврат/);
    expect(feedback("o2_5", MISTAKES.o2_5[0])).toMatch(/ещё жива/);
  });

  it("ё ≠ е: LIKE '%Теплый%' по её счёту пусто, '%Тёплый%' — 140 строк", () => {
    expect(run(`SELECT * FROM transactions WHERE account_id = ${ACC} AND counterparty LIKE '%Теплый%'`).rowCount).toBe(0);
    expect(run(`SELECT * FROM transactions WHERE account_id = ${ACC} AND counterparty LIKE '%Тёплый%'`).rowCount).toBe(140);
  });
});

// ==================================================================== протокол и допрос

describe("Д2: протокол и допрос", () => {
  const protocol = () => c02.protocol as NonNullable<CaseDef["protocol"]>;
  const seen = () => {
    const options = new Set<string>();
    const values = new Set<string>();
    for (const o of c02.objectives) {
      const r = run(o.solution);
      for (const v of scanSeenOptions(protocol(), r)) options.add(v);
      for (const v of scanSeen(r)) values.add(v);
    }
    return { options, values };
  };

  it("ответы протокола находятся в результатах эталонов; все варианты можно увидеть", () => {
    const { options, values } = seen();
    for (const b of protocol().blanks) {
      expect(options.has(b.answer), b.id).toBe(true);
      expect(availableOptions(b, values), b.id).toEqual(b.options);
    }
    expect(protocol().blanks.map((b) => [b.id, b.kind, b.answer])).toEqual([
      ["key", "text", OLEG_SHORT],
      ["time", "datetime", C02_FACTS.olegKey],
      ["sum", "number", "-38000"],
    ]);
  });

  it("верные ответы подтверждаются пачкой из трёх; один неверный — ничего", () => {
    const ok = checkProtocol(protocol(), { key: OLEG_SHORT, time: C02_FACTS.olegKey, sum: "-38000" }, new Set());
    expect(ok.solved).toBe(true);
    expect(ok.newlyConfirmed).toEqual(["key", "time", "sum"]);
    for (const wrong of [
      { key: SAMOYLOVA_SHORT, time: C02_FACTS.olegKey, sum: "-38000" },
      { key: OLEG_SHORT, time: C02_FACTS.sbp.ts, sum: "-38000" },
      { key: OLEG_SHORT, time: C02_FACTS.olegKey, sum: "-340" },
    ]) {
      expect(checkProtocol(protocol(), wrong, new Set()).newlyConfirmed).toEqual([]);
    }
  });

  it("карточки живого запроса пробивают утверждения Олега", () => {
    const int = c02.scenes.find((s) => s.id === "int_oleg")?.interrogation as InterrogationDef;
    const card = (table: string, sql: string): PinnedCard => {
      const r = run(sql);
      expect(r.rowCount, sql).toBe(1);
      return { id: sql, table, columns: r.columns, values: r.rows[0] as PinnedCard["values"], sourceClass: "mirror_siyanie" };
    };
    const cards = {
      "c02.int_oleg.003": card("intercom_events", "SELECT ts, key_owner FROM intercom_events WHERE address_id = 811 AND ts = '2026-12-07 06:30:00'"),
      "c02.int_oleg.004": card("delivery_orders", "SELECT accepted_at, delivered_at, drop_text FROM delivery_orders WHERE delivered_at = '2026-12-07 06:24:00'"),
      "c02.int_oleg.006": card("transactions", `SELECT ts, amount, counterparty FROM transactions WHERE account_id = ${ACC} AND amount = -38000`),
      "c02.int_oleg.009": card("incidents", "SELECT reported_at, applicant_text FROM incidents WHERE id = 1735"),
    };
    for (const p of int.points) {
      const present = p.present as NonNullable<typeof p.present>;
      expect(presentMatches(present, { cards: [cards[p.line as keyof typeof cards]] }), p.line).toBe(true);
      // карточка другого утверждения не пробивает
      const other = Object.entries(cards).find(([k]) => k !== p.line)?.[1] as PinnedCard;
      expect(presentMatches(present, { cards: [other] }), p.line).toBe(false);
    }
  });
});

// ==================================================================== посаженные факты

describe("Д2: посаженные факты (разд. 8.4, блок «Д2»)", () => {
  it("addresses 811 — Шахтная, 12-31; прописана там только Пахомова", () => {
    expect(rows(world, "SELECT district, street, house, apt FROM addresses WHERE id = 811")).toEqual([["Шахтный", "Шахтная", "12", "31"]]);
    expect(rows(world, "SELECT person_id FROM registrations WHERE address_id = 811")).toEqual([[F.PERSON.pakhomova]]);
    expect(one(world, "SELECT COUNT(*) FROM addresses WHERE street = 'Шахтная' AND house = '12' AND apt = '31'")).toBe(1);
  });

  it("heat_readings: 864 строки, 6 квартир по 144; ряд ШХ-12-31 по библии", () => {
    expect(one(world, "SELECT COUNT(*) FROM heat_readings")).toBe(864);
    expect(rows(world, "SELECT COUNT(*), COUNT(DISTINCT flat_id), MIN(ts), MAX(ts) FROM heat_readings")[0]).toEqual([864, 6, "2026-12-06 00:00:00", "2026-12-07 23:40:00"]);
    expect(rows(world, "SELECT COUNT(*), MIN(address_id), MAX(address_id) FROM heat_readings WHERE flat_id = ?", [C02_FLAT])[0]).toEqual([144, 811, 811]);
    expect(rows(world, "SELECT ts FROM heat_readings WHERE flat_id = ? AND temp_c = -999 ORDER BY ts", [C02_FLAT]).map((r) => r[0])).toEqual([...C02_FACTS.sentinel]);
    expect(one(world, "SELECT MIN(ts) FROM heat_readings WHERE flat_id = ? AND temp_c < 12 AND temp_c > -999", [C02_FLAT])).toBe(C02_FACTS.below12);
    expect(rows(world, "SELECT ts, temp_c FROM heat_readings WHERE flat_id = ? AND temp_c > -999 ORDER BY temp_c LIMIT 2", [C02_FLAT])[0]).toEqual([C02_FACTS.minAt, 4.1]);
    expect(one(world, "SELECT COUNT(*) FROM heat_readings WHERE flat_id = ? AND temp_c = 4.1", [C02_FLAT])).toBe(1);
    // с 10:00 07.12 нагрев: каждая точка теплее минимума
    expect(one(world, "SELECT MIN(temp_c) FROM heat_readings WHERE flat_id = ? AND ts >= '2026-12-07 10:00:00'", [C02_FLAT])).toBeGreaterThan(4.1);
  });

  it("incidents 1735 — первый вызов 07.12 11:04, соцработница; других вызовов по адресу нет", () => {
    expect(rows(world, "SELECT reported_at, district, kind, applicant_text FROM incidents WHERE id = 1735")[0]).toEqual([
      C02_FACTS.firstCall, "Шахтный", "сообщение гражданина", "Самойлова Т. Н. (соцработник)",
    ]);
    expect(String(one(world, "SELECT description FROM incidents WHERE id = 1735"))).toContain("Пахомова З. П., Шахтная, 12-31");
    expect(one(world, "SELECT COUNT(*) FROM incidents WHERE address_text LIKE 'Шахтная, 12%' AND reported_at LIKE '2026-12-07%'")).toBe(1);
  });

  it("transactions ACC-30518: фонд 139 × 7 000 + возврат, СФР 48, УК 25 000, после смерти ровно два списания", () => {
    const by = (sql: string) => rows(world, sql, [C02_ACCOUNT]);
    expect(by("SELECT COUNT(*), SUM(amount), MIN(ts), MAX(ts) FROM transactions WHERE account_id = ? AND counterparty = 'Фонд «Тёплый берег»' AND amount > 0")[0].slice(0, 2)).toEqual([139, 973000]);
    expect(by("SELECT ts, amount FROM transactions WHERE account_id = ? AND counterparty = 'Фонд «Тёплый берег»' AND amount < 0")).toEqual([["2026-09-07 11:16:42", -7000]]);
    const sfr = by("SELECT COUNT(*), MIN(ts), MAX(ts) FROM transactions WHERE account_id = ? AND counterparty = 'СФР'")[0];
    expect(sfr[0]).toBe(48);
    expect(String(sfr[1]).slice(0, 10)).toBe("2023-01-04");
    expect(String(sfr[2]).slice(0, 10)).toBe("2026-12-04");
    expect(by("SELECT ts, amount FROM transactions WHERE account_id = ? AND counterparty = 'УК «Шахтный»'")).toEqual([[C02_FACTS.ukRecalc.ts, 25000]]);
    expect(by("SELECT ts, amount, counterparty, channel FROM transactions WHERE account_id = ? AND amount < 0 AND ts >= '2026-12-06 23:00:00' ORDER BY ts")).toEqual([
      [C02_FACTS.sbp.ts, -38000, OLEG_SHORT, "СБП"],
      [C02_FACTS.lapa.ts, -340, "Зоомагазин «Лапа»", "карта"],
    ]);
    // регулярных (≥ 12) — ровно двое; по AVG без порога лидирует УК
    expect(by("SELECT counterparty FROM transactions WHERE account_id = ? AND amount > 0 GROUP BY counterparty HAVING COUNT(*) >= 12 ORDER BY counterparty").map((r) => r[0])).toEqual(["СФР", "Фонд «Тёплый берег»"]);
    expect(by("SELECT counterparty FROM transactions WHERE account_id = ? AND amount > 0 GROUP BY counterparty ORDER BY AVG(amount) DESC LIMIT 1")[0][0]).toBe("УК «Шахтный»");
    // МФО «Деньги Сразу» — у других клиентов (понадобится в Д8)
    expect(Number(one(world, "SELECT COUNT(DISTINCT account_id) FROM transactions WHERE counterparty = 'МФО «Деньги Сразу»'"))).toBeGreaterThan(5);
  });

  it("intercom_events: код 7741 ровно в трёх домах; у 811 — «Вальц И.»; утро 07.12 — Олег 06:30 и Самойлова 11:02", () => {
    expect(rows(world, "SELECT ts, address_id, guest_name FROM intercom_events WHERE code = '7741' ORDER BY ts")).toEqual([
      [C02_FACTS.valtsGuest, C02_ADDRESS.pakhomova, "Вальц И."],
      ["2026-09-14 19:12:00", C02_ADDRESS.code7741a, null],
      ["2026-10-02 17:55:00", C02_ADDRESS.code7741b, null],
    ]);
    expect(rows(world, "SELECT ts, method, key_owner, guest_name FROM intercom_events WHERE address_id = 811 AND ts >= '2026-12-07 00:00:00' ORDER BY ts")).toEqual([
      [C02_FACTS.olegKey, "ключ жильца", OLEG_SHORT, null],
      [C02_FACTS.samoylova, "гостевой код", null, SAMOYLOVA_SHORT],
    ]);
    expect(one(world, "SELECT COUNT(*) FROM intercom_events WHERE guest_name = 'Вальц И.'")).toBe(1);
  });

  it("delivery_orders: курьер 2589, 07.12 — 05:52 → 06:24 «Шахтная, 10», следующий в 07:05; минуты 06:24 и 07:05 — только его", () => {
    expect(rows(world, "SELECT accepted_at, delivered_at, drop_text FROM delivery_orders WHERE courier_person_id = 2589 AND accepted_at >= '2026-12-07 05:30:00' AND accepted_at < '2026-12-07 07:30:00' ORDER BY accepted_at")).toEqual([
      [C02_FACTS.delivery.accepted, C02_FACTS.delivery.delivered, C02_FACTS.delivery.drop],
      [C02_FACTS.delivery.next, "2026-12-07 07:38:00", "Мира, 12-44"],
    ]);
    expect(one(world, "SELECT COUNT(*) FROM delivery_orders WHERE delivered_at LIKE '2026-12-07 06:24%' OR accepted_at LIKE '2026-12-07 07:05%'")).toBe(2);
    expect(one(world, "SELECT COUNT(DISTINCT courier_name) FROM delivery_orders WHERE courier_person_id = 2589")).toBe(1);
    expect(one(world, "SELECT COUNT(*) FROM delivery_orders WHERE accepted_at < '2026-12-07 07:00:00' AND accepted_at >= '2026-12-07 05:00:00' AND courier_person_id <> 2589")).toBe(0);
  });
});
