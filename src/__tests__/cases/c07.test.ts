/**
 * Дело 07 «Служебная квартира» (case-07-sluzhebnaya-kvartira): контент,
 * эталоны и ловушки задач на мире «Полыньи», протокол, допрос и факты
 * разд. 8.4 (блок «Д7»), посаженные plants/c07.ts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { Database } from "sql.js";
import {
  checkCaseProgress,
  checkProtocol,
  collectEvidenceIds,
  dueEvents,
  executeSQL,
  mainObjectives,
  presentMatches,
  scanSeenOptions,
  validateCaseContent,
  STORY_PATCHES,
} from "@/engine";
import type { CaseDef, CaseObjective, PinnedCard, QueryResult } from "@/engine";
import { exportWorld, generateWorld, openCaseDatabase } from "@/engine/world/generate";
import { C07, C07_OUTSIDERS } from "@/engine/world/plants/c07";
import { cases, characters, getCase, handbookByCase } from "@/data";

const CASE = getCase("case-07-sluzhebnaya-kvartira") as CaseDef;
const START = "2026-12-21 16:00:00";
/** Ратников оседает в кабинете: патч c07.admission ставит строку 601 на текущие часы */
const ADMITTED = "2026-12-21 18:47:00";
/** Часы, на которых игрок ищет его в горздраве (несколько запросов спустя) */
const LATER = "2026-12-21 19:02:00";
const CAP = "2026-12-21 23:30:00";

let world: Database;
let bytes: Uint8Array;
let generationMs = 0;
/** База дела после госпитализации (все задачи решаемы) */
let db: Database;
/** База дела на старте: живой строки 601 ещё нет */
let dbStart: Database;

const openAt = (clock: string, admitted?: string) =>
  openCaseDatabase(bytes, {
    clock,
    tables: CASE.tables,
    patches: ["p0.player", ...(admitted ? [{ id: "c07.admission", params: { clock: admitted } }] : [])],
  });

beforeAll(async () => {
  const t0 = performance.now();
  world = await generateWorld();
  generationMs = performance.now() - t0;
  bytes = exportWorld(world);
  db = await openAt(LATER, ADMITTED);
  dbStart = await openAt(START);
}, 60_000);

const run = (sql: string, base: Database = db): QueryResult => executeSQL(base, sql, CASE.tables);
const rows = (sql: string, base: Database = world): unknown[][] => base.exec(sql)[0]?.values ?? [];
const one = (sql: string, base: Database = world): unknown => rows(sql, base)[0]?.[0];

const objective = (id: string): CaseObjective => {
  const o = CASE.objectives.find((x) => x.id === id);
  if (!o) throw new Error(`нет задачи ${id}`);
  return o;
};

/** Засчитывается ли запрос задаче id, если все основные задачи до неё выполнены */
function passes(id: string, sql: string, base: Database = db): boolean {
  const target = objective(id);
  const before = new Set(mainObjectives(CASE).filter((o) => o.order < target.order).map((o) => o.id));
  const result = run(sql, base);
  expect(result.error, `${id}: ${sql}\n${result.error}`).toBeUndefined();
  return checkCaseProgress(CASE, result, base, before).completed.some((c) => c.objectiveId === id);
}

// ==================================================================== контент

describe("контент дела", () => {
  it("мир сгенерирован за разумное время", () => {
    expect(generationMs).toBeLessThan(8000);
  });

  it("validateCaseContent: проблем нет", () => {
    expect(validateCaseContent(CASE, characters, collectEvidenceIds(cases))).toEqual([]);
  });

  it("шесть основных задач по порядку и одна ★; концепции дела — со статьями справочника", () => {
    expect(mainObjectives(CASE).map((o) => o.id)).toEqual(["o7_1", "o7_2", "o7_3", "o7_4", "o7_5", "o7_6"]);
    expect(CASE.objectives.filter((o) => o.optional).map((o) => o.id)).toEqual(["o7_3b"]);
    expect(handbookByCase.c07.map((e) => e.id)).toEqual(CASE.concepts);
    for (const o of CASE.objectives) {
      expect(o.hints.length, o.id).toBeGreaterThanOrEqual(3);
      expect(o.hints.every((h) => h.by), o.id).toBe(true);
      expect(o.evidence?.id, o.id).toMatch(/^ev\.c07\./);
    }
  });

  it("таблицы дела: прежние плюс четыре новые", () => {
    expect(CASE.newTables).toEqual(["properties", "employment", "accounts", "hospital_admissions"]);
    const prev = getCase("case-06-polynya") as CaseDef;
    expect(prev.tables.filter((t) => !CASE.tables.includes(t))).toEqual([]);
  });

  it("реплики: без родовых форм игрока, озвучиваемые — не длиннее 220 знаков", () => {
    const gendered = /(?<![а-яё])ты\s+[а-яё]+(л|ла|лся|лась)(?![а-яё])|(?<![а-яё])(готов|готова)(?![а-яё])/i;
    const playerPast = /(?<![а-яё])я\s+[а-яё]+(л|ла|лся|лась)(?![а-яё])|(?<![а-яё])(сам|сама|один|одна|рад|рада)(?![а-яё])/i;
    for (const scene of CASE.scenes) {
      for (const line of scene.lines) {
        expect(line.text.length, line.id).toBeLessThanOrEqual(220);
        expect(gendered.test(line.text), `${line.id}: ${line.text}`).toBe(false);
      }
      for (const choice of scene.choices ?? []) {
        expect(playerPast.test(choice.text), `${scene.id}/${choice.id}: ${choice.text}`).toBe(false);
        expect(gendered.test(choice.text), `${scene.id}/${choice.id}`).toBe(false);
      }
    }
    for (const o of CASE.objectives) {
      for (const text of [o.task, o.success, ...o.hints.map((h) => h.text)]) {
        expect(gendered.test(text), `${o.id}: ${text}`).toBe(false);
      }
    }
  });

  it("часы: старт 21.12 16:00, потолок 23:30 — раньше выхода B-9000 в 23:41", () => {
    expect(CASE.date).toBe("2026-12-21 16:00");
    expect(CASE.clock?.cap).toBe("2026-12-21 23:30");
    expect(CASE.clock?.cap ?? "" < C07.playerExit).toBe(true);
  });
});

