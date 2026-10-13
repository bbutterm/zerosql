/**
 * Шум мира: не повторяет зарезервированные ключи посадок, соблюдает
 * форматы дат, не кладёт «будущих» строк в таблицы без горизонта, держит
 * ритмы и правила грязных данных разд. 8.3.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { Database } from "sql.js";
import * as F from "@/engine/world/facts";
import { WORLD_TABLES, tableOpensAt } from "@/engine/world/schema";
import { PATRONYMIC_OF } from "@/engine/world/pools";
import { sharedWorld, one, rows } from "./helpers";

let db: Database;

beforeAll(async () => {
  ({ db } = await sharedWorld());
}, 30_000);

/** Столбцы-даты (разд. 8.1 — полный список для базового мира) */
const DATE_COLUMNS: Record<string, string[]> = {
  persons: ["birth_date", "death_date"],
  staff: ["hired_at", "fired_at"],
  cases: ["status_at"],
  registrations: ["from_date", "to_date"],
  employment: ["from_date", "to_date"],
  vehicles: ["registered_at", "sold_at", "deregistered_at"],
  accounts: ["opened_at"],
  phones: ["registered_at"],
  companies: ["registered_at", "liquidated_at"],
  company_owners: ["since", "until"],
  share_deals: ["deal_date"],
  contracts: ["signed_at"],
  construction_docs: ["signed_at"],
  diver_reports: ["report_date"],
  properties: ["acquired_at"],
  gs_phonebook: ["from_date", "to_date"],
};

/** Столбцы дата-время: всегда 'YYYY-MM-DD HH:MM:SS' */
const DATETIME_COLUMNS: Record<string, string[]> = {
  incidents: ["reported_at"],
  persons: ["created_at"],
  logins: ["created_at", "last_login_at"],
  audit_log: ["ts"],
  query_log: ["logged_at"],
  evidence_registry: ["pinned_at"],
  cron_jobs: ["created_at", "fired_at"],
  attachments: ["created_at"],
  cases: ["opened_at"],
  doc_registry: ["registered_at"],
  statements: ["taken_at"],
  zags_deaths: ["died_at", "registered_at"],
  morgue_records: ["received_at", "identified_at"],
  hospital_admissions: ["admitted_at", "discharged_at"],
  plate_reads: ["read_at"],
  intercom_events: ["ts"],
  heat_readings: ["ts"],
  delivery_orders: ["accepted_at", "delivered_at"],
  transit_taps: ["ts"],
  door_access: ["ts"],
  purchases: ["ts"],
  transactions: ["ts"],
  messenger_events: ["ts", "created_at"],
  grant_requests: ["requested_at"],
  migration_jobs: ["run_at"],
  outfall_temp: ["ts"],
};

const DATE_GLOB = "[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]";
const DATETIME_GLOB = `${DATE_GLOB} [0-2][0-9]:[0-5][0-9]:[0-5][0-9]`;

describe("форматы дат (разд. 8.1)", () => {
  it("столбцы-даты — строго 'YYYY-MM-DD'", () => {
    for (const [t, cols] of Object.entries(DATE_COLUMNS)) {
      for (const c of cols) {
        expect(one(db, `SELECT COUNT(*) FROM ${t} WHERE ${c} IS NOT NULL AND NOT (${c} GLOB '${DATE_GLOB}')`), `${t}.${c}`).toBe(0);
      }
    }
  });

  it("столбцы дата-время — строго 'YYYY-MM-DD HH:MM:SS', секунды записаны", () => {
    for (const [t, cols] of Object.entries(DATETIME_COLUMNS)) {
      for (const c of cols) {
        expect(one(db, `SELECT COUNT(*) FROM ${t} WHERE ${c} IS NOT NULL AND NOT (${c} GLOB '${DATETIME_GLOB}')`), `${t}.${c}`).toBe(0);
      }
    }
  });

  it("сознательные исключения: gs_comms_2015.ts_unix — целое unix-время", () => {
    expect(one(db, "SELECT COUNT(*) FROM gs_comms_2015 WHERE typeof(ts_unix) <> 'integer'")).toBe(0);
    expect(one(db, "SELECT MIN(datetime(ts_unix, 'unixepoch', '+3 hours')) >= '2014-01-01' FROM gs_comms_2015")).toBe(1);
  });

  it("в столбцах горизонта нет NULL: иначе строка не появилась бы никогда", () => {
    for (const t of WORLD_TABLES) {
      if (!t.horizon || t.late) continue;
      expect(one(db, `SELECT COUNT(*) FROM ${t.name} WHERE ${t.horizon} IS NULL`), t.name).toBe(0);
    }
  });
});

