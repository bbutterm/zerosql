/**
 * Дело № 03 «Наезд на Полярной» (case-03-polyarnaya): контент, эталоны, ловушки,
 * протокол, допрос «Бурцев» (выиграть нельзя) и посаженные факты разд. 8.4
 * (блок «Д3») — по TECH_SPEC, разд. 5.
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
import { C03_CAM7_WINDOW, C03_DECOYS, C03_INCIDENTS, C03_NIGHT, C03_TAXI_OWNER } from "@/engine/world/plants/c03";
import * as F from "@/engine/world/facts";
import { sharedWorld, one, rows } from "../world/helpers";

const CASE_ID = "case-03-polyarnaya";

let world: Database;
let bytes: Uint8Array;
/** База дела на старте часов (15:00) и на потолке (18:00) */
let db: Database;
let dbCap: Database;
let c03: CaseDef;

const openAt = (clock: string) =>
  openCaseDatabase(bytes, {
    clock,
    tables: c03.tables,
    patches: [{ id: "p0.player", params: { playerName: "Северов" } }],
  });

beforeAll(async () => {
  ({ db: world, bytes } = await sharedWorld());
  c03 = getCase(CASE_ID) as CaseDef;
  db = await openAt(c03.date);
  dbCap = await openAt(c03.clock?.cap as string);
}, 60_000);

const run = (sql: string, base: Database = db): QueryResult => executeSQL(base, sql, c03.tables);

const objective = (id: string): CaseObjective => {
  const o = c03.objectives.find((x) => x.id === id);
  if (!o) throw new Error(`нет задачи ${id}`);
  return o;
};

function doneBefore(id: string): Set<string> {
  const o = objective(id);
  if (o.optional) return new Set(mainObjectives(c03).map((m) => m.id));
  return new Set(mainObjectives(c03).filter((m) => m.order < o.order).map((m) => m.id));
}

function passes(id: string, sql: string, base: Database = db): boolean {
  const result = run(sql, base);
  const progress = checkCaseProgress(c03, result, base, doneBefore(id));
  return progress.completed.some((c) => c.objectiveId === id);
}

const feedback = (id: string, sql: string): string | null =>
  checkCaseProgress(c03, run(sql), db, doneBefore(id)).activeFeedback;

const NIGHT = `reported_at BETWEEN '${C03_NIGHT.from}' AND '${C03_NIGHT.to}'`;
const CAM7 = "r.read_at BETWEEN '2026-11-18 23:00:00' AND '2026-11-18 23:15:00'";
const ROUTE = "r.read_at BETWEEN '2026-11-18 22:00:00' AND '2026-11-18 23:59:59'";