// ==================================================================== задачи

const ALTERNATIVES: Record<string, string[]> = {
  o7_1: [
    // JOIN вместо подзапроса, другие алиасы, полуоткрытый интервал
    `SELECT p.id AS flat, p.address_text, p.owner_person_id FROM properties p
     JOIN companies c ON c.id = p.grantor_company_id
     WHERE c.name = 'ООО «Глубина-Строй»' AND p.acquired_at >= '2015-03-01' AND p.acquired_at < '2016-01-01'`,
    // только адреса, IN вместо =
    `WITH gs AS (SELECT id FROM companies WHERE name LIKE '%Глубина-Строй%')
     SELECT address_text FROM properties WHERE grantor_company_id IN (SELECT id FROM gs)
       AND acquired_at BETWEEN '2015-03-01' AND '2015-12-31'`,
  ],
  o7_2: [
    // анти-джойн через LEFT JOIN
    `WITH flats AS (SELECT * FROM properties WHERE grantor_company_id = 18 AND acquired_at BETWEEN '2015-03-01' AND '2015-12-31')
     SELECT f.owner_person_id, p.full_name, f.address_text
     FROM flats f JOIN persons p ON p.id = f.owner_person_id
     LEFT JOIN employment e ON e.person_id = f.owner_person_id AND e.company_id = 18
     WHERE e.id IS NULL`,
    // только ФИО, NOT EXISTS через COUNT
    `WITH flats AS (SELECT owner_person_id FROM properties WHERE grantor_company_id = 18 AND acquired_at LIKE '2015-%' AND acquired_at >= '2015-03-01')
     SELECT p.full_name FROM persons p JOIN flats f ON f.owner_person_id = p.id
     WHERE (SELECT COUNT(*) FROM employment e WHERE e.person_id = p.id AND e.company_id = 18) = 0`,
  ],
  o7_3: [
    // одним запросом по счёту, с полным временем
    `SELECT ts, amount, purpose FROM transactions
     WHERE account_id = 'ACC-41104' AND counterparty = 'Фонд «Тёплый берег»' ORDER BY ts`,
    // UNION ALL с метками и суммами по модулю
    `SELECT date(ts) AS d, 'платёж' AS вид, amount AS amount, purpose FROM transactions WHERE account_id = 'ACC-41104' AND purpose LIKE 'матпомощь%'
     UNION ALL
     SELECT date(ts), 'возврат', abs(amount), purpose FROM transactions WHERE account_id = 'ACC-41104' AND amount < 0 AND purpose LIKE 'возврат%'`,
  ],
  o7_3b: [
    "SELECT * FROM zags_deaths WHERE person_id = 1105",
    "SELECT p.full_name, z.died_at FROM persons p JOIN zags_deaths z ON z.person_id = p.id WHERE p.last_name LIKE 'Ратников%'",
  ],
  o7_4: [
    // только ФИО держателей, NOT EXISTS вместо EXCEPT
    `SELECT DISTINCT a.holder_name FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.counterparty = 'Фонд «Тёплый берег»' AND t.amount > 0 AND t.ts < '2018-01-01 00:00:00'
       AND NOT EXISTS (SELECT 1 FROM transactions r WHERE r.account_id = t.account_id AND r.amount < 0
                         AND r.counterparty = 'Фонд «Тёплый берег»' AND r.ts < '2018-01-01 00:00:00')`,
    // EXCEPT по счетам, затем к людям
    `WITH kept AS (
       SELECT account_id FROM transactions WHERE counterparty = 'Фонд «Тёплый берег»' AND amount > 0 AND ts BETWEEN '2015-01-01 00:00:00' AND '2017-12-31 23:59:59'
       EXCEPT
       SELECT account_id FROM transactions WHERE purpose = 'возврат: отказ получателя' AND ts BETWEEN '2015-01-01 00:00:00' AND '2017-12-31 23:59:59')
     SELECT a.holder_person_id AS person_id, p.full_name FROM kept k JOIN accounts a ON a.id = k.account_id JOIN persons p ON p.id = a.holder_person_id`,
  ],
  o7_5: [
    // INTERSECT по именам держателей счетов
    `SELECT a.holder_name FROM properties pr JOIN accounts a ON a.holder_person_id = pr.owner_person_id
     WHERE pr.grantor_company_id = 18 AND pr.acquired_at BETWEEN '2015-03-01' AND '2015-12-31'
     INTERSECT
     SELECT a.holder_name FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.counterparty = 'Фонд «Тёплый берег»' AND t.amount > 0 AND t.ts < '2018-01-01 00:00:00'
     EXCEPT
     SELECT a.holder_name FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.purpose = 'возврат: отказ получателя' AND t.ts < '2018-01-01 00:00:00'`,
    // цепочка CTE: квартиры ∩ получатели − вернувшие, ответ — id
    `WITH flats AS (SELECT owner_person_id AS pid FROM properties WHERE grantor_company_id = 18 AND acquired_at BETWEEN '2015-03-01' AND '2015-12-31'),
          paid AS (SELECT a.holder_person_id AS pid FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.counterparty = 'Фонд «Тёплый берег»' AND t.amount > 0 AND t.ts < '2018-01-01 00:00:00'),
          back AS (SELECT a.holder_person_id AS pid FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.purpose = 'возврат: отказ получателя' AND t.ts < '2018-01-01 00:00:00')
     SELECT pid FROM flats INTERSECT SELECT pid FROM paid EXCEPT SELECT pid FROM back`,
  ],
  o7_6: [
    "SELECT full_name, department, diagnosis, admitted_at FROM hospital_admissions WHERE person_id = 1104",
    "SELECT * FROM hospital_admissions ORDER BY admitted_at DESC LIMIT 3",
  ],
};