describe("таблицы без горизонта: нет строк позже старта дела, которое их открывает", () => {
  it("все даты ≤ старта открывающего дела", () => {
    for (const t of WORLD_TABLES) {
      if (t.horizon || t.late || !t.opensIn) continue;
      const limit = tableOpensAt(t) as string;
      for (const c of DATE_COLUMNS[t.name] ?? []) {
        expect(one(db, `SELECT COUNT(*) FROM ${t.name} WHERE ${c} > ?`, [limit.slice(0, 10)]), `${t.name}.${c}`).toBe(0);
      }
      for (const c of DATETIME_COLUMNS[t.name] ?? []) {
        // Расписание финализации — единственные строки «вперёд»: они запланированы
        const extra = t.name === "migration_jobs" ? " AND status <> 'запланировано'" : "";
        expect(one(db, `SELECT COUNT(*) FROM ${t.name} WHERE ${c} > ?${extra}`, [limit]), `${t.name}.${c}`).toBe(0);
      }
    }
  });

  it("incident_persons — только по происшествиям до старта Д3", () => {
    expect(one(db, "SELECT COUNT(*) FROM incident_persons ip JOIN incidents i ON i.id = ip.incident_id WHERE i.reported_at > ?", [F.CASE_START.c03])).toBe(0);
  });

  it("записываемые таблицы Д11 не содержат строк позже его старта", () => {
    expect(one(db, "SELECT COUNT(*) FROM statements WHERE taken_at > ?", [F.CASE_START.c12])).toBe(0);
    expect(one(db, "SELECT COUNT(*) FROM evidence_registry WHERE pinned_at > ?", [F.CASE_START.c12])).toBe(0);
  });
});