const ALTERNATIVES: Record<string, string[]> = {
  o3_1: [
    "SELECT i.kusp_no, v.plate FROM incidents i JOIN vehicles v ON v.id = i.vehicle_id WHERE i.kusp_no IN (4515, 4518);",
    "SELECT * FROM vehicles INNER JOIN incidents ON incidents.vehicle_id = vehicles.id WHERE incidents.kusp_no = 4515 OR incidents.kusp_no = 4518;",
    "select incidents.kusp_no, vehicles.make, vehicles.plate from incidents join vehicles on incidents.vehicle_id = vehicles.id where incidents.kusp_no between 4515 and 4518",
  ],
  o3_2: [
    `SELECT plate_reads.read_at, cameras.name FROM plate_reads JOIN cameras ON cameras.id = plate_reads.camera_id WHERE plate_reads.plate = 'К404ТО' AND plate_reads.read_at LIKE '2026-11-18%' ORDER BY plate_reads.read_at;`,
    `SELECT c.name AS camera, r.read_at AS at, r.direction FROM cameras c JOIN plate_reads r ON r.camera_id = c.id WHERE r.plate = 'К404ТО' AND r.read_at < '2026-11-19 00:00:00' ORDER BY r.read_at ASC;`,
  ],
  o3_3: [
    "SELECT p.full_name FROM companies c JOIN persons p ON p.id = c.director_person_id WHERE c.id = 17;",
    "SELECT c.name, p.full_name, p.birth_date FROM persons p JOIN companies c ON c.director_person_id = p.id WHERE c.name LIKE '%«Щит»%';",
    // «из будущего»: три таблицы одним запросом
    "SELECT v.plate, c.name, p.full_name FROM vehicles v JOIN companies c ON c.id = v.owner_company_id JOIN persons p ON p.id = c.director_person_id WHERE v.plate = 'К404ТО';",
  ],
  o3_4: [
    `SELECT kusp_no, reported_at FROM incidents WHERE ${NIGHT} ORDER BY kusp_no ASC;`,
    "SELECT * FROM incidents WHERE reported_at >= '2026-11-18 22:00:00' AND reported_at <= '2026-11-19 01:00:00' ORDER BY kusp_no;",
    "SELECT kusp_no, reported_at, applicant_text FROM incidents WHERE reported_at BETWEEN '2026-11-18 22:00:00' AND '2026-11-19 00:59:59' ORDER BY id;",
  ],
  o3_5: [
    "SELECT m.* FROM incident_persons ip JOIN morgue_records m ON m.kusp_no = ip.kusp_no WHERE ip.kusp_no = 4515 AND ip.person_id IS NULL;",
    "SELECT m.full_name_text FROM morgue_records m JOIN incident_persons ip ON ip.kusp_no = m.kusp_no WHERE ip.person_id IS NULL AND ip.role = 'потерпевшая' AND ip.kusp_no = 4515;",
    "SELECT * FROM morgue_records WHERE kusp_no = 4515;",
  ],
  o3_1b: [
    "SELECT incidents.* FROM incidents JOIN vehicles ON vehicles.id = incidents.vehicle_id WHERE vehicles.plate = 'К404ТО';",
    "SELECT i.kusp_no, i.description FROM vehicles v JOIN incidents i ON i.vehicle_id = v.id WHERE v.plate LIKE 'К404%' ORDER BY i.reported_at DESC;",
  ],
  o3_2b: [
    `SELECT r.plate, r.read_at, r.direction, v.make FROM plate_reads r JOIN vehicles v ON v.plate = r.plate WHERE r.camera_id = 7 AND ${CAM7} ORDER BY r.direction ASC, r.read_at DESC;`,
    `SELECT v.make, v.owner_name, r.* FROM vehicles v JOIN plate_reads r ON r.plate = v.plate WHERE r.camera_id = 7 AND r.read_at LIKE '2026-11-18 23:0%' OR r.camera_id = 7 AND r.read_at LIKE '2026-11-18 23:1%' ORDER BY r.direction, r.read_at DESC;`,
  ],
};

const MISTAKES: Record<string, string[]> = {
  o3_1: [
    // склейка не по тому полю
    "SELECT incidents.kusp_no, vehicles.plate FROM incidents JOIN vehicles ON vehicles.id = incidents.id WHERE incidents.kusp_no IN (4515, 4518);",
    // без фильтра — все угоны и ДТП города
    "SELECT incidents.kusp_no, vehicles.plate FROM incidents JOIN vehicles ON vehicles.id = incidents.vehicle_id;",
    // без склейки — номера машины нет
    "SELECT kusp_no, vehicle_id FROM incidents WHERE kusp_no IN (4515, 4518);",
  ],
  o3_2: [
    // без даты — захватывает выезд 19.11 в 03:10
    "SELECT r.read_at, c.name FROM plate_reads r JOIN cameras c ON c.id = r.camera_id WHERE r.plate = 'К404ТО' ORDER BY r.read_at;",
    // сортировка по названию камеры
    `SELECT r.read_at, c.name FROM plate_reads r JOIN cameras c ON c.id = r.camera_id WHERE r.plate = 'К404ТО' AND ${ROUTE} ORDER BY c.name;`,
    // без названий камер
    `SELECT r.read_at, r.camera_id FROM plate_reads r WHERE r.plate = 'К404ТО' AND ${ROUTE} ORDER BY r.read_at;`,
    // латиница в номере
    `SELECT r.read_at, c.name FROM plate_reads r JOIN cameras c ON c.id = r.camera_id WHERE r.plate = 'K404TO' AND ${ROUTE} ORDER BY r.read_at;`,
  ],
  o3_3: [
    // ловушка: «Щит» в «ёлочках», а не в "лапках"
    "SELECT c.name, p.full_name FROM companies c JOIN persons p ON p.id = c.director_person_id WHERE c.name = 'ЧОП \"Щит\"';",
    // все директора города
    "SELECT c.name, p.full_name FROM companies c JOIN persons p ON p.id = c.director_person_id;",
    // склейка по id компании, а не директора
    "SELECT c.name, p.full_name FROM companies c JOIN persons p ON p.id = c.id WHERE c.name LIKE '%Щит%';",
  ],
  o3_4: [
    // по времени — 4518 встаёт вторым, аномалии не видно
    `SELECT kusp_no, reported_at FROM incidents WHERE ${NIGHT} ORDER BY reported_at;`,
    // до полуночи — теряется 4519
    "SELECT kusp_no, reported_at FROM incidents WHERE reported_at BETWEEN '2026-11-18 22:00:00' AND '2026-11-18 23:59:59' ORDER BY kusp_no;",
    // дата не в ISO — пусто
    "SELECT kusp_no, reported_at FROM incidents WHERE reported_at BETWEEN '18.11.2026 22:00' AND '19.11.2026 01:00' ORDER BY kusp_no;",
  ],
  o3_5: [
    // М4: JOIN с persons — 0 строк
    "SELECT ip.role, p.full_name FROM incident_persons ip JOIN persons p ON p.id = ip.person_id WHERE ip.kusp_no = 4515;",
    // = NULL — 0 строк
    "SELECT ip.role, ip.note, m.full_name_text, m.person_id FROM incident_persons ip JOIN morgue_records m ON m.kusp_no = ip.kusp_no WHERE ip.kusp_no = 4515 AND ip.person_id = NULL;",
    // только строка без человека — имени ещё нет
    "SELECT * FROM incident_persons WHERE kusp_no = 4515 AND person_id IS NULL;",
    // склейка с моргом по id строки
    "SELECT ip.role, m.full_name_text, m.person_id FROM incident_persons ip JOIN morgue_records m ON m.id = ip.id WHERE ip.kusp_no = 4515;",
  ],
  o3_1b: [
    // латиница: такого номера в реестре нет
    "SELECT i.kusp_no, i.reported_at, i.description FROM incidents i JOIN vehicles v ON v.id = i.vehicle_id WHERE v.plate = 'K404TO';",
    // только угон
    "SELECT i.kusp_no FROM incidents i JOIN vehicles v ON v.id = i.vehicle_id WHERE v.plate = 'К404ТО' AND i.kind = 'угон';",
    // по марке, а не по номеру — чужие «Тайги»
    "SELECT i.kusp_no, i.reported_at FROM incidents i JOIN vehicles v ON v.id = i.vehicle_id WHERE v.make LIKE 'Тайга%';",
  ],
  o3_2b: [
    // второй ключ без DESC
    `SELECT r.direction, r.read_at, r.plate, v.make FROM plate_reads r JOIN vehicles v ON v.plate = r.plate WHERE r.camera_id = 7 AND ${CAM7} ORDER BY r.direction, r.read_at;`,
    // один ключ
    `SELECT r.direction, r.read_at, r.plate, v.make FROM plate_reads r JOIN vehicles v ON v.plate = r.plate WHERE r.camera_id = 7 AND ${CAM7} ORDER BY r.read_at DESC;`,
    // без марки
    `SELECT r.direction, r.read_at, r.plate FROM plate_reads r WHERE r.camera_id = 7 AND ${CAM7} ORDER BY r.direction, r.read_at DESC;`,
  ],
};

