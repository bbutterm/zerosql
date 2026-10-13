/**
 * Дело № 08 «Призрак в системе» (case-08-prizrak): контент, эталоны,
 * ловушки, обвинение, допрос и посаженные факты разд. 8.4 библии.
 *
 * TECH_SPEC разд. 5: мир генерируется один раз, каждая задача проходит
 * своим эталоном по порядку, альтернативой и не проходит правдоподобными
 * ошибками; эталоны укладываются в таблицы и понятия дела.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Database } from "sql.js";
import {
  activeObjective,
  checkAccusation,
  checkCaseProgress,
  collectEvidenceIds,
  executeSQL,
  exportWorld,
  generateWorld,
  mainObjectives,
  openCaseDatabase,
  optionalObjectives,
  presentMatches,
  scanSeen,
  validateCaseContent,
  type CaseDef,
  type CaseObjective,
  type PinnedCard,
  type QueryResult,
} from "@/engine";
import { cases, characters, getCase } from "@/data";

const CASE_ID = "case-08-prizrak";
const c08 = getCase(CASE_ID) as CaseDef;
const START = "2026-12-24 09:00:00";
const CAP = "2026-12-24 13:00:00";
/** Кода открывается выбором после допроса (флаг c08_coda) */
const CODA = { c08_coda: true } as const;

let db: Database;
let capDb: Database;
let genMs = 0;

/**
 * База дела на часах Д8. Задания zero (М6), сработавшие до Д8 при любом
 * прохождении: № 1 — живое событие Д5, № 5 и № 6 — «всегда» после Д6.
 */
async function caseDb(bytes: Uint8Array, clock: string): Promise<Database> {
  return openCaseDatabase(bytes, {
    clock,
    tables: c08.tables,
    patches: [
      { id: "cron.fire", params: { jobId: 1, variant: "a", at: "2026-12-15 03:12:00" } },
      { id: "cron.fire", params: { jobId: 5, at: "2026-12-18 03:12:00" } },
      { id: "cron.fire", params: { jobId: 6, at: "2026-12-18 03:12:00" } },
    ],
  });
}

beforeAll(async () => {
  const t0 = performance.now();
  const world = await generateWorld();
  genMs = performance.now() - t0;
  // Выход B-9000 21.12 23:41 сажает дело 07 (plants/README.md). Пока c07 —
  // заглушка, тест повторяет его посадку; после слияния строка уже есть.
  const b9000 = world.exec("SELECT COUNT(*) FROM main.door_access WHERE badge_id = 'B-9000' AND ts = '2026-12-21 23:41:00'");
  if (Number(b9000[0].values[0][0]) === 0) {
    world.run("INSERT INTO main.door_access (ts, badge_id, door, direction, note) VALUES ('2026-12-21 23:41:00', 'B-9000', 'КПП-1', 'выход', NULL)");
  }
  const bytes = exportWorld(world);
  world.close();
  db = await caseDb(bytes, START);
  capDb = await caseDb(bytes, CAP);
}, 60_000);

afterAll(() => {
  db?.close();
  capDb?.close();
});

// ------------------------------------------------------------------ помощники

const objective = (id: string): CaseObjective => {
  const o = c08.objectives.find((x) => x.id === id);
  if (!o) throw new Error(`нет задачи ${id}`);
  return o;
};

function run(sql: string, on: Database = db): QueryResult {
  return executeSQL(on, sql, c08.tables);
}

function rowsOf(sql: string, on: Database = db): unknown[][] {
  const r = run(sql, on);
  if (r.error) throw new Error(`${r.error}\n${sql}`);
  return r.rows;
}

/** Задачи, выполненные к моменту, когда активна данная */
function doneBefore(o: CaseObjective): Set<string> {
  const mains = mainObjectives(c08, CODA);
  if (o.optional) return new Set(mains.map((m) => m.id));
  return new Set(mains.filter((m) => m.order < o.order).map((m) => m.id));
}

/** Засчитывает ли запрос задачу (если она активна / проверяется) */
function passes(id: string, sql: string, on: Database = db): boolean {
  const o = objective(id);
  const result = run(sql, on);
  expect(result.error, `${id}: ${result.error}\n${sql}`).toBeNull();
  const progress = checkCaseProgress(c08, result, on, doneBefore(o), { flags: CODA });
  return progress.completed.some((c) => c.objectiveId === id);
}

const card = (id: string, r: QueryResult, i: number, sourceClass: PinnedCard["sourceClass"] = "mirror_siyanie"): PinnedCard => ({
  id,
  columns: r.columns,
  values: r.rows[i] as PinnedCard["values"],
  sourceClass,
});

// ------------------------------------------------------------------ контент