const WRONG: Record<string, string[]> = {
  o7_1: [
    // забыт период: в выдачу попадают квартиры 2014 и 2016 годов
    "SELECT id, address_text FROM properties WHERE grantor_company_id = 18",
    // «весь 2015-й» вместо «с марта»: февральская квартира лишняя
    "SELECT id, address_text FROM properties WHERE grantor_company_id = 18 AND acquired_at LIKE '2015%'",
    // по основанию, без дарителя: шум с «передачей от работодателя» тоже здесь
    "SELECT id, address_text FROM properties WHERE basis = 'передача от работодателя' AND acquired_at BETWEEN '2015-03-01' AND '2015-12-31'",
    // ошибка тетради: «%Глубина%» находит сначала АО «Глубина» (id 2) — пусто
    `SELECT id FROM properties WHERE grantor_company_id = (SELECT id FROM companies WHERE name LIKE '%Глубина%') AND acquired_at BETWEEN '2015-03-01' AND '2015-12-31'`,
  ],
  o7_2: [
    // ловушка реального мира: NOT IN по employment с NULL у подрядчиков → 0 строк
    `WITH flats AS (SELECT owner_person_id FROM properties WHERE grantor_company_id = 18 AND acquired_at BETWEEN '2015-03-01' AND '2015-12-31')
     SELECT owner_person_id FROM flats WHERE owner_person_id NOT IN (SELECT person_id FROM employment WHERE company_id = 18)`,
    // «проверь, что значит поле»: по тексту должности Петров выпадает
    `WITH flats AS (SELECT owner_person_id FROM properties WHERE grantor_company_id = 18 AND acquired_at BETWEEN '2015-03-01' AND '2015-12-31')
     SELECT owner_person_id FROM flats f WHERE NOT EXISTS (SELECT 1 FROM employment e WHERE e.person_id = f.owner_person_id
       AND (e.company_id = 18 OR e.position LIKE '%Глубина-Стро%'))`,
    // условие на правую таблицу в WHERE: LEFT JOIN превращается во «внутренний»
    `WITH flats AS (SELECT owner_person_id FROM properties WHERE grantor_company_id = 18 AND acquired_at BETWEEN '2015-03-01' AND '2015-12-31')
     SELECT f.owner_person_id FROM flats f LEFT JOIN employment e ON e.person_id = f.owner_person_id WHERE e.company_id <> 18`,
  ],
  o7_3: [
    // ловушка дела: UNION схлопывает два одинаковых возврата 08.11.2016 → 47
    `SELECT date(ts) AS date, amount, purpose FROM transactions WHERE account_id = 'ACC-41104' AND counterparty = 'Фонд «Тёплый берег»' AND amount > 0
     UNION
     SELECT date(ts), amount, purpose FROM transactions WHERE account_id = 'ACC-41104' AND purpose = 'возврат: отказ получателя'`,
    // только платежи
    "SELECT date(ts), amount, purpose FROM transactions WHERE account_id = 'ACC-41104' AND amount > 0 AND counterparty = 'Фонд «Тёплый берег»'",
    // весь счёт без фильтра по фонду: довольствие и аптека лишние
    "SELECT date(ts), amount, purpose FROM transactions WHERE account_id = 'ACC-41104'",
    // DISTINCT в одном запросе — та же потеря строки
    "SELECT DISTINCT date(ts), amount, purpose FROM transactions WHERE account_id = 'ACC-41104' AND counterparty = 'Фонд «Тёплый берег»'",
  ],
  o7_3b: [
    "SELECT id, full_name FROM persons WHERE last_name = 'Ратников'",
    "SELECT * FROM staff WHERE full_name LIKE 'Ратников%'",
  ],
  o7_4: [
    // период только в первой части: возврат Пахомовой 2026 года вычитает её
    `SELECT a.holder_person_id, a.holder_name FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.counterparty = 'Фонд «Тёплый берег»' AND t.amount > 0 AND t.ts BETWEEN '2015-01-01 00:00:00' AND '2017-12-31 23:59:59'
     EXCEPT
     SELECT a.holder_person_id, a.holder_name FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.purpose = 'возврат: отказ получателя'`,
    // без вычитания: Ратников в списке
    `SELECT DISTINCT a.holder_person_id, a.holder_name FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.counterparty = 'Фонд «Тёплый берег»' AND t.amount > 0 AND t.ts < '2018-01-01 00:00:00'`,
    // в частях лишний столбец (сумма): строки не совпадают и ничего не вычитается
    `SELECT a.holder_person_id, t.amount FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.counterparty = 'Фонд «Тёплый берег»' AND t.ts < '2018-01-01 00:00:00'
     EXCEPT
     SELECT a.holder_person_id, t.amount FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.purpose = 'возврат: отказ получателя' AND t.ts < '2018-01-01 00:00:00'`,
  ],
  o7_5: [
    // пересечение со всеми получателями фонда: Ратников остаётся
    `SELECT owner_person_id FROM properties WHERE grantor_company_id = 18 AND acquired_at BETWEEN '2015-03-01' AND '2015-12-31'
     INTERSECT
     SELECT a.holder_person_id FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.counterparty = 'Фонд «Тёплый берег»' AND t.amount > 0`,
    // ошибка тетради: id против ФИО — пусто
    `SELECT owner_person_id FROM properties WHERE grantor_company_id = 18 AND acquired_at BETWEEN '2015-03-01' AND '2015-12-31'
     INTERSECT
     SELECT a.holder_name FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.counterparty = 'Фонд «Тёплый берег»'`,
    // EXCEPT вместо INTERSECT: строители без денег фонда
    `SELECT owner_person_id FROM properties WHERE grantor_company_id = 18 AND acquired_at BETWEEN '2015-03-01' AND '2015-12-31'
     EXCEPT
     SELECT a.holder_person_id FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.counterparty = 'Фонд «Тёплый берег»'`,
  ],
  o7_6: [
    // забыт DESC: самая старая строка
    "SELECT * FROM hospital_admissions ORDER BY admitted_at LIMIT 1",
    // вся кардиология без сортировки и предела
    "SELECT * FROM hospital_admissions WHERE department = 'кардиология ГБ № 1'",
  ],
};