/** Уровень 4 («Ирочкина шпаргалка»): одна ошибка — и задача не засчитывается */
const CHEAT_SHEETS: Record<string, string> = {
  o3_1: "SELECT incidents.kusp_no, vehicles.plate, vehicles.make FROM incidents JOIN vehicles ON vehicles.id = incidents.id WHERE incidents.kusp_no IN (4515, 4518);",
  o3_2: "SELECT r.read_at, c.name FROM plate_reads r JOIN cameras c ON c.id = r.camera_id WHERE r.plate = 'К404ТО' ORDER BY r.read_at;",
  o3_3: "SELECT c.name, p.full_name FROM companies c JOIN persons p ON p.id = c.director_person_id WHERE c.name = 'ЧОП \"Щит\"';",
  o3_4: `SELECT kusp_no, reported_at, kind FROM incidents WHERE ${NIGHT} ORDER BY reported_at;`,
  o3_5: "SELECT ip.role, ip.note, m.full_name_text, m.person_id FROM incident_persons ip JOIN morgue_records m ON m.kusp_no = ip.kusp_no WHERE ip.kusp_no = 4515 AND ip.person_id = NULL;",
  o3_1b: "SELECT i.kusp_no, i.reported_at, i.description FROM incidents i JOIN vehicles v ON v.id = i.vehicle_id WHERE v.plate = 'K404TO';",
  o3_2b: `SELECT r.direction, r.read_at, r.plate, v.make FROM plate_reads r JOIN vehicles v ON v.plate = r.plate WHERE r.camera_id = 7 AND ${CAM7} ORDER BY r.direction, r.read_at;`,
};

/** Ключевые слова из более поздних дел (строгая лестница, разд. 4.1, п. 8) */
const FUTURE_KEYWORDS = [
  "LEFT", "COALESCE", "IFNULL", "EXISTS", "CASE", "WITH", "UNION", "EXCEPT", "INTERSECT", "OVER", "PARTITION",
  "DATE", "DATETIME", "STRFTIME", "JULIANDAY", "SUBSTR", "LENGTH", "REPLACE", "INSERT", "UPDATE", "DELETE",
];
const keywordsOf = (sql: string) =>
  (sql.replace(/'(?:[^']|'')*'/g, "''").match(/[A-Za-z_]+/g) ?? []).map((w) => w.toUpperCase());