describe("резервы посадок: шум их не повторяет", () => {
  it("номера машин каста — по одной строке реестра", () => {
    expect(one(db, "SELECT COUNT(*) FROM vehicles WHERE plate = 'К404ТО'")).toBe(1);
    expect(one(db, "SELECT COUNT(*) FROM vehicles WHERE plate = 'О114РБ'")).toBe(1);
    expect(one(db, "SELECT COUNT(*) FROM vehicles WHERE plate = 'Т117АУ'")).toBe(1); // c06: машина Сазонова
    // К372ОК сажает c01: одна строка реестра, проезды — только посаженные (тест дела c01)
    expect(one(db, "SELECT COUNT(*) FROM vehicles WHERE plate = 'К372ОК'")).toBe(1);
    expect(one(db, "SELECT COUNT(*) FROM plate_reads WHERE plate IN ('К404ТО')")).toBe(5);
    expect(one(db, "SELECT COUNT(*) FROM plate_reads WHERE plate IN ('О114РБ', 'Т117АУ')")).toBe(0);
  });

  it("телефоны каста: по одной строке; «id-номера» каста шуму не выданы", () => {
    for (const p of Object.values(F.PHONE)) expect(one(db, "SELECT COUNT(*) FROM phones WHERE msisdn = ?", [p]), p).toBe(1);
    const castLike = F.CAST_PERSONS.map((p) => F.castPhoneFor(p.id)).filter((p) => !Object.values(F.PHONE).includes(p as never));
    expect(one(db, `SELECT COUNT(*) FROM phones WHERE msisdn IN (${castLike.map(() => "?").join(",")})`, castLike)).toBe(0);
    const castPhones = Object.values(F.PHONE);
    expect(one(db, `SELECT COUNT(*) FROM messenger_events WHERE from_msisdn IN (${castPhones.map(() => "?").join(",")}) OR to_msisdn IN (${castPhones.map(() => "?").join(",")})`, [...castPhones, ...castPhones])).toBe(1);
    expect(one(db, `SELECT COUNT(*) FROM gs_comms_2015 WHERE to_number IN (${castPhones.map(() => "?").join(",")})`, castPhones)).toBe(2);
  });

  it("все телефоны — в вымышленном диапазоне +7 900 000-XX-XX", () => {
    const g = "+7 900 000-[0-9][0-9]-[0-9][0-9]";
    expect(one(db, `SELECT COUNT(*) FROM phones WHERE NOT (msisdn GLOB '${g}')`)).toBe(0);
    expect(one(db, `SELECT COUNT(*) FROM messenger_events WHERE NOT (from_msisdn GLOB '${g}') OR NOT (to_msisdn GLOB '${g}')`)).toBe(0);
    expect(one(db, `SELECT COUNT(*) FROM gs_comms_2015 WHERE NOT (to_number GLOB '${g}')`)).toBe(0);
  });

  it("пропуска, ИНН, счета, номера актов, названия компаний уникальны", () => {
    expect(one(db, "SELECT COUNT(*) - COUNT(DISTINCT badge_id) FROM staff")).toBe(0);
    expect(one(db, "SELECT COUNT(*) - COUNT(DISTINCT inn) FROM companies")).toBe(0);
    expect(one(db, "SELECT COUNT(*) - COUNT(DISTINCT name) FROM companies")).toBe(0);
    expect(one(db, "SELECT COUNT(*) FROM staff WHERE badge_id IN ('B-9000')")).toBe(0);
    for (const b of Object.values(F.BADGE).filter((b) => b !== F.BADGE.player)) {
      expect(one(db, "SELECT COUNT(*) FROM staff WHERE badge_id = ?", [b]), b).toBe(1);
    }
  });

  it("КУСП уникален в пределах года; 4515 и 4518 — только у посаженных строк", () => {
    expect(one(db, "SELECT COUNT(*) FROM (SELECT strftime('%Y', reported_at) y, kusp_no FROM incidents GROUP BY y, kusp_no HAVING COUNT(*) > 1)")).toBe(0);
    expect(one(db, "SELECT COUNT(*) FROM incidents WHERE kusp_no IN (4515, 4518) AND reported_at LIKE '2026%'")).toBe(2);
    expect(one(db, "SELECT COUNT(*) FROM morgue_records WHERE kusp_no = 4515")).toBe(1);
  });

  it("КУСП растёт вместе с id (кроме правленого 4518), id — с моментом регистрации", () => {
    const bad = one(db, `SELECT COUNT(*) FROM incidents i JOIN incidents j ON j.id = i.id + 1
      WHERE i.id > 40 AND strftime('%Y', i.reported_at) = strftime('%Y', j.reported_at) AND j.kusp_no <= i.kusp_no`);
    expect(bad).toBe(0);
    expect(one(db, "SELECT COUNT(*) FROM incidents i JOIN incidents j ON j.id = i.id + 1 WHERE i.id > 40 AND j.reported_at < i.reported_at AND j.id <> 1615")).toBe(0);
  });

  it("под логинами i.valts, nol и zero строк шума нет", () => {
    expect(one(db, "SELECT COUNT(*) FROM audit_log WHERE login = 'i.valts'")).toBe(231 + 20);
    expect(one(db, "SELECT COUNT(*) FROM audit_log WHERE login IN ('nol', 'zero', 'p.gromov', 'test1')")).toBe(0);
    expect(one(db, "SELECT COUNT(*) FROM query_log WHERE login IN ('zero', 'i.valts')")).toBe(0);
    expect(one(db, "SELECT COUNT(*) FROM audit_log WHERE login = 'a.lykov' AND workstation = 'WS-07'")).toBe(1);
  });

  it("сироты в logins — только test1 и zero (c04); без карточки — только опечатки c04; в ЗАГС — Вальц и Громов", () => {
    expect(rows(db, "SELECT login FROM logins WHERE staff_id IS NULL OR staff_id NOT IN (SELECT id FROM staff) ORDER BY login")).toEqual([["test1"], ["zero"]]);
    expect(rows(db, "SELECT s.id FROM staff s LEFT JOIN persons p ON p.id = s.person_id WHERE p.id IS NULL ORDER BY s.id"))
      .toEqual(F.STAFF_TYPOS.map((t) => [t.staffId]));
    expect(rows(db, "SELECT s.login FROM staff s JOIN zags_deaths d ON d.person_id = s.person_id ORDER BY s.login")).toEqual([["i.valts"], ["p.gromov"]]);
  });

  it("деньги группы и фонда — только посадки", () => {
    expect(one(db, "SELECT COUNT(*) FROM transactions WHERE counterparty LIKE '%Тёплый берег%' AND account_id <> 'ACC-30518'")).toBe(0);
    expect(one(db, "SELECT COUNT(*) FROM transactions WHERE counterparty LIKE '%Ладога%' OR counterparty LIKE '%Щит%'")).toBe(1);
    expect(one(db, "SELECT COUNT(*) FROM contracts c WHERE c.company_id IN (1,2,3,4,12,13,14,15,16,17,18) AND c.person_id IS NOT NULL")).toBe(0);
    expect(one(db, "SELECT COUNT(*) FROM company_owners WHERE company_id IN (1,2,3,4,12,13,14,15,16,17,18) OR (owner_type = 'company' AND owner_id IN (1,2,3,4,12,13,14,15,16,17,18))")).toBe(0);
  });
});

