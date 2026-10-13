/**
 * Д6 «Полынья» (case-06-polynya): контент, эталоны, ловушки, протокол,
 * допрос «Приснилось» и посаженные факты разд. 8.4 (блок «Д6») — по TECH_SPEC, разд. 5.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { Database } from "sql.js";
import {
  cardMatches,
  checkCaseProgress,
  checkProtocol,
  collectEvidenceIds,
  executeSQL,
  isCaseObjectivesDone,
  mainObjectives,
  openCaseDatabase,
  scanSeenOptions,
  validateCaseContent,
  type CaseDef,
  type CaseObjective,
  type PinnedCard,
  type QueryResult,
} from "@/engine";
import { cases, characters, getCase, handbookById } from "@/data";
import { BEREGOVAYA_4, DIVER_REPORT, KIM_PORTOVAYA, MORGUE_SAZONOV, NIGHT_RESIDENTS } from "@/engine/world/plants/c06";
import * as F from "@/engine/world/facts";
import { sharedWorld, one, rows } from "../world/helpers";

const CASE_ID = "case-06-polynya";

let world: Database;
let bytes: Uint8Array;
let db: Database;
let dbCap: Database;
let c06: CaseDef;

const openAt = (clock: string) =>
  openCaseDatabase(bytes, { clock, tables: c06.tables, patches: [{ id: "p0.player", params: { playerName: "Северов" } }] });

beforeAll(async () => {
  ({ db: world, bytes } = await sharedWorld());
  c06 = getCase(CASE_ID) as CaseDef;
  db = await openAt(c06.date);
  dbCap = await openAt(c06.clock?.cap as string);
}, 60_000);

const run = (sql: string, base: Database = db): QueryResult => executeSQL(base, sql, c06.tables);

const objective = (id: string): CaseObjective => {
  const o = c06.objectives.find((x) => x.id === id);
  if (!o) throw new Error(`нет задачи ${id}`);
  return o;
};

function doneBefore(id: string): Set<string> {
  const o = objective(id);
  if (o.optional) return new Set(mainObjectives(c06).map((m) => m.id));
  return new Set(mainObjectives(c06).filter((m) => m.order < o.order).map((m) => m.id));
}

function passes(id: string, sql: string, base: Database = db): boolean {
  const progress = checkCaseProgress(c06, run(sql, base), base, doneBefore(id));
  return progress.completed.some((c) => c.objectiveId === id);
}

// ------------------------------------------------------------------ альтернативы и ошибки

const ALTERNATIVES: Record<string, string[]> = {
  o6_1: [
    "SELECT MIN(date(ts)) FROM outfall_temp WHERE temp_c < 1;",
    "SELECT date(ts) AS d, MIN(temp_c) FROM outfall_temp WHERE ts >= '2026-12-01 00:00:00' GROUP BY d HAVING MIN(temp_c) < 1;",
    "SELECT strftime('%Y-%m-%d', ts) AS day FROM outfall_temp WHERE temp_c < 1 ORDER BY ts LIMIT 1;",
  ],
  o6_2: [
    "SELECT strftime('%Y', ts) y, MIN(temp_c) m FROM outfall_temp GROUP BY y;",
    "SELECT MIN(temp_c) AS минимум, strftime('%Y', ts) AS год, COUNT(*) FROM outfall_temp GROUP BY 2 ORDER BY 2 DESC;",
  ],
  o6_3: [
    "SELECT * FROM vehicles WHERE plate = 'Т117АУ';",
    "SELECT owner_name FROM vehicles WHERE plate = 'Т117АУ';",
    "SELECT v.plate, p.full_name FROM vehicles v JOIN persons p ON p.id = v.owner_person_id WHERE v.plate = 'Т117АУ';",
  ],
  o6_4: [
    // естественный вариант без date(): 20,0014 дня — допуск ±1
    "SELECT d.doc_no, d.signed_at, p.full_name, sqrt((o.x_m-i.x_m)*(o.x_m-i.x_m)+(o.y_m-i.y_m)*(o.y_m-i.y_m)) AS было_м, sqrt((d.x_m-i.x_m)*(d.x_m-i.x_m)+(d.y_m-i.y_m)*(d.y_m-i.y_m)) AS стало_м, julianday(d.signed_at) - julianday(i.reported_at) AS дней FROM construction_docs d JOIN construction_docs o ON o.id = d.supersedes_doc_id JOIN persons p ON p.id = d.signed_by_person_id JOIN incidents i ON i.id = 7 WHERE d.subject LIKE 'Перенос оголовка%';",
    "SELECT p.full_name AS who, d.signed_at AS dt, d.doc_no AS doc, round(sqrt((d.x_m-i.x_m)*(d.x_m-i.x_m)+(d.y_m-i.y_m)*(d.y_m-i.y_m))) AS new_m, round(sqrt((o.x_m-i.x_m)*(o.x_m-i.x_m)+(o.y_m-i.y_m)*(o.y_m-i.y_m))) AS old_m, round(julianday(d.signed_at) - julianday(i.reported_at)) AS days FROM incidents i, construction_docs d JOIN construction_docs o ON d.supersedes_doc_id = o.id JOIN persons p ON d.signed_by_person_id = p.id WHERE i.id = 7 AND d.id = 104;",
  ],
  o6_5: [
    "SELECT p.full_name FROM persons p JOIN registrations r ON r.person_id = p.id WHERE r.address_id = 512 AND r.from_date <= '2015-02-20' AND (r.to_date IS NULL OR r.to_date >= '2015-02-19');",
    "SELECT person_id FROM registrations WHERE address_id IN (SELECT id FROM addresses WHERE street = 'Береговая' AND house = '4') AND from_date <= '2015-02-19' AND COALESCE(to_date, '9999-12-31') >= '2015-02-20';",
  ],
  o6_3b: [
    "SELECT * FROM diver_reports WHERE report_date = '2018-07-14';",
    "SELECT report_date, note, checked_by FROM diver_reports WHERE note LIKE '%кузов%';",
  ],
  o6_5b: [
    "SELECT g.*, p.room, p.holder_person_id FROM gs_comms_2015 g JOIN gs_phonebook p ON p.ext = g.from_ext WHERE g.from_ext = '2-14';",
    "SELECT c.to_number, s.text, pb.room FROM gs_comms_2015 c JOIN gs_comms_2015 s ON s.from_ext = c.from_ext AND s.kind = 'sms' AND abs(s.ts_unix - c.ts_unix) <= 900 JOIN gs_phonebook pb ON pb.ext = c.from_ext WHERE c.kind = 'call' AND datetime(c.ts_unix, 'unixepoch', '+3 hours') BETWEEN '2015-02-19 21:00:00' AND '2015-02-19 22:00:00';",
  ],
  o6_0a: [
    "SELECT c.name FROM cameras c WHERE NOT EXISTS (SELECT 1 FROM plate_reads r WHERE r.camera_id = c.id AND date(r.read_at) = '2026-12-16');",
  ],
  o6_0b: [
    "SELECT COUNT(*) AS n, district FROM incidents WHERE date(reported_at) = '2026-12-16' GROUP BY district;",
  ],
};

const MISTAKES: Record<string, string[]> = {
  o6_1: [
    // ловушка: GROUP BY ts — не сутки, а момент
    "SELECT ts, MIN(temp_c) FROM outfall_temp GROUP BY ts HAVING MIN(temp_c) < 1 ORDER BY ts LIMIT 1;",
    "SELECT date(ts) AS день, MIN(temp_c) FROM outfall_temp GROUP BY date(ts) HAVING MIN(temp_c) < 0 ORDER BY день LIMIT 1;",
    "SELECT date(ts) AS день, MIN(temp_c) FROM outfall_temp GROUP BY date(ts) ORDER BY день;",
  ],
  o6_2: [
    "SELECT strftime('%Y', ts) AS год, MIN(temp_c) FROM outfall_temp WHERE ts < '2026-12-01 00:00:00' GROUP BY год;",
    "SELECT strftime('%Y', ts) AS год, MIN(temp_c) FROM outfall_temp;",
    "SELECT date(ts) AS год, MIN(temp_c) FROM outfall_temp GROUP BY date(ts);",
  ],
  o6_3: [
    "SELECT * FROM vehicles WHERE plate = 'т117ау';",
    "SELECT full_name FROM persons WHERE id = 1388;",
  ],
  o6_4: [
    // «оголовок сброса» есть только в теме ПД-117 (у изм.3 — «оголовка»), а у ПД-117 нет прежнего документа
    "SELECT d.doc_no, d.signed_at, p.full_name, sqrt((o.x_m-i.x_m)*(o.x_m-i.x_m)+(o.y_m-i.y_m)*(o.y_m-i.y_m)) AS было_м, sqrt((d.x_m-i.x_m)*(d.x_m-i.x_m)+(d.y_m-i.y_m)*(d.y_m-i.y_m)) AS стало_м, julianday(d.signed_at) - julianday(date(i.reported_at)) AS дней FROM construction_docs d JOIN construction_docs o ON o.id = d.supersedes_doc_id JOIN persons p ON p.id = d.signed_by_person_id JOIN incidents i ON i.id = 7 WHERE d.subject LIKE '%Оголовок сброса%';",
    // не та строка 2015 года
    "SELECT d.doc_no, d.signed_at, p.full_name, sqrt((o.x_m-i.x_m)*(o.x_m-i.x_m)+(o.y_m-i.y_m)*(o.y_m-i.y_m)) AS было_м, sqrt((d.x_m-i.x_m)*(d.x_m-i.x_m)+(d.y_m-i.y_m)*(d.y_m-i.y_m)) AS стало_м, julianday(d.signed_at) - julianday(date(i.reported_at)) AS дней FROM construction_docs d JOIN construction_docs o ON o.id = d.supersedes_doc_id JOIN persons p ON p.id = d.signed_by_person_id JOIN incidents i ON i.id = 6 WHERE d.id = 104;",
    // дни от ПД-117, а не от строки 7
    "SELECT d.doc_no, d.signed_at, p.full_name, sqrt((o.x_m-i.x_m)*(o.x_m-i.x_m)+(o.y_m-i.y_m)*(o.y_m-i.y_m)) AS было_м, sqrt((d.x_m-i.x_m)*(d.x_m-i.x_m)+(d.y_m-i.y_m)*(d.y_m-i.y_m)) AS стало_м, julianday(d.signed_at) - julianday(o.signed_at) AS дней FROM construction_docs d JOIN construction_docs o ON o.id = d.supersedes_doc_id JOIN persons p ON p.id = d.signed_by_person_id JOIN incidents i ON i.id = 7 WHERE d.id = 104;",
    // все ревизии ПД-117 — ложный след
    "SELECT d.doc_no, d.signed_at, p.full_name, sqrt((o.x_m-i.x_m)*(o.x_m-i.x_m)+(o.y_m-i.y_m)*(o.y_m-i.y_m)) AS было_м, sqrt((d.x_m-i.x_m)*(d.x_m-i.x_m)+(d.y_m-i.y_m)*(d.y_m-i.y_m)) AS стало_м, julianday(d.signed_at) - julianday(date(i.reported_at)) AS дней FROM construction_docs d JOIN construction_docs o ON o.id = d.supersedes_doc_id JOIN persons p ON p.id = d.signed_by_person_id JOIN incidents i ON i.id = 7 WHERE d.doc_no LIKE 'ПД-117%';",
  ],
  o6_5: [
    // без даты: Лосева и Кузьмин в списке
    "SELECT p.id, p.full_name FROM registrations r JOIN persons p ON p.id = r.person_id WHERE r.address_id = 512;",
    // только начало периода: Лосева уехала до той ночи
    "SELECT p.id, p.full_name FROM registrations r JOIN persons p ON p.id = r.person_id WHERE r.address_id = 512 AND r.from_date <= '2015-02-19';",
    // по фамилии: однофамилица с Портовой и чужие Ким
    "SELECT id, full_name FROM persons WHERE last_name = 'Ким';",
  ],
  o6_3b: [
    "SELECT * FROM diver_reports;",
    "SELECT * FROM diver_reports WHERE note LIKE '%металлолом%' AND report_date < '2018-01-01';",
  ],
  o6_5b: [
    "SELECT * FROM gs_comms_2015 WHERE text LIKE '%ЕДЕТ%';",
    // ловушка UTC: окно 21:00–22:00 без '+3 hours' пустое
    "SELECT c.to_number, s.text, pb.room FROM gs_comms_2015 c JOIN gs_comms_2015 s ON s.from_ext = c.from_ext AND s.kind = 'sms' AND s.ts_unix BETWEEN c.ts_unix AND c.ts_unix + 900 JOIN gs_phonebook pb ON pb.ext = c.from_ext WHERE c.kind = 'call' AND datetime(c.ts_unix, 'unixepoch') BETWEEN '2015-02-19 21:00:00' AND '2015-02-19 22:00:00';",
  ],
  o6_0a: [
    // условие на правую таблицу в WHERE превращает LEFT в INNER
    "SELECT c.id, c.name FROM cameras c LEFT JOIN plate_reads r ON r.camera_id = c.id WHERE date(r.read_at) = '2026-12-16' AND r.id IS NULL;",
    "SELECT c.id, c.name FROM cameras c LEFT JOIN plate_reads r ON r.camera_id = c.id WHERE r.id IS NULL;",
  ],
  o6_0b: [
    "SELECT district, COUNT(*) FROM incidents GROUP BY district;",
    "SELECT district, COUNT(*) FROM incidents WHERE reported_at = '2026-12-16' GROUP BY district;",
  ],
};

/** Уровень 4 («тетрадь Ирины») — ровно одна ошибка: задача не засчитывается */
const NOTEBOOK: Record<string, string> = {
  o6_1: "SELECT date(ts) AS день, MIN(temp_c) AS минимум FROM outfall_temp GROUP BY ts HAVING MIN(temp_c) < 1 ORDER BY день;",
  o6_2: "SELECT strftime('%m', ts) AS год, MIN(temp_c) AS минимум FROM outfall_temp GROUP BY год ORDER BY год;",
  o6_3: "SELECT plate, make, model, year, owner_name FROM vehicles WHERE plate = 'T117AY';",
  o6_5: "SELECT p.id, p.full_name, r.from_date, r.to_date FROM registrations r JOIN addresses a ON a.id = r.address_id JOIN persons p ON p.id = r.person_id WHERE a.street = 'Береговая' AND a.house = '4' AND r.from_date <= '2015-02-19' AND r.to_date >= '2015-02-20';",
  o6_3b: "SELECT report_date, location, note, checked_by FROM diver_reports WHERE note LIKE 'машин%';",
};