describe("эталоны задач", () => {
  it("эталоны проходят по порядку через checkCaseProgress, каждый быстрее 1 с", () => {
    const completed = new Set<string>();
    for (const o of mainObjectives(CASE)) {
      const t0 = performance.now();
      const result = run(o.solution);
      const ms = performance.now() - t0;
      expect(result.error, `${o.id}: ${result.error}`).toBeUndefined();
      expect(ms, o.id).toBeLessThan(1000);
      const progress = checkCaseProgress(CASE, result, db, completed);
      expect(progress.completed.map((c) => c.objectiveId), `${o.id}: ${progress.activeFeedback}`).toContain(o.id);
      const done = progress.completed.find((c) => c.objectiveId === o.id);
      expect(done?.evidence?.id).toBe(o.evidence?.id);
      completed.add(o.id);
    }
    expect(completed.size).toBe(6);
  });

  it("★ o7_3b засчитывается своим эталоном на любом шаге", () => {
    const result = run(objective("o7_3b").solution);
    const progress = checkCaseProgress(CASE, result, db, new Set());
    expect(progress.completed.map((c) => c.objectiveId)).toEqual(["o7_3b"]);
  });

  it("эталоны проходят table-guard с таблицами дела, закрытые таблицы — «нет допуска»", () => {
    for (const o of CASE.objectives) {
      const result = executeSQL(db, o.solution, CASE.tables);
      expect(result.errorKind, o.id).toBeUndefined();
    }
    for (const closed of ["door_access", "bank_statements", "cron_jobs", "purchases"]) {
      expect(executeSQL(db, `SELECT * FROM ${closed} LIMIT 1`, CASE.tables).error, closed).toBeDefined();
    }
  });

  it.each(Object.entries(ALTERNATIVES))("альтернативные верные запросы засчитываются: %s", (id, sqls) => {
    for (const sql of sqls) expect(passes(id, sql), `${id}: ${sql}`).toBe(true);
  });

  it.each(Object.entries(WRONG))("правдоподобные ошибки не засчитываются: %s", (id, sqls) => {
    expect(sqls.length).toBeGreaterThanOrEqual(2);
    for (const sql of sqls) expect(passes(id, sql), `${id}: ${sql}`).toBe(false);
  });

  it("до госпитализации задача 7.6 не решается: строки 601 ещё нет", () => {
    expect(one("SELECT COUNT(*) FROM hospital_admissions WHERE id = 601", dbStart)).toBe(0);
    expect(passes("o7_6", objective("o7_6").solution, dbStart)).toBe(false);
  });

  it("эталоны 7.1–7.5 дают один ответ на старте дела и на его потолке", async () => {
    const atCap = await openAt(CAP, ADMITTED);
    for (const o of mainObjectives(CASE).filter((x) => x.id !== "o7_6")) {
      expect(run(o.solution, dbStart).rows, o.id).toEqual(run(o.solution, atCap).rows);
    }
  });

  it("предсказание 7.3: UNION без ALL возвращает 47 строк, UNION ALL — 48", () => {
    const p = objective("o7_3").prediction;
    expect(p).toBeDefined();
    expect(run(p?.sql ?? "").rowCount).toBe(p?.answer);
    expect(p?.answer).toBe(47);
    expect(run(objective("o7_3").solution).rowCount).toBe(48);
  });

  it("подсказки уровня 4 (тетрадь Ирины) содержат ровно одну ошибку: их запрос не засчитывается", () => {
    for (const o of mainObjectives(CASE)) {
      const last = o.hints[o.hints.length - 1];
      expect(last.by, o.id).toBe("irina");
      const sql = last.text.slice(last.text.indexOf("\n") + 1);
      expect(passes(o.id, sql), `${o.id}: ${sql}`).toBe(false);
    }
  });

  it("примеры справочника выполняются на мире дела", () => {
    for (const e of handbookByCase.c07) {
      for (const sql of e.example.split(/\n\n/)) {
        const result = run(sql);
        expect(result.error, `${e.id}: ${result.error}`).toBeUndefined();
        expect(result.rowCount, e.id).toBeGreaterThan(0);
      }
    }
  });
});

