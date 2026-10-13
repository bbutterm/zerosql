/**
 * Регрессии ревью генератора мира: ложные улики шума, резервы жителей,
 * created_at карточек, история владений, СКУД, АТС 19.02.2015, КУСП,
 * гомоглифы OCR, поля верхней таблицы разд. 8.4 вне persons — и
 * устойчивость к пересеву фона (NG+, разд. 8.3): те же инварианты на чужом зерне.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "@/engine/database";
import { WorldContext } from "@/engine/world/context";
import { worldSeedNumber } from "@/engine/world/generate";
import { WORLD_SCHEMA_SQL, WORLD_TABLES, tableOpensAt } from "@/engine/world/schema";
import { PLANT_REGISTRY } from "@/engine/world/plants";
import { ADULT_PERSON_IDS } from "@/engine/world/plants/core";
import { generateNoise } from "@/engine/world/noise";
import { noiseState } from "@/engine/world/noise/state";
import { OCR_LATIN_READS } from "@/engine/world/noise/city";
import { spreadKusp } from "@/engine/world/noise/police";
import { Rng, parseTs } from "@/engine/world/rng";
import * as F from "@/engine/world/facts";
import { sharedWorld, one, rows } from "./helpers";

/** Мир на другом зерне вместе с контекстом генерации (для проверки состояния шума) */
async function worldWithContext(seed: string, extraPlant?: (ctx: WorldContext) => void): Promise<{ db: Database; ctx: WorldContext }> {
  const db = await createDatabase();
  const ctx = new WorldContext(db, worldSeedNumber(seed));
  db.run("PRAGMA foreign_keys = OFF");
  db.run(WORLD_SCHEMA_SQL);
  db.run("BEGIN");
  ctx.phase = "plants";
  for (const m of PLANT_REGISTRY) m.plant(ctx);
  extraPlant?.(ctx);
  ctx.phase = "noise";
  generateNoise(ctx);
  ctx.dispose();
  db.run("COMMIT");
  return { db, ctx };
}

/** Запрос «на часах»: строки позже часов в таблицах горизонта не видны */
function at(db: Database, clock: string, sql: string, params: (string | number | null)[] = []): unknown[][] {
  const horizon: Record<string, string> = Object.fromEntries(WORLD_TABLES.filter((t) => t.horizon && !t.late).map((t) => [t.name, t.horizon as string]));
  const wrapped = sql.replace(/\b(FROM|JOIN)\s+([a-z_0-9]+)\b/gi, (m, kw: string, t: string) =>
    horizon[t] ? `${kw} (SELECT * FROM ${t} WHERE ${horizon[t]} <= '${clock}') ${t}` : m
  );
  return rows(db, wrapped, params);
}

const SESSION_STARTS = `WITH a AS (SELECT ts, LAG(ts) OVER (ORDER BY ts) AS prev FROM audit_log
    WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00')
  SELECT ts FROM a WHERE prev IS NULL OR (julianday(ts) - julianday(prev)) * 1440 > 20`;

/** Эталон 8.3 (разд. 5.8) */
const D8_PRESENCE = `WITH a AS (SELECT ts, LAG(ts) OVER (ORDER BY ts) AS prev FROM audit_log
    WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00'),
  starts AS (SELECT ts AS t0 FROM a WHERE prev IS NULL OR (julianday(ts) - julianday(prev)) * 1440 > 20),
  v AS (SELECT badge_id, direction, ts AS t_in, LEAD(ts) OVER (PARTITION BY badge_id ORDER BY ts) AS t_out
    FROM door_access WHERE door = 'КПП-Б0')
  SELECT st.full_name, COUNT(DISTINCT s.t0) FROM starts s
  JOIN v ON v.direction = 'вход' AND s.t0 BETWEEN v.t_in AND COALESCE(v.t_out, datetime(v.t_in, '+12 hours'))
  JOIN staff st ON st.badge_id = v.badge_id
  GROUP BY st.full_name HAVING COUNT(DISTINCT s.t0) = 7`;