/** Ключевые слова поздних дел (строгая лестница, разд. 4.1, п. 8) */
const FUTURE_KEYWORDS = [
  "WITH", "RECURSIVE", "UNION", "EXCEPT", "INTERSECT", "OVER", "PARTITION", "ROW_NUMBER", "RANK", "DENSE_RANK",
  "LAG", "LEAD", "GROUP_CONCAT", "SUBSTR", "INSTR", "TRIM", "REPLACE", "GLOB", "HEX", "INSERT", "UPDATE", "DELETE",
];
const keywordsOf = (sql: string) =>
  (sql.replace(/'(?:[^']|'')*'/g, "''").match(/[A-Za-z_]+/g) ?? []).map((w) => w.toUpperCase());

// ------------------------------------------------------------------ контент

describe("Д6: контент дела", () => {
  it("validateCaseContent → пусто", () => {
    expect(validateCaseContent(c06, characters, collectEvidenceIds(cases))).toEqual([]);
  });

  it("карточка по библии: 17.12 08:40, 1 мин/запрос, потолок 12:00, семь новых таблиц", () => {
    expect(c06.order).toBe(6);
    expect(c06.act).toBe(2);
    expect(c06.difficulty).toBe("medium");
    expect(c06.date).toBe("2026-12-17 08:40");
    expect(c06.minutesPerQuery).toBe(1);
    expect(c06.clock?.cap).toBe("2026-12-17 12:00");
    expect(c06.newTables).toEqual(["outfall_temp", "construction_docs", "registrations", "addresses", "diver_reports", "gs_comms_2015", "gs_phonebook"]);
    for (const t of c06.newTables ?? []) expect(c06.tables).toContain(t);
    expect(mainObjectives(c06).map((o) => o.id)).toEqual(["o6_1", "o6_2", "o6_3", "o6_4", "o6_5"]);
    expect(c06.objectives.filter((o) => o.optional).map((o) => o.id).sort()).toEqual(["o6_0a", "o6_0b", "o6_3b", "o6_5b"]);
  });

  it("подсказки голосами, эталоны, улики; concepts — статьи справочника", () => {
    for (const o of c06.objectives) {
      expect(o.hints.length, o.id).toBeGreaterThanOrEqual(3);
      for (const h of o.hints) expect(h.by, o.id).toBeDefined();
      expect(o.solution.trim(), o.id).not.toBe("");
      if (o.concept) expect(handbookById.has(o.concept), o.id).toBe(true);
      if (!o.id.startsWith("o6_0")) expect(o.evidence?.id, o.id).toMatch(/^ev\.c06\./);
    }
    for (const id of c06.concepts) expect(handbookById.has(id), id).toBe(true);
  });

  it("реплики библии стоят на своих id", () => {
    const line = (id: string) => c06.scenes.flatMap((s) => s.lines).find((l) => l.id === id);
    expect(line("c06.shore.001")).toMatchObject({ speaker: "valentina", emotion: "hurt" });
    expect(line("c06.shore.004")).toMatchObject({ speaker: "valentina", text: "Она с четырёх лет акростихи писала." });
    expect(line("c06.dream.003")?.text).toBe("Я в Створе не жила.");
    expect(line("c06.dream.005")?.text).toBe("В ту ночь я спала.");
    expect(line("c06.dream.007")?.text).toBe("Папа ни про какие машины не говорил.");
    expect(line("c06.dream_break.001")?.text).toBe("Это я его разбудила. Фары под водой.");
    expect(line("c06.dream_break.002")?.text).toBe("А потом дядя Лёва сказал — приснилось.");
    expect(line("c06.intro.003")?.text).toBe("Понимаешь, лёд — это тоже прогресс.");
    const shore = c06.scenes.find((s) => s.id === "shore");
    expect(shore?.outdoor).toBe(true);
  });

  it("реплики озвучиваемы: ≤ 160 знаков, без цифр у персонажей, без родовых форм к игроку", () => {
    const END = "(?=$|[\\s.,!?…»:;)])";
    const youPast = new RegExp(`(^|[\\s,«(—])ты\\s+(\\S+\\s+)?[а-яё]+(л|ла|лся|лась)${END}`, "i");
    const iPast = new RegExp(`(^|[\\s,«(—])я\\s+(\\S+\\s+)?[а-яё]+(л|ла|лся|лась)${END}`, "i");
    const shortAdj = new RegExp(`(^|[\\s,«(—])(готов|готова|рад|рада|должен|должна|уверен|уверена)${END}`, "i");
    for (const scene of c06.scenes) {
      for (const l of scene.lines) {
        expect(l.text.length, l.id).toBeLessThanOrEqual(160);
        if (l.speaker !== "narrator") expect(/\d/.test(l.text), `${l.id}: цифры в озвучке`).toBe(false);
        expect(youPast.test(l.text), `${l.id}: «ты …л(а)»`).toBe(false);
      }
      for (const ch of scene.choices ?? []) {
        for (const re of [youPast, iPast, shortAdj]) expect(re.test(ch.text), ch.id).toBe(false);
      }
    }
  });

  it("«Приснилось»: союзник без терпения, три утверждения, флаг выбора dasha_knows_burial", () => {
    const dream = c06.scenes.find((s) => s.id === "dream");
    expect(dream?.interrogation).toMatchObject({ suspect: "dasha", mode: "ally", trustFlag: "dasha_trust" });
    expect(dream?.interrogation?.points.map((p) => p.line)).toEqual(["c06.dream.003", "c06.dream.005", "c06.dream.007"]);
    expect(objective("o6_5").sceneAfter).toBe("dream_open");
    const flags = c06.scenes.flatMap((s) => s.choices ?? []).map((c) => c.flag).filter(Boolean);
    expect(flags).toContain("dasha_knows_burial");
  });
});

