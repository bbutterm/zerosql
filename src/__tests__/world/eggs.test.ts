/**
 * Тайники в данных (EASTER_EGGS.md, разд. 8): каждый тайник находится своим
 * образцовым запросом в самом раннем деле (с его таблицами и часами), раньше —
 * нет; ни один эталон задач сезона и ни один «первый взгляд» на таблицу
 * тайник не открывает; инварианты библии с пасхалками держатся.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { Database } from "sql.js";
import { checkSecrets, executeSQL, openCaseDatabase, type CaseDef, type PatchRequest, type QueryResult } from "@/engine";
import { cases, secrets } from "@/data";
import * as F from "@/engine/world/facts";
import { BOBBY_FIRST_NAME, EGG_PERSON_IDS, EGG_ROW_KEYS } from "@/engine/world/plants/eggs";
import type { Row } from "@/engine/world/context";
import { sharedWorld, one, rows } from "./helpers";

let world: Database;
let bytes: Uint8Array;

const byOrder = [...cases].sort((a, b) => a.order - b.order);
const caseByKey = (key: string): CaseDef => {
  const n = Number(key.slice(1));
  const def = byOrder.find((c) => c.order === n);
  if (!def) throw new Error(`нет дела ${key}`);
  return def;
};

/** Запросы игрока в Д9: из них патч c10.frame ставит подставные правки (как в c10.test.ts) */
const D9_QUERIES = ["11:01:00", "11:02:00", "11:03:00", "11:05:00", "11:06:00", "11:10:00", "11:11:00"].map((t) => `2026-12-28 ${t}`);

/** Патчи, с которыми дело открыто в игре к этим часам (как в тестах дел) */
function patchesFor(def: CaseDef, clock: string): PatchRequest[] {
  const p: PatchRequest[] = ["p0.player"];
  switch (def.order) {
    case 7:
      if (clock >= "2026-12-21 18:47") p.push({ id: "c07.admission", params: { clock: "2026-12-21 18:47:00" } });
      break;
    case 9:
      p.push("late.bank_statements");
      break;
    case 10:
      p.push({ id: "c10.frame", params: { queries: D9_QUERIES.map((loggedAt) => ({ loggedAt, sql: "SELECT 1" })) } });
      if (clock >= "2026-12-31 10:41") {
        const flags = { tokha_turned: false };
        p.push(
          { id: "c10.rollback", params: { flags, clock: "2026-12-31 09:12:00" } },
          { id: "ws07.removed", params: { flags, clock: "2026-12-31 09:12:00" } },
          { id: "c10.purge", params: { clock: "2026-12-31 10:30:00" } },
          { id: "c10.import", params: { flags, clock: "2026-12-31 10:40:00" } },
          { id: "late.nina_carbon", params: { flags, clock: "2026-12-31 10:40:00" } }
        );
      }
      break;
    case 11:
      p.push({ id: "c10.import", params: { flags: {} } }, { id: "late.drafts", params: { flags: {} } });
      break;
    case 12:
      p.push("late.bank_statements", "late.nina_carbon", "c10.import", "late.drafts", "late.publication");
      break;
  }
  return p;
}

const opened = new Map<string, Database>();
async function caseDb(def: CaseDef, at: "start" | "cap" = "start"): Promise<Database> {
  const clock = at === "start" ? def.date : (def.clock?.cap ?? def.date);
  const k = `${def.id}@${clock}`;
  let db = opened.get(k);
  if (!db) {
    db = await openCaseDatabase(bytes, { clock, tables: def.tables, writable: def.writableTables, patches: patchesFor(def, clock) });
    opened.set(k, db);
  }
  return db;
}

/** Представления игрока в базе дела (для DML-задач Интерлюдии) */
const playerViews = (db: Database): string[] =>
  (db.exec("SELECT name FROM temp.sqlite_master WHERE type = 'view'")[0]?.values ?? []).map((r) => String(r[0]));