/** Инварианты, которые держатся на любом зерне фона */
function invariants(db: Database): void {
  // Ни одной даты после старта дела, которое открывает таблицу без горизонта
  for (const t of WORLD_TABLES) {
    if (t.horizon || t.late || !t.opensIn) continue;
    const limit = tableOpensAt(t) as string;
    for (const c of t.columns) {
      if (!/(_at|_date|^since$|^until$)$/.test(c.name)) continue;
      const extra = t.name === "migration_jobs" ? " AND status <> 'запланировано'" : "";
      const n = Number(one(db, `SELECT COUNT(*) FROM ${t.name} WHERE ${c.name} > CASE WHEN length(${c.name}) = 10 THEN ? ELSE ? END${extra}`, [limit.slice(0, 10), limit]));
      expect(n, `${t.name}.${c.name} > ${limit}`).toBe(0);
    }
  }
  // Д4: 214 действий i.valts после смерти; последнее «по id» — пачка 19.11
  expect(at(db, F.CASE_START.c04, "SELECT COUNT(*) FROM audit_log WHERE login = 'i.valts' AND ts > '2026-11-18 23:10:00'")).toEqual([[214]]);
  expect(at(db, F.CASE_START.c04, "SELECT substr(ts, 1, 10) FROM audit_log WHERE login = 'i.valts' ORDER BY id DESC LIMIT 1")).toEqual([["2026-11-19"]]);
  // Д8: 7 стартов, в цокольном этаже в начале всех — только Лыков
  expect(at(db, "2026-12-24 13:00:00", SESSION_STARTS).length).toBe(7);
  expect(at(db, "2026-12-24 13:00:00", D8_PRESENCE)).toEqual([["Лыков А. С.", 7]]);
  // Д8: голосовое Ирины и три сбоя часов видны на старте Д8
  expect(at(db, F.CASE_START.c08, "SELECT COUNT(*) FROM messenger_events WHERE ts > ?", [F.CASE_START.c08])).toEqual([[4]]);
  // Д9: доли текущих владельцев — ровно 100
  expect(one(db, "SELECT COUNT(*) FROM (SELECT company_id FROM company_owners WHERE until IS NULL GROUP BY company_id HAVING ABS(SUM(share) - 100) > 0.001)")).toBe(0);
  // Д10 ★: 16 гомоглифов шума до старта Д10 (+ K372OK из c01 = 17)
  expect(at(db, F.CASE_START.c10, "SELECT COUNT(*) FROM plate_reads WHERE plate GLOB '*[A-Z]*'")).toEqual([[OCR_LATIN_READS.beforeC10]]);
  // Гости КПП-1 — только к сотрудникам в штате
  const castHosts = ["Вальц И. П.", "Ратников Л. Б.", "Ким Д. С.", "Лыков А. С.", "Шустова Н. Ф.", "Мельник К. И."].map((c) => `%(к ${c})`);
  expect(one(db, `SELECT COUNT(*) FROM door_access WHERE badge_id LIKE 'G-%' AND (${castHosts.map(() => "note LIKE ?").join(" OR ")})`, castHosts)).toBe(0);
  // После смерти Ирины в ПБД заведена одна карточка — Кравец
  expect(rows(db, "SELECT id FROM persons WHERE created_at > ?", [F.KEY_TIMES.hitAndRun])).toEqual([[F.PERSON.kravets]]);
}

let db: Database;

beforeAll(async () => {
  ({ db } = await sharedWorld());
}, 30_000);

