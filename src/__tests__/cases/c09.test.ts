/**
 * Дело № 09 «Матрёшка» (case-09-matryoshka): контент, эталоны, ловушки
 * (цикл владения, рамка RANGE), протокол, ветка «сторожа» и посаженные
 * факты разд. 8.4 библии.
 *
 * TECH_SPEC разд. 5: мир генерируется один раз, каждая задача проходит
 * своим эталоном по порядку, альтернативой и не проходит правдоподобными
 * ошибками; эталоны укладываются в таблицы и понятия дела.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Database } from "sql.js";
import {
  activeObjective,
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
import { cases, characters, getCase, handbookById } from "@/data";

const CASE_ID = "case-09-matryoshka";
const c09 = getCase(CASE_ID) as CaseDef;
const START = "2026-12-28 11:00:00";
const CAP = "2026-12-28 15:00:00";
const STARTUP = ["p0.player", "late.bank_statements"] as const;

let db: Database;
let capDb: Database;
let watcherDb: Database;
let genMs = 0;

beforeAll(async () => {
  const t0 = performance.now();
  const world = await generateWorld();
  genMs = performance.now() - t0;
  const bytes = exportWorld(world);
  world.close();
  db = await openCaseDatabase(bytes, { clock: START, tables: c09.tables, patches: [...STARTUP] });
  capDb = await openCaseDatabase(bytes, { clock: CAP, tables: c09.tables, patches: [...STARTUP] });
  watcherDb = await openCaseDatabase(bytes, {
    clock: START,
    tables: c09.tables,
    patches: [...STARTUP, { id: "c09.watcher", params: { at: "2026-12-28 10:59:00", flags: { watcher_tripped: true } } }],
  });
}, 60_000);

afterAll(() => {
  db?.close();
  capDb?.close();
  watcherDb?.close();
});

// ------------------------------------------------------------------ помощники

const objective = (id: string): CaseObjective => {
  const o = c09.objectives.find((x) => x.id === id);
  if (!o) throw new Error(`нет задачи ${id}`);
  return o;
};

function run(sql: string, on: Database = db): QueryResult {
  return executeSQL(on, sql, c09.tables);
}

function rowsOf(sql: string, on: Database = db): unknown[][] {
  const r = run(sql, on);
  if (r.error) throw new Error(`${r.error}\n${sql}`);
  return r.rows;
}

const one = (sql: string, on: Database = db): unknown => rowsOf(sql, on)[0]?.[0];

function doneBefore(o: CaseObjective): Set<string> {
  const mains = mainObjectives(c09, {});
  if (o.optional) return new Set(mains.map((m) => m.id));
  return new Set(mains.filter((m) => m.order < o.order).map((m) => m.id));
}

/** Засчитывает ли запрос задачу (активную по порядку или ★) */
function passes(id: string, sql: string, on: Database = db): boolean {
  const o = objective(id);
  const result = run(sql, on);
  expect(result.error, `${id}: ${result.error}\n${sql}`).toBeNull();
  const progress = checkCaseProgress(c09, result, on, doneBefore(o), {});
  return progress.completed.some((c) => c.objectiveId === id);
}

// ------------------------------------------------------------------ контент