// ==================================================================== протокол

describe("протокол", () => {
  const protocol = () => {
    if (!CASE.protocol) throw new Error("нет протокола");
    return CASE.protocol;
  };

  it("каждый ответ находится в результатах эталонов (scanSeenOptions)", () => {
    const seen = new Set<string>();
    for (const o of mainObjectives(CASE)) for (const v of scanSeenOptions(protocol(), run(o.solution))) seen.add(v);
    for (const blank of protocol().blanks) expect(seen.has(blank.answer), `${blank.id}: ${blank.answer}`).toBe(true);
    // ложные варианты тоже видны — выбор не угадывается по списку
    expect(seen.has("Петров Виктор Семёнович")).toBe(true);
    expect(seen.has("Пахомова Зинаида Павловна")).toBe(true);
  });

  it("верные ответы подтверждаются полностью, неверные — нет", () => {
    const answers = Object.fromEntries(protocol().blanks.map((b) => [b.id, b.answer]));
    expect(checkProtocol(protocol(), answers, new Set()).solved).toBe(true);

    const swapped = { ...answers, kept1: "Мирошник Алла Дмитриевна", kept2: "Шубин Аркадий Алексеевич" };
    const check = checkProtocol(protocol(), swapped, new Set());
    expect(check.solved).toBe(false);
    expect(check.confirmed).toEqual(["address", "owner", "purpose"]);

    const bad = { ...answers, owner: "Шубин Аркадий Алексеевич", purpose: "матпомощь: лечение члена семьи", kept1: "Петров Виктор Семёнович" };
    expect(checkProtocol(protocol(), bad, new Set()).confirmed).toEqual([]);
  });
});

// ==================================================================== допрос и события

const card = (columns: string[], values: (string | number | null)[], table?: string): PinnedCard => ({
  id: `card-${columns.join("-")}`,
  columns,
  values,
  ...(table ? { table } : {}),
});