function found(def: CaseDef, db: Database, sql: string): { result: QueryResult; ids: string[] } {
  const result = executeSQL(db, sql, def.tables, {
    writableTables: def.writableTables,
    allowViews: def.allowViews,
    playerViews: playerViews(db),
  });
  return { result, ids: checkSecrets(secrets, result, db, new Set(), def.tables) };
}

beforeAll(async () => {
  ({ db: world, bytes } = await sharedWorld());
}, 60_000);

// ==================================================================== образцы

/** Образцовые запросы разд. 3 («Образец») и самое раннее дело находки */
const SAMPLES: { id: string; earliest: string; sql: string }[] = [
  { id: "secret.ddl_signature", earliest: "c00", sql: "SELECT name, sql FROM sqlite_master WHERE name = 'incidents';" },
  { id: "secret.owls", earliest: "c00", sql: "SELECT id, reported_at, kind, description, applicant_text FROM incidents WHERE district = 'Промзона' AND reported_at BETWEEN '2026-10-24 00:00:00' AND '2026-10-25 23:59:59';" },
  { id: "secret.schrodinger", earliest: "c00", sql: "SELECT ts, card_no, holder_text, route, stop FROM transit_taps WHERE card_kind = 'льготная' ORDER BY ts LIMIT 20;" },
  { id: "secret.delorean", earliest: "c01", sql: "SELECT plate, make, model, year, owner_name, registered_at, deregistered_at FROM vehicles WHERE deregistered_at < registered_at;" },
  { id: "secret.office_romance", earliest: "c08", sql: "SELECT ts, account_id, amount, counterparty, purpose FROM transactions WHERE amount = -1 ORDER BY ts;" },
  { id: "secret.timurovets", earliest: "c02", sql: "SELECT ts, account_id, amount, purpose FROM transactions WHERE purpose LIKE '%Шахтная, 7%';" },
  { id: "secret.matroskin", earliest: "c03", sql: "SELECT ts, amount, counterparty, purpose FROM transactions WHERE account_id = 'ACC-25900';" },
  { id: "secret.bobby_tables", earliest: "c03", sql: "SELECT id, full_name, length(full_name) AS n FROM persons ORDER BY n DESC LIMIT 5;" },
  { id: "secret.null_citizen", earliest: "c03", sql: "SELECT special_marks, COUNT(*) FROM persons GROUP BY special_marks;" },
  { id: "secret.horns_hooves", earliest: "c03", sql: "SELECT c.name, c.liquidated_at, p.full_name, p.birth_date FROM companies c JOIN persons p ON p.id = c.director_person_id ORDER BY p.birth_date LIMIT 5;" },
  { id: "secret.forty_two", earliest: "c04", sql: "SELECT logged_at, login, query_text, status FROM query_log WHERE status = 'error' AND login <> 'nol';" },
  { id: "secret.hal9000", earliest: "c05", sql: "SELECT taken_at, person_text, text FROM statements WHERE text LIKE '%Сияние%';" },
  { id: "secret.epoch_edge", earliest: "c06", sql: "SELECT id, ts_unix, datetime(ts_unix, 'unixepoch', '+3 hours') AS t, text FROM gs_comms_2015 ORDER BY ts_unix LIMIT 5;" },
  { id: "secret.irony_of_fate", earliest: "c06", sql: "SELECT street, house, apt, COUNT(*) FROM addresses GROUP BY street, house, apt HAVING COUNT(*) > 1;" },
  // У «Януса» два пути: прописка (Д6) и больница (Д7, образец)
  { id: "secret.janus", earliest: "c06", sql: "SELECT person_id, address_id, from_date, to_date FROM registrations WHERE from_date > to_date;" },
  // Образец разд. 3.15 без фильтра NULL сортирует первыми поступления без выписки — фильтр обязателен
  { id: "secret.janus", earliest: "c07", sql: "SELECT full_name, admitted_at, discharged_at, julianday(discharged_at) - julianday(admitted_at) AS days FROM hospital_admissions WHERE discharged_at IS NOT NULL ORDER BY days LIMIT 3;" },
  { id: "secret.janus", earliest: "c07", sql: "SELECT full_name, admitted_at, discharged_at FROM hospital_admissions WHERE discharged_at < admitted_at;" },
  { id: "secret.plaster", earliest: "c07", sql: "SELECT full_name, admitted_at, diagnosis FROM hospital_admissions WHERE department LIKE 'травм%' AND diagnosis LIKE '%гипс%';" },
  { id: "secret.last_pack", earliest: "c08", sql: "SELECT ts, merchant, item, qty, amount FROM purchases WHERE payer_person_id = 3071 ORDER BY ts;" },
  { id: "secret.carnival_night", earliest: "c09", sql: "SELECT requested_at, org_text, request_text, status FROM grant_requests WHERE status = 'отклонено';" },
  { id: "secret.picnic", earliest: "c09", sql: "SELECT g.requested_at, p.full_name, p.birth_date, g.request_text, g.status FROM grant_requests g JOIN persons p ON p.id = g.requester_person_id ORDER BY p.birth_date DESC LIMIT 3;" },
  { id: "secret.all_the_pieces", earliest: "c10", sql: "SELECT card_title, COUNT(*) FROM evidence_registry GROUP BY card_title;" },
  { id: "secret.ded_moroz", earliest: "c12", sql: "SELECT from_msisdn, COUNT(DISTINCT cell_id) AS cells, COUNT(*) AS n FROM messenger_events WHERE created_at BETWEEN '2026-12-31 23:55:00' AND '2027-01-01 00:15:00' GROUP BY from_msisdn ORDER BY cells DESC;" },
  { id: "secret.first_light", earliest: "c12", sql: "SELECT full_name, admitted_at, department, diagnosis FROM hospital_admissions WHERE admitted_at BETWEEN '2026-12-31 20:00:00' AND '2027-01-01 06:00:00';" },
];