describe("ревью: ложные улики шума", () => {
  it("гости КПП-1 приходят к сотрудникам в штате: не к погибшей, не к Ратникову в кардиологии, не к Даше до перевода", () => {
    const notes = rows(db, "SELECT note FROM door_access WHERE badge_id LIKE 'G-%' AND direction = 'вход'").map((r) => String(r[0]));
    expect(notes.length).toBeGreaterThan(100);
    for (const n of notes) expect(n).toMatch(/^гость: .+ \(к .+\)$/);
    const cast = ["Вальц И. П.", "Ратников Л. Б.", "Ким Д. С.", "Лыков А. С.", "Шустова Н. Ф.", "Мельник К. И."];
    expect(notes.filter((n) => cast.some((c) => n.includes(`(к ${c})`)))).toEqual([]);
  });

  it("после смерти Ирины в ПБД заведена одна карточка — «мёртвая душа» 4301; карточки шума заводят днём", () => {
    expect(rows(db, "SELECT id, created_at FROM persons WHERE created_at > ?", [F.KEY_TIMES.hitAndRun])).toEqual([[4301, "2026-11-20 02:22:00"]]);
    expect(one(db, "SELECT COUNT(*) FROM persons WHERE id < 9000 AND id <> 4301 AND (time(created_at) < '08:30:00' OR time(created_at) >= '18:30:00')")).toBe(0);
    // Нет «прилипших» к одной секунде пачек (раньше дубли упирались в 2026-12-08 15:00:00)
    expect(one(db, "SELECT MAX(c) FROM (SELECT COUNT(*) c FROM persons GROUP BY created_at)")).toBeLessThan(3);
  });

  it("АТС «Глубина-Строя»: вечер 19.02.2015 — только звонок и SMS с 2-14; ловушка UTC пуста", () => {
    expect(rows(db, `SELECT datetime(ts_unix, 'unixepoch', '+3 hours'), kind, from_ext FROM gs_comms_2015
      WHERE datetime(ts_unix, 'unixepoch', '+3 hours') BETWEEN '2015-02-19 18:00:00' AND '2015-02-20 03:00:00' ORDER BY ts_unix`))
      .toEqual([["2015-02-19 21:47:00", "call", "2-14"], ["2015-02-19 21:56:00", "sms", "2-14"]]);
    expect(one(db, "SELECT COUNT(*) FROM gs_comms_2015 WHERE datetime(ts_unix, 'unixepoch') BETWEEN '2015-02-19 21:00:00' AND '2015-02-19 22:00:00'")).toBe(0);
    expect(Number(one(db, "SELECT COUNT(*) FROM gs_comms_2015 WHERE text LIKE '%ЕДЕТ%'"))).toBeGreaterThan(24);
  });

  it("сброс «Створа»: холоднее +1 впервые 14.12; до 2026 года минимум ровно +6,2", () => {
    expect(rows(db, "SELECT date(ts) FROM outfall_temp GROUP BY date(ts) HAVING MIN(temp_c) < 1 ORDER BY 1 LIMIT 1")).toEqual([["2026-12-14"]]);
    expect(one(db, "SELECT MIN(temp_c) FROM outfall_temp WHERE ts < '2026-01-01'")).toBe(6.2);
    expect(one(db, "SELECT MIN(ts) FROM outfall_temp")).toMatch(/^2015-03-12 /);
  });
});

describe("ревью: верхняя таблица разд. 8.4 вне persons", () => {
  it("Портовая, 3: Сазоновы (кв. 12) и соседка Лапина (кв. 14, до смерти); шум в эти квартиры не прописан", () => {
    expect(rows(db, `SELECT r.person_id, a.street, a.house, a.apt, r.from_date, r.to_date FROM registrations r JOIN addresses a ON a.id = r.address_id
      WHERE a.id IN (?, ?) ORDER BY r.person_id`, [F.ADDRESS.sazonovs.id, F.ADDRESS.lapina.id]))
      .toEqual([
        [1388, "Портовая", "3", "12", "1996-05-14", null],
        [1389, "Портовая", "3", "12", "1996-05-14", null],
        [3550, "Портовая", "3", "14", "1979-08-01", "2019-10-11"],
      ]);
  });

  it("Петров — врач АНО «Медсанчасть Створ»; Олег Пахомов — курьер «Сияние.Доставки»", () => {
    expect(rows(db, "SELECT e.person_id, c.name, e.position FROM employment e JOIN companies c ON c.id = e.company_id WHERE e.person_id IN (1777, 2589) ORDER BY e.person_id"))
      .toEqual([[1777, "АНО «Медсанчасть Створ»", "врач-терапевт"], [2589, "ПАО «Сияние»", "курьер «Сияние.Доставки»"]]);
    // Четверо получателей квартир (Д7) — не работники «Глубина-Строя»
    expect(one(db, "SELECT COUNT(*) FROM employment WHERE company_id = 18 AND person_id IN (1104, 1602, 1530, 1777)")).toBe(0);
  });

  it("Кравец 4301: нет прописки, телефона и работы", () => {
    expect(one(db, `SELECT (SELECT COUNT(*) FROM registrations WHERE person_id = 4301) + (SELECT COUNT(*) FROM phones WHERE person_id = 4301)
      + (SELECT COUNT(*) FROM employment WHERE person_id = 4301)`)).toBe(0);
  });

  it("инженеры ревизий ПД-117 и директора компаний — живые взрослые", () => {
    const engineers = rows(db, `SELECT id, birth_date, death_date FROM persons WHERE id IN (${F.PD117_ENGINEERS.join(",")})`);
    expect(engineers.length).toBe(F.PD117_ENGINEERS.length);
    for (const [id, birth, death] of engineers) {
      expect(String(birth) >= F.PD117_ENGINEER_BORN.bornFrom && String(birth) <= F.PD117_ENGINEER_BORN.bornTo, `${id} ${birth}`).toBe(true);
      expect(death, String(id)).toBeNull();
      expect(one(db, "SELECT COUNT(*) FROM zags_deaths WHERE person_id = ?", [Number(id)]), String(id)).toBe(0);
    }
    expect(one(db, `SELECT COUNT(*) FROM persons WHERE id IN (${ADULT_PERSON_IDS.join(",")}) AND (birth_date > '1996-12-01' OR death_date IS NOT NULL)`)).toBe(0);
  });
});