describe("допрос «Исповедь» и живые события", () => {
  const office = () => {
    const scene = CASE.scenes.find((s) => s.id === "office");
    if (!scene?.interrogation) throw new Error("нет допроса в сцене office");
    return scene.interrogation;
  };
  const present = (line: string) => {
    const p = office().points.find((x) => x.line === line)?.present;
    if (!p) throw new Error(`нет предъявления на ${line}`);
    return p;
  };

  it("допрос-союзник: Ратников, шаги neutral → uneasy → ashamed → broken, утверждения .004 .008 .012 .016", () => {
    expect(office().suspect).toBe("ratnikov");
    expect(office().mode).toBe("ally");
    expect(office().breakSteps).toEqual(["neutral", "uneasy", "ashamed", "broken"]);
    expect(office().points.map((p) => p.line)).toEqual(["c07.office.004", "c07.office.008", "c07.office.012", "c07.office.016"]);
    const texts = Object.fromEntries(CASE.scenes.flatMap((s) => s.lines).map((l) => [l.id, l.text]));
    expect(texts["c07.office.004"]).toBe("Квартиру получил по очереди, как все.");
    expect(texts["c07.office.016"]).toBe("От фонда я ничего не брал.");
    expect(texts["c07.corridor.002"]).toBe("Куда его повезли?!");
    expect(texts["c07.corridor.005"]).toBe("Не надо.");
  });

  it("«квартира» пробивается картой Северная, 14-27 или уликой 7.2", () => {
    const flat = rows("SELECT id, address_text, owner_person_id FROM properties WHERE address_text = 'Северная, 14-27'")[0] as (string | number)[];
    expect(presentMatches(present("c07.office.004"), { cards: [card(["id", "address_text", "owner_person_id"], flat, "properties")] })).toBe(true);
    expect(presentMatches(present("c07.office.004"), { evidenceIds: ["ev.c07.flat"] })).toBe(true);
    expect(presentMatches(present("c07.office.004"), { evidenceIds: ["ev.c07.flats"] })).toBe(false);
  });

  it("«дело вёл как положено» пробивается документом 3313; «не выезжал» — строкой 7", () => {
    const doc = rows("SELECT id, reg_no, doc_type, note FROM doc_registry WHERE year = 2015 AND reg_no = 3313")[0] as (string | number)[];
    expect(doc).toBeDefined();
    expect(presentMatches(present("c07.office.008"), { cards: [card(["id", "reg_no", "doc_type", "note"], doc, "doc_registry")] })).toBe(true);
    const row7 = rows("SELECT id, applicant_text, description FROM incidents WHERE id = 7")[0] as (string | number)[];
    expect(presentMatches(present("c07.office.012"), { cards: [card(["id", "applicant_text", "description"], row7, "incidents")] })).toBe(true);
    expect(presentMatches(present("c07.office.012"), { cards: [card(["id", "reg_no", "doc_type", "note"], doc, "doc_registry")] })).toBe(false);
  });

  it("«от фонда ничего не брал» — правда: пробой требует обеих карточек A и B", () => {
    const p = present("c07.office.016");
    expect(presentMatches(p, { evidenceIds: ["ev.c07.ledger", "ev.c07.kept"] })).toBe(true);
    expect(presentMatches(p, { evidenceIds: ["ev.c07.ledger"] })).toBe(false);
    expect(presentMatches(p, { evidenceIds: ["ev.c07.kept"] })).toBe(false);
  });

  it("сочувственная ветка открывается только с A, B и датой смерти Тамары; полное признание — флаг ratnikov_full", () => {
    const confession = CASE.scenes.find((s) => s.id === "confession");
    const tamara = confession?.choices?.find((c) => c.goto === "office_tamara");
    expect(tamara?.requires).toEqual(["ev.c07.ledger", "ev.c07.kept", "ev.c07.tamara"]);
    const record = CASE.scenes.find((s) => s.id === "record");
    expect(record?.choices?.find((c) => c.flag === "ratnikov_full")?.goto).toBe("record_on");
  });

  it("Даша в кабинете — только при dasha_knows_burial; госпитализация — по концу сцены collapse", () => {
    const base = { queryCount: 20, now: "2026-12-21 18:40:00", fired: new Set<string>(), completed: new Set<string>() };
    const afterShubin = { ...base, endedScenes: new Set(["shubin"]) };
    expect(dueEvents(CASE, { ...afterShubin, flags: { dasha_knows_burial: true } }).map((e) => e.scene)).toEqual(["office_dasha"]);
    expect(dueEvents(CASE, { ...afterShubin, flags: {} }).map((e) => e.scene)).toEqual(["office_alone"]);
    const afterCollapse = dueEvents(CASE, { ...base, endedScenes: new Set(["collapse"]) });
    expect(afterCollapse.map((e) => [e.patch, e.scene])).toEqual([["c07.admission", "ambulance"]]);
    expect(STORY_PATCHES["c07.admission"]).toBeDefined();
    const afterCorridor = { ...base, endedScenes: new Set(["corridor"]) };
    expect(dueEvents(CASE, { ...afterCorridor, flags: {} }).map((e) => e.scene)).toEqual(["dasha_silent"]);
    expect(dueEvents(CASE, { ...afterCorridor, flags: { dasha_knows_burial: true } }).map((e) => e.scene)).toEqual(["dasha_knew"]);
  });
});

// ==================================================================== факты разд. 8.4 (Д7)