// ------------------------------------------------------------------ эталоны

describe("Д6: эталоны проходят по порядку", () => {
  it("каждый эталон засчитывает свою задачу — на старте и на потолке часов", () => {
    for (const base of [db, dbCap]) {
      const completed = new Set<string>();
      for (const o of [...mainObjectives(c06), ...c06.objectives.filter((x) => x.optional)]) {
        const result = run(o.solution, base);
        expect(result.error, `${o.id}: ${result.error}`).toBeNull();
        const ids = checkCaseProgress(c06, result, base, completed).completed.map((c) => c.objectiveId);
        expect(ids, o.id).toContain(o.id);
        for (const id of ids) completed.add(id);
      }
      expect(isCaseObjectivesDone(c06, completed)).toBe(true);
    }
  });

  it("эталоны проходят table-guard этого дела; закрытые таблицы — отказ", () => {
    for (const o of c06.objectives) {
      const r = executeSQL(db, o.solution, c06.tables);
      expect(r.error, o.id).toBeNull();
      expect(r.errorKind, o.id).toBeUndefined();
    }
    expect(executeSQL(db, "SELECT * FROM properties", c06.tables).error).not.toBeNull();
  });

  it("строгая лестница: в эталонах нет понятий поздних дел", () => {
    for (const o of c06.objectives) {
      expect(keywordsOf(o.solution).filter((w) => FUTURE_KEYWORDS.includes(w)), o.id).toEqual([]);
    }
  });

  it("каждый эталон быстрее 1 с", () => {
    for (const o of c06.objectives) {
      const t0 = performance.now();
      run(o.solution);
      expect(performance.now() - t0, o.id).toBeLessThan(1000);
    }
  });
});