// ==================================================================== контент

describe("Д3: контент дела", () => {
  it("validateCaseContent → пусто", () => {
    expect(validateCaseContent(c03, characters, collectEvidenceIds(cases))).toEqual([]);
  });

  it("карточка дела по библии: 09.12 15:00, 1 мин/запрос, потолок 18:00, четыре новые таблицы", () => {
    expect(c03.order).toBe(3);
    expect(c03.act).toBe(1);
    expect(c03.difficulty).toBe("medium");
    expect(c03.date).toBe("2026-12-09 15:00");
    expect(c03.minutesPerQuery).toBe(1);
    expect(c03.clock?.cap).toBe("2026-12-09 18:00");
    expect(c03.newTables).toEqual(["incident_persons", "persons", "morgue_records", "companies"]);
    expect(c03.tables).toEqual([...(getCase("case-02-minus-41") as CaseDef).tables, ...(c03.newTables ?? [])]);
    expect(c03.concepts).toEqual(["h.inner_join", "h.table_alias", "h.order_multi", "w.kusp"]);
    expect(mainObjectives(c03).map((o) => o.id)).toEqual(["o3_1", "o3_2", "o3_3", "o3_4", "o3_5"]);
    expect(c03.objectives.filter((o) => o.optional).map((o) => o.id)).toEqual(["o3_1b", "o3_2b"]);
  });

  it("у каждой задачи 4 подсказки голосами, улика ev.c03.*, эталон; понятия — статьи справочника", () => {
    for (const o of c03.objectives) {
      expect(o.hints.length, o.id).toBe(4);
      for (const h of o.hints) expect(h.by, o.id).toBeDefined();
      expect(o.hints[0].line, o.id).toBe(`hint.c03_${o.id}.001`);
      expect(/\d/.test(o.hints[0].text), `${o.id}: цифры в озвученной наводке`).toBe(false);
      expect(o.hints[3].by, o.id).toBe("nina");
      expect(o.evidence?.id, o.id).toMatch(/^ev\.c03\./);
      expect(handbookById.has(o.concept as string), o.id).toBe(true);
    }
    for (const id of c03.concepts) expect(handbookById.has(id), id).toBe(true);
  });

  it("реплики библии стоят на своих id", () => {
    const line = (id: string) => c03.scenes.flatMap((s) => s.lines).find((l) => l.id === id);
    expect(line("c03.int_burtsev.002")).toMatchObject({ speaker: "burtsev", text: "Угнали в десять сорок. Заявил сразу.", lie: true });
    expect(line("c03.int_burtsev.006")).toMatchObject({ speaker: "burtsev", text: "Больше мы его не видели.", lie: true });
    expect(line("c03.int_burtsev_break_kusp.002")?.text).toBe("Дежурный напутал. Спросите дежурного.");
    expect(line("c03.int_burtsev_break_route.003")?.text).toBe("Не надо.");
    expect(line("c03.ratnikov_call.002")).toMatchObject({ speaker: "ratnikov", text: "Ким. Закрываем. Не лезь." });
    expect(line("c03.tokha.002")?.text).toContain("ЧОПовские тачки вечно угоняют, короч. Ключи под козырьком");
    expect(line("c03.morgue.004")).toMatchObject({ speaker: "nina", emotion: "sad", text: "NULL — это не пустота, голубчик." });
    expect(line("c03.morgue.005")?.text).toBe("Это то, что кто-то не захотел записать.");
    expect(line("c03.morgue.006")?.text).toBe("Ирочку не обижай. Она хорошая была.");
    expect(line("c03.outro.006")).toMatchObject({ speaker: "valentina", text: "Она не бегала по ночам. Её ждали." });
    expect(line("c03.intro.011")?.text).toContain("Там всё ясно");
  });

  it("реплики озвучиваемы: ≤ 160 знаков, без цифр у персонажей, без родовых форм к игроку", () => {
    const END = "(?=$|[\\s.,!?…»:;)])";
    const youPast = new RegExp(`(^|[\\s,«(—])ты\\s+(\\S+\\s+)?[а-яё]+(л|ла|лся|лась)${END}`, "i");
    const ready = /(^|[\s,«(—])(готов|готова)(?=$|[\s.,!?…»])/i;
    let count = 0;
    for (const scene of c03.scenes) {
      for (const l of scene.lines) {
        count++;
        expect(l.text.length, l.id).toBeLessThanOrEqual(160);
        if (l.speaker !== "narrator") expect(/\d/.test(l.text), `${l.id}: цифры в озвучке`).toBe(false);
        if (l.speaker !== "narrator") expect(youPast.test(l.text), `${l.id}: «ты …л(а)»`).toBe(false);
        expect(ready.test(l.text), `${l.id}: «готов(а)»`).toBe(false);
      }
    }
    expect(count).toBeGreaterThanOrEqual(80);
  });

  it("допрос «Бурцев»: выиграть нельзя, шаги neutral → cold → thinking, два пробоя, живой запрос", () => {
    const scene = c03.scenes.find((s) => s.id === "int_burtsev");
    const int = scene?.interrogation as InterrogationDef;
    expect(int.suspect).toBe("burtsev");
    expect(int.mode).toBe("unwinnable");
    expect(int.liveQuery).toBe(true);
    expect(int.breakSteps).toEqual(["neutral", "cold", "thinking"]);
    expect(int.points.filter((p) => p.present).map((p) => p.line)).toEqual(["c03.int_burtsev.002", "c03.int_burtsev.006"]);
    // признания нет: ни одна сцена допроса не даёт Бурцеву сломаться
    const burtsevLines = c03.scenes.filter((s) => s.id.startsWith("int_burtsev")).flatMap((s) => s.lines).filter((l) => l.speaker === "burtsev");
    expect(burtsevLines.some((l) => l.emotion === "scared")).toBe(false);
    // звонок Ратникова — живое событие по второму пробою
    expect(c03.events).toEqual([{ id: "ratnikov_call", after: { interrogation: "int_burtsev", breaks: 2 }, scene: "ratnikov_call" }]);
  });
});

// ==================================================================== эталоны

describe("Д3: эталоны проходят по порядку", () => {
  it("каждый эталон засчитывает свою задачу — на старте и на потолке часов", () => {
    for (const base of [db, dbCap]) {
      const completed = new Set<string>();
      for (const o of [...mainObjectives(c03), ...c03.objectives.filter((x) => x.optional)]) {
        const result = run(o.solution, base);
        expect(result.error, `${o.id}: ${result.error}`).toBeNull();
        const ids = checkCaseProgress(c03, result, base, completed).completed.map((c) => c.objectiveId);
        expect(ids, o.id).toContain(o.id);
        for (const id of ids) completed.add(id);
      }
      expect(isCaseObjectivesDone(c03, completed)).toBe(true);
    }
  });

  it("эталоны дают одинаковый результат на 15:00 и на 18:00", () => {
    for (const o of c03.objectives) expect(run(o.solution, dbCap).rows, o.id).toEqual(run(o.solution).rows);
  });

  it("эталоны проходят table-guard дела; logins и audit_log закрыты", () => {
    for (const o of c03.objectives) {
      const r = executeSQL(db, o.solution, c03.tables);
      expect(r.error, o.id).toBeNull();
      expect(r.errorKind, o.id).toBeUndefined();
    }
    expect(executeSQL(db, "SELECT * FROM logins", c03.tables).error).not.toBeNull();
    expect(executeSQL(db, "SELECT * FROM audit_log", c03.tables).error).not.toBeNull();
  });

  it("строгая лестница: в эталонах нет понятий позже Д3 и нет цепочек из трёх таблиц", () => {
    for (const o of c03.objectives) {
      expect(keywordsOf(o.solution).filter((w) => FUTURE_KEYWORDS.includes(w)), o.id).toEqual([]);
      expect(keywordsOf(o.solution).filter((w) => w === "JOIN").length, o.id).toBeLessThanOrEqual(1);
    }
  });

  it("каждый эталон быстрее 1 с", () => {
    for (const o of c03.objectives) {
      const t0 = performance.now();
      run(o.solution);
      expect(performance.now() - t0, o.id).toBeLessThan(1000);
    }
  });

  it("предсказание перед 3.5: JOIN по КУСП 4515 возвращает 0 строк", () => {
    const o = objective("o3_5");
    const p = o.prediction as NonNullable<CaseObjective["prediction"]>;
    expect(p.options).toEqual([0, 1, 2]);
    expect(run(p.sql ?? o.solution).rowCount).toBe(p.answer);
    expect(p.answer).toBe(0);
  });
});

describe("Д3: альтернативы засчитываются", () => {
  for (const [id, list] of Object.entries(ALTERNATIVES)) {
    it.each(list)(`${id}: %s`, (sql) => {
      expect(run(sql).error).toBeNull();
      expect(passes(id, sql)).toBe(true);
    });
  }
});

describe("Д3: правдоподобные ошибки не засчитываются", () => {
  for (const [id, list] of Object.entries(MISTAKES)) {
    it.each(list)(`${id}: %s`, (sql) => {
      expect(passes(id, sql)).toBe(false);
    });
  }

  it("ошибок ≥ 2 и альтернатив ≥ 1 на задачу; шпаргалка — с одной ошибкой и не проходит", () => {
    for (const o of c03.objectives) {
      expect(MISTAKES[o.id]?.length ?? 0, o.id).toBeGreaterThanOrEqual(2);
      expect(ALTERNATIVES[o.id]?.length ?? 0, o.id).toBeGreaterThanOrEqual(1);
      expect(o.hints[3].text, o.id).toContain(CHEAT_SHEETS[o.id]);
      expect(passes(o.id, CHEAT_SHEETS[o.id]), o.id).toBe(false);
    }
  });

  it("примеры МИРЫ (уровень 2) выполняются, непусты и задачу не решают", () => {
    for (const o of c03.objectives) {
      const sql = o.hints[1].text.match(/Пример: (SELECT .+?)\. См\./)?.[1];
      expect(sql, o.id).toBeDefined();
      const r = run(sql as string);
      expect(r.error, `${o.id}: ${r.error}`).toBeNull();
      expect(r.rowCount, o.id).toBeGreaterThan(0);
      expect(passes(o.id, sql as string), o.id).toBe(false);
    }
  });

  it("ловушки дела: INNER JOIN теряет наезд, = NULL и JOIN с persons пусты, «Щит» в лапках пуст", () => {
    expect(run("SELECT i.kusp_no FROM incidents i JOIN vehicles v ON v.id = i.vehicle_id WHERE i.kusp_no IN (4515, 4518)").rows).toEqual([[4518]]);
    expect(run("SELECT * FROM incident_persons WHERE kusp_no = 4515 AND person_id = NULL").rowCount).toBe(0);
    expect(run("SELECT * FROM incident_persons WHERE kusp_no = 4515 AND person_id IS NULL").rowCount).toBe(1);
    expect(run("SELECT * FROM companies WHERE name = 'ЧОП \"Щит\"'").rowCount).toBe(0);
    // LIKE архива регистронезависим и для кириллицы (sql-functions.ts)
    expect(run("SELECT * FROM companies WHERE name LIKE '%щит%'").rowCount).toBe(1);
    expect(run("SELECT name FROM companies WHERE name LIKE '%Щит%'").rows).toEqual([["ЧОП «Щит»"]]);
    // в реестре кавычки вперемешку — «лапки» тоже бывают
    expect(Number(run("SELECT COUNT(*) FROM companies WHERE name LIKE '%\"%'").rows[0][0])).toBeGreaterThan(10);
    expect(feedback("o3_2", MISTAKES.o3_2[0])).toMatch(/следующая ночь/);
  });
});

// ==================================================================== протокол и допрос

describe("Д3: протокол и допрос", () => {
  const protocol = () => c03.protocol as NonNullable<CaseDef["protocol"]>;
  const seen = (objectives: readonly CaseObjective[]) => {
    const options = new Set<string>();
    const values = new Set<string>();
    for (const o of objectives) {
      const r = run(o.solution);
      for (const v of scanSeenOptions(protocol(), r)) options.add(v);
      for (const v of scanSeen(r)) values.add(v);
    }
    return { options, values };
  };

  it("ответы протокола находятся в результатах основных эталонов; с допзадачами видны все варианты", () => {
    const main = seen(mainObjectives(c03));
    for (const b of protocol().blanks) expect(main.options.has(b.answer), b.id).toBe(true);
    const all = seen(c03.objectives);
    for (const b of protocol().blanks) expect(availableOptions(b, all.values), b.id).toEqual(b.options);
    expect(protocol().blanks.map((b) => [b.id, b.kind, b.answer])).toEqual([
      ["claim", "number", "4518"],
      ["plate", "text", F.PLATE.taiga],
      ["back", "datetime", "2026-11-18 23:34:00"],
      ["victim", "person", "Вальц Ирина Петровна"],
    ]);
  });

  it("погибшая открывается и по id 4127 (person)", () => {
    const victim = protocol().blanks.find((b) => b.id === "victim");
    expect(victim?.aliases?.["Вальц Ирина Петровна"]).toEqual([F.PERSON.irina]);
  });

  it("верные ответы подтверждаются; один неверный из четырёх — подтверждаются три верных, но дело не сверено", () => {
    const right = { claim: "4518", plate: "К404ТО", back: "2026-11-18 23:34:00", victim: "Вальц Ирина Петровна" };
    const ok = checkProtocol(protocol(), right, new Set());
    expect(ok.solved).toBe(true);
    expect([...ok.newlyConfirmed].sort()).toEqual(["back", "claim", "plate", "victim"]);
    for (const wrong of [
      { ...right, claim: "4515" },
      { ...right, plate: C03_DECOYS.taxi.plate },
      { ...right, back: "2026-11-18 22:40:00" },
      { ...right, victim: "Бурцев Валерий Николаевич" },
    ]) {
      expect(checkProtocol(protocol(), wrong, new Set()).solved).toBe(false);
    }
    // два неверных — ничего не подтверждается
    expect(checkProtocol(protocol(), { ...right, claim: "4515", back: "2026-11-18 23:08:00" }, new Set()).newlyConfirmed).toEqual([]);
  });

  it("карточки живого запроса пробивают утверждения Бурцева; чужая карточка — нет", () => {
    const int = c03.scenes.find((s) => s.id === "int_burtsev")?.interrogation as InterrogationDef;
    const card = (table: string, sql: string): PinnedCard => {
      const r = run(sql);
      expect(r.rowCount, sql).toBe(1);
      return { id: sql, table, columns: r.columns, values: r.rows[0] as PinnedCard["values"], sourceClass: "pbd" };
    };
    const cards = {
      "c03.int_burtsev.002": card("incidents", "SELECT kusp_no, reported_at, kind FROM incidents WHERE kusp_no = 4517 AND reported_at LIKE '2026-11%'"),
      "c03.int_burtsev.006": card("plate_reads", "SELECT plate, read_at, camera_id FROM plate_reads WHERE plate = 'К404ТО' AND read_at = '2026-11-18 23:34:00'"),
    };
    for (const p of int.points.filter((x) => x.present)) {
      const present = p.present as NonNullable<typeof p.present>;
      expect(presentMatches(present, { cards: [cards[p.line as keyof typeof cards]] }), p.line).toBe(true);
      const other = Object.entries(cards).find(([k]) => k !== p.line)?.[1] as PinnedCard;
      expect(presentMatches(present, { cards: [other] }), p.line).toBe(false);
      // улика задачи тоже пробивает
      expect(presentMatches(present, { evidenceIds: present.correct }), p.line).toBe(true);
    }
  });
});

// ==================================================================== посаженные факты

describe("Д3: посаженные факты (разд. 8.4, блок «Д3»)", () => {
  it("КУСП ночи 18.11: ровно шесть строк с 22:00 до 01:00, id и номера подряд", () => {
    expect(rows(world, `SELECT id, kusp_no, reported_at FROM incidents WHERE ${NIGHT} ORDER BY kusp_no`)).toEqual([
      [1611, 4514, "2026-11-18 22:55:00"],
      [1612, 4515, "2026-11-18 23:10:00"],
      [1613, 4516, "2026-11-18 23:25:00"],
      [1614, 4517, "2026-11-18 23:40:00"],
      [1615, 4518, "2026-11-18 22:40:00"],
      [1616, 4519, "2026-11-19 00:05:00"],
    ]);
    for (const i of C03_INCIDENTS) {
      expect(rows(world, "SELECT kusp_no, reported_at, kind FROM incidents WHERE id = ?", [i.id])[0], String(i.id)).toEqual([i.kusp, i.at, i.kind]);
      expect(one(world, "SELECT COUNT(*) FROM incidents WHERE kusp_no = ? AND reported_at LIKE '2026-%'", [i.kusp])).toBe(1);
    }
    expect(String(one(world, "SELECT description FROM incidents WHERE id = 1613"))).toContain("«Якорь»");
    expect(rows(world, "SELECT kind, address_text, vehicle_id, applicant_text FROM incidents WHERE id = 1612")[0]).toEqual([
      "ДТП", "Полярная, 17", null, "Самохин А. В. (прохожий)",
    ]);
    expect(rows(world, "SELECT kind, vehicle_id, applicant_text FROM incidents WHERE id = 1615")[0]).toEqual(["угон", 404, "Бурцев В. Н."]);
  });

  it("сгоревшая «Тайга»: 1631 → КУСП 4549, 20.11 10:40; у К404ТО ровно два происшествия", () => {
    expect(rows(world, "SELECT kusp_no, reported_at, vehicle_id FROM incidents WHERE id = 1631")[0]).toEqual([4549, "2026-11-20 10:40:00", 404]);
    expect(String(one(world, "SELECT description FROM incidents WHERE id = 1631"))).toContain("сгоревшая «Тайга» К404ТО");
    expect(rows(world, "SELECT kusp_no FROM incidents WHERE vehicle_id = 404 ORDER BY kusp_no")).toEqual([[4518], [4549]]);
  });

  it("incident_persons: по 4515 — одна потерпевшая без person_id с биркой «Б0-03»; по 4518 — только заявитель Бурцев", () => {
    expect(rows(world, "SELECT id, incident_id, person_id, role, note FROM incident_persons WHERE kusp_no = 4515")).toEqual([
      [1205, 1612, null, "потерпевшая", "женщина ~30 лет, документов нет; при себе ключ с биркой «Б0-03»; телефон не обнаружен"],
    ]);
    expect(rows(world, "SELECT id, incident_id, person_id, role FROM incident_persons WHERE kusp_no = 4518")).toEqual([[1209, 1615, 2214, "заявитель"]]);
  });

  it("морг 311: Вальц Ирина Петровна, 4127, 19.11 00:40, опознана матерью; по 4515 ровно одна запись", () => {
    expect(rows(world, "SELECT kusp_no, received_at, full_name_text, person_id, identified_at, identified_by FROM morgue_records WHERE id = 311")[0]).toEqual([
      4515, "2026-11-19 00:40:00", "Вальц Ирина Петровна", F.PERSON.irina, "2026-11-19 09:30:00", "Вальц В. С. (мать)",
    ]);
    expect(one(world, "SELECT COUNT(*) FROM morgue_records WHERE kusp_no = 4515")).toBe(1);
    expect(one(world, "SELECT full_name FROM persons WHERE id = 4127")).toBe("Вальц Ирина Петровна");
  });

  it("«Щит» — единственная компания с «Щит» в названии, директор 2214 Бурцев; «Тайга» записана на неё", () => {
    expect(rows(world, "SELECT id, name, director_person_id FROM companies WHERE name LIKE '%Щит%'")).toEqual([[17, "ЧОП «Щит»", 2214]]);
    expect(one(world, "SELECT full_name FROM persons WHERE id = 2214")).toBe("Бурцев Валерий Николаевич");
    expect(rows(world, "SELECT id, make, model, owner_company_id, owner_name FROM vehicles WHERE plate = 'К404ТО'")).toEqual([
      [404, "Тайга", "4×4", 17, "ЧОП «Щит»"],
    ]);
  });

  it("маршрут К404ТО: четыре проезда вечером 18.11 и выезд 19.11 в 03:10", () => {
    expect(rows(world, "SELECT read_at, camera_id FROM plate_reads WHERE plate = 'К404ТО' ORDER BY read_at")).toEqual([
      ["2026-11-18 22:52:00", 15],
      ["2026-11-18 23:08:00", 7],
      ["2026-11-18 23:21:00", 3],
      ["2026-11-18 23:34:00", 15],
      ["2026-11-19 03:10:00", 15],
    ]);
  });

  it("камера 7 в 23:00–23:15: ровно «Тайга» и три ложных следа, у каждого номера одна строка реестра", () => {
    expect(
      rows(world, "SELECT plate, read_at FROM plate_reads WHERE camera_id = 7 AND read_at BETWEEN ? AND ? ORDER BY read_at", [
        C03_CAM7_WINDOW.from, C03_CAM7_WINDOW.to,
      ])
    ).toEqual([
      [C03_DECOYS.taxi.plate, C03_DECOYS.taxi.at],
      [F.PLATE.taiga, "2026-11-18 23:08:00"],
      [C03_DECOYS.delivery.plate, C03_DECOYS.delivery.at],
      [C03_DECOYS.ambulance.plate, C03_DECOYS.ambulance.at],
    ]);
    for (const d of Object.values(C03_DECOYS)) expect(one(world, "SELECT COUNT(*) FROM vehicles WHERE plate = ?", [d.plate]), d.plate).toBe(1);
    expect(rows(world, "SELECT make, owner_name FROM vehicles WHERE plate = ?", [C03_DECOYS.taxi.plate])[0]).toEqual(["Нордика", C03_TAXI_OWNER]);
    expect(rows(world, "SELECT make, owner_company_id FROM vehicles WHERE plate = ?", [C03_DECOYS.delivery.plate])[0]).toEqual(["Сайгак Next", F.COMPANY.siyanie]);
    expect(rows(world, "SELECT make, owner_company_id FROM vehicles WHERE plate = ?", [C03_DECOYS.ambulance.plate])[0]).toEqual(["Вега", F.COMPANY.medsanchast]);
    // ложные следы — кириллицей: счёт латиницы ★Д10 не меняется
    expect(one(world, "SELECT COUNT(*) FROM plate_reads WHERE camera_id = 7 AND read_at LIKE '2026-11-18 23%' AND plate GLOB '*[A-Z]*'")).toBe(0);
  });
});