describe("контент дела", () => {
  it("validateCaseContent: проблем нет", () => {
    expect(validateCaseContent(c09, characters, collectEvidenceIds(cases))).toEqual([]);
  });

  it("мир генерируется за разумное время", () => {
    expect(genMs).toBeLessThan(15_000);
  });

  it("каркас по библии: 28.12 11:00, потолок 15:00, минута на запрос, шесть новых таблиц", () => {
    expect(c09.date).toBe("2026-12-28 11:00");
    expect(c09.clock?.cap).toBe("2026-12-28 15:00");
    expect(c09.minutesPerQuery).toBe(1);
    expect(c09.act).toBe(3);
    expect(c09.difficulty).toBe("hard");
    expect(c09.newTables).toEqual(["company_owners", "share_deals", "contracts", "grant_requests", "migration_jobs", "bank_statements"]);
    expect(c09.concepts).toEqual(["h.recursive", "h.cycle_guard", "h.running_total", "h.frames", "w.ownership"]);
    expect(mainObjectives(c09, {}).map((o) => o.id)).toEqual(["o9_1", "o9_2", "o9_3", "o9_4", "o9_5"]);
    expect(optionalObjectives(c09).map((o) => o.id)).toEqual(["o9_3b", "o9_6s"]);
  });

  it("статьи справочника дела есть, примеры выполняются на мире", () => {
    for (const id of c09.concepts) {
      const entry = handbookById.get(id);
      expect(entry, id).toBeDefined();
      const r = run(entry!.example);
      expect(r.error, id).toBeNull();
      expect(r.rowCount, id).toBeGreaterThan(0);
    }
  });

  it("М18: ни эталоны, ни подсказки, ни заготовка не содержат «Гранин» и 1001", () => {
    const texts = [c09.starterSql ?? "", ...c09.objectives.flatMap((o) => [o.task, o.solution, ...o.hints.map((h) => h.text)])];
    for (const t of texts) {
      expect(/гранин/i.test(t), t).toBe(false);
      expect(/\b1001\b/.test(t), t).toBe(false);
    }
  });

  it("реплики: id по правилу, длина ≤ 220, к игроку без родовых форм", () => {
    const gendered = /\b(ты|я)\s+[а-яё]+(л|ла)\b|\bготова?\b|\bнашла\b|\bсмогла\b/i;
    for (const s of c09.scenes) {
      for (const l of s.lines) {
        expect(l.id.startsWith(`c09.${s.id}.`), l.id).toBe(true);
        expect(l.text.length, l.id).toBeLessThanOrEqual(220);
        expect(gendered.test(l.text), `${l.id}: ${l.text}`).toBe(false);
      }
      for (const ch of s.choices ?? []) expect(gendered.test(ch.text), ch.text).toBe(false);
    }
  });
});

// ------------------------------------------------------------------ эталоны