describe("Д6: альтернативные формулировки засчитываются", () => {
  for (const [id, list] of Object.entries(ALTERNATIVES)) {
    it.each(list)(`${id}: %s`, (sql) => {
      expect(run(sql).error).toBeNull();
      expect(passes(id, sql)).toBe(true);
    });
  }
});

describe("Д6: правдоподобные ошибки не засчитываются", () => {
  for (const [id, list] of Object.entries(MISTAKES)) {
    it.each(list)(`${id}: %s`, (sql) => {
      expect(passes(id, sql)).toBe(false);
    });
  }

  it("ошибок не меньше двух на задачу, альтернатив — не меньше одной", () => {
    for (const o of c06.objectives) {
      expect(MISTAKES[o.id]?.length ?? 0, o.id).toBeGreaterThanOrEqual(2);
      expect(ALTERNATIVES[o.id]?.length ?? 0, o.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("тетрадь Ирины (уровень 4) — с одной ошибкой и не засчитывается", () => {
    for (const [id, sql] of Object.entries(NOTEBOOK)) {
      expect(objective(id).hints[3].text, id).toContain(sql);
      expect(passes(id, sql), id).toBe(false);
    }
    const o64 = objective("o6_4").hints[3].text;
    expect(o64).toContain("o.id = d.id");
    expect(passes("o6_4", o64.slice(o64.indexOf("SELECT"), o64.indexOf(";") + 1))).toBe(false);
    const o65b = objective("o6_5b").hints[3].text;
    expect(passes("o6_5b", o65b.slice(o65b.indexOf("SELECT"), o65b.indexOf(";") + 1))).toBe(false);
  });

  it("ловушка GROUP BY ts: сотни групп вместо суток", () => {
    expect(run("SELECT ts, MIN(temp_c) FROM outfall_temp GROUP BY ts").rowCount).toBeGreaterThan(500);
    expect(run("SELECT date(ts), MIN(temp_c) FROM outfall_temp WHERE ts >= '2026-12-01' GROUP BY date(ts)").rowCount).toBe(17);
  });

  it("6.4: эталон даёт ровно 21 день, естественный вариант без date() — 20,0014", () => {
    const r = run(objective("o6_4").solution);
    expect(r.rows).toEqual([["ПД-117/изм.3", "2015-03-12", "Гранин Эдуард Витальевич", 2140, 18, 21]]);
    const raw = Number(one(world, "SELECT julianday('2015-03-12') - julianday(reported_at) FROM incidents WHERE id = 7"));
    expect(raw).toBeCloseTo(20.0014, 3);
  });
});

// ------------------------------------------------------------------ протокол и допрос

describe("Д6: протокол и «Приснилось»", () => {
  const protocol = () => c06.protocol as NonNullable<CaseDef["protocol"]>;
  const answers = () => Object.fromEntries(protocol().blanks.map((b) => [b.id, b.answer]));

  it("ответы протокола находятся scanSeenOptions в результатах эталонов основных задач", () => {
    const seen = new Set<string>();
    for (const o of mainObjectives(c06)) for (const v of scanSeenOptions(protocol(), run(o.solution))) seen.add(v);
    for (const b of protocol().blanks) expect(seen.has(b.answer), b.id).toBe(true);
    expect(answers()).toEqual({ car: "Т117АУ", days: "21", doc: "ПД-117/изм.3", meters: "18", signer: "Гранин Эдуард Витальевич" });
  });

  it("верные ответы подтверждаются; ложные следы — нет", () => {
    const ok = checkProtocol(protocol(), answers(), new Set());
    expect(ok.solved).toBe(true);
    for (const wrong of [
      { signer: "Сазонов Пётр Ильич" },
      { doc: "ПД-117" },
      { meters: "2140" },
      { days: "18" },
      { car: "К404ТО" },
    ]) {
      const r = checkProtocol(protocol(), { ...answers(), ...wrong }, new Set());
      expect(r.solved, JSON.stringify(wrong)).toBe(false);
    }
  });

  it("карточки из эталонов и живых запросов пробивают утверждения Даши", () => {
    const dream = c06.scenes.find((s) => s.id === "dream");
    const points = dream?.interrogation?.points ?? [];
    const cardsOf = (sql: string): PinnedCard[] => {
      const r = run(sql);
      return r.rows.map((values, i) => ({ id: `card${i}`, columns: r.columns, values: values as PinnedCard["values"] }));
    };
    const breaks = (line: string, cards: PinnedCard[]) => {
      const p = points.find((x) => x.line === line);
      return (p?.present?.cards ?? []).some((pred) => cards.some((c) => cardMatches(c, pred)));
    };
    const reg = cardsOf(objective("o6_5").solution);
    expect(breaks("c06.dream.003", reg.filter((c) => c.values.includes(3071)))).toBe(true);
    expect(breaks("c06.dream.003", reg.filter((c) => c.values.includes(3471)))).toBe(false);
    expect(breaks("c06.dream.005", cardsOf("SELECT * FROM doc_registry WHERE year = 2015 AND reg_no = 3313"))).toBe(true);
    expect(breaks("c06.dream.005", cardsOf("SELECT * FROM doc_registry WHERE year = 2015 AND reg_no = 3311"))).toBe(false);
    expect(breaks("c06.dream.007", cardsOf("SELECT * FROM incidents WHERE id = 7"))).toBe(true);
    expect(breaks("c06.dream.007", cardsOf("SELECT * FROM incidents WHERE id = 6"))).toBe(false);
  });
});

// ------------------------------------------------------------------ посаженные факты

describe("Д6: посаженные факты (разд. 8.4)", () => {
  it("outfall_temp: еженедельно с 2015-03-12 (+6,2 … +19), ежечасно с 01.12, 14.12 минимум +0,6", () => {
    expect(rows(world, "SELECT MIN(ts), MIN(temp_c), MAX(temp_c) FROM outfall_temp WHERE ts < '2026-12-01'")).toEqual([
      [expect.stringMatching(/^2015-03-12 /), 6.2, 19],
    ]);
    expect(one(world, "SELECT MIN(temp_c) FROM outfall_temp WHERE date(ts) = '2026-12-14'")).toBe(0.6);
    expect(one(world, "SELECT MIN(temp_c) FROM outfall_temp WHERE date(ts) = '2026-12-13'")).toBeGreaterThanOrEqual(1);
    expect(one(world, "SELECT COUNT(*) FROM outfall_temp WHERE date(ts) = '2026-12-10'")).toBe(24);
  });

  it("construction_docs: ПД-117 и семь ревизий, перенос — у Гранина, «оголовок сброса» — только ПД-117", () => {
    expect(rows(world, "SELECT id, doc_no, signed_at, signed_by_person_id, supersedes_doc_id FROM construction_docs WHERE doc_no LIKE 'ПД-117%' ORDER BY id")).toEqual([
      [101, "ПД-117", "2014-06-10", 1620, null],
      [102, "ПД-117/изм.1", "2014-09-02", 1641, 101],
      [103, "ПД-117/изм.2", "2014-12-15", 1702, 102],
      [104, "ПД-117/изм.3", "2015-03-12", 1001, 101],
      [105, "ПД-117/изм.4", "2015-06-30", 1755, 104],
      [106, "ПД-117/изм.5", "2015-11-18", 1810, 101],
      [107, "ПД-117/изм.6", "2016-04-07", 1843, 101],
      [108, "ПД-117/изм.7", "2017-02-20", 1641, 101],
    ]);
    expect(one(world, "SELECT rationale FROM construction_docs WHERE id = 104")).toBe("использовать существующий временный сброс, экономия 41 млн");
    expect(rows(world, "SELECT id FROM construction_docs WHERE subject LIKE '%оголов%' OR subject LIKE '%Оголов%' ORDER BY id")).toEqual([[101], [104]]);
    // инженеры ревизий — живые взрослые, им в 2014–2017 было 30–60
    for (const id of F.PD117_ENGINEERS) {
      const birth = String(one(world, "SELECT birth_date FROM persons WHERE id = ? AND death_date IS NULL", [id]));
      expect(birth >= "1956-01-01" && birth <= "1984-12-31", String(id)).toBe(true);
    }
  });

  it("ровно одна машина Т117АУ — Сазонова, на учёте, ни одного считывания камер", () => {
    expect(rows(world, "SELECT make, model, year, owner_person_id, owner_name, deregistered_at FROM vehicles WHERE plate = 'Т117АУ'")).toEqual([
      ["Нордика", "Седан", 2009, 1388, "Сазонов Пётр Ильич", null],
    ]);
    expect(one(world, "SELECT COUNT(*) FROM plate_reads WHERE plate = 'Т117АУ'")).toBe(0);
  });

  it("морг 398: КУСП 4921, 17.12 13:20 — после потолка часов Д6, в деле не виден", () => {
    expect(rows(world, "SELECT kusp_no, received_at, full_name_text, person_id, identified_at, identified_by FROM morgue_records WHERE id = 398")).toEqual([
      [MORGUE_SAZONOV.kusp_no, MORGUE_SAZONOV.received_at, MORGUE_SAZONOV.full_name_text, 1388, MORGUE_SAZONOV.identified_at, MORGUE_SAZONOV.identified_by],
    ]);
    expect(one(world, "SELECT COUNT(*) FROM morgue_records WHERE kusp_no = 4921")).toBe(1);
    expect(run("SELECT * FROM morgue_records WHERE id = 398", dbCap).rowCount).toBe(0);
  });

  it("Береговая, 4 — один адрес 512 без хвостового пробела; в ночь на 20.02.2015 там семеро, Лосевой нет", () => {
    expect(rows(world, "SELECT id, district, street, house, apt FROM addresses WHERE trim(street) = 'Береговая' AND house = '4'")).toEqual([
      [BEREGOVAYA_4.id, "Створ", "Береговая", "4", null],
    ]);
    const night = rows(world, "SELECT person_id FROM registrations WHERE address_id = 512 AND from_date <= '2015-02-19' AND (to_date IS NULL OR to_date >= '2015-02-20') ORDER BY person_id").map((r) => r[0]);
    expect(night).toEqual([...NIGHT_RESIDENTS].sort((a, b) => a - b));
    expect(rows(world, "SELECT person_id, from_date, to_date FROM registrations WHERE address_id = 512 AND person_id IN (3070, 3071, 3112) ORDER BY person_id")).toEqual([
      [3070, "2009-03-01", "2016-08-31"],
      [3071, "2009-03-01", "2016-08-31"],
      [3112, "2010-01-10", "2014-12-31"],
    ]);
    // ловушка открытого периода: без IS NULL теряются две семьи
    expect(one(world, "SELECT COUNT(*) FROM registrations WHERE address_id = 512 AND from_date <= '2015-02-19' AND to_date >= '2015-02-20'")).toBe(4);
    // однофамилица Ким — на Портовой
    expect(rows(world, "SELECT a.street, a.house, a.apt FROM registrations r JOIN addresses a ON a.id = r.address_id WHERE r.person_id = ?", [KIM_PORTOVAYA.personId])).toEqual([
      ["Портовая", "3", "7"],
    ]);
  });

  it("рапорт водолазов 2018-07-14 — единственный с машиной", () => {
    expect(rows(world, "SELECT id, report_date, note, checked_by FROM diver_reports WHERE note LIKE '%машин%' OR note LIKE '%кузов%'")).toEqual([
      [DIVER_REPORT.id, "2018-07-14", DIVER_REPORT.note, "майор Ратников"],
    ]);
  });

  it("АТС «Глубина-Строя»: вечер 19.02 — только звонок и SMS с 2-14, окно без +3 часов пусто, шум «ЕДЕТ» — десятки строк", () => {
    expect(rows(world, "SELECT datetime(ts_unix, 'unixepoch') AS utc, kind, from_ext, to_number, recipient_name, duration_sec, text FROM gs_comms_2015 WHERE datetime(ts_unix, 'unixepoch', '+3 hours') BETWEEN '2015-02-19 18:00:00' AND '2015-02-20 02:59:59' ORDER BY ts_unix")).toEqual([
      ["2015-02-19 18:47:00", "call", "2-14", F.PHONE.sazonov, null, 60, null],
      ["2015-02-19 18:56:00", "sms", "2-14", F.PHONE.burtsev, "ст. наряда Бурцев", null, "ГОСТЬ ЕДЕТ К СТАРОМУ ПРИЧАЛУ. ВСТРЕТЬ."],
    ]);
    expect(one(world, "SELECT COUNT(*) FROM gs_comms_2015 WHERE datetime(ts_unix, 'unixepoch') BETWEEN '2015-02-19 21:00:00' AND '2015-02-19 22:00:00'")).toBe(0);
    expect(Number(one(world, "SELECT COUNT(*) FROM gs_comms_2015 WHERE text LIKE '%ЕДЕТ%'"))).toBeGreaterThan(24);
    expect(rows(world, "SELECT room, holder_person_id, from_date, to_date FROM gs_phonebook WHERE ext = '2-14'")).toEqual([
      ["приёмная директора", 1001, "2013-04-01", "2017-06-30"],
    ]);
  });

  it("камера 22 «Береговое шоссе» отключена по запросу собственника", () => {
    expect(rows(world, "SELECT name, status, status_reason FROM cameras WHERE id = 22")).toEqual([
      ["Береговое шоссе", "отключена", "по запросу собственника территории (ЧОП «Щит»)"],
    ]);
  });
});