describe("ревью: СКУД, журналы, номера", () => {
  it("Лыков после сеансов 1–6 выходит около 03:10 (03:05–03:15), после сеанса 7 — не выходит", () => {
    const exits = rows(db, "SELECT ts FROM door_access WHERE badge_id = 'B-4210' AND door = 'КПП-Б0' AND direction = 'выход' AND time(ts) < '06:00:00' ORDER BY ts").map((r) => String(r[0]));
    const sessionExits = exits.filter((t) => F.GHOST_SESSIONS.some((s) => s.n < 7 && t.startsWith(s.start.slice(0, 10))));
    expect(sessionExits.length).toBe(6);
    for (const t of sessionExits) expect(t.slice(11, 16) >= "03:05" && t.slice(11, 16) <= "03:15", t).toBe(true);
  });

  it("визиты в серверную у одного пропуска не пересекаются (нет «вход, вход» подряд)", () => {
    expect(one(db, `WITH e AS (SELECT direction, LAG(direction) OVER (PARTITION BY badge_id ORDER BY ts) pd
      FROM door_access WHERE door = 'Серверная' AND badge_id LIKE 'B-%') SELECT COUNT(*) FROM e WHERE pd = direction`)).toBe(0);
    // Пока пропуск в серверной, на КПП-Б0 он не выходит (обед — вне визитов)
    expect(one(db, `SELECT COUNT(*) FROM door_access s JOIN door_access o ON o.badge_id = s.badge_id AND o.door = 'Серверная' AND o.direction = 'выход'
      AND o.ts = (SELECT MIN(ts) FROM door_access x WHERE x.badge_id = s.badge_id AND x.door = 'Серверная' AND x.direction = 'выход' AND x.ts > s.ts)
      JOIN door_access k ON k.badge_id = s.badge_id AND k.door = 'КПП-Б0' AND k.direction = 'выход' AND k.ts > s.ts AND k.ts < o.ts
      WHERE s.door = 'Серверная' AND s.direction = 'вход' AND s.badge_id LIKE 'B-%'`)).toBe(0);
  });

  it("Д4: ~600 легальных UPDATE Мельника с WS-IT-01 к старту Д4", () => {
    const n = Number(one(db, "SELECT COUNT(*) FROM audit_log WHERE login = 'k.melnik' AND workstation = 'WS-IT-01' AND action = 'UPDATE' AND ts <= ?", [F.CASE_START.c04]));
    expect(n).toBeGreaterThan(510);
    expect(n).toBeLessThan(690);
  });

  it("владения: периоды прежних и нынешних владельцев не пересекаются (сумма 100 на любую дату)", () => {
    for (const d of ["2014-06-01", "2016-06-01", "2019-06-01", "2022-06-01", "2025-06-01"]) {
      expect(one(db, `SELECT COUNT(*) FROM (SELECT o.company_id FROM company_owners o
        WHERE o.since <= ? AND (o.until IS NULL OR o.until > ?) GROUP BY o.company_id HAVING ABS(SUM(o.share) - 100) > 0.001)`, [d, d]), d).toBe(0);
    }
    // Владелец-компания существовал к моменту владения
    expect(one(db, `SELECT COUNT(*) FROM company_owners o JOIN companies c ON c.id = o.owner_id
      WHERE o.owner_type = 'company' AND c.registered_at > o.since`)).toBe(0);
  });

  it("КУСП: в incidents примерно каждое второе сообщение — пропуски естественные, «подряд» — не норма", () => {
    const share = Number(one(db, `WITH r AS (SELECT kusp_no - LAG(kusp_no) OVER (ORDER BY id) g FROM incidents
      WHERE id > 40 AND reported_at LIKE '2026%') SELECT AVG(g = 1) FROM r WHERE g IS NOT NULL`));
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.6);
  });

  it("spreadKusp: номера растут, лежат строго между соседями, обходят резерв", () => {
    const rng = new Rng(7);
    const out = spreadKusp(rng, [10, 11, 12, 13, 14], 100, 120, (v) => v === 110);
    expect(out.length).toBe(5);
    expect(out.every((v, i) => v > 100 && v < 120 && v !== 110 && (i === 0 || v > out[i - 1]))).toBe(true);
    // Без верхней границы — около оценки
    const open = spreadKusp(rng, [500, 502, 504], 0, 1_000_000, () => false);
    expect(open[0]).toBeGreaterThan(496);
    expect(open[2]).toBeLessThan(508);
  });

  it("гомоглифы OCR: 16 до старта Д10, ни одного в день Д10, ещё 4 после Нового года", () => {
    expect(one(db, "SELECT COUNT(*) FROM plate_reads WHERE plate GLOB '*[A-Z]*' AND read_at < ?", [F.CASE_START.c10])).toBe(OCR_LATIN_READS.beforeC10);
    expect(one(db, "SELECT COUNT(*) FROM plate_reads WHERE plate GLOB '*[A-Z]*' AND read_at BETWEEN ? AND '2026-12-31 23:59:59'", [F.CASE_START.c10])).toBe(0);
    expect(one(db, "SELECT COUNT(*) FROM plate_reads WHERE plate GLOB '*[A-Z]*' AND read_at >= '2027-01-01'")).toBe(OCR_LATIN_READS.afterNewYear);
  });

  it("сбой часов в messenger_events: все три строки созданы до старта Д8", () => {
    expect(rows(db, "SELECT ts FROM messenger_events WHERE ts > created_at AND from_msisdn <> ? AND created_at <= ? ORDER BY ts", [F.PHONE.irina, F.CASE_START.c08]).length).toBe(3);
  });
});

