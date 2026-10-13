/**
 * Глобальные факты разд. 8.4 (верхняя таблица) и сквозная хроника
 * вмешательств — проверка явными SQL-запросами к миру.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { Database } from "sql.js";
import { openCaseDatabase } from "@/engine/world/generate";
import * as F from "@/engine/world/facts";
import { sharedWorld, one, rows } from "./helpers";

let world: Database;
let bytes: Uint8Array;
const atClock = (clock: string, patches: string[] = []) => openCaseDatabase(bytes, { clock, patches });

beforeAll(async () => {
  ({ db: world, bytes } = await sharedWorld());
}, 30_000);

describe("люди (persons)", () => {
  it("каждый посаженный житель: ФИО, дата рождения, отчество не NULL", () => {
    for (const p of F.CAST_PERSONS) {
      const r = rows(world, "SELECT full_name, birth_date, patronymic, sex FROM persons WHERE id = ?", [p.id])[0];
      expect(r, String(p.id)).toBeDefined();
      expect(r[0]).toBe(`${p.last} ${p.first} ${p.middle}`);
      expect(r[1]).toBe(p.birth);
      expect(r[2]).not.toBeNull();
      expect(r[3]).toBe(p.sex);
    }
  });

  it("ключевые поля верхней таблицы", () => {
    expect(rows(world, "SELECT father_id, mother_id FROM persons WHERE id = 4127")[0]).toEqual([1388, 1389]);
    expect(one(world, "SELECT prev_last_name FROM persons WHERE id = 1389")).toBe("Сазонова");
    expect(one(world, "SELECT father_id FROM persons WHERE id = 3071")).toBe(3070);
    expect(one(world, "SELECT mother_id FROM persons WHERE id = 3612")).toBe(3611);
    expect(one(world, "SELECT death_date FROM persons WHERE id = 1105")).toBe("2016-03-14");
    expect(one(world, "SELECT death_date FROM persons WHERE id = 2588")).toBe("2026-12-06");
    expect(one(world, "SELECT death_date FROM persons WHERE id = 3550")).toBe("2019-10-11");
    expect(one(world, "SELECT created_at FROM persons WHERE id = 4301")).toBe("2026-11-20 02:22:00");
    expect(one(world, "SELECT MAX(id) FROM persons WHERE id < 9000")).toBe(4301);
  });

  it("приметы Бурцева и наряда 2015 года обнулены (special_marks NULL)", () => {
    for (const id of [2214, ...F.GUARD_SQUAD_2015]) {
      expect(one(world, "SELECT special_marks FROM persons WHERE id = ?", [id]), String(id)).toBeNull();
    }
  });

  it("акростих: фамилии в ПБД уже исправлены", () => {
    for (const a of F.ACROSTIC) expect(one(world, "SELECT last_name FROM persons WHERE id = ?", [a.personId])).toBe(a.right);
  });
});

describe("сотрудники, логины, пропуска, станции", () => {
  it("staff 118 — Ирина (П, Д4)", () => {
    expect(rows(world, "SELECT person_id, full_name, login, position, dept, workstation, badge_id, hired_at, fired_at FROM staff WHERE id = 118")[0])
      .toEqual([4127, "Вальц И. П.", "i.valts", "аналитик ОЦР", "ОЦР", "WS-03", "B-4127", "2025-03-03", "2026-11-19"]);
  });

  it("каст в staff: логины, пропуска 'B-' + id, Даша в ОЦР с 01.12", () => {
    const cast: [number, number, string, string][] = [
      [F.STAFF.ratnikov, 1104, "l.ratnikov", "B-1104"], [F.STAFF.nina, 1210, "n.shustova", "B-1210"],
      [F.STAFF.melnik, 1412, "k.melnik", "B-1412"], [F.STAFF.lykov, 4210, "a.lykov", "B-4210"],
      [F.STAFF.dasha, 3071, "d.kim", "B-3071"],
    ];
    for (const [id, person, login, badge] of cast) {
      expect(rows(world, "SELECT person_id, login, badge_id FROM staff WHERE id = ?", [id])[0]).toEqual([person, login, badge]);
    }
    expect(one(world, "SELECT hired_at FROM staff WHERE id = 150")).toBe("2026-12-01");
    expect(one(world, "SELECT full_name FROM staff WHERE id = 12")).toBe("Ратников Л. Б.");
  });

  it("zero: служебная учётка «Сокола», включена; i.valts не отключён", () => {
    expect(rows(world, "SELECT staff_id, role, created_at, created_by, enabled FROM logins WHERE login = 'zero'")[0])
      .toEqual([null, "service", "2015-03-01 00:00:00", "system", 1]);
    expect(one(world, "SELECT enabled FROM logins WHERE login = 'i.valts'")).toBe(1);
  });

  it("станции WS-03, WS-07 (серверная Б0-11), CRON-01, WS-IT-01…05", () => {
    expect(one(world, "SELECT room FROM workstations WHERE id = 'WS-03'")).toBe("Б0-03");
    expect(one(world, "SELECT room FROM workstations WHERE id = 'WS-07'")).toBe("Б0-11");
    expect(one(world, "SELECT kind FROM workstations WHERE id = 'CRON-01'")).toBe("виртуальная");
    expect(one(world, "SELECT COUNT(*) FROM workstations WHERE id LIKE 'WS-IT-0%'")).toBe(5);
    expect(one(world, "SELECT COUNT(*) FROM workstations WHERE id = 'GLB-CORE'")).toBe(0);
  });
});

describe("связь, машины, счета, компании, камеры", () => {
  it("телефоны каста — в вымышленном диапазоне и у своих владельцев", () => {
    const expected: [string, number][] = [
      [F.PHONE.sazonov, 1388], [F.PHONE.valentina, 1389], [F.PHONE.burtsev, 2214], [F.PHONE.irina, 4127], [F.PHONE.lykov, 4210],
    ];
    for (const [msisdn, person] of expected) expect(one(world, "SELECT person_id FROM phones WHERE msisdn = ?", [msisdn])).toBe(person);
    expect(one(world, "SELECT registered_at FROM phones WHERE msisdn = ?", [F.PHONE.burtsev])).toBe("2013-02-01");
  });

  it("«Тайга» К404ТО и «Бастион» О114РБ — машины «Щита»", () => {
    expect(rows(world, "SELECT id, make, model, owner_company_id, owner_name FROM vehicles WHERE plate = 'К404ТО'")).toEqual([[404, "Тайга", "4×4", 17, "ЧОП «Щит»"]]);
    expect(rows(world, "SELECT owner_company_id FROM vehicles WHERE plate = 'О114РБ'")).toEqual([[17]]);
  });

  it("счёт ACC-30518 — Пахомова З. П.", () => {
    expect(rows(world, "SELECT holder_person_id, holder_name FROM accounts WHERE id = 'ACC-30518'")).toEqual([[2588, "Пахомова З. П."]]);
  });

  it("компании группы с фиксированными id; «Щит» только один", () => {
    for (const [id, name] of Object.entries(F.COMPANY_NAME)) expect(one(world, "SELECT name FROM companies WHERE id = ?", [Number(id)])).toBe(name);
    expect(one(world, "SELECT director_person_id FROM companies WHERE id = 17")).toBe(2214);
    expect(one(world, "SELECT director_person_id FROM companies WHERE id = 18")).toBe(1001);
    expect(one(world, "SELECT liquidated_at FROM companies WHERE id = 18")).toBe("2017-06-30");
    expect(one(world, "SELECT registered_at FROM companies WHERE id = 3")).toBe("2015-03-01");
    expect(rows(world, "SELECT id FROM companies WHERE name LIKE '%Щит%'")).toEqual([[17]]);
  });

  it("камеры с сюжетной ролью; 22 отключена по запросу «Щита»", () => {
    expect(one(world, "SELECT name FROM cameras WHERE id = 12")).toBe("Промзона — выезд (Энергетиков)");
    expect(one(world, "SELECT name FROM cameras WHERE id = 15")).toBe("Промзона — база ЧОП «Щит»");
    expect(rows(world, "SELECT status, status_reason FROM cameras WHERE id = 22")).toEqual([["отключена", "по запросу собственника территории (ЧОП «Щит»)"]]);
  });
});

describe("2015 год: «Сокол», дело 15-0219, «Глубина-Строй»", () => {
  it("incidents 1–40 — висяки I квартала 2015 года по порядку, у 31 исполнитель Ратников", () => {
    const r = rows(world, "SELECT id, reported_at FROM incidents WHERE id <= 40 ORDER BY id");
    expect(r).toHaveLength(40);
    for (let i = 1; i < r.length; i++) expect(String(r[i][1]) > String(r[i - 1][1])).toBe(true);
    expect(String(r[0][1]) >= "2015-01-01" && String(r[39][1]) < "2015-04-01").toBe(true);
    expect(one(world, "SELECT COUNT(*) FROM incidents WHERE id <= 40 AND officer_staff_id = 12")).toBe(31);
  });

  it("строки 6 и 7 (М1)", () => {
    expect(rows(world, "SELECT reported_at, district, kind, applicant_text, status, officer_staff_id FROM incidents WHERE id = 6")[0])
      .toEqual(["2015-02-19 23:20:00", "Старый город", "заявление", "Сазонова В. С.", "приостановлено", 12]);
    expect(one(world, "SELECT description FROM incidents WHERE id = 6")).toContain("уехал после звонка с работы, не отвечает");
    const seven = rows(world, "SELECT reported_at, district, applicant_text, description, x_m, y_m FROM incidents WHERE id = 7")[0];
    expect(seven.slice(0, 3)).toEqual(["2015-02-19 23:58:00", "Створ", "Ким С. А. (Береговая, 4)"]);
    expect(seven[3]).toContain("проверка 00:30, ст. наряда Бурцев В. Н.");
    expect(seven.slice(4)).toEqual([F.GEO.row7.x, F.GEO.row7.y]);
    // В 18 м от нового оголовка и в 2 140 м от старого
    const d = (p: { x: number; y: number }) => Math.round(Math.hypot(p.x - F.GEO.row7.x, p.y - F.GEO.row7.y));
    expect(d(F.GEO.outfallNew)).toBe(18);
    expect(d(F.GEO.outfallOld)).toBe(2140);
  });

  it("дело 15-0219", () => {
    expect(rows(world, "SELECT title, opened_at, applicant_text, investigator, status, status_at FROM cases WHERE id = '15-0219'")[0])
      .toEqual(["Безвестное исчезновение Сазонова Петра Ильича", "2015-02-19 23:20:00", "Сазонова В. С. (жена)", "майор Ратников Л. Б.", "приостановлено", "2015-05-20"]);
  });

  it("журнал «Сокола»: дыра 3312, соседи 3311 и 3313, правленые 3320 и 3322, 61 % у Нины, 12 черновиков", () => {
    const gaps = rows(world, `SELECT d.reg_no + 1 FROM doc_registry d WHERE d.year = 2015
      AND NOT EXISTS (SELECT 1 FROM doc_registry x WHERE x.year = 2015 AND x.reg_no = d.reg_no + 1)
      AND d.reg_no < (SELECT MAX(reg_no) FROM doc_registry WHERE year = 2015)`).map((r) => r[0]);
    expect(gaps).toContain(3312);
    expect(gaps.every((g) => g === 3312 || g === 4471)).toBe(true);
    expect(rows(world, "SELECT registered_at, doc_type, case_id FROM doc_registry WHERE reg_no = 3311")).toEqual([["2015-02-20 01:05:00", "рапорт о выезде", "15-0219"]]);
    expect(rows(world, "SELECT registered_at, note FROM doc_registry WHERE reg_no = 3313")).toEqual([["2015-02-20 01:55:00", "составлена несовершеннолетней Ким Д. С., 13 л., к объяснению № 3312"]]);
    expect(rows(world, "SELECT reg_no, doc_type, case_id, date(registered_at) FROM doc_registry WHERE reg_no IN (3320, 3322) ORDER BY reg_no"))
      .toEqual([[3320, "объяснение", "15-0219", "2015-02-21"], [3322, "объяснение", "15-0219", "2015-02-21"]]);
    expect(one(world, "SELECT ROUND(100.0 * SUM(registered_by = 'Шустова Н. Ф.') / COUNT(*)) FROM doc_registry")).toBe(61);
    expect(one(world, "SELECT COUNT(*) FROM doc_registry WHERE reg_no IS NULL")).toBe(12);
    expect(one(world, "SELECT COUNT(*) FROM doc_registry")).toBe(5850);
  });

  it("объяснения по 15-0219: 60 настоящих + 3 подделки; 11 сирот «Сокола» в ПБД нет", () => {
    expect(one(world, "SELECT COUNT(*) FROM statements WHERE case_id = '15-0219'")).toBe(63);
    expect(rows(world, "SELECT id, person_id, doc_reg_no, taken_at, status FROM statements WHERE id IN (5203, 5204, 5207) ORDER BY id")).toEqual([
      [5203, 4301, 3320, "2015-02-21 11:20:00", "принято"],
      [5204, 3550, 3320, "2015-02-21 12:05:00", "принято"],
      [5207, 2588, 3322, "2015-02-21 15:40:00", "принято"],
    ]);
    expect(one(world, `SELECT COUNT(*) FROM statements WHERE id IN (${F.STATEMENTS_MISSING_IN_PBD.join(",")})`)).toBe(0);
    expect(rows(world, "SELECT MIN(id), MAX(id), COUNT(*) FROM statements WHERE id < 5000")[0]).toEqual([1001, 2100, 1089]);
  });

  it("АТС «Глубина-Строя»: звонок 21:47 и SMS 21:56 с 2-14 (unix-время UTC)", () => {
    const call = Date.UTC(2015, 1, 19, 18, 47) / 1000;
    const sms = Date.UTC(2015, 1, 19, 18, 56) / 1000;
    expect(rows(world, "SELECT kind, to_number, duration_sec FROM gs_comms_2015 WHERE from_ext = '2-14' AND ts_unix = ?", [call])).toEqual([["call", F.PHONE.sazonov, 60]]);
    expect(rows(world, "SELECT kind, to_number, recipient_name, text FROM gs_comms_2015 WHERE from_ext = '2-14' AND ts_unix = ?", [sms]))
      .toEqual([["sms", F.PHONE.burtsev, "ст. наряда Бурцев", "ГОСТЬ ЕДЕТ К СТАРОМУ ПРИЧАЛУ. ВСТРЕТЬ."]]);
    expect(rows(world, "SELECT room, holder_person_id, from_date, to_date FROM gs_phonebook WHERE ext = '2-14'")).toEqual([["приёмная директора", 1001, "2013-04-01", "2017-06-30"]]);
    expect(Number(one(world, "SELECT COUNT(*) FROM gs_comms_2015 WHERE text LIKE '%ЕДЕТ%'"))).toBeGreaterThan(20);
  });
});

describe("ночь 18.11.2026 и смерти", () => {
  it("КУСП 4515 и 4518: наезд и «угон» (reported_at уже правлен)", () => {
    expect(rows(world, "SELECT id, reported_at, kind, address_text, vehicle_id FROM incidents WHERE kusp_no = 4515")).toEqual([[1612, "2026-11-18 23:10:00", "ДТП", "Полярная, 17", null]]);
    expect(rows(world, "SELECT id, reported_at, kind, applicant_text, vehicle_id FROM incidents WHERE kusp_no = 4518")).toEqual([[1615, "2026-11-18 22:40:00", "угон", "Бурцев В. Н.", 404]]);
    expect(rows(world, "SELECT person_id, role FROM incident_persons WHERE id = 1205")).toEqual([[null, "потерпевшая"]]);
    expect(one(world, "SELECT note FROM incident_persons WHERE id = 1205")).toContain("«Б0-03»");
    expect(rows(world, "SELECT incident_id, person_id, role FROM incident_persons WHERE id = 1209")).toEqual([[1615, 2214, "заявитель"]]);
  });

  it("маршрут К404ТО: 22:52 (15), 23:08 (7), 23:21 (3), 23:34 (15), 19.11 03:10 (15)", () => {
    expect(rows(world, "SELECT read_at, camera_id FROM plate_reads WHERE plate = 'К404ТО' ORDER BY read_at")).toEqual([
      ["2026-11-18 22:52:00", 15], ["2026-11-18 23:08:00", 7], ["2026-11-18 23:21:00", 3], ["2026-11-18 23:34:00", 15], ["2026-11-19 03:10:00", 15],
    ]);
  });

  it("морг 311 и ЗАГС: Ирина, Громов, Пахомова, Ратникова, Ким С. А., Лапина", () => {
    expect(rows(world, "SELECT id, received_at, full_name_text, person_id, identified_at, identified_by FROM morgue_records WHERE kusp_no = 4515"))
      .toEqual([[311, "2026-11-19 00:40:00", "Вальц Ирина Петровна", 4127, "2026-11-19 09:30:00", "Вальц В. С. (мать)"]]);
    expect(rows(world, "SELECT person_id, died_at, registered_at FROM zags_deaths WHERE act_no = 'А-2026-0911'")).toEqual([[4127, "2026-11-18 23:10:00", "2026-11-20 11:00:00"]]);
    expect(rows(world, "SELECT person_id, died_at, registered_at FROM zags_deaths WHERE act_no = 'А-2019-0402'")).toEqual([[1550, "2019-06-02 04:30:00", "2019-06-04 10:00:00"]]);
    for (const id of [1105, 2588, 3070, 3550]) expect(one(world, "SELECT COUNT(*) FROM zags_deaths WHERE person_id = ?", [id]), String(id)).toBe(1);
  });

  it("голосовое Ирины матери: создано 18.11 23:05, доставка 11.01 12:58", () => {
    expect(rows(world, "SELECT ts, created_at, to_msisdn, kind, size_kb, cell_id, status FROM messenger_events WHERE from_msisdn = ?", [F.PHONE.irina]))
      .toEqual([["2027-01-11 12:58:00", "2026-11-18 23:05:00", F.PHONE.valentina, "голос", 412, "ПЛР-17", "запланировано"]]);
  });
});

describe("деньги", () => {
  it("фонд → Пахомова: 139 × 7 000 (05.03.2015 … 05.09.2026) и возврат 07.09.2026", () => {
    expect(rows(world, `SELECT COUNT(*), SUM(amount), date(MIN(ts)), date(MAX(ts)) FROM transactions
      WHERE account_id = 'ACC-30518' AND counterparty = 'Фонд «Тёплый берег»' AND amount > 0`)[0]).toEqual([139, 973000, "2015-03-05", "2026-09-05"]);
    expect(rows(world, "SELECT date(ts), amount, purpose FROM transactions WHERE account_id = 'ACC-30518' AND amount = -7000"))
      .toEqual([["2026-09-07", -7000, "возврат: отказ получателя"]]);
  });

  it("«Щит»: 380 000 за Лыкова (12.11) и 300 000 «доп. соглашение № 7» (20.11 14:05)", () => {
    expect(rows(world, "SELECT ts, amount, counterparty, purpose FROM transactions WHERE account_id = 'ACC-10017' ORDER BY ts")).toEqual([
      ["2026-11-12 11:47:00", -380000, "МФО «Деньги Сразу»", "погашение займа за Лыкова А. С."],
      ["2026-11-20 14:05:00", 300000, "ООО «Ладога Инвест»", "доп. соглашение № 7"],
    ]);
  });
});

describe("хроника вмешательств (М5, М6, М14, М15)", () => {
  it("Д4: 214 действий i.valts после смерти, 34 — не DELETE, последнее — EXPORT 09.12 02:30", async () => {
    const db = await atClock(F.CASE_START.c04);
    expect(one(db, `SELECT COUNT(a.id) FROM audit_log a JOIN zags_deaths d ON d.person_id = 4127 AND a.ts > d.died_at WHERE a.login = 'i.valts'`)).toBe(214);
    expect(one(db, "SELECT COUNT(*) FROM audit_log WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00' AND action <> 'DELETE'")).toBe(34);
    expect(rows(db, "SELECT ts, action FROM audit_log WHERE login = 'i.valts' ORDER BY ts DESC LIMIT 1")).toEqual([["2026-12-09 02:30:00", "EXPORT"]]);
    // id — порядок репликации: пачку 19.11 WS-07 отдала только 10.12
    expect(String(one(db, "SELECT ts FROM audit_log WHERE login = 'i.valts' ORDER BY id DESC LIMIT 1"))).toMatch(/^2026-11-19/);
    db.close();
  });

  it("три ключевые правки М5", () => {
    expect(rows(world, "SELECT ts, old_value, new_value FROM audit_log WHERE login = 'i.valts' AND table_name = 'persons' AND row_id = '2214'"))
      .toEqual([["2026-11-19 02:10:00", "[ПДн скрыто]", null]]);
    expect(rows(world, "SELECT ts, old_value, new_value FROM audit_log WHERE table_name = 'incidents' AND row_id = '1615' AND field = 'reported_at'"))
      .toEqual([["2026-11-20 02:14:00", "2026-11-18 23:52:00", "2026-11-18 22:40:00"]]);
    expect(rows(world, "SELECT ts, old_value, new_value FROM audit_log WHERE table_name = 'incident_persons' AND row_id = '1205'"))
      .toEqual([["2026-11-21 02:31:00", "4127", null]]);
    expect(one(world, "SELECT COUNT(*) FROM audit_log WHERE login = 'i.valts' AND field = 'special_marks'")).toBe(6);
    expect(rows(world, "SELECT row_id, old_value, new_value FROM audit_log WHERE table_name = 'sokol_stage_registry' ORDER BY ts")).toEqual([
      ["3320", "запрос в ГИБДД", "объяснение"], ["3322", "рапорт о ДТП", "объяснение"],
    ]);
  });

  it("Д8: 231 действие, 7 сеансов (разрыв > 20 мин), сеансы 2 и 6 — по 31", async () => {
    const db = await atClock(F.CASE_START.c08);
    expect(one(db, "SELECT COUNT(*) FROM audit_log WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00'")).toBe(231);
    const starts = rows(db, `WITH a AS (SELECT ts, LAG(ts) OVER (ORDER BY ts) AS prev FROM audit_log WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00')
      SELECT ts FROM a WHERE prev IS NULL OR (julianday(ts) - julianday(prev)) * 1440 > 20`).map((r) => r[0]);
    expect(starts).toEqual(F.GHOST_SESSIONS.map((s) => s.start));
    const sizes = rows(db, `SELECT date(ts, '-8 hours') AS night, COUNT(*) FROM audit_log WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00' GROUP BY night ORDER BY night`).map((r) => r[1]);
    expect(sizes).toEqual(F.GHOST_SESSIONS.map((s) => s.total));
    db.close();
  });

  it("Ирина 16.11: zero 0 → 1 и 9 заданий cron; акростих — пачка 2101–2110", () => {
    expect(rows(world, "SELECT ts, workstation, old_value, new_value FROM audit_log WHERE login = 'i.valts' AND table_name = 'logins' AND row_id = 'zero'"))
      .toEqual([["2026-11-16 22:41:00", "WS-03", "0", "1"]]);
    expect(one(world, "SELECT COUNT(*) FROM audit_log WHERE login = 'i.valts' AND table_name = 'cron_jobs' AND action = 'INSERT'")).toBe(9);
    expect(one(world, "SELECT group_concat(substr(new_value, 1, 1), '') FROM (SELECT new_value FROM audit_log WHERE id BETWEEN 2101 AND 2110 ORDER BY ts)")).toBe("СПРОСИНИНУ");
    expect(one(world, "SELECT group_concat(substr(new_value, 1, 1), '') FROM (SELECT new_value FROM audit_log WHERE id BETWEEN 2101 AND 2110 ORDER BY id)")).toBe("НИСПУИРОСН");
  });

  it("cron_jobs: 9 заданий Ирины с моментами М6", () => {
    expect(rows(world, "SELECT id, created_at, created_by, fired_at FROM cron_jobs ORDER BY id")).toEqual(
      F.CRON_JOBS.map((j) => [j.id, j.createdAt, "i.valts", null])
    );
  });

  it("запросы Ирины стёрты: 183 дыры в id query_log, у каждой — DELETE в аудите", () => {
    const deleted = rows(world, "SELECT CAST(row_id AS INTEGER) FROM audit_log WHERE login = 'i.valts' AND action = 'DELETE' AND table_name = 'query_log'").map((r) => Number(r[0]));
    expect(deleted).toHaveLength(183);
    const present = Number(one(world, `SELECT COUNT(*) FROM query_log WHERE id IN (${deleted.join(",")})`));
    expect(present).toBe(0);
    expect(one(world, "SELECT COUNT(*) FROM query_log WHERE login = 'i.valts'")).toBe(0);
    expect(rows(world, "SELECT MAX(id) - COUNT(*) FROM query_log")).toEqual([[183]]);
  });

  it("22.12 02:47:19: выгрузка 15-0219 под nol с WS-07; 21.12 03:04 — агент на WS-07", () => {
    expect(rows(world, "SELECT terminal, query_text, rows_returned FROM query_log WHERE login = 'nol'"))
      .toEqual([["WS-07", "SELECT * FROM statements WHERE case_id = '15-0219'", 63]]);
    expect(one(world, "SELECT logged_at FROM query_log WHERE login = 'nol'")).toBe("2026-12-22 02:47:19");
    expect(rows(world, "SELECT ts, login, workstation, new_value FROM audit_log WHERE table_name = 'workstations' AND row_id = 'WS-07'"))
      .toEqual([["2026-12-21 03:04:00", "a.lykov", "WS-07", "агент синхронизации v2"]]);
  });

  it("М15: две чашки чабреца Лыкова за 15 минут до каждого сеанса; вход на КПП-Б0 за 12 минут", () => {
    expect(rows(world, "SELECT ts FROM purchases WHERE payer_person_id = 4210 AND item = 'чай с чабрецом' AND qty = 2 ORDER BY ts").map((r) => r[0]))
      .toEqual(F.GHOST_SESSIONS.map((s) => s.tea));
    // «две чашки» — только посадки: 7 сеансов Лыкова + 11 пятниц Ирины 04.09–13.11 (разд. 8.4, посадка c08)
    expect(one(world, "SELECT COUNT(*) FROM purchases WHERE item = 'чай с чабрецом' AND qty >= 2")).toBe(18);
    expect(one(world, "SELECT COUNT(*) FROM purchases WHERE item = 'чай с чабрецом' AND qty >= 2 AND payer_person_id NOT IN (4210, 4127)")).toBe(0);
    const ins = rows(world, "SELECT ts FROM door_access WHERE badge_id = 'B-4210' AND door = 'КПП-Б0' AND direction = 'вход' AND time(ts) < '05:00:00' ORDER BY ts").map((r) => r[0]);
    for (const s of F.GHOST_SESSIONS) expect(ins).toContain(s.lykovIn);
    expect(one(world, "SELECT COUNT(*) FROM door_access WHERE badge_id = 'B-4210' AND ts > '2026-12-22 02:08:00'")).toBe(0);
  });

  it("эталон 8.3: в цокольном этаже в начале всех 7 сеансов — только Лыков", async () => {
    const db = await atClock(F.CASE_START.c08);
    const r = rows(db, `WITH a AS (SELECT ts, LAG(ts) OVER (ORDER BY ts) AS prev FROM audit_log WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00'),
      starts AS (SELECT ts AS t0 FROM a WHERE prev IS NULL OR (julianday(ts) - julianday(prev)) * 1440 > 20),
      v AS (SELECT badge_id, direction, ts AS t_in, LEAD(ts) OVER (PARTITION BY badge_id ORDER BY ts) AS t_out FROM door_access WHERE door = 'КПП-Б0')
      SELECT st.full_name, COUNT(DISTINCT s.t0) FROM starts s
      JOIN v ON v.direction = 'вход' AND s.t0 BETWEEN v.t_in AND COALESCE(v.t_out, datetime(v.t_in, '+12 hours'))
      JOIN staff st ON st.badge_id = v.badge_id
      GROUP BY st.full_name HAVING COUNT(DISTINCT s.t0) = 7`);
    expect(r).toEqual([["Лыков А. С.", 7]]);
    db.close();
  });

  it("migration_jobs: загрузка 14.12 и финализация 11.01 под nol", () => {
    expect(rows(world, "SELECT run_at, action, target, responsible_login, status FROM migration_jobs WHERE id = 9"))
      .toEqual([["2026-12-14 01:30:00", "LOAD", "sokol_stage_registry → doc_registry", "k.melnik", "выполнено"]]);
    expect(rows(world, "SELECT id, run_at, action, target, responsible_login, status FROM migration_jobs WHERE run_at >= '2027-01-11 00:00:00' ORDER BY id")).toEqual(
      F.MIGRATION_FINAL.map((j) => [j.id, j.runAt, j.action, j.target, "nol", "запланировано"])
    );
  });
});