describe("реализм и грязные данные (разд. 8.3)", () => {
  it("отчество ребёнка выводится из имени отца по father_id", () => {
    const pairs = rows(db, "SELECT c.patronymic, c.sex, f.first_name FROM persons c JOIN persons f ON f.id = c.father_id");
    expect(pairs.length).toBeGreaterThan(300);
    for (const [patronymic, sex, father] of pairs) {
      const pair = PATRONYMIC_OF[String(father)];
      expect(pair, String(father)).toBeDefined();
      expect(patronymic).toBe(sex === "М" ? pair[0] : pair[1]);
    }
  });

  it("~5 % дублей карточек, ~6 % особых примет, ~1 % хвостовых пробелов в улицах", () => {
    const dupes = Number(one(db, "SELECT COUNT(*) FROM persons WHERE father_id IS NULL AND mother_id IS NULL AND prev_last_name IS NULL AND special_marks IS NULL AND created_at > '2015'"));
    expect(dupes).toBeGreaterThan(200);
    const marks = Number(one(db, "SELECT 100.0 * COUNT(special_marks) / COUNT(*) FROM persons"));
    expect(marks).toBeGreaterThan(3);
    expect(marks).toBeLessThan(9);
    const spaces = Number(one(db, "SELECT COUNT(*) FROM addresses WHERE street LIKE '% '"));
    expect(spaces).toBeGreaterThan(2);
    expect(spaces).toBeLessThan(25);
    expect(one(db, "SELECT COUNT(*) FROM persons WHERE special_marks LIKE '%палец%' OR special_marks LIKE '%фаланг%'")).toBe(0);
  });

  it("камеры: пик 7–9 сильнее ночи 2–4; гомоглифов OCR около 0,5 %", () => {
    const peak = Number(one(db, "SELECT COUNT(*) FROM plate_reads WHERE time(read_at) BETWEEN '07:00:00' AND '08:59:59'"));
    const night = Number(one(db, "SELECT COUNT(*) FROM plate_reads WHERE time(read_at) BETWEEN '02:00:00' AND '03:59:59'"));
    expect(peak).toBeGreaterThan(night * 5);
    const latin = Number(one(db, "SELECT COUNT(*) FROM plate_reads WHERE plate GLOB '*[ABEKMHOPCTYX]*'"));
    expect(latin).toBeGreaterThan(3);
    expect(latin).toBeLessThan(60);
    expect(one(db, "SELECT COUNT(*) FROM plate_reads WHERE camera_id = 22")).toBe(0);
  });

  it("платежи: аванс 5-го, зарплата 20-го, пенсия «СФР» 4-го (выходные — на пятницу)", () => {
    const days = (purpose: string) => rows(db, "SELECT DISTINCT CAST(strftime('%d', ts) AS INTEGER) FROM transactions WHERE purpose = ?", [purpose]).map((r) => Number(r[0]));
    expect(days("аванс").every((d) => d >= 3 && d <= 5)).toBe(true);
    expect(days("заработная плата").every((d) => d >= 18 && d <= 20)).toBe(true);
    expect(days("пенсия").every((d) => d >= 2 && d <= 4)).toBe(true);
    expect(one(db, "SELECT COUNT(DISTINCT counterparty) FROM transactions WHERE purpose = 'пенсия'")).toBe(1);
    expect(Number(one(db, "SELECT COUNT(*) FROM transactions WHERE counterparty = 'МФО «Деньги Сразу»' AND account_id <> 'ACC-10017'"))).toBeGreaterThan(30);
  });

  it("СКУД: служебные пропуска на КПП-1 — только 20:00–08:00", () => {
    expect(one(db, "SELECT COUNT(*) FROM door_access WHERE door = 'КПП-1' AND badge_id LIKE 'B-%' AND time(ts) >= '08:00:00' AND time(ts) < '20:00:00'")).toBe(0);
    expect(Number(one(db, "SELECT COUNT(*) FROM door_access WHERE door = 'КПП-1' AND badge_id LIKE 'G-%'"))).toBeGreaterThan(100);
  });

  it("ЗЕРКАЛО: сбой часов — ровно три строки «из будущего» от посторонних номеров, плюс голосовое Ирины", () => {
    expect(one(db, "SELECT COUNT(*) FROM messenger_events WHERE ts > '2027-01-11 13:00:00'")).toBe(3);
    expect(one(db, "SELECT COUNT(*) FROM messenger_events WHERE ts > created_at")).toBe(4);
  });

  it("владения компаний: доли текущих владельцев — ровно 100, циклов в шуме нет", () => {
    expect(one(db, "SELECT COUNT(*) FROM (SELECT company_id, SUM(share) s FROM company_owners WHERE until IS NULL GROUP BY company_id HAVING ABS(s - 100) > 0.001)")).toBe(0);
    const deep = one(db, `WITH RECURSIVE up(company_id, owner_id, depth) AS (
        SELECT company_id, owner_id, 1 FROM company_owners WHERE owner_type = 'company'
        UNION ALL SELECT o.company_id, o.owner_id, up.depth + 1 FROM up JOIN company_owners o ON o.company_id = up.owner_id AND o.owner_type = 'company' WHERE up.depth < 50)
      SELECT MAX(depth) FROM up`);
    expect(Number(deep ?? 0)).toBeLessThan(20);
  });

  it("журнал «Сокола»: номера 2015 года растут вместе с датой", () => {
    expect(one(db, `SELECT COUNT(*) FROM doc_registry a JOIN doc_registry b ON b.reg_no = a.reg_no + 1 WHERE b.registered_at < a.registered_at`)).toBe(0);
  });

  it("audit_log: id — порядок репликации, офлайн-станции дают пачки «из прошлого»", () => {
    const offline = Number(one(db, "SELECT COUNT(*) FROM audit_log a JOIN audit_log b ON b.id = a.id + 1 WHERE b.ts < a.ts"));
    expect(offline).toBeGreaterThan(20);
    expect(Number(one(db, "SELECT COUNT(*) FROM audit_log WHERE login = 'k.melnik' AND action = 'UPDATE' AND workstation = 'WS-IT-01'"))).toBeGreaterThan(400);
    expect(one(db, "SELECT COUNT(*) FROM audit_log WHERE old_value = '[ПДн скрыто]' AND field NOT IN ('special_marks', 'passport', 'phone', 'home_address')")).toBe(0);
  });
});