describe("ревью: посадка без id и без orderAt", () => {
  it("id выдаёт аллокатор — шум потом не выдаёт тот же id", async () => {
    const mem = await createDatabase();
    mem.run(WORLD_SCHEMA_SQL);
    const ctx = new WorldContext(mem, 1);
    ctx.phase = "plants";
    ctx.insert("diver_reports", { report_date: "2018-07-14", location: "Створ", note: "кузов", checked_by: "x" });
    const planted = Number(ctx.planted("diver_reports")[0].row.id);
    expect(planted).toBeGreaterThan(0);
    expect(ctx.nextId("diver_reports")).not.toBe(planted);
    expect(one(mem, "SELECT id FROM diver_reports")).toBe(planted);
    mem.close();
  });
});

describe("ревью: пересев фона (NG+) не ломает посаженные факты", () => {
  let alt: { db: Database; ctx: WorldContext };

  beforeAll(async () => {
    // Чужое зерно и заодно контракт ctx.exclude для persons (и дублей), addresses и staff
    alt = await worldWithContext("POLYNYA-NG+review", (ctx) => {
      ctx.exclude("persons", (r) => r.last_name === "Яковлев" || r.last_name === "Яковлева");
      ctx.exclude("addresses", (r) => String(r.street).trim() === "Маячная");
      ctx.exclude("staff", (r) => Number(r.person_id) % 2 === 0);
    });
  }, 30_000);

  it("исключения посадок действуют на дубли карточек, адреса и сотрудников шума", () => {
    expect(one(alt.db, "SELECT COUNT(*) FROM persons WHERE last_name IN ('Яковлев', 'Яковлева')")).toBe(0);
    expect(one(alt.db, "SELECT COUNT(*) FROM addresses WHERE trim(street) = 'Маячная'")).toBe(0);
    const cast = Object.values(F.STAFF);
    const evenNoise = rows(alt.db, `SELECT id FROM staff WHERE person_id % 2 = 0 AND id NOT IN (${cast.join(",")})`);
    expect(evenNoise).toEqual([]);
  });

  it("основной мир: инварианты держатся", () => {
    invariants(db);
  });

  it("чужое зерно: те же инварианты", () => {
    invariants(alt.db);
  });

  it("чужое зерно: резервы жителей — не дубли и нужного возраста", () => {
    const st = noiseState(alt.ctx);
    for (const id of [...ADULT_PERSON_IDS, ...F.PD117_ENGINEERS]) {
      const p = st.byId.get(id);
      expect(p, String(id)).toBeDefined();
      expect(p?.dup, String(id)).toBe(false);
      expect(p?.death, String(id)).toBeNull();
    }
    for (const id of F.PD117_ENGINEERS) {
      const birth = st.byId.get(id)?.birth as number;
      expect(birth >= parseTs(F.PD117_ENGINEER_BORN.bornFrom) && birth <= parseTs(F.PD117_ENGINEER_BORN.bornTo), String(id)).toBe(true);
    }
  });
});