/** Ключевые слова понятий из будущих дел (лестница разд. 4.1, п. 8) */
const FUTURE = /\bIS\s+NOT\s+(?!NULL\b)|\|\||\bsubstr\b|\bgroup_concat\b|\binstr\b|\breplace\s*\(|\bGLOB\b|\bhex\s*\(|\bFULL\s+JOIN\b|\b(INSERT|UPDATE|DELETE|CREATE|BEGIN|COMMIT)\b/i;

describe("эталоны", () => {
  it("основные задачи проходят эталонами по порядку, каждая не дольше 1 с", () => {
    const done = new Set<string>();
    for (const o of mainObjectives(c09, {})) {
      const t0 = performance.now();
      const result = run(o.solution);
      const ms = performance.now() - t0;
      expect(result.error, `${o.id}: ${result.error}`).toBeNull();
      expect(ms, o.id).toBeLessThan(1000);
      const progress = checkCaseProgress(c09, result, db, done, {});
      expect(progress.completed.map((c) => c.objectiveId), `${o.id}: ${progress.activeFeedback}`).toContain(o.id);
      done.add(o.id);
    }
    expect(activeObjective(c09, done, {})).toBeNull();
  });

  it("★-задачи проходят своими эталонами", () => {
    for (const o of optionalObjectives(c09)) {
      const t0 = performance.now();
      expect(passes(o.id, o.solution), o.id).toBe(true);
      expect(performance.now() - t0, o.id).toBeLessThan(1000);
    }
  });

  it("эталоны проходят table guard с таблицами дела и не берут понятий из будущих дел", () => {
    for (const o of c09.objectives) {
      const r = executeSQL(db, o.solution, c09.tables);
      expect(r.error, o.id).toBeNull();
      expect(FUTURE.exec(o.solution)?.[0], o.id).toBeUndefined();
    }
  });

  it("на старте и на потолке часов эталоны дают один ответ", () => {
    for (const o of c09.objectives) expect(rowsOf(o.solution, capDb), o.id).toEqual(rowsOf(o.solution, db));
  });

  it("ветка «сторожа»: платёж 20.11 пропал из ЗЕРКАЛА, но все задачи решаются (9.2 — по выписке банка)", () => {
    expect(one("SELECT COUNT(*) FROM transactions WHERE account_id = 'ACC-10017' AND ts = '2026-11-20 14:05:00'", watcherDb)).toBe(0);
    expect(one("SELECT COUNT(*) FROM bank_statements WHERE payee = 'ЧОП «Щит»' AND ts = '2026-11-20 14:05:00' AND amount = 300000", watcherDb)).toBe(1);
    const done = new Set<string>();
    for (const o of mainObjectives(c09, { watcher_tripped: true })) {
      const progress = checkCaseProgress(c09, run(o.solution, watcherDb), watcherDb, done, { flags: { watcher_tripped: true } });
      expect(progress.completed.map((c) => c.objectiveId), o.id).toContain(o.id);
      done.add(o.id);
    }
    // В ЗЕРКАЛЕ на этой ветке ноябрь неполон
    expect(passes("o9_2", ALT_TX, watcherDb)).toBe(false);
    const note = rowsOf("SELECT query_text FROM query_log WHERE login = 'nol' AND terminal = 'WS-07' AND query_text LIKE '%Не надо.'", watcherDb);
    expect(note.length).toBe(1);
    // «Бастион» у общежития — ночью 29.12, за горизонтом Д9: в базе есть, игроку пока не виден
    const bastion = "FROM plate_reads WHERE plate = 'О114РБ' AND camera_id = 31 AND read_at = '2026-12-29 02:10:00'";
    expect(watcherDb.exec(`SELECT COUNT(*) FROM main.${bastion.slice(5)}`)[0].values[0][0]).toBe(1);
    expect(one(`SELECT COUNT(*) ${bastion}`, watcherDb)).toBe(0);
  });
});

// ------------------------------------------------------------------ альтернативы и ошибки

const ALT_TX = `SELECT t.ts, t.counterparty, t.amount, t.purpose
FROM transactions t JOIN accounts a ON a.id = t.account_id
WHERE a.holder_name = 'ЧОП «Щит»' AND t.amount > 0 AND date(t.ts) BETWEEN '2026-11-01' AND '2026-11-30'`;

const CASES: Record<string, { ok: string[]; wrong: string[] }> = {
  o9_1: {
    ok: [
      // голые id, без имён и без глубины
      `WITH RECURSIVE up AS (
         SELECT company_id, owner_type, owner_id, share FROM company_owners
         WHERE company_id = (SELECT id FROM companies WHERE name LIKE '%Щит%') AND until IS NULL
         UNION ALL
         SELECT o.company_id, o.owner_type, o.owner_id, o.share
         FROM company_owners o JOIN up ON up.owner_type = 'company' AND o.company_id = up.owner_id
         WHERE o.until IS NULL)
       SELECT company_id, owner_id, share FROM up`,
      // имена компаний, владелец — id
      `WITH RECURSIVE chain(cid, otype, oid, pct) AS (
         SELECT o.company_id, o.owner_type, o.owner_id, o.share FROM company_owners o
         JOIN companies c ON c.id = o.company_id WHERE c.name = 'ЧОП «Щит»' AND o.until IS NULL
         UNION
         SELECT o.company_id, o.owner_type, o.owner_id, o.share FROM chain
         JOIN company_owners o ON chain.otype = 'company' AND o.company_id = chain.oid AND o.until IS NULL)
       SELECT c.name AS company, chain.oid AS owner, chain.pct FROM chain JOIN companies c ON c.id = chain.cid`,
    ],
    wrong: [
      // один этаж вместо рекурсии
      `SELECT c.name, o.owner_type, o.owner_id, o.share FROM company_owners o JOIN companies c ON c.id = o.company_id
       WHERE c.name LIKE '%Щит%' AND o.until IS NULL`,
      // until забыт в шаге: вылезает прежний владелец Kordon
      `WITH RECURSIVE up(company_id, owner_type, owner_id, share) AS (
         SELECT o.company_id, o.owner_type, o.owner_id, o.share FROM company_owners o JOIN companies c ON c.id = o.company_id
         WHERE c.name LIKE '%«Щит»%' AND o.until IS NULL
         UNION ALL
         SELECT o.company_id, o.owner_type, o.owner_id, o.share FROM up JOIN company_owners o
           ON up.owner_type = 'company' AND o.company_id = up.owner_id)
       SELECT * FROM up`,
      // направление перепутано: вниз от «Щита»
      `WITH RECURSIVE dn(id) AS (SELECT 17 UNION SELECT o.company_id FROM dn JOIN company_owners o ON o.owner_type = 'company' AND o.owner_id = dn.id)
       SELECT o.company_id, o.owner_id, o.share FROM dn JOIN company_owners o ON o.company_id = dn.id WHERE dn.id <> 17`,
    ],
  },
  o9_2: {
    ok: [
      ALT_TX,
      `SELECT SUM(amount) AS всего FROM bank_statements
       WHERE payee_account = 'ACC-10017' AND ts >= '2026-11-01 00:00:00' AND ts < '2026-12-01 00:00:00'`,
      `SELECT * FROM transactions WHERE account_id = 'ACC-10017' AND ts LIKE '2026-11-%'`,
    ],
    wrong: [
      // весь год
      `SELECT ts, amount FROM transactions WHERE account_id = 'ACC-10017' AND amount > 0 AND ts >= '2026-01-01 00:00:00'`,
      // LIKE без %: ничего
      `SELECT ts, payer, amount FROM bank_statements WHERE payee = 'ЧОП «Щит»' AND ts LIKE '2026-11'`,
      // только крупные: обычный платёж потерян
      `SELECT ts, amount FROM bank_statements WHERE payee = 'ЧОП «Щит»' AND amount > 200000 AND ts LIKE '2026-11%'`,
      // октябрь вместо ноября
      `SELECT ts, amount FROM bank_statements WHERE payee = 'ЧОП «Щит»' AND ts LIKE '2026-10%'`,
    ],
  },
  o9_3: {
    ok: [
      // UNION ALL с пределом глубины
      `WITH RECURSIVE d(id, depth) AS (
         SELECT 12, 0
         UNION ALL
         SELECT o.company_id, d.depth + 1 FROM d JOIN company_owners o ON o.owner_type = 'company' AND o.owner_id = d.id
         WHERE d.depth < 8)
       SELECT DISTINCT k.doc_no, k.person_id, k.subject FROM d JOIN contracts k ON k.company_id = d.id WHERE k.person_id IS NOT NULL`,
      // группа — IN (подзапрос к рекурсии)
      `WITH RECURSIVE g(id) AS (SELECT id FROM companies WHERE name LIKE 'Kordon%'
         UNION SELECT o.company_id FROM company_owners o JOIN g ON o.owner_type = 'company' AND o.owner_id = g.id)
       SELECT doc_no AS договор, counterparty_text, signed_at FROM contracts
       WHERE person_id IS NOT NULL AND company_id IN (SELECT id FROM g)`,
    ],
    wrong: [
      // все договоры с людьми, без группы
      `SELECT doc_no, company_id, person_id FROM contracts WHERE person_id IS NOT NULL`,
      // один этаж вниз: фонд (через «Сияние») не попадает
      `SELECT k.doc_no FROM company_owners o JOIN contracts k ON k.company_id = o.company_id
       WHERE o.owner_type = 'company' AND o.owner_id = 12 AND k.person_id IS NOT NULL`,
      // договоры с организациями вместо людей
      `WITH RECURSIVE g(id) AS (SELECT 12 UNION SELECT o.company_id FROM g JOIN company_owners o ON o.owner_type = 'company' AND o.owner_id = g.id)
       SELECT k.doc_no FROM g JOIN contracts k ON k.company_id = g.id WHERE k.person_id IS NULL`,
    ],
  },
  o9_4: {
    ok: [
      // без LIMIT: после СД-0147 у Kordon сделок нет
      `WITH t AS (SELECT deal_no, SUM(amount) OVER (ORDER BY deal_date, deal_no ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS s
                  FROM share_deals WHERE buyer_company_id = 12)
       SELECT deal_no, s FROM t WHERE s >= 31820000`,
      // коррелированный подзапрос вместо окна
      `SELECT d.deal_no, (SELECT SUM(x.amount) FROM share_deals x WHERE x.buyer_company_id = 12
                 AND (x.deal_date < d.deal_date OR (x.deal_date = d.deal_date AND x.deal_no <= d.deal_no))) AS total
       FROM share_deals d WHERE d.buyer_company_id = 12 AND total >= 31820000 ORDER BY total LIMIT 1`,
      // через LAG: прошлый итог ниже порога, текущий — выше
      `WITH t AS (SELECT deal_no, SUM(amount) OVER (ORDER BY deal_date, deal_no ROWS UNBOUNDED PRECEDING) AS s
                  FROM share_deals WHERE buyer_company_id = 12),
            u AS (SELECT deal_no, s, LAG(s) OVER (ORDER BY s) AS prev FROM t)
       SELECT * FROM u WHERE s >= 31820000 AND prev < 31820000`,
    ],
    wrong: [
      // ловушка RANGE: у СД-0146 и СД-0147 один итог, первой «пробивает» СД-0146
      `WITH t AS (SELECT deal_no, deal_date, SUM(amount) OVER (ORDER BY deal_date) AS s FROM share_deals WHERE buyer_company_id = 12)
       SELECT deal_no, s FROM t WHERE s >= 31820000 ORDER BY s, deal_no LIMIT 1`,
      `WITH t AS (SELECT deal_no, deal_date, SUM(amount) OVER (ORDER BY deal_date) AS s FROM share_deals WHERE buyer_company_id = 12)
       SELECT deal_no, s FROM t WHERE s >= 31820000`,
      // покупатель забыт: итог всего реестра
      `WITH t AS (SELECT deal_no, SUM(amount) OVER (ORDER BY deal_date, deal_no ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS s FROM share_deals)
       SELECT deal_no, s FROM t WHERE s >= 31820000 ORDER BY s LIMIT 1`,
      // просто все сделки Kordon
      `SELECT deal_no, deal_date, amount FROM share_deals WHERE buyer_company_id = 12`,
    ],
  },
  o9_5: {
    ok: [
      `SELECT * FROM migration_jobs WHERE date(run_at) = '2027-01-11'`,
      `SELECT run_at, action, target, responsible_login FROM migration_jobs WHERE status = 'запланировано'`,
    ],
    wrong: [
      // дата без времени
      `SELECT run_at, action, target, responsible_login FROM migration_jobs WHERE run_at = '2027-01-11'`,
      // только удаления после обеда
      `SELECT run_at, action, target, responsible_login FROM migration_jobs WHERE run_at > '2027-01-11 12:30:00'`,
      // последние три по id
      `SELECT run_at, action, target, responsible_login FROM migration_jobs ORDER BY id DESC LIMIT 3`,
    ],
  },
  o9_3b: {
    ok: [
      `SELECT g.*, p.last_name, p.first_name, p.patronymic, p.full_name FROM grant_requests g JOIN persons p ON p.id = g.requester_person_id
       ORDER BY g.requested_at DESC LIMIT 20`,
    ],
    wrong: [
      // без имени заявителя
      `SELECT * FROM grant_requests WHERE requested_at >= '2026-11-01 00:00:00'`,
      // весь список
      `SELECT g.request_text, p.full_name FROM grant_requests g JOIN persons p ON p.id = g.requester_person_id`,
    ],
  },
  o9_6s: {
    ok: [
      `SELECT a.holder_name, COUNT(*) AS n, SUM(t.amount) FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE t.counterparty LIKE '%Возврат%' GROUP BY a.holder_name`,
    ],
    wrong: [
      // название без формы и кавычек: равенство ничего не находит
      `SELECT t.ts, a.holder_name FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.counterparty = 'Возврат'`,
      // без хозяина счёта
      `SELECT ts, account_id, amount FROM transactions WHERE counterparty = 'ООО «Возврат»'`,
    ],
  },
};

describe("альтернативы и ошибки", () => {
  for (const [id, set] of Object.entries(CASES)) {
    it(`${id}: альтернативы проходят, ошибки — нет`, () => {
      for (const sql of set.ok) expect(passes(id, sql), sql).toBe(true);
      for (const sql of set.wrong) expect(passes(id, sql), sql).toBe(false);
      expect(set.wrong.length).toBeGreaterThanOrEqual(2);
    });
  }

  it("цикл 15 ↔ 16: UNION ALL без предела глубины не останавливается (тормоз — LIMIT внутри CTE)", () => {
    const n = one(`WITH RECURSIVE d(id, depth) AS (
      SELECT 12, 0 UNION ALL
      SELECT o.company_id, d.depth + 1 FROM d JOIN company_owners o ON o.owner_type = 'company' AND o.owner_id = d.id
      LIMIT 2000) SELECT COUNT(*) FROM d`);
    expect(n).toBe(2000);
    // Вверх от «Щита» цикла нет: UNION ALL без предела завершается
    expect(rowsOf(objective("o9_1").solution).length).toBe(5);
  });
});

// ------------------------------------------------------------------ протокол

describe("протокол", () => {
  const protocol = () => c09.protocol!;

  it("ответы находятся scanSeenOptions в результатах эталонов основных задач", () => {
    const seen = new Set<string>();
    for (const o of mainObjectives(c09, {})) for (const v of scanSeenOptions(protocol(), run(o.solution))) seen.add(v);
    for (const b of protocol().blanks) expect(seen.has(b.answer), b.id).toBe(true);
  });

  it("на ветке «сторожа» ответы тоже видны (выписка банка)", () => {
    const seen = new Set<string>();
    for (const o of mainObjectives(c09, {})) for (const v of scanSeenOptions(protocol(), run(o.solution, watcherDb))) seen.add(v);
    for (const b of protocol().blanks) expect(seen.has(b.answer), b.id).toBe(true);
  });

  it("верные ответы подтверждаются, неверные — нет", () => {
    const answers = Object.fromEntries(protocol().blanks.map((b) => [b.id, b.answer]));
    const ok = checkProtocol(protocol(), answers, new Set());
    expect(ok.solved).toBe(true);
    expect(new Set(ok.newlyConfirmed)).toEqual(new Set(protocol().blanks.map((b) => b.id)));

    const nominee = checkProtocol(protocol(), { ...answers, owner: "Елисеев Кирилл Андреевич", share: "30" }, new Set());
    expect(nominee.solved).toBe(false);
    const rangeTrap = checkProtocol(protocol(), { ...answers, deal: "СД-0146", paid_at: "2026-11-05", amount: "180000" }, new Set());
    expect(rangeTrap.solved).toBe(false);
    expect(rangeTrap.newlyConfirmed).not.toContain("deal");
  });
});

// ------------------------------------------------------------------ факты разд. 8.4

describe("посаженные факты Д9", () => {
  it("«Щит» в названии — ровно одна компания, 17", () => {
    expect(rowsOf("SELECT id FROM companies WHERE name LIKE '%Щит%'")).toEqual([[17]]);
  });

  it("цепочка вверх: 17 ← 14 ← 13 ← 12 ← люди 70 + 30, других нынешних владельцев на пути нет", () => {
    expect(rowsOf(`SELECT company_id, owner_type, owner_id, share FROM company_owners
      WHERE company_id IN (12, 13, 14, 17) AND until IS NULL ORDER BY company_id, share DESC`)).toEqual([
      [12, "person", 1001, 70],
      [12, "person", 3305, 30],
      [13, "company", 12, 100],
      [14, "company", 13, 100],
      [17, "company", 14, 100],
    ]);
  });

  it("группа вниз: 1 ← 12 (51), 2/3/4 ← 1, 18 ← 13 до 2017-06-30, цикл 15 ↔ 16 с долями 95/5 и 90/10", () => {
    expect(rowsOf("SELECT owner_id, share FROM company_owners WHERE company_id = 1 AND owner_type = 'company' AND until IS NULL")).toEqual([[12, 51]]);
    expect(rowsOf("SELECT company_id FROM company_owners WHERE owner_type = 'company' AND owner_id = 1 AND share = 100 ORDER BY company_id")).toEqual([[2], [3], [4]]);
    expect(rowsOf("SELECT until FROM company_owners WHERE company_id = 18 AND owner_id = 13")).toEqual([["2017-06-30"]]);
    expect(rowsOf("SELECT company_id, owner_id, share FROM company_owners WHERE company_id IN (15, 16) ORDER BY company_id, share DESC")).toEqual([
      [15, 13, 95], [15, 16, 5], [16, 13, 90], [16, 15, 10],
    ]);
    expect(one("SELECT COUNT(*) FROM (SELECT company_id FROM company_owners WHERE until IS NULL GROUP BY company_id HAVING ABS(SUM(share) - 100) > 0.001)")).toBe(0);
  });

  it("договор группы с человеком — ровно один, ТБ-2026/117 (фонд → игрок)", () => {
    expect(rowsOf(`SELECT doc_no, company_id, person_id, signed_at FROM contracts
      WHERE person_id IS NOT NULL AND company_id IN (1, 2, 3, 4, 12, 13, 14, 15, 16, 17, 18)`)).toEqual([["ТБ-2026/117", 3, 9000, "2026-11-25"]]);
    expect(String(one("SELECT clause FROM contracts WHERE doc_no = 'ТБ-2026/117'"))).toContain("п. 4.2");
  });

  it("«Ладога Инвест» → «Щит»: 180 000 каждое 5-е число и 300 000 20.11; в ноябре — ровно два платежа", () => {
    expect(rowsOf(`SELECT ts, amount, purpose FROM transactions WHERE account_id = 'ACC-10017' AND amount > 0
      AND ts >= '2026-11-01 00:00:00' AND ts < '2026-12-01 00:00:00' ORDER BY ts`)).toEqual([
      ["2026-11-05 10:15:00", 180000, "абонентская охрана"],
      ["2026-11-20 14:05:00", 300000, "доп. соглашение № 7"],
    ]);
    expect(one("SELECT COUNT(*) FROM transactions WHERE account_id = 'ACC-10017' AND amount = 180000 AND substr(ts, 9, 2) <> '05'")).toBe(0);
  });

  it("сделки Kordon: итог 31 500 000 после СД-0145, СД-0146 → 31 700 000, СД-0147 → 32 100 000, после — ничего", () => {
    const r = rowsOf(`SELECT deal_no, deal_date, SUM(amount) OVER (ORDER BY deal_date, deal_no ROWS UNBOUNDED PRECEDING)
      FROM share_deals WHERE buyer_company_id = 12 ORDER BY deal_date, deal_no`);
    expect(r.slice(-3)).toEqual([["СД-0145", "2015-12-04", 31500000], ["СД-0146", "2015-12-07", 31700000], ["СД-0147", "2015-12-07", 32100000]]);
    // Номера реестра идут по дате
    expect(one(`SELECT COUNT(*) FROM share_deals a JOIN share_deals b ON a.deal_no < b.deal_no AND a.deal_date > b.deal_date`)).toBe(0);
    expect(one("SELECT COUNT(*) FROM share_deals")).toBe(300);
  });

  it("выписка банка: 16 взносов «Бурцева» ровно на 31 820 000, оплата СД-0146/0147 07.12.2015, 500 строк", () => {
    expect(rowsOf("SELECT COUNT(*), SUM(amount), MIN(ts) >= '2015-03-01', MAX(ts) < '2015-12-01' FROM bank_statements WHERE payer LIKE '%вноситель Бурцев В. Н.%'"))
      .toEqual([[16, 31820000, 1, 1]]);
    expect(rowsOf("SELECT purpose FROM bank_statements WHERE payer = 'Kordon Holdings Ltd' AND ts LIKE '2015-12-07%' ORDER BY ts")).toEqual([
      ["оплата по сделке СД-0146"], ["оплата по сделке СД-0147"],
    ]);
    expect(one("SELECT COUNT(*) FROM bank_statements")).toBe(500);
    expect(one("SELECT COUNT(*) FROM bank_statements WHERE payer = 'Фонд «Тёплый берег»' AND payee = 'Пахомова З. П.'")).toBe(139);
    expect(String(one("SELECT purpose FROM bank_statements WHERE payer_account = 'ACC-90000' ORDER BY ts DESC LIMIT 1"))).toContain("412 000");
  });

  it("заявка в фонд «без опыта» — одна: Ратников, 2026-11-20 10:15:00", () => {
    expect(rowsOf("SELECT requested_at, requester_person_id, status FROM grant_requests WHERE request_text LIKE '%без опыта%'"))
      .toEqual([["2026-11-20 10:15:00", 1104, "исполнено"]]);
  });

  it("финализация: migration_jobs 17–20 на 11.01 под nol, других строк после старта Д9 нет", () => {
    expect(rowsOf("SELECT id, run_at, action, target, responsible_login, status FROM migration_jobs WHERE run_at >= '2026-12-28 00:00:00' ORDER BY id")).toEqual([
      [17, "2027-01-11 12:20:00", "DROP", "sokol_stage_registry", "nol", "запланировано"],
      [18, "2027-01-11 12:40:00", "DROP", "sokol_stage_statements", "nol", "запланировано"],
      [19, "2027-01-11 13:00:00", "DROP", "sokol_stage_persons", "nol", "запланировано"],
      [20, "2027-01-11 13:00:00", "FINALIZE", "Сокол → ПБД", "nol", "запланировано"],
    ]);
  });

  it("«Возврат» → ИП Мельник Е. А.: 60 000 ежемесячно с 2025-06, «Возврат» — не группа", () => {
    expect(rowsOf(`SELECT COUNT(*), MIN(t.ts) >= '2025-06-01', MIN(t.amount), MAX(t.amount), MAX(a.holder_name)
      FROM transactions t JOIN accounts a ON a.id = t.account_id
      WHERE t.counterparty = 'ООО «Возврат»'`)).toEqual([[19, 1, 60000, 60000, "ИП Мельник Е. А."]]);
    expect(rowsOf("SELECT owner_type, owner_id, share FROM company_owners WHERE company_id = 60")).toEqual([["person", 2058, 100]]);
  });
});