describe("тайники: каждый находится образцом в самом раннем деле", () => {
  it("образцы покрывают все 22 тайника из secrets.json", () => {
    expect(secrets).toHaveLength(22);
    expect(new Set(SAMPLES.map((s) => s.id))).toEqual(new Set(secrets.map((s) => s.id)));
  });

  for (const s of SAMPLES) {
    it(`${s.id}: ${s.earliest} — находится, ровно один`, async () => {
      const def = caseByKey(s.earliest);
      const { result, ids } = found(def, await caseDb(def), s.sql);
      expect(result.error, String(result.error)).toBeNull();
      expect(ids).toEqual([s.id]);
    });

    if (s.earliest === "c00") continue;
    it(`${s.id}: дело раньше ${s.earliest} — не находится (таблица закрыта или строка за горизонтом)`, async () => {
      const prev = caseByKey(`c${String(Number(s.earliest.slice(1)) - 1).padStart(2, "0")}`);
      // Интерлюдия — на старте (23:00): полночь ещё не наступила
      const db = await caseDb(prev, prev.order === 11 ? "start" : "cap");
      expect(found(prev, db, s.sql).ids).toEqual([]);
    });
  }
});

// ==================================================================== эталоны сезона

describe("тайники: эталоны задач их не открывают", () => {
  for (const def of byOrder) {
    it(`${def.id}: solution каждой задачи на старте и на потолке часов → []`, async () => {
      let ran = 0;
      for (const at of ["start", "cap"] as const) {
        const db = await caseDb(def, at);
        for (const o of def.objectives) {
          if (!o.solution) continue;
          const { result, ids } = found(def, db, o.solution);
          if (!result.error) ran++;
          expect(ids, `${o.id} (${at})`).toEqual([]);
        }
      }
      // Эталоны действительно выполнились, а не упали на отсутствующих таблицах
      expect(ran).toBeGreaterThan(0);
    });
  }
});

// ==================================================================== первый взгляд

