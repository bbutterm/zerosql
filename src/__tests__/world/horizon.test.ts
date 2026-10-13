/**
 * Горизонт времени (TEMP VIEW + game_now()), поздние таблицы и сюжетные патчи.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { openCaseDatabase } from "@/engine/world/generate";
import {
  applyStoryPatch, createHorizonViews, getGameClock, horizonViews, normalizeClock, setGameClock, STORY_PATCHES,
} from "@/engine/world/horizon";
import { HORIZON_COLUMNS, WORLD_LATE_TABLES } from "@/engine/world/schema";
import { CASE_START } from "@/engine/world/facts";
import { logPlayerQuery } from "@/engine/query-log";
import * as facade from "@/engine";
import { sharedWorld, one, rows } from "./helpers";

let bytes: Uint8Array;

beforeAll(async () => {
  ({ bytes } = await sharedWorld());
}, 30_000);

describe("game_now() и часы", () => {
  it("отдаёт часы базы с секундами; часы переводятся", async () => {
    const db = await openCaseDatabase(bytes, { clock: "2026-12-02 18:05" });
    expect(one(db, "SELECT game_now()")).toBe("2026-12-02 18:05:00");
    setGameClock(db, "2026-12-03 21:30:15");
    expect(one(db, "SELECT game_now()")).toBe("2026-12-03 21:30:15");
    expect(getGameClock(db)).toBe("2026-12-03 21:30:15");
    expect(() => normalizeClock("02.12.2026 18:05")).toThrow(RangeError);
    expect(() => normalizeClock("2026-02-31 10:00")).toThrow(RangeError);
    db.close();
  });
});

describe("горизонт", () => {
  it("представления созданы для всех таблиц со столбцом горизонта", async () => {
    const db = await openCaseDatabase(bytes, { clock: CASE_START.c04 });
    expect(horizonViews(db).sort()).toEqual(Object.keys(HORIZON_COLUMNS).filter((t) => !WORLD_LATE_TABLES[t]).sort());
    db.close();
  });

  it("строки позже часов не видны и проявляются, когда часы до них доходят", async () => {
    const db = await openCaseDatabase(bytes, { clock: CASE_START.c00 });
    for (const [table, col] of Object.entries(HORIZON_COLUMNS)) {
      const total = Number(one(db, `SELECT COUNT(*) FROM main.${table}`));
      const visible = Number(one(db, `SELECT COUNT(*) FROM ${table}`));
      const future = Number(one(db, `SELECT COUNT(*) FROM main.${table} WHERE ${col} > ?`, [CASE_START.c00]));
      expect(visible, table).toBe(total - future);
      expect(Number(one(db, `SELECT COUNT(*) FROM ${table} WHERE ${col} > game_now()`)), table).toBe(0);
    }
    const before = Number(one(db, "SELECT COUNT(*) FROM incidents"));
    setGameClock(db, CASE_START.c12);
    const after = Number(one(db, "SELECT COUNT(*) FROM incidents"));
    expect(after).toBeGreaterThan(before);
    expect(after).toBe(Number(one(db, "SELECT COUNT(*) FROM main.incidents WHERE reported_at <= ?", [CASE_START.c12])));
    db.close();
  });

  it("М1: SELECT * FROM incidents LIMIT 10 через горизонт отдаёт id 1–10 (висяки 2015 года)", async () => {
    const db = await openCaseDatabase(bytes, { clock: CASE_START.c00 });
    expect(rows(db, "SELECT id FROM incidents LIMIT 10").map((r) => r[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    db.close();
  });

  it("выгрузка 22.12 02:47:19 и седьмой сеанс не видны в Д7 и видны в Д8", async () => {
    const db = await openCaseDatabase(bytes, { clock: "2026-12-21 23:30:00" });
    expect(one(db, "SELECT COUNT(*) FROM query_log WHERE login = 'nol'")).toBe(0);
    expect(one(db, "SELECT COUNT(*) FROM audit_log WHERE login = 'i.valts' AND ts > '2026-12-20'")).toBe(0);
    setGameClock(db, CASE_START.c08);
    expect(one(db, "SELECT COUNT(*) FROM query_log WHERE login = 'nol'")).toBe(1);
    expect(one(db, "SELECT COUNT(*) FROM audit_log WHERE login = 'i.valts' AND ts > '2026-12-20'")).toBe(17);
    db.close();
  });

  it("строка «из будущего»: голосовое видно по created_at, хотя ts — 11.01", async () => {
    const db = await openCaseDatabase(bytes, { clock: CASE_START.c08 });
    expect(one(db, "SELECT ts FROM messenger_events WHERE from_msisdn = '+7 900 000-41-27'")).toBe("2027-01-11 12:58:00");
    db.close();
  });

  it("записываемые таблицы дела горизонта не имеют", async () => {
    const db = await openCaseDatabase(bytes, { clock: CASE_START.c12, writable: ["statements", "evidence_registry"] });
    expect(horizonViews(db)).not.toContain("statements");
    expect(horizonViews(db)).not.toContain("evidence_registry");
    expect(horizonViews(db)).toContain("audit_log");
    db.close();
  });

  it("представления только для открытых таблиц дела, если список задан", async () => {
    const db = await openCaseDatabase(bytes, { clock: CASE_START.c01, tables: ["incidents", "staff", "plate_reads", "vehicles", "cameras"] });
    expect(horizonViews(db).sort()).toEqual(["incidents", "plate_reads"]);
    expect(createHorizonViews(db, ["incidents"])).toEqual([]);
    db.close();
  });
});

describe("поздние таблицы и сюжетные патчи", () => {
  it("поздних таблиц нет, пока их не создаст патч", async () => {
    const db = await openCaseDatabase(bytes, { clock: CASE_START.c09 });
    for (const t of Object.keys(WORLD_LATE_TABLES)) expect(one(db, "SELECT COUNT(*) FROM sqlite_master WHERE name = ?", [t]), t).toBe(0);
    applyStoryPatch(db, "late.bank_statements");
    expect(one(db, "SELECT COUNT(*) FROM sqlite_master WHERE name = 'bank_statements'")).toBe(1);
    applyStoryPatch(db, "late.drafts");
    applyStoryPatch(db, "late.publication");
    applyStoryPatch(db, "late.nina_carbon");
    for (const t of Object.keys(WORLD_LATE_TABLES)) expect(one(db, "SELECT COUNT(*) FROM sqlite_master WHERE name = ?", [t]), t).toBe(1);
    // Повтор безопасен
    expect(() => applyStoryPatch(db, "late.bank_statements")).not.toThrow();
    db.close();
  });

  it("p0.player: игрок 9000, staff 151, nol, договор ТБ-2026/117 (повтор ничего не дублирует)", async () => {
    const db = await openCaseDatabase(bytes, { clock: CASE_START.c00, patches: [{ id: "p0.player", params: { playerName: "Северов" } }] });
    applyStoryPatch(db, "p0.player", { playerName: "Северов" });
    expect(rows(db, "SELECT full_name, first_name, patronymic FROM persons WHERE id = 9000")).toEqual([["Северов", "", null]]);
    expect(rows(db, "SELECT person_id, login, workstation, badge_id, hired_at, contract_no FROM staff WHERE id = 151"))
      .toEqual([[9000, "nol", "WS-03", "B-9000", "2026-12-02", "ТБ-2026/117"]]);
    expect(rows(db, "SELECT company_id, person_id, signed_at FROM contracts WHERE doc_no = 'ТБ-2026/117'")).toEqual([[3, 9000, "2026-11-25"]]);
    expect(one(db, "SELECT clause FROM contracts WHERE doc_no = 'ТБ-2026/117'")).toContain("п. 4.2");
    expect(one(db, "SELECT COUNT(*) FROM logins")).toBe(170);
    db.close();
  });

  it("case.logins: zero входил прошлой ночью в 03:12:00", async () => {
    const d4 = await openCaseDatabase(bytes, { clock: CASE_START.c04 });
    expect(one(d4, "SELECT last_login_at FROM logins WHERE login = 'zero'")).toBe("2026-12-11 03:12:00");
    d4.close();
    const d5 = await openCaseDatabase(bytes, { clock: CASE_START.c05 });
    expect(one(d5, "SELECT last_login_at FROM logins WHERE login = 'zero'")).toBe("2026-12-14 03:12:00");
    d5.close();
  });

  it("cron.fire: строка zero / CRON-01 в 03:12:00 и fired_at; повтор ничего не добавляет", async () => {
    const db = await openCaseDatabase(bytes, { clock: "2026-12-15 03:11:00" });
    applyStoryPatch(db, "cron.fire", { jobId: 1, variant: "b", clock: "2026-12-15 03:12:30" });
    applyStoryPatch(db, "cron.fire", { jobId: 1, variant: "b", clock: "2026-12-15 03:12:30" });
    expect(rows(db, "SELECT logged_at, terminal, query_text FROM main.query_log WHERE login = 'zero'"))
      .toEqual([["2026-12-15 03:12:00", "CRON-01", "SELECT * FROM doc_registry WHERE year = 2015 AND reg_no BETWEEN 3311 AND 3313; -- соседи помнят больше, чем номер."]]);
    expect(one(db, "SELECT fired_at FROM cron_jobs WHERE id = 1")).toBe("2026-12-15 03:12:00");
    db.close();
  });

  it("ws07.agent срабатывает по часам; c10.purge чистит ЗЕРКАЛО, но не bank_statements", async () => {
    const d6 = await openCaseDatabase(bytes, { clock: CASE_START.c06 });
    expect(one(d6, "SELECT note FROM workstations WHERE id = 'WS-07'")).not.toContain("агент");
    d6.close();
    // Агент поставлен 21.12 в 03:04 — к старту Д7 (21.12 16:00) он уже стоит
    const d7 = await openCaseDatabase(bytes, { clock: CASE_START.c07 });
    expect(one(d7, "SELECT note FROM workstations WHERE id = 'WS-07'")).toBe("агент синхронизации v2");
    d7.close();
    const db = await openCaseDatabase(bytes, { clock: CASE_START.c10 });
    expect(one(db, "SELECT note FROM workstations WHERE id = 'WS-07'")).toBe("агент синхронизации v2");
    const res = applyStoryPatch(db, "c10.purge");
    expect(res.changes).toBe(7 + 13 + 2);
    expect(one(db, "SELECT COUNT(*) FROM purchases WHERE payer_person_id = 4210")).toBe(0);
    expect(one(db, "SELECT COUNT(*) FROM main.transactions WHERE account_id = 'ACC-10017'")).toBe(0);
    applyStoryPatch(db, "ws07.removed", { flags: { tokha_turned: true } });
    expect(one(db, "SELECT note FROM workstations WHERE id = 'WS-07'")).toBe("агент удалён 31.12.2026");
    db.close();
  });

  it("c10.frame и c10.rollback: подставные правки под nol и откат по аудиту", async () => {
    const db = await openCaseDatabase(bytes, { clock: CASE_START.c10, patches: ["p0.player"] });
    const before = one(db, "SELECT registered_at FROM doc_registry WHERE reg_no = 3313");
    const queries = ["2026-12-28 11:03:00", "2026-12-28 11:05:00", "2026-12-28 11:09:00"].map((loggedAt) => ({ loggedAt, sql: "SELECT 1" }));
    applyStoryPatch(db, "c10.frame", { queries });
    expect(one(db, "SELECT COUNT(*) FROM main.audit_log WHERE login = 'nol' AND workstation = 'WS-07'")).toBe(3);
    expect(one(db, "SELECT registered_at FROM doc_registry WHERE reg_no = 3313")).not.toBe(before);
    applyStoryPatch(db, "c10.rollback", { clock: "2026-12-31 10:20:00" });
    expect(one(db, "SELECT registered_at FROM doc_registry WHERE reg_no = 3313")).toBe(before);
    db.close();
  });

  it("c09.watcher: «-- Не надо.» под nol, платёж 20.11 удалён, «Бастион» у общежития", async () => {
    const db = await openCaseDatabase(bytes, { clock: "2026-12-28 12:00:00" });
    applyStoryPatch(db, "c09.watcher");
    expect(one(db, "SELECT COUNT(*) FROM main.transactions WHERE amount = 300000")).toBe(0);
    expect(one(db, "SELECT logged_at FROM main.query_log WHERE query_text LIKE '%Не надо.%'")).toBe("2026-12-28 12:01:00");
    expect(rows(db, "SELECT camera_id FROM main.plate_reads WHERE plate = 'О114РБ'")).toEqual([[31]]);
    db.close();
  });

  it("Д10 импорт диска и Д11 удаление staging: представления arch16_* появляются и исчезают", async () => {
    const db = await openCaseDatabase(bytes, { clock: CASE_START.c10, patches: ["c10.import"] });
    expect(one(db, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'view' AND name LIKE 'arch16_%'")).toBe(3);
    applyStoryPatch(db, "c12.drop.registry");
    expect(one(db, "SELECT COUNT(*) FROM sqlite_master WHERE name IN ('arch16_registry', 'sokol_stage_registry')")).toBe(0);
    expect(one(db, "SELECT status FROM migration_jobs WHERE id = 17")).toBe("выполнено");
    applyStoryPatch(db, "c12.voice");
    expect(one(db, "SELECT status FROM main.messenger_events WHERE from_msisdn = '+7 900 000-41-27'")).toBe("доставлено");
    db.close();
  });

  it("c07.admission: живая строка 601", async () => {
    const db = await openCaseDatabase(bytes, { clock: "2026-12-21 23:10:00", patches: ["c07.admission"] });
    expect(rows(db, "SELECT id, person_id, admitted_at, department, diagnosis FROM hospital_admissions WHERE id = 601"))
      .toEqual([[601, 1104, "2026-12-21 23:10:00", "кардиология ГБ № 1", "ОКС"]]);
    db.close();
  });

  it("у каждого патча есть название; неизвестный id — ошибка", async () => {
    for (const p of Object.values(STORY_PATCHES)) expect(p.title.length, p.id).toBeGreaterThan(5);
    const db = await openCaseDatabase(bytes, { clock: CASE_START.c00 });
    expect(() => applyStoryPatch(db, "nope")).toThrow();
    db.close();
  });

  it("журнал игрока пишется в main.query_log базы дела и сразу виден на часах", async () => {
    const db = await openCaseDatabase(bytes, { clock: CASE_START.c04, patches: ["p0.player"] });
    const id = logPlayerQuery(db, { loggedAt: CASE_START.c04, login: "nol", terminal: "WS-03", sql: "SELECT * FROM logins", rowsReturned: 170, ok: true, caseId: "case-04-mertvaya-dusha", objectiveId: "o4_2" });
    expect(id).toBeGreaterThan(1383);
    expect(rows(db, "SELECT login, objective_id FROM query_log WHERE id = ?", [id as number])).toEqual([["nol", "o4_2"]]);
    db.close();
  });
});

describe("фасад", () => {
  it("экспортирует мир v2", () => {
    for (const name of ["WORLD_SEED", "generateWorld", "exportWorld", "openCaseDatabase", "setGameClock", "applyStoryPatch", "WORLD_LATE_TABLES", "worldFacts"]) {
      expect(facade, name).toHaveProperty(name);
    }
    expect(facade.WORLD_SEED).toBe("POLYNYA-S1");
    expect(facade.worldFacts.PERSON.irina).toBe(4127);
  });
});