describe("контент дела", () => {
  it("validateCaseContent: проблем нет", () => {
    expect(validateCaseContent(c08, characters, collectEvidenceIds(cases))).toEqual([]);
  });

  it("мир генерируется за разумное время", () => {
    expect(genMs).toBeLessThan(15_000);
  });

  it("каркас по библии: 24.12 09:00, потолок 13:00, минута на запрос, новые таблицы Д8", () => {
    expect(c08.date).toBe("2026-12-24 09:00");
    expect(c08.clock?.cap).toBe("2026-12-24 13:00");
    expect(c08.minutesPerQuery).toBe(1);
    expect(c08.act).toBe(2);
    expect(c08.newTables).toEqual(["door_access", "purchases", "messenger_events", "phones", "cron_jobs"]);
    expect(c08.concepts).toEqual(["h.window", "h.row_number_rank", "h.lag_lead", "w.skud"]);
  });

  it("основные задачи 8.0–8.4 и кода; ★-задачи необязательны", () => {
    expect(mainObjectives(c08, CODA).map((o) => o.id)).toEqual(["o8_0", "o8_0b", "o8_1", "o8_2", "o8_3", "o8_4", "o8_5"]);
    expect(optionalObjectives(c08).map((o) => o.id)).toEqual(["o8_5s", "o8_6s", "o8_7s"]);
    // Кода не активна до выбора после допроса: после 8.4 открывается обвинение
    const upTo84 = new Set(["o8_0", "o8_0b", "o8_1", "o8_2", "o8_3", "o8_4"]);
    expect(activeObjective(c08, upTo84, {})).toBeNull();
    expect(activeObjective(c08, upTo84, CODA)?.id).toBe("o8_5");
  });

  it("у каждой задачи 3–4 подсказки голосами, уровень 4 — Ратников по телефону (Д8–Д9)", () => {
    for (const o of c08.objectives) {
      expect(o.hints.length, o.id).toBeGreaterThanOrEqual(3);
      expect(o.hints.length, o.id).toBeLessThanOrEqual(4);
      for (const h of o.hints) expect(h.by, o.id).toBeDefined();
      expect(o.hints[o.hints.length - 1].by, o.id).toBe("ratnikov");
      expect(o.evidence?.id, o.id).toMatch(/^ev\.c08\./);
    }
  });

  it("реплики: короткие, без родовых форм в обращении к игроку и в его выборах", () => {
    const lines = c08.scenes.flatMap((s) => s.lines);
    for (const l of lines) expect(l.text.length, l.id).toBeLessThanOrEqual(220);
    const short = lines.filter((l) => l.text.length <= 120).length;
    expect(short / lines.length).toBeGreaterThan(0.9);
    // К игроку: выборы, подсказки, формулировки задач, выводы (голос Ноль)
    const toPlayer = [
      ...c08.scenes.flatMap((s) => (s.choices ?? []).map((ch) => [ch.id, ch.text] as const)),
      ...c08.objectives.flatMap((o) => [
        [o.id, o.task] as const,
        [o.id, o.success] as const,
        ...o.hints.map((h) => [o.id, h.text] as const),
      ]),
    ];
    const gendered = /\b(ты|я)\s+(?:[а-яё]+\s+)?[а-яё]+(?:л|ла|лся|лась)\b|\b(готов|готова|уверен|уверена|должен|должна|сам|сама)\b/i;
    for (const [id, text] of toPlayer) {
      const prose = text.split("\n").filter((s) => !/^\s*(SELECT|FROM|WHERE|WITH|JOIN|GROUP|ORDER|AND|ON|\)|\w+ AS \()/i.test(s)).join(" ");
      const hit = gendered.exec(prose.replace(/Где-то я, старый, напутал|не потерял ли я кого/g, ""));
      expect(hit?.[0], `${id}: «${prose}»`).toBeUndefined();
    }
  });

  it("твисты и моменты библии на месте: М14, М15, М16, М17", () => {
    const text = (id: string) => c08.scenes.flatMap((s) => s.lines).find((l) => l.id === id)?.text;
    expect(text("c08.cold_open.002")).toBe("Ваш логин в два сорок семь ночи выгрузил дело Сазонова целиком. Объяснитесь.");
    expect(text("c08.glass.002")).toBe("Так. Стоп. Он с двадцать второго не выходил?");
    expect(text("c08.int_tokha_fridays.002")).toBe("Она мне чай носила. По пятницам.");
    expect(text("c08.int_tokha_fridays.003")).toBe("Я до сих пор беру два. Рука сама.");
    expect(text("c08.int_tokha_loan.003")).toBe("Я сказал им, во сколько она уходит. Думал — напугают.");
    expect(text("c08.coda.030")).toBe("Каждую ночь в три двенадцать. Я думал — это она.");
    expect(text("c08.coda.031")).toBe("Понимаю, что так не бывает. А всё равно.");
    expect(text("c08.future_row.001")).toBe("Отложенная отправка. Я видел. Не стал трогать.");
    expect(text("c08.accuse_melnik.001")).toBe("Я в областном центре был, коллеги. Вот посадочный.");
    const choiceFlags = c08.scenes.flatMap((s) => (s.choices ?? []).map((ch) => ch.flag)).filter(Boolean);
    expect(choiceFlags).toEqual(expect.arrayContaining(["tokha_turned", "valentina_warned", "c08_coda"]));
  });
});

// ------------------------------------------------------------------ эталоны