describe("тайники: первый взгляд на таблицу их не открывает", () => {
  it("SELECT * FROM t, LIMIT 10, LIMIT 20 по всем таблицам Д11 → []", async () => {
    const def = caseByKey("c12");
    const db = await caseDb(def, "cap");
    // Полный просмотр — по таблицам находок (порог фокуса), первые строки — по всем
    const eggTables = new Set(secrets.flatMap((x) => x.tables ?? []));
    for (const t of def.tables) {
      const sqls = [`SELECT * FROM ${t} LIMIT 10`, `SELECT * FROM ${t} LIMIT 20`];
      if (eggTables.has(t)) sqls.unshift(`SELECT * FROM ${t}`);
      for (const sql of sqls) {
        const { result, ids } = found(def, db, sql);
        if (result.error) continue;
        expect(ids, sql).toEqual([]);
      }
    }
  }, 60_000);

  it("опасные соседи: эксперимент с эпохой, телефоны, карточки жителей, проезд, сигареты → []", async () => {
    const def = caseByKey("c12");
    const db = await caseDb(def, "cap");
    for (const sql of [
      "SELECT datetime(0, 'unixepoch', '+3 hours')",
      "SELECT * FROM phones",
      "SELECT * FROM persons WHERE id IN (1965, 1975, 1976, 1985, 1931)",
      "SELECT * FROM plate_reads WHERE plate = 'М088АК'",
      "SELECT * FROM purchases WHERE item LIKE '%сигарет%'",
    ]) {
      const { result, ids } = found(def, db, sql);
      expect(result.error, sql).toBeNull();
      expect(ids, sql).toEqual([]);
    }
  });
});

// ==================================================================== инварианты