describe("посаженные факты Д7", () => {
  const WINDOW = "grantor_company_id = 18 AND acquired_at BETWEEN '2015-03-01' AND '2015-12-31'";

  it("ровно 22 квартиры жилфонда «Глубина-Строя» в окне — это properties 401–422 на Северной, 14 и 16", () => {
    expect(rows(`SELECT id FROM properties WHERE ${WINDOW} ORDER BY id`).map((r) => r[0])).toEqual(
      Array.from({ length: 22 }, (_, i) => 401 + i)
    );
    expect(one(`SELECT COUNT(*) FROM properties WHERE ${WINDOW} AND address_text NOT GLOB 'Северная, 1[46]-*'`)).toBe(0);
    expect(one("SELECT name FROM companies WHERE id = 18")).toBe("ООО «Глубина-Строй»");
    // вне окна — ровно три квартиры «Глубина-Строя»: окно 7.1 не пустая формальность
    expect(rows("SELECT id FROM properties WHERE grantor_company_id = 18 AND id NOT BETWEEN 401 AND 422 ORDER BY id").map((r) => r[0])).toEqual([...C07.outOfWindowFlatIds]);
    // на Северной, 14 и 16 нет квартир, кроме жилфонда
    expect(one("SELECT COUNT(*) FROM properties WHERE address_text GLOB 'Северная, 1[46]-*' AND id NOT BETWEEN 401 AND 422")).toBe(0);
    expect(one("SELECT COUNT(*) FROM properties WHERE address_text LIKE 'Северная, 14%' AND acquired_at LIKE '2015%'")).toBe(10);
  });

  it("квартиры посторонних: Ратников 14-27 (18.12.2015), Шубин 14-31, Мирошник 16-4, Петров 16-9", () => {
    const got = rows("SELECT owner_person_id, address_text, acquired_at FROM properties WHERE owner_person_id IN (1104, 1602, 1530, 1777) ORDER BY owner_person_id");
    expect(got).toEqual(
      [...C07_OUTSIDERS]
        .sort((a, b) => a.person - b.person)
        .map((o) => [o.person, `Северная, ${o.house}-${o.apt}`, o.acquired])
    );
    expect(rows("SELECT address_text, acquired_at FROM properties WHERE owner_person_id = 1104")).toEqual([["Северная, 14-27", "2015-12-18"]]);
  });

  it("ровно четверо получателей ни дня не работали в «Глубина-Строе»; NOT IN даёт ноль строк", () => {
    const outsiders = rows(`SELECT owner_person_id FROM properties pr WHERE ${WINDOW}
      AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.person_id = pr.owner_person_id AND e.company_id = 18) ORDER BY 1`);
    expect(outsiders.map((r) => r[0])).toEqual([1104, 1530, 1602, 1777]);
    expect(one("SELECT COUNT(*) FROM employment WHERE company_id = 18 AND person_id IS NULL")).toBe(4);
    expect(one(`SELECT COUNT(*) FROM properties WHERE ${WINDOW} AND owner_person_id NOT IN (SELECT person_id FROM employment WHERE company_id = 18)`)).toBe(0);
    // Петров — в медсанчасти (отдельное юрлицо), и в должности упомянута стройка
    expect(rows("SELECT company_id, position FROM employment WHERE person_id = 1777 ORDER BY from_date")[0]).toEqual([90, "врач здравпункта стройплощадки «Глубина-Строя»"]);
    expect(one("SELECT COUNT(*) FROM employment WHERE person_id IN (1104, 1602, 1530, 1777) AND company_id = 18")).toBe(0);
  });

  it("лента Ратникова: 24 × 25 000 (01.2016–12.2017) и 24 возврата, два — одинаковые строки 08.11.2016", () => {
    const acc = C07.account.ratnikov;
    expect(rows(`SELECT id, holder_name FROM accounts WHERE holder_person_id = 1104`)).toEqual([[acc, "Ратников Л. Б."]]);
    expect(rows(`SELECT COUNT(*), MIN(ts), MAX(ts), SUM(amount) FROM transactions WHERE account_id = '${acc}' AND counterparty = 'Фонд «Тёплый берег»' AND amount > 0`)[0].slice(0, 1)).toEqual([24]);
    expect(one(`SELECT MIN(substr(ts, 1, 7)) || '…' || MAX(substr(ts, 1, 7)) FROM transactions WHERE account_id = '${acc}' AND amount = 25000`)).toBe("2016-01…2017-12");
    expect(one(`SELECT COUNT(*) FROM transactions WHERE account_id = '${acc}' AND amount = -25000 AND purpose = 'возврат: отказ получателя'`)).toBe(24);
    expect(rows(`SELECT ts, amount, counterparty, counterparty_account, channel, purpose, COUNT(*) FROM transactions
      WHERE account_id = '${acc}' AND date(ts) = '2016-11-08' GROUP BY 1, 2, 3, 4, 5, 6`)).toEqual([
      [C07.doubleRefundAt, -25000, "Фонд «Тёплый берег»", "ACC-10003", "перевод", "возврат: отказ получателя", 2],
    ]);
    // в остальные дни одинаковых строк нет: UNION теряет ровно одну
    expect(one(`SELECT COUNT(*) FROM (SELECT date(ts), amount, purpose FROM transactions WHERE account_id = '${acc}' AND counterparty = 'Фонд «Тёплый берег»'
      GROUP BY 1, 2, 3 HAVING COUNT(*) > 1)`)).toBe(1);
    // возвраты — все в 2016–2017
    expect(one(`SELECT COUNT(*) FROM transactions WHERE account_id = '${acc}' AND amount < 0 AND counterparty = 'Фонд «Тёплый берег»' AND ts NOT BETWEEN '2016-01-01' AND '2017-12-31 23:59:59'`)).toBe(0);
  });

  it("Шубину 36 × 40 000, Мирошник 24 × 30 000 — возвратов нет; переселенцам — 57 разовых «матпомощь»", () => {
    expect(rows(`SELECT COUNT(*), MIN(amount), MAX(amount) FROM transactions WHERE account_id = '${C07.account.shubin}' AND counterparty = 'Фонд «Тёплый берег»'`)[0]).toEqual([36, 40000, 40000]);
    expect(rows(`SELECT COUNT(*), MIN(amount), MAX(amount) FROM transactions WHERE account_id = '${C07.account.miroshnik}' AND counterparty = 'Фонд «Тёплый берег»'`)[0]).toEqual([24, 30000, 30000]);
    expect(rows(`SELECT holder_person_id FROM accounts WHERE id IN ('${C07.account.shubin}', '${C07.account.miroshnik}') ORDER BY 1`)).toEqual([[1530], [1602]]);
    expect(rows(`SELECT COUNT(*), COUNT(DISTINCT account_id), MIN(ts) >= '2015-03-01', MAX(ts) < '2016-01-01' FROM transactions WHERE purpose = '${C07.purpose.resettler}'`)[0]).toEqual([57, 57, 1, 1]);
    // за 2015–2017 фонд платил 60 получателям, вернул один Ратников
    expect(one(`SELECT COUNT(DISTINCT a.holder_person_id) FROM transactions t JOIN accounts a ON a.id = t.account_id
      WHERE t.counterparty = 'Фонд «Тёплый берег»' AND t.amount > 0 AND t.ts < '2018-01-01'`)).toBe(61);
    expect(rows(`SELECT DISTINCT a.holder_person_id FROM transactions t JOIN accounts a ON a.id = t.account_id
      WHERE t.purpose = 'возврат: отказ получателя' AND t.ts < '2018-01-01'`)).toEqual([[1104]]);
  });

  it("единственные, у кого и квартира, и деньги без возврата, — Шубин и Мирошник", () => {
    const both = rows(`SELECT owner_person_id FROM properties WHERE ${WINDOW}
      INTERSECT SELECT a.holder_person_id FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE t.counterparty = 'Фонд «Тёплый берег»' AND t.amount > 0 AND t.ts < '2018-01-01'
      EXCEPT SELECT a.holder_person_id FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE t.purpose = 'возврат: отказ получателя' AND t.ts < '2018-01-01' ORDER BY 1`);
    expect(both).toEqual([[1530], [1602]]);
  });

  it("Ратникова Тамара Викторовна (1105): death_date 2016-03-14, прописана на Северной, 14-27 до смерти", () => {
    expect(rows("SELECT full_name, death_date FROM persons WHERE id = 1105")).toEqual([["Ратникова Тамара Викторовна", "2016-03-14"]]);
    expect(rows(`SELECT r.to_date FROM registrations r JOIN addresses a ON a.id = r.address_id
      WHERE r.person_id = 1105 AND a.street = 'Северная' AND a.house = '14' AND a.apt = '27'`)).toEqual([["2016-03-14"]]);
  });

  it("госпитализация: 601 — последняя строка горздрава, другого Ратникова в больнице нет", () => {
    expect(rows("SELECT id, person_id, full_name, admitted_at, discharged_at, department, diagnosis FROM hospital_admissions ORDER BY admitted_at DESC LIMIT 1", db)).toEqual([
      [601, 1104, "Ратников Лев Борисович", ADMITTED, null, "кардиология ГБ № 1", "ОКС"],
    ]);
    expect(one("SELECT COUNT(*) FROM main.hospital_admissions WHERE person_id = 1104 OR full_name LIKE 'Ратников%'", db)).toBe(1);
    expect(one("SELECT COUNT(*) FROM hospital_admissions WHERE admitted_at BETWEEN '2026-12-21 16:00:00' AND '2026-12-22 00:00:00'")).toBe(0);
  });

  it("пропуск игрока: единственный выход B-9000 — КПП-1, 21.12 23:41:00", () => {
    expect(rows("SELECT ts, door, direction FROM door_access WHERE badge_id = 'B-9000'")).toEqual([["2026-12-21 23:41:00", "КПП-1", "выход"]]);
  });

  it("посаженные жители дела прописаны — «мёртвых душ» не прибавилось", () => {
    expect(one(`SELECT COUNT(*) FROM (
        SELECT owner_person_id AS pid FROM properties WHERE grantor_company_id = 18
        UNION SELECT a.holder_person_id FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.purpose = '${C07.purpose.resettler}'
      ) x WHERE NOT EXISTS (SELECT 1 FROM registrations r WHERE r.person_id = x.pid)`)).toBe(0);
  });
});