/** Ключевые слова понятий из будущих дел (лестница разд. 4.1, п. 8) */
const FUTURE = /\bRECURSIVE\b|\bROWS\s+BETWEEN\b|\bRANGE\s+BETWEEN\b|\bIS\s+NOT\s+(?!NULL\b)|\|\||\bsubstr\b|\bgroup_concat\b|\binstr\b|\breplace\s*\(|\bGLOB\b|\bhex\s*\(|\b(SUM|AVG|MIN|MAX)\s*\([^)]*\)\s*OVER\b|\b(INSERT|UPDATE|DELETE|CREATE|BEGIN|COMMIT)\b/i;

describe("эталоны", () => {
  it("основные задачи проходят эталонами по порядку, каждая не дольше 1 с", () => {
    const done = new Set<string>();
    for (const o of mainObjectives(c08, CODA)) {
      const t0 = performance.now();
      const result = run(o.solution);
      const ms = performance.now() - t0;
      expect(result.error, `${o.id}: ${result.error}`).toBeNull();
      expect(ms, o.id).toBeLessThan(1000);
      expect(result.rowCount, o.id).toBeLessThanOrEqual(5000);
      const progress = checkCaseProgress(c08, result, db, done, { flags: CODA });
      expect(progress.completed[0]?.objectiveId, `${o.id}: ${progress.activeFeedback}`).toBe(o.id);
      done.add(o.id);
    }
    expect(activeObjective(c08, done, CODA)).toBeNull();
  });

  it("★-задачи проходят своими эталонами", () => {
    for (const o of optionalObjectives(c08)) {
      const t0 = performance.now();
      expect(passes(o.id, o.solution), o.id).toBe(true);
      expect(performance.now() - t0, o.id).toBeLessThan(1000);
    }
  });

  it("эталоны проходят table guard с таблицами дела и не берут понятий из будущих дел", () => {
    for (const o of c08.objectives) {
      const r = executeSQL(db, o.solution, c08.tables);
      expect(r.error, o.id).toBeNull();
      expect(FUTURE.exec(o.solution)?.[0], o.id).toBeUndefined();
    }
  });

  it("на старте и на потолке часов эталоны дают один ответ", () => {
    for (const o of c08.objectives) {
      expect(rowsOf(o.solution, capDb), o.id).toEqual(rowsOf(o.solution, db));
    }
  });

  it("предсказание «топ-3 через RANK» сходится с числом строк", () => {
    const p = objective("o8_6s").prediction;
    expect(p).toBeDefined();
    expect(run(p?.sql ?? objective("o8_6s").solution).rowCount).toBe(p?.answer);
    expect(p?.answer).toBe(4);
  });
});

// ------------------------------------------------------------------ альтернативы и ошибки

const STARTS = `WITH a AS (SELECT ts, LAG(ts) OVER (ORDER BY ts) AS prev FROM audit_log
                   WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00'),
starts AS (SELECT ts AS t0 FROM a WHERE prev IS NULL OR (julianday(ts) - julianday(prev)) * 1440 > 20)`;

const V = `v AS (SELECT badge_id, direction, ts AS t_in,
                 LEAD(ts) OVER (PARTITION BY badge_id ORDER BY ts) AS t_out
          FROM door_access WHERE door = 'КПП-Б0')`;

const CASES: Record<string, { ok: string[]; wrong: string[] }> = {
  o8_0: {
    ok: [
      `SELECT q.logged_at, q.terminal, q.query_text FROM query_log q
       WHERE q.login = 'nol' AND q.logged_at >= '2026-12-21 18:00:00' AND q.logged_at < '2026-12-22 09:00:00'`,
      `SELECT * FROM query_log WHERE login = 'nol' ORDER BY logged_at DESC LIMIT 20`,
    ],
    wrong: [
      // только свой терминал
      `SELECT logged_at, terminal, query_text FROM query_log
       WHERE login = 'nol' AND terminal = 'WS-03' AND logged_at BETWEEN '2026-12-21 18:00:00' AND '2026-12-22 09:00:00'`,
      // ночь оборвана в полночь
      `SELECT logged_at, terminal, query_text FROM query_log
       WHERE login = 'nol' AND logged_at BETWEEN '2026-12-21 18:00:00' AND '2026-12-21 23:59:59'`,
      // дата без времени: только 21.12
      `SELECT logged_at, terminal, query_text FROM query_log WHERE login = 'nol' AND date(logged_at) = '2026-12-21'`,
    ],
  },
  o8_0b: {
    ok: [
      `SELECT * FROM door_access WHERE badge_id = 'B-9000' AND date(ts) = '2026-12-21'`,
      `SELECT ts, door, direction FROM door_access WHERE badge_id LIKE 'b-9000' ORDER BY ts DESC`,
    ],
    wrong: [
      // кириллическая В в пропуске
      `SELECT ts, door, direction FROM door_access WHERE badge_id = 'В-9000' AND ts BETWEEN '2026-12-21 18:00:00' AND '2026-12-22 09:00:00'`,
      // искали только на цокольном КПП
      `SELECT ts, door, direction FROM door_access WHERE badge_id = 'B-9000' AND door = 'КПП-Б0'`,
    ],
  },
  o8_1: {
    ok: [
      `SELECT ts, ROW_NUMBER() OVER (ORDER BY ts, id) AS rn FROM audit_log
       WHERE login = 'i.valts' AND ts >= '2026-11-19 00:00:00'`,
      `SELECT a.ts, (SELECT COUNT(*) FROM audit_log b WHERE b.login = 'i.valts'
                       AND b.ts > '2026-11-18 23:10:00' AND b.ts <= a.ts) AS номер
       FROM audit_log a WHERE a.login = 'i.valts' AND a.ts > '2026-11-18 23:10:00'`,
    ],
    wrong: [
      // id — порядок репликации, а не время (пачка сеанса 1 пришла 10.12)
      `SELECT ts, ROW_NUMBER() OVER (ORDER BY id) AS n FROM audit_log
       WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00'`,
      // без момента гибели: в счёт попали её собственные правки 16–17.11
      `SELECT ts, ROW_NUMBER() OVER (ORDER BY ts) AS n FROM audit_log WHERE login = 'i.valts'`,
      // число вместо нумерации
      `SELECT COUNT(*) AS n FROM audit_log WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00'`,
    ],
  },
  o8_2: {
    ok: [
      `WITH a AS (SELECT ts, LAG(ts) OVER (ORDER BY ts) AS prev FROM audit_log
                  WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00')
       SELECT ts AS t0 FROM a WHERE prev IS NULL OR unixepoch(ts) - unixepoch(prev) > 1200`,
      `SELECT ts FROM (SELECT ts, LAG(ts, 1, '2000-01-01 00:00:00') OVER (ORDER BY ts) AS prev FROM audit_log
                       WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00')
       WHERE (julianday(ts) - julianday(prev)) * 24 * 60 > 20`,
    ],
    wrong: [
      // первая строка журнала — тоже начало сеанса
      `WITH a AS (SELECT ts, LAG(ts) OVER (ORDER BY ts) AS prev FROM audit_log
                  WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00')
       SELECT ts FROM a WHERE (julianday(ts) - julianday(prev)) * 1440 > 20`,
      // julianday — сутки, а не минуты
      `WITH a AS (SELECT ts, LAG(ts) OVER (ORDER BY ts) AS prev FROM audit_log
                  WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00')
       SELECT ts FROM a WHERE prev IS NULL OR julianday(ts) - julianday(prev) > 20`,
    ],
  },
  o8_3: {
    ok: [
      // пропуск вместо имени, открытый конец — часы дела
      `${STARTS}, ${V}
       SELECT v.badge_id, COUNT(DISTINCT s.t0) AS n FROM starts s
       JOIN v ON v.direction = 'вход' AND s.t0 BETWEEN v.t_in AND IFNULL(v.t_out, game_now())
       GROUP BY v.badge_id HAVING n = 7`,
      // всё одним CTE с подзапросом на staff
      `${STARTS}, ${V},
       hits AS (SELECT v.badge_id, COUNT(DISTINCT s.t0) AS seen FROM starts s
                JOIN v ON v.direction = 'вход' AND s.t0 >= v.t_in
                      AND s.t0 <= COALESCE(v.t_out, datetime(v.t_in, '+12 hours'))
                GROUP BY v.badge_id)
       SELECT st.full_name, st.login, h.seen FROM hits h JOIN staff st ON st.badge_id = h.badge_id
       WHERE h.seen = (SELECT COUNT(*) FROM starts)`,
    ],
    wrong: [
      // ловушка дела: NULL от LEAD у последнего входа — у Лыкова 6 из 7, результат пуст
      `${STARTS}, ${V}
       SELECT st.full_name, COUNT(DISTINCT s.t0) FROM starts s
       JOIN v ON v.direction = 'вход' AND s.t0 BETWEEN v.t_in AND v.t_out
       JOIN staff st ON st.badge_id = v.badge_id
       GROUP BY st.full_name HAVING COUNT(DISTINCT s.t0) = 7`,
      // «почти все» — ложные следы Нина и Ратников (6 из 7)
      `${STARTS}, ${V}
       SELECT st.full_name, COUNT(DISTINCT s.t0) FROM starts s
       JOIN v ON v.direction = 'вход' AND s.t0 BETWEEN v.t_in AND COALESCE(v.t_out, datetime(v.t_in, '+12 hours'))
       JOIN staff st ON st.badge_id = v.badge_id
       GROUP BY st.full_name HAVING COUNT(DISTINCT s.t0) >= 6`,
      // LAG вместо LEAD: граница — предыдущий проход, интервал пуст
      `${STARTS},
       v AS (SELECT badge_id, direction, ts AS t_in, LAG(ts) OVER (PARTITION BY badge_id ORDER BY ts) AS t_out
             FROM door_access WHERE door = 'КПП-Б0')
       SELECT st.full_name, COUNT(DISTINCT s.t0) FROM starts s
       JOIN v ON v.direction = 'вход' AND s.t0 BETWEEN v.t_in AND COALESCE(v.t_out, datetime(v.t_in, '+12 hours'))
       JOIN staff st ON st.badge_id = v.badge_id
       GROUP BY st.full_name HAVING COUNT(DISTINCT s.t0) = 7`,
    ],
  },
  o8_4: {
    ok: [
      `SELECT ts, payer_name, item, qty FROM purchases
       WHERE merchant = 'Кипяток (ГУ, холл)' AND item = 'чай с чабрецом' AND qty = 2 ORDER BY ts`,
      `SELECT * FROM purchases WHERE merchant LIKE 'Кипяток%' AND time(ts) < '05:00:00'`,
    ],
    wrong: [
      // окно после начала сеанса, а не до
      `${STARTS}
       SELECT s.t0, p.ts, p.payer_name FROM starts s JOIN purchases p ON p.merchant = 'Кипяток (ГУ, холл)'
       AND p.ts BETWEEN s.t0 AND datetime(s.t0, '+30 minutes')`,
      // точное совпадение названия: в «Сияние.Pay» оно полное
      `${STARTS}
       SELECT s.t0, p.ts, p.payer_name FROM starts s JOIN purchases p ON p.merchant = 'Кипяток'
       AND p.ts BETWEEN datetime(s.t0, '-30 minutes') AND s.t0`,
      // слишком узкое окно: чай берут за 15 минут
      `${STARTS}
       SELECT s.t0, p.ts, p.payer_name FROM starts s JOIN purchases p ON p.merchant = 'Кипяток (ГУ, холл)'
       AND p.ts BETWEEN datetime(s.t0, '-10 minutes') AND s.t0`,
      // весь автомат подряд — это не «перед сеансами»
      `SELECT * FROM purchases WHERE merchant = 'Кипяток (ГУ, холл)'`,
    ],
  },
  o8_5: {
    ok: [
      `SELECT * FROM cron_jobs`,
      `SELECT DISTINCT terminal, time(logged_at) AS t FROM query_log WHERE login = 'zero'`,
      `SELECT login, terminal, logged_at FROM query_log WHERE login = 'zero'`,
    ],
    wrong: [
      // минуты без секунд: '03:12' — не '03:12:00'
      `SELECT terminal, strftime('%H:%M', logged_at) AS t, COUNT(*) FROM query_log WHERE login = 'zero' GROUP BY terminal, t`,
      // учётка, но не журнал и не расписание
      `SELECT * FROM logins WHERE login = 'zero'`,
      // запросы Ирины стёрты
      `SELECT * FROM query_log WHERE login = 'i.valts'`,
    ],
  },
  o8_5s: {
    ok: [
      `SELECT from_msisdn, MAX(ts) AS last_ts FROM messenger_events GROUP BY from_msisdn`,
    ],
    wrong: [
      // первое событие вместо последнего
      `SELECT from_msisdn, ts FROM (SELECT from_msisdn, ts, ROW_NUMBER() OVER (PARTITION BY from_msisdn ORDER BY ts) AS rn
       FROM messenger_events) WHERE rn = 1`,
      // разбиение по получателю
      `SELECT to_msisdn, ts FROM (SELECT to_msisdn, ts, ROW_NUMBER() OVER (PARTITION BY to_msisdn ORDER BY ts DESC) AS rn
       FROM messenger_events) WHERE rn = 1`,
    ],
  },
  o8_6s: {
    ok: [
      `WITH n AS (SELECT date(ts) AS d, COUNT(*) AS c FROM audit_log
                  WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00' GROUP BY d)
       SELECT * FROM (SELECT d, c, DENSE_RANK() OVER (ORDER BY c DESC) AS m FROM n) WHERE m <= 3`,
    ],
    wrong: [
      // ROW_NUMBER теряет равную ночь
      `WITH n AS (SELECT date(ts, '-8 hours') AS night, COUNT(*) AS c FROM audit_log
                  WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00' GROUP BY night)
       SELECT * FROM (SELECT night, c, ROW_NUMBER() OVER (ORDER BY c DESC) AS place FROM n) WHERE place <= 3`,
      `SELECT date(ts) AS d, COUNT(*) AS c FROM audit_log
       WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00' GROUP BY d ORDER BY c DESC LIMIT 3`,
    ],
  },
  o8_7s: {
    ok: [
      `SELECT date(ts) AS night FROM door_access
       WHERE badge_id = 'B-1210' AND door = 'КПП-Б0' AND direction = 'вход' AND time(ts) >= '20:00:00'
         AND ts BETWEEN '2026-11-18 00:00:00' AND '2026-12-22 23:59:59'`,
    ],
    wrong: [
      // ночь разрезана полуночью
      `SELECT date(ts) AS night, COUNT(*) FROM door_access
       WHERE badge_id = 'B-1210' AND door = 'КПП-Б0'
         AND ts BETWEEN '2026-11-18 12:00:00' AND '2026-12-22 12:00:00'
         AND (time(ts) >= '20:00:00' OR time(ts) < '07:00:00')
       GROUP BY night`,
      // без ночного окна: в счёт попали дневные смены
      `SELECT date(ts, '-8 hours') AS night, COUNT(*) FROM door_access
       WHERE badge_id = 'B-1210' AND door = 'КПП-Б0' AND ts BETWEEN '2026-11-18 12:00:00' AND '2026-12-22 12:00:00'
       GROUP BY night`,
    ],
  },
};

describe("альтернативы проходят, ошибки — нет", () => {
  it("у каждой задачи есть альтернатива и не меньше двух ошибок", () => {
    for (const o of c08.objectives) {
      expect(CASES[o.id]?.ok.length ?? 0, o.id).toBeGreaterThanOrEqual(1);
      expect(CASES[o.id]?.wrong.length ?? 0, o.id).toBeGreaterThanOrEqual(2);
    }
  });

  for (const [id, { ok, wrong }] of Object.entries(CASES)) {
    it(`${id}: альтернативные формулировки засчитываются`, () => {
      ok.forEach((sql, i) => expect(passes(id, sql), `${id} ok[${i}]`).toBe(true));
    });
    it(`${id}: правдоподобные ошибки не засчитываются`, () => {
      wrong.forEach((sql, i) => expect(passes(id, sql), `${id} wrong[${i}]`).toBe(false));
    });
  }
});

// ------------------------------------------------------------------ посаженные факты (разд. 8.4)

describe("посаженные факты Д8", () => {
  const PRESENCE = `${STARTS}, ${V}
    SELECT st.full_name, COUNT(DISTINCT s.t0) AS n FROM starts s
    JOIN v ON v.direction = 'вход' AND s.t0 BETWEEN v.t_in AND COALESCE(v.t_out, datetime(v.t_in, '+12 hours'))
    JOIN staff st ON st.badge_id = v.badge_id
    GROUP BY st.full_name ORDER BY n DESC, st.full_name`;

  it("семь сеансов i.valts: 231 действие, сеансы 2 и 6 — по 31", () => {
    expect(rowsOf("SELECT COUNT(*) FROM audit_log WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00'")).toEqual([[231]]);
    const starts = rowsOf(`${STARTS} SELECT t0 FROM starts ORDER BY t0`).map((r) => r[0]);
    expect(starts).toEqual([
      "2026-11-19 01:50:00", "2026-11-20 01:55:00", "2026-11-21 02:05:00", "2026-11-27 01:40:00",
      "2026-12-03 02:00:00", "2026-12-09 01:58:00", "2026-12-22 02:20:00",
    ]);
    const perNight = rowsOf(`SELECT date(ts) AS d, COUNT(*) FROM audit_log
      WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00' GROUP BY d ORDER BY d`).map((r) => r[1]);
    expect(perNight).toEqual([60, 31, 45, 25, 22, 31, 17]);
    // В ts нет совпадений: нумерация по времени однозначна
    expect(rowsOf(`SELECT COUNT(*) - COUNT(DISTINCT ts) FROM audit_log WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00'`)).toEqual([[0]]);
  });

  it("в начале сеансов в Б0: Лыков 7 из 7 — ровно один; Нина и Ратников 6, Мельник 5", () => {
    const presence = Object.fromEntries(rowsOf(PRESENCE).map((r) => [String(r[0]), Number(r[1])]));
    expect(presence["Лыков А. С."]).toBe(7);
    expect(presence["Шустова Н. Ф."]).toBe(6);
    expect(presence["Ратников Л. Б."]).toBe(6);
    expect(presence["Мельник К. И."]).toBe(5);
    expect(Object.values(presence).filter((n) => n === 7)).toHaveLength(1);
    expect(Object.entries(presence).filter(([name, n]) => n >= 5 && !["Лыков А. С.", "Шустова Н. Ф.", "Ратников Л. Б.", "Мельник К. И."].includes(name))).toEqual([]);
  });

  it("последний проход Лыкова — вход на КПП-Б0 22.12 02:08, выхода нет (LEAD = NULL)", () => {
    expect(rowsOf(`SELECT ts, door, direction FROM door_access WHERE badge_id = 'B-4210' ORDER BY ts DESC LIMIT 1`))
      .toEqual([["2026-12-22 02:08:00", "КПП-Б0", "вход"]]);
    const lykovIns = rowsOf(`SELECT ts FROM door_access WHERE badge_id = 'B-4210' AND door = 'КПП-Б0' AND direction = 'вход'
      AND time(ts) BETWEEN '01:00:00' AND '02:30:00' ORDER BY ts`).map((r) => r[0]);
    expect(lykovIns).toEqual([
      "2026-11-19 01:38:00", "2026-11-20 01:43:00", "2026-11-21 01:53:00", "2026-11-27 01:28:00",
      "2026-12-03 01:48:00", "2026-12-09 01:46:00", "2026-12-22 02:08:00",
    ]);
  });

  it("ночи Нины, Ратникова и Мельника на КПП-Б0 — по библии", () => {
    const nina = rowsOf(`SELECT ts, direction FROM door_access WHERE badge_id = 'B-1210' AND door = 'КПП-Б0'
      AND (time(ts) >= '20:00:00' OR time(ts) < '07:00:00') ORDER BY ts`);
    expect(nina.filter((r) => r[1] === "вход").map((r) => r[0])).toEqual([
      "2026-11-18 22:30:00", "2026-11-19 22:30:00", "2026-11-20 22:30:00",
      "2026-12-02 22:30:00", "2026-12-08 22:30:00", "2026-12-21 22:30:00",
    ]);
    expect(nina.filter((r) => r[1] === "выход").every((r) => String(r[0]).endsWith(" 06:30:00"))).toBe(true);
    // 27.11 Нина на больничном: в Б0 её нет весь день
    expect(rowsOf(`SELECT COUNT(*) FROM door_access WHERE badge_id = 'B-1210' AND ts BETWEEN '2026-11-26 20:00:00' AND '2026-11-27 23:59:59'`)).toEqual([[0]]);

    const ratnikovOut = rowsOf(`SELECT ts FROM door_access WHERE badge_id = 'B-1104' AND door = 'КПП-Б0' AND direction = 'выход'
      AND time(ts) BETWEEN '03:00:00' AND '05:00:00' ORDER BY ts`).map((r) => String(r[0]));
    expect(ratnikovOut.map((t) => t.slice(0, 10))).toEqual(["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-27", "2026-12-03", "2026-12-09"]);
    for (const t of ratnikovOut) expect(t.slice(11) >= "03:30:00" && t.slice(11) <= "04:00:00", t).toBe(true);
    // 22.12 Ратников в больнице: после 21.12 16:00 — только выход с бригадой СМП
    expect(rowsOf(`SELECT ts, door, direction, note FROM door_access WHERE badge_id = 'B-1104' AND ts > '2026-12-21 16:00:00'`))
      .toEqual([["2026-12-21 16:31:12", "КПП-Б0", "выход", "СМП"]]);
    // поэтому открытый интервал «до часов игры» не даёт ему седьмой сеанс
    expect(rowsOf(`${STARTS}, ${V}
      SELECT v.badge_id FROM starts s JOIN v ON v.direction = 'вход' AND s.t0 BETWEEN v.t_in AND IFNULL(v.t_out, game_now())
      GROUP BY v.badge_id HAVING COUNT(DISTINCT s.t0) = 7`)).toEqual([["B-4210"]]);

    const melnik = rowsOf(`SELECT ts, direction FROM door_access WHERE badge_id = 'B-1412' AND door = 'КПП-Б0'
      AND time(ts) BETWEEN '00:30:00' AND '04:00:00' ORDER BY ts`);
    expect(melnik.map((r) => `${r[0]} ${r[1]}`)).toEqual(
      ["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-27", "2026-12-22"].flatMap((d) => [`${d} 01:00:00 вход`, `${d} 03:30:00 выход`])
    );
    // 03.12 командировка, 09.12 больничный
    expect(rowsOf(`SELECT COUNT(*) FROM door_access WHERE badge_id = 'B-1412' AND date(ts) IN ('2026-12-03', '2026-12-09')`)).toEqual([[0]]);
  });

  it("две чашки чабреца: Лыков — 7 раз за 15 минут до сеанса, Ирина — 11 пятниц до 13.11; других «двух чашек» нет", () => {
    const lykov = rowsOf(`SELECT ts FROM purchases WHERE payer_person_id = 4210 AND merchant = 'Кипяток (ГУ, холл)'
      AND item = 'чай с чабрецом' AND qty = 2 ORDER BY ts`).map((r) => r[0]);
    expect(lykov).toEqual([
      "2026-11-19 01:35:00", "2026-11-20 01:40:00", "2026-11-21 01:50:00", "2026-11-27 01:25:00",
      "2026-12-03 01:45:00", "2026-12-09 01:43:00", "2026-12-22 02:05:00",
    ]);
    const before = rowsOf(`${STARTS}
      SELECT COUNT(*) FROM starts s JOIN purchases p ON p.payer_person_id = 4210 AND p.item = 'чай с чабрецом'
      AND (julianday(s.t0) - julianday(p.ts)) * 1440 BETWEEN 14.9 AND 15.1`);
    expect(before).toEqual([[7]]);

    const irina = rowsOf(`SELECT ts, strftime('%w', ts) FROM purchases WHERE payer_person_id = 4127 AND item = 'чай с чабрецом' AND qty = 2 ORDER BY ts`);
    expect(irina).toHaveLength(11);
    expect(irina.every((r) => r[1] === "5")).toBe(true);
    expect(String(irina[0][0])).toMatch(/^2026-09-04 21:/);
    expect(String(irina[10][0])).toMatch(/^2026-11-13 21:/);
    // Якорь записи № 8: покупка Ирины 13.11 до 21:45 (attachments 207)
    expect(String(irina[10][0]) < "2026-11-13 21:45:00").toBe(true);

    const payers = rowsOf(`SELECT DISTINCT payer_person_id FROM purchases WHERE item = 'чай с чабрецом' AND qty >= 2 ORDER BY 1`).map((r) => r[0]);
    expect(payers).toEqual([4127, 4210]);
  });

  it("по пятницам через минуту после чая пропуск Ирины — у серверной", () => {
    const pairs = rowsOf(`SELECT p.ts, MIN(d.ts) FROM purchases p
      JOIN door_access d ON d.badge_id = 'B-4127' AND d.door = 'Серверная' AND d.direction = 'вход'
       AND d.ts BETWEEN p.ts AND datetime(p.ts, '+3 minutes')
      WHERE p.payer_person_id = 4127 AND p.item = 'чай с чабрецом' GROUP BY p.ts`);
    expect(pairs).toHaveLength(11);
    for (const [bought, entered] of pairs) {
      const gap = (Date.parse(String(entered).replace(" ", "T")) - Date.parse(String(bought).replace(" ", "T"))) / 1000;
      expect(gap).toBeGreaterThanOrEqual(60);
      expect(gap).toBeLessThan(120);
    }
  });

  it("чужая строка query_log и выход B-9000 — единственные в ночь на 22.12", () => {
    expect(rowsOf(`SELECT logged_at, terminal, query_text, rows_returned FROM query_log
      WHERE login = 'nol' AND logged_at BETWEEN '2026-12-21 18:00:00' AND '2026-12-22 09:00:00'`))
      .toEqual([["2026-12-22 02:47:19", "WS-07", "SELECT * FROM statements WHERE case_id = '15-0219'", 63]]);
    expect(rowsOf(`SELECT ts, door, direction FROM door_access WHERE badge_id = 'B-9000'`))
      .toEqual([["2026-12-21 23:41:00", "КПП-1", "выход"]]);
  });

  it("строки «из будущего»: четыре, настоящая одна — голосовое Ирины матери", () => {
    expect(rowsOf(`SELECT COUNT(*) FROM messenger_events WHERE ts > game_now()`)).toEqual([[4]]);
    expect(rowsOf(`SELECT from_msisdn, to_msisdn, ts, created_at, kind, size_kb, cell_id, status
      FROM messenger_events WHERE from_msisdn = '+7 900 000-41-27' ORDER BY ts DESC LIMIT 1`))
      .toEqual([["+7 900 000-41-27", "+7 900 000-13-89", "2027-01-11 12:58:00", "2026-11-18 23:05:00", "голос", 412, "ПЛР-17", "запланировано"]]);
    const glitch = rowsOf(`SELECT ts FROM messenger_events WHERE ts > game_now() AND from_msisdn <> '+7 900 000-41-27' ORDER BY ts`).map((r) => String(r[0]));
    expect(glitch).toContain("2099-01-01 00:00:00");
    expect(glitch).toContain("2099-12-31 23:59:00");
  });

  it("«Щит» гасит займ Лыкова: 12.11, −380 000, МФО «Деньги Сразу» — ровно одна строка", () => {
    expect(rowsOf(`SELECT ts, amount, counterparty, purpose FROM transactions WHERE purpose LIKE '%Лыкова%'`))
      .toEqual([["2026-11-12 11:47:00", -380000, "МФО «Деньги Сразу»", "погашение займа за Лыкова А. С."]]);
  });

  it("zero: только CRON-01 и только 03:12:00; расписание — девять заданий i.valts от 16.11", () => {
    expect(rowsOf(objective("o8_5").solution)).toEqual([["CRON-01", "03:12:00", 3]]);
    const jobs = rowsOf(`SELECT id, created_by, created_at FROM cron_jobs ORDER BY id`);
    expect(jobs).toHaveLength(9);
    expect(jobs.every((r) => r[1] === "i.valts" && String(r[2]).startsWith("2026-11-16 22:"))).toBe(true);
  });
});

// ------------------------------------------------------------------ обвинение и допрос

describe("обвинение и допрос", () => {
  const acc = () => c08.accusations?.[0];

  it("обвинение принимается по двум карточкам из эталонов, ответ виден в результатах", () => {
    const a = acc();
    expect(a).toBeDefined();
    if (!a) return;
    const r83 = run(objective("o8_3").solution);
    const r84 = run(objective("o8_4").solution);
    const seen = new Set([...scanSeen(r83), ...scanSeen(r84)]);
    expect(a.keys.some((k) => seen.has(String(k)))).toBe(true);
    const cards = [card("seven", r83, 0, "pbd"), card("cups", r84, 0)];
    const ok = checkAccusation(a, "Лыков Антон Сергеевич", cards);
    expect(ok.outcome).toBe("accepted");
    expect(ok.scene).toBe("int_tokha");
    expect(checkAccusation(a, "Лыков А. С.", cards).outcome).toBe("accepted");
    expect(checkAccusation(a, "Лыков Антон Сергеевич", [cards[0]]).outcome).toBe("weak_evidence");
  });

  it("ложные обвинения: Мельник — посадочный и −1 к доверию Даши; Нина и Ратников — свои сцены", () => {
    const a = acc();
    if (!a) throw new Error("нет обвинения");
    const melnik = checkAccusation(a, "Мельник Константин Игоревич", []);
    expect(melnik.outcome).toBe("wrong_person");
    expect(melnik.scene).toBe("accuse_melnik");
    expect(melnik.trustFlag).toBe("dasha_trust");
    expect(checkAccusation(a, "Шустова Нина Фёдоровна", []).scene).toBe("accuse_nina");
    expect(checkAccusation(a, "Ратников Л. Б.", []).scene).toBe("accuse_ratnikov");
    expect(checkAccusation(a, "Пахомов Олег Викторович", []).scene).toBe("accuse_wrong");
  });

  it("каждое утверждение Тохи пробивается карточкой из запроса дела, чужая карточка — нет", () => {
    const scene = c08.scenes.find((s) => s.id === "int_tokha");
    const points = scene?.interrogation?.points ?? [];
    expect(points.map((p) => p.line)).toEqual(["c08.int_tokha.003", "c08.int_tokha.007", "c08.int_tokha.011", "c08.int_tokha.015"]);
    const present = (i: number) => {
      const p = points[i].present;
      if (!p) throw new Error(`нет предъявления у ${points[i].line}`);
      return p;
    };

    // .003 «дома сплю» — 7 из 7 (улика задачи) или живая строка входа 22.12 02:08
    expect(presentMatches(present(0), { evidenceIds: ["ev.c08.seven_of_seven"] })).toBe(true);
    const lastIn = run(`SELECT ts, badge_id, door, direction FROM door_access WHERE badge_id = 'B-4210' ORDER BY ts DESC LIMIT 1`);
    expect(presentMatches(present(0), { cards: [card("in", lastIn, 0)] })).toBe(true);
    expect(presentMatches(present(0), { cards: [card("o83", run(objective("o8_3").solution), 0)] })).toBe(true);

    // .007 «кто угодно заходит» — две чашки
    const cups = run(objective("o8_4").solution);
    expect(presentMatches(present(1), { cards: [card("cups", cups, 0)] })).toBe(true);
    expect(presentMatches(present(1), { evidenceIds: ["ev.c08.two_cups"] })).toBe(true);

    // .011 «почти не общались» — пятничные покупки Ирины или её проход в серверную
    const fridays = run(`SELECT ts, payer_name, item, qty FROM purchases WHERE payer_person_id = 4127 AND item = 'чай с чабрецом'`);
    expect(presentMatches(present(2), { cards: [card("fri", fridays, 0)] })).toBe(true);
    const server = run(`SELECT ts, badge_id, door, direction FROM door_access WHERE badge_id = 'B-4127' AND door = 'Серверная' LIMIT 1`);
    expect(presentMatches(present(2), { cards: [card("srv", server, 0)] })).toBe(true);
    expect(presentMatches(present(2), { cards: [card("cups", cups, 0)] })).toBe(false);

    // .015 «ничего не надо было» — платёж МФО живым запросом прямо в допросе
    const loan = run(`SELECT ts, amount, counterparty, purpose FROM transactions WHERE counterparty LIKE '%Деньги Сразу%' AND amount = -380000`);
    expect(loan.rowCount).toBe(1);
    expect(presentMatches(present(3), { cards: [card("loan", loan, 0, "mirror_siyanie")] })).toBe(true);
    const melnikIn = run(`SELECT ts, badge_id, door, direction FROM door_access WHERE badge_id = 'B-1412' AND door = 'КПП-Б0' LIMIT 1`);
    for (let i = 0; i < 4; i++) expect(presentMatches(present(i), { cards: [card("m", melnikIn, 0)] }), points[i].line).toBe(false);
  });
});