describe("тайники: инварианты библии", () => {
  it("жители-пасхалки посажены дословно, с отчеством и пропиской; Кравец — самая новая карточка", () => {
    expect(rows(world, `SELECT id FROM persons WHERE id IN (${EGG_PERSON_IDS.join(",")}) AND patronymic IS NOT NULL ORDER BY id`).map((r) => r[0]))
      .toEqual([...EGG_PERSON_IDS].sort((a, b) => a - b));
    expect(one(world, `SELECT COUNT(DISTINCT person_id) FROM registrations WHERE person_id IN (${EGG_PERSON_IDS.join(",")})`)).toBe(EGG_PERSON_IDS.length);
    expect(one(world, "SELECT id FROM persons ORDER BY created_at DESC LIMIT 1")).toBe(4301);
    // шум не заводит тёзок пасхалок (side-04)
    expect(one(world, `SELECT COUNT(*) FROM persons p WHERE p.id NOT IN (${EGG_PERSON_IDS.join(",")})
      AND EXISTS (SELECT 1 FROM persons e WHERE e.id IN (${EGG_PERSON_IDS.join(",")}) AND e.last_name = p.last_name AND e.first_name = p.first_name AND e.patronymic = p.patronymic)`)).toBe(0);
  });

  it("единственные значения: −1 ₽ — 29 строк, 'NULL' буквами — один 404, снятие до регистрации — одна М088АК, дубль адреса — «3-я Строителей»", () => {
    expect(one(world, "SELECT COUNT(*) FROM transactions WHERE amount = -1")).toBe(29);
    expect(rows(world, "SELECT id FROM persons WHERE special_marks = 'NULL'")).toEqual([[404]]);
    expect(rows(world, "SELECT plate FROM vehicles WHERE deregistered_at < registered_at")).toEqual([["М088АК"]]);
    expect(rows(world, "SELECT street, COUNT(*) FROM addresses GROUP BY street, house, apt HAVING COUNT(*) > 1")).toEqual([["3-я Строителей", 2]]);
    expect(one(world, "SELECT id FROM persons ORDER BY length(full_name) DESC LIMIT 1")).toBe(327);
    expect(rows(world, "SELECT plate FROM plate_reads WHERE plate IN ('М088АК', 'M088AK', 'М088AK')")).toEqual([["М088АК"]]);
  });

  it("P.1: первые 10 вызовов — по-прежнему id 1–10; фиксированные id тайников на месте", async () => {
    const c00 = await caseDb(caseByKey("c00"));
    expect(rows(c00, "SELECT * FROM incidents LIMIT 10").map((r) => r[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rows(world, "SELECT id, person_id FROM staff WHERE id IN (13, 42) ORDER BY id")).toEqual([[13, 2002], [42, 4242]]);
    expect(one(world, "SELECT name FROM companies WHERE id = 231")).toBe("ООО «Рога и копыта»");
    expect(one(world, "SELECT plate FROM vehicles WHERE id = 88")).toBe("М088АК");
    expect(one(world, "SELECT COUNT(*) FROM addresses WHERE id IN (761, 762) AND street = '3-я Строителей'")).toBe(2);
    expect(one(world, "SELECT title FROM cases WHERE id = '19-0302'")).toMatch(/Янтарь/);
    // офицер вызовов-тайников — действующий полицейский шума
    expect(rows(world, "SELECT fired_at, rank IS NOT NULL FROM staff WHERE id = 97")).toEqual([[null, 1]]);
  });

  it("плавающие строки получили id по времени: LIMIT без ORDER BY их не показывает", () => {
    for (const [table, min] of [["grant_requests", 20], ["transit_taps", 20], ["hospital_admissions", 20], ["incidents", 40]] as const) {
      const ids = rows(world, `SELECT * FROM ${table}`).length;
      expect(ids, table).toBeGreaterThan(min);
    }
    const eggIds = (table: string) => {
      const res = world.exec(`SELECT * FROM ${table}`)[0];
      return res.values
        .map((v) => Object.fromEntries(res.columns.map((c, i) => [c, v[i]])) as Row)
        .filter((r) => EGG_ROW_KEYS[table](r))
        .map((r) => Number(r.id));
    };
    expect(eggIds("grant_requests")).toHaveLength(3);
    expect(eggIds("transit_taps")).toHaveLength(2);
    expect(eggIds("hospital_admissions")).toHaveLength(3);
    expect(Math.min(...eggIds("grant_requests"))).toBeGreaterThan(20);
    expect(Math.min(...eggIds("transit_taps"))).toBeGreaterThan(20);
    expect(eggIds("hospital_admissions").every((id) => id <= 600)).toBe(true);
    expect(eggIds("query_log")).toHaveLength(3);
    expect(eggIds("messenger_events")).toHaveLength(13);
  });

  it("номера шума не бывают в 8+ сотах за час: путь через COUNT(DISTINCT cell_id) ведёт к Деду Морозу", () => {
    const top = rows(world, `SELECT from_msisdn, strftime('%Y-%m-%d %H', created_at) AS h, COUNT(DISTINCT cell_id) AS c
      FROM messenger_events GROUP BY from_msisdn, h HAVING c > 7`);
    expect(top).toEqual([["+7 900 000-01-01", "2027-01-01 00", 13]]);
  });

  it("Бобби: экранированный литерал проходит guard и находит одну строку; без экранирования — отказ, таблица цела", async () => {
    const def = caseByKey("c03");
    const db = await caseDb(def);
    const ok = executeSQL(db, "SELECT id FROM persons WHERE first_name = 'Роберт''); DROP TABLE persons;--'", def.tables);
    expect(ok.error).toBeNull();
    expect(ok.rows).toEqual([[327]]);
    const bad = executeSQL(db, "SELECT id FROM persons WHERE first_name = 'Роберт'); DROP TABLE persons;--'", def.tables);
    expect(bad.error).not.toBeNull();
    expect(one(db, "SELECT COUNT(*) FROM persons WHERE id = 327")).toBe(1);
    expect(one(db, "SELECT first_name FROM persons WHERE id = 327")).toBe(BOBBY_FIRST_NAME);
  });

  it("версия генератора поднята: байты мира с тайниками не берутся из старого кеша", () => {
    expect(F.WORLD_GENERATOR_VERSION).toBeGreaterThanOrEqual(3);
  });
});
