/**
 * ПБД: workstations, staff, logins, incidents, incident_persons, cases,
 * doc_registry, statements, evidence_registry, attachments, migration_jobs.
 *
 * - incidents: id 41–2000 по времени (около 7,2 в сутки), КУСП — сквозной
 *   годовой номер ГУ (~14 в сутки, в incidents попадает примерно каждое
 *   второе), посаженные строки — якоря id и КУСП. Координат у шума нет.
 * - doc_registry: I квартал 2015 года, ~65 в сутки, номера подряд, кроме
 *   дыр посадок; 12 черновиков с reg_no NULL; ровно 61 % на 'Шустова Н. Ф.'.
 * - statements: 2015 год — id «Сокола» 1001–2100 по моменту ввода,
 *   2026 год — по времени, вокруг подделок призрака.
 */
import type { Row, WorldContext } from "../context";
import { WorldGenError, fillOrdered, fitSequence, flushByTime, planOrdered, sampleTimes } from "../context";
import type { Rng } from "../rng";
import { DAY, HOUR, fmtDate, fmtTs, hourOfDay, isWeekend, parseTs } from "../rng";
import { loginFor } from "../pools";
import {
  CASE_STATUSES, CASE_TITLES, DISTRICT_WEIGHTS, DOC_TYPES_2015, INCIDENT_KINDS, INCIDENT_STATUSES_OLD,
  INCIDENT_TEXT, RANKS, STAFF_DEPTS, STREETS, incidentWeight, officeWeight,
} from "../catalog";
import { CASE_START, CASE_SAZONOV } from "../facts";
import { kuspEstimate, sokolEntryTime } from "../plants/core";
import { noiseState, noiseTarget, type NoisePerson, type NoiseStaff } from "./state";

const YEAR = 365.25 * DAY;
const SEASON_START = parseTs(CASE_START.c00);

// ==================================================================== workstations

const WORKSTATION_CATALOG: readonly { id: string; room: string | null; floor: string | null; kind: string; note: string | null }[] = [
  { id: "WS-01", room: "1-12", floor: "1", kind: "рабочая станция", note: "кабинет начальника ОЦР" },
  { id: "WS-02", room: "1-14", floor: "1", kind: "рабочая станция", note: null },
  { id: "WS-04", room: "Б0-05", floor: "Б0", kind: "рабочая станция", note: "сканер архива" },
  { id: "WS-05", room: "Б0-03", floor: "Б0", kind: "рабочая станция", note: null },
  { id: "WS-06", room: "1-16", floor: "1", kind: "рабочая станция", note: null },
  ...Array.from({ length: 16 }, (_, i) => ({
    id: `WS-${String(i + 8).padStart(2, "0")}`, room: `${2 + Math.floor(i / 8)}-${String(10 + (i % 8) * 2).padStart(2, "0")}`,
    floor: String(2 + Math.floor(i / 8)), kind: "рабочая станция", note: null,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `WS-${24 + i}`, room: null, floor: null, kind: "ноутбук", note: "выездной, синхронизация при подключении",
  })),
  { id: "ДЧ-01", room: "1-01", floor: "1", kind: "рабочая станция", note: "дежурная часть" },
  { id: "ДЧ-02", room: "1-01", floor: "1", kind: "рабочая станция", note: "дежурная часть" },
  { id: "ДЧ-03", room: "1-01", floor: "1", kind: "рабочая станция", note: "дежурная часть, резерв" },
  { id: "АРХ-01", room: "Б0-05", floor: "Б0", kind: "рабочая станция", note: "архив ОЦР" },
  { id: "АРХ-02", room: "Б0-05", floor: "Б0", kind: "рабочая станция", note: "архив ОЦР, оцифровка" },
  { id: "MIRROR-01", room: "Б0-03", floor: "Б0", kind: "терминал ЗЕРКАЛА", note: "терминал «Сияние.Город», только чтение" },
];

/** Офлайн-станции: синхронизируются пачками (id audit_log ≠ порядок времени) */
export const OFFLINE_WORKSTATIONS = ["WS-24", "WS-25", "WS-26", "WS-27", "WS-28"];

export function generateWorkstations(ctx: WorldContext): void {
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "workstations");
  let made = 0;
  for (const w of WORKSTATION_CATALOG) {
    if (made >= target) break;
    if (ctx.isReserved("workstation", w.id)) continue;
    const row = { ...w };
    if (ctx.isExcluded("workstations", row)) continue;
    ctx.write("workstations", row);
    ctx.reserve("workstation", w.id);
    made++;
  }
  for (const p of ctx.planted("workstations")) st.workstations.push(String(p.row.id));
  st.workstations.push(...WORKSTATION_CATALOG.map((w) => w.id).filter((id) => ctx.isReserved("workstation", id)));
}

// ==================================================================== staff

function rankFor(rng: Rng, hired: number): string {
  const years = (SEASON_START - hired) / YEAR;
  if (years < 3) return rng.pick(["сержант", "лейтенант", "младший лейтенант"]);
  if (years < 8) return rng.pick(["старший сержант", "лейтенант", "старший лейтенант"]);
  if (years < 15) return rng.weighted(RANKS.filter(([r]) => r !== "сержант"));
  return rng.pick(["капитан", "майор", "майор", "подполковник"]);
}

export function generateStaff(ctx: WorldContext): void {
  const rng = ctx.rng("noise.staff");
  const st = noiseState(ctx);
  // Посаженные сотрудники (каст, игрок, опечатки c04)
  for (const p of ctx.planted("staff")) {
    const r = p.row;
    st.staff.push({
      id: Number(r.id), personId: Number(r.person_id), short: String(r.full_name), login: r.login ? String(r.login) : null,
      rank: r.rank ? String(r.rank) : null, position: String(r.position), dept: String(r.dept),
      workstation: r.workstation ? String(r.workstation) : null, badge: String(r.badge_id),
      hired: parseTs(String(r.hired_at)), fired: r.fired_at ? parseTs(String(r.fired_at)) : null, cast: true,
    });
  }
  const used = new Set(ctx.planted("staff").map((p) => Number(p.row.person_id)));
  const pool = rng.shuffle(st.adults.filter((p) => !used.has(p.id)));
  // Станции каста (WS-01 Ратникова, WS-03 Ирины, WS-05 Даши, WS-07 в серверной) шуму не раздаются
  const officeWs = st.workstations.filter((w) => /^WS-(0[2-9]|1\d|2[0-3])$/.test(w) && !["WS-03", "WS-05", "WS-07"].includes(w));
  const itWs = st.workstations.filter((w) => w.startsWith("WS-IT-"));
  const dutyWs = st.workstations.filter((w) => w.startsWith("ДЧ-"));
  const t0 = parseTs("1984-01-01");
  const t1 = parseTs("2026-11-20");
  for (let id = 1; id <= 150; id++) {
    if (ctx.isIdUsed("staff", id)) continue;
    const officer = ctx.reservedRef<{ hiredBefore: string; active: boolean }>("staff:officer", String(id));
    let hired = t0 + ((id - 1) / 149) * (t1 - t0) + rng.float(-200, 200) * DAY;
    if (officer) hired = Math.min(hired, parseTs(officer.hiredBefore) - rng.float(30, 2000) * DAY);
    hired = Math.min(Math.floor(hired / DAY) * DAY, t1);
    const idx = pool.findIndex((p) => hired - p.birth >= 20 * YEAR && hired - p.birth <= 42 * YEAR && t1 - p.birth < 64 * YEAR);
    if (idx < 0) throw new WorldGenError(`staff: нет подходящего жителя для id ${id}`);
    const person = pool.splice(idx, 1)[0];
    const dept = officer
      ? rng.pick(STAFF_DEPTS.filter((d) => d.uniformed && d.dept !== "следственный отдел"))
      : rng.weighted(STAFF_DEPTS.map((d) => [d, d.weight] as const));
    const fired = !officer?.active && rng.chance(officer ? 0.4 : 0.12)
      ? Math.floor(rng.float(hired + YEAR, SEASON_START - 10 * DAY) / DAY) * DAY
      : null;
    const login = ctx.unique("login", (() => {
      let n = 0;
      return () => (n++ === 0 ? loginFor(person.first, person.last) : `${loginFor(person.first, person.last)}${n}`);
    })());
    const ws = dept.dept === "ИТ-отдел" ? rng.pick(itWs) : dept.dept === "дежурная часть" ? rng.pick(dutyWs)
      : dept.dept === "ППС" || dept.dept === "ГИБДД" ? null : rng.pick(officeWs);
    const badge = `B-${person.id}`;
    ctx.reserve("badge", badge);
    const row = {
      id, person_id: person.id, full_name: person.short, login, rank: dept.uniformed ? rankFor(rng, hired) : null,
      position: rng.pick(dept.positions), dept: dept.dept, workstation: ws, badge_id: badge,
      hired_at: fmtDate(hired), fired_at: fired && fired > hired ? fmtDate(fired) : null, contract_no: null,
    };
    ctx.write("staff", row);
    st.staff.push({
      id, personId: person.id, short: person.short, login, rank: row.rank, position: row.position, dept: dept.dept,
      workstation: ws, badge, hired, fired: row.fired_at ? fired : null, cast: false,
    });
    person.employer = -1;
  }
  st.staff.sort((a, b) => a.id - b.id);
}

/** Сотрудник в строю на момент t (по желанию — из отделов) */
export function activeStaff(ctx: WorldContext, t: number, depts?: readonly string[], includeCast = false): NoiseStaff[] {
  return noiseState(ctx).staff.filter(
    (s) => (includeCast || !s.cast) && s.hired <= t && (s.fired === null || s.fired > t) && (!depts || depts.includes(s.dept))
  );
}

export function staffTitle(s: NoiseStaff): string {
  return s.rank ? `${s.rank} ${s.short}` : s.short;
}

// ==================================================================== logins

const SERVICE_LOGINS = [
  "svc.backup", "svc.report", "svc.mirror", "svc.archive", "svc.monitor", "adm.it2", "adm.it3", "svc.print",
  "svc.scan", "svc.mail", "svc.kusp", "svc.gibdd", "svc.import", "adm.duty", "svc.audit", "svc.video", "adm.it4", "svc.sync2",
];

export function generateLogins(ctx: WorldContext): void {
  const rng = ctx.rng("noise.logins");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "logins") - 1; // nol вставляет патч p0.player
  const ITs = st.staff.filter((s) => s.dept === "ИТ-отдел" && !s.cast);
  const rows: Row[] = [];
  const lastBefore = parseTs(CASE_START.c04) - 30 * 60_000;
  for (const s of st.staff) {
    if (s.cast || !s.login) continue;
    const created = Math.max(s.hired, parseTs("2017-03-14")) + rng.int(1, 9) * HOUR;
    const enabled = s.fired === null ? 1 : 0;
    const last = enabled
      ? lastBefore - rng.float(0.05, rng.chance(0.85) ? 3 : 25) * DAY
      : (s.fired as number) - rng.float(0.1, 2) * DAY;
    rows.push({
      login: s.login, staff_id: s.id, role: s.dept === "ИТ-отдел" ? "admin" : s.dept === "дежурная часть" ? "duty" : "user",
      created_at: fmtTs(Math.floor(created / 1000) * 1000), created_by: created < parseTs("2017-03-16") ? "system" : "k.melnik",
      enabled, last_login_at: fmtTs(Math.floor(Math.max(last, created + HOUR) / 1000) * 1000),
    });
  }
  // Служебные учётки привязаны к сотрудникам ИТ (сироты — только test1 и zero)
  for (const name of SERVICE_LOGINS) {
    if (rows.length >= target) break;
    if (ctx.isReserved("login", name)) continue;
    ctx.reserve("login", name);
    const owner = rng.pick(ITs);
    const created = Math.max(owner.hired, parseTs("2017-03-14")) + rng.float(1, 400) * DAY;
    rows.push({
      login: name, staff_id: owner.id, role: "service", created_at: fmtTs(Math.floor(Math.min(created, lastBefore - 60 * DAY) / 1000) * 1000),
      created_by: "k.melnik", enabled: 1, last_login_at: fmtTs(Math.floor((lastBefore - rng.float(0.1, 2) * DAY) / 1000) * 1000),
    });
  }
  for (const r of rows.slice(0, Math.max(0, target))) if (!ctx.isExcluded("logins", r)) ctx.write("logins", r);
}

// ==================================================================== incidents

const INCIDENTS_FROM = parseTs("2026-04-15 00:00:00");
const INCIDENTS_TO = parseTs("2027-01-11 11:00:00");

export function generateIncidents(ctx: WorldContext): void {
  const rng = ctx.rng("noise.incidents");
  const st = noiseState(ctx);
  const plantedById = new Map<number, Row>();
  for (const p of ctx.planted("incidents")) if (p.row.id !== undefined) plantedById.set(Number(p.row.id), p.row);
  const anchors = ctx.anchors("incidents");
  const anchorIds = new Set(anchors.map((a) => a.id));
  const segments = planOrdered(anchors, 41, 2000, INCIDENTS_FROM, INCIDENTS_TO, (id) => ctx.isIdUsed("incidents", id) && !anchorIds.has(id));
  const floating = ctx.takeDeferred("incidents").map((p) => ({ row: p.row, key: p.key as number })).sort((a, b) => a.key - b.key);
  const weight = (t: number) => (ctx.isExcluded("incidents", { reported_at: fmtTs(t) }) ? 0 : incidentWeight(t));

  // 1) Моменты всех строк 41–2000 по порядку id: шум, плавающие посадки, якоря
  interface Item { id: number; key: number; planted?: Row; anchor?: boolean; kusp?: number }
  const items: Item[] = [];
  let fi = 0;
  for (const seg of segments) {
    const mine: { row: Row; key: number }[] = [];
    while (fi < floating.length && floating[fi].key <= seg.keyHi) mine.push(floating[fi++]);
    if (mine.length > seg.ids.length) throw new WorldGenError("incidents: посадок больше, чем свободных id между якорями");
    const keys = sampleTimes(rng, seg.ids.length - mine.length, seg.keyLo, seg.keyHi, weight);
    const merged: { key: number; planted?: Row }[] = [...keys.map((key) => ({ key })), ...mine.map((m) => ({ key: m.key, planted: m.row }))];
    merged.sort((a, b) => a.key - b.key);
    seg.ids.forEach((id, i) => items.push({ id, key: merged[i].key, planted: merged[i].planted }));
  }
  for (const a of anchors) {
    if (a.id < 41 || a.id > 2000) continue;
    const row = plantedById.get(a.id);
    items.push({ id: a.id, key: a.key, planted: row, anchor: true, kusp: row?.kusp_no != null ? Number(row.kusp_no) : undefined });
  }
  items.sort((a, b) => a.id - b.id);

  // 2) КУСП: годовой номер, номера посадок фиксированы, остальные — по ожидаемой плотности
  for (const it of items) if (!it.anchor && it.planted?.kusp_no != null) it.kusp = Number(it.planted.kusp_no);
  const yearOf = (t: number) => new Date(t).getUTCFullYear();
  let runStart = 0;
  while (runStart < items.length) {
    if (items[runStart].kusp !== undefined) {
      runStart++;
      continue;
    }
    const year = yearOf(items[runStart].key);
    let runEnd = runStart;
    while (runEnd + 1 < items.length && items[runEnd + 1].kusp === undefined && yearOf(items[runEnd + 1].key) === year) runEnd++;
    const before = items[runStart - 1];
    const after = items[runEnd + 1];
    const lo = before && yearOf(before.key) === year ? (before.kusp as number) : 0;
    const hi = after && yearOf(after.key) === year && after.kusp !== undefined ? after.kusp : 1_000_000;
    const run = items.slice(runStart, runEnd + 1);
    const values = fitSequence(run.map((it) => kuspEstimate(it.key) + rng.int(-1, 1)), lo, hi, (v) => ctx.isReserved(`kusp:${year}`, String(v)));
    run.forEach((it, k) => (it.kusp = values[k]));
    runStart = runEnd + 1;
  }

  // 3) Строки
  const vehiclesForIncidents = st.vehicles.filter((v) => v.active && v.ownerPersonId !== null);
  for (const it of items) {
    if (it.anchor) {
      if (it.planted) st.incidents.push({ id: it.id, kusp: it.kusp as number, at: it.key, applicant: null });
      continue; // якорь уже записан посадкой (или это дыра)
    }
    if (it.planted) {
      ctx.write("incidents", { ...it.planted, id: it.id, kusp_no: it.kusp });
      st.incidents.push({ id: it.id, kusp: it.kusp as number, at: it.key, applicant: null });
      continue;
    }
    let applicant: NoisePerson | null = null;
    const row = ctx.tryRow("incidents", () => {
      const kind = rng.weighted(INCIDENT_KINDS);
      const district = rng.weighted(DISTRICT_WEIGHTS);
      const s = rng.pick(STREETS[district]);
      const officers = activeStaff(ctx, it.key, ["ППС", "дежурная часть", "УУП", "ОУР", "ГИБДД"]);
      applicant = kind === "рапорт" ? null : rng.pick(st.adults);
      const officer = officers.length > 0 ? rng.pick(officers) : null;
      const old = it.key < parseTs("2026-10-15");
      return {
        id: it.id, kusp_no: it.kusp, reported_at: fmtTs(it.key), kind, district, address_text: `${s.street}, ${rng.int(1, s.houses)}`,
        description: rng.pick(INCIDENT_TEXT[kind]),
        vehicle_id: (kind === "ДТП" || kind === "угон") && rng.chance(0.55) && vehiclesForIncidents.length > 0 ? rng.pick(vehiclesForIncidents).id : null,
        applicant_text: kind === "рапорт" ? (officer ? staffTitle(officer) : "дежурный") : (applicant as NoisePerson).short,
        officer_staff_id: officer?.id ?? null,
        status: old ? rng.weighted(INCIDENT_STATUSES_OLD) : rng.weighted([["зарегистрировано", 55], ["проверка", 35], ["передано в ОУР", 10]] as const),
        x_m: null, y_m: null,
      };
    });
    ctx.write("incidents", row);
    const a = applicant as NoisePerson | null;
    st.incidents.push({ id: it.id, kusp: it.kusp as number, at: it.key, applicant: a ? a.id : null });
  }
  // Висяки 2015 года (id 1–40) — для incident_persons
  for (const [id, row] of plantedById) {
    if (id <= 40) st.incidents.push({ id, kusp: Number(row.kusp_no), at: parseTs(String(row.reported_at)), applicant: null });
  }
  st.incidents.sort((a, b) => a.id - b.id);
}

// ==================================================================== incident_persons

export function generateIncidentPersons(ctx: WorldContext): void {
  const rng = ctx.rng("noise.incident_persons");
  const st = noiseState(ctx);
  const cutoff = parseTs(CASE_START.c03);
  const eligible = st.incidents.filter((i) => i.at <= cutoff - HOUR);
  const byId = new Map(eligible.map((i) => [i.id, i]));
  const maxIncident = eligible[eligible.length - 1].id;
  const anchors = ctx.anchors("incident_persons");
  const last = anchors.length > 0 ? anchors.reduce((a, b) => (a.id > b.id ? a : b)) : null;
  const density = last ? (last.id - 1) / Math.max(1, last.key) : noiseTarget(ctx, "incident_persons") / eligible.length;
  const idTo = last
    ? last.id + Math.round(eligible.filter((i) => i.id > last.key).length * density)
    : noiseTarget(ctx, "incident_persons");
  const firstRole = new Set<number>();
  const roles = [["потерпевший", 40], ["свидетель", 35], ["подозреваемый", 20], ["задержанный", 5]] as const;
  fillOrdered(ctx, {
    table: "incident_persons", idFrom: 1, idTo, keyFrom: 1, keyTo: maxIncident, rng,
    keyOf: (r) => Number(r.incident_id),
    sampleKeys: (r, n, lo, hi) => {
      const pool = eligible.filter((i) => i.id >= lo && i.id <= hi).map((i) => i.id);
      if (pool.length === 0) throw new WorldGenError("incident_persons: нет происшествий в сегменте");
      return Array.from({ length: n }, () => r.pick(pool)).sort((a, b) => a - b);
    },
    build: (key, id, r) => {
      const inc = byId.get(Math.round(key)) ?? byId.get(Math.floor(key));
      if (!inc) return null;
      const first = !firstRole.has(inc.id);
      firstRole.add(inc.id);
      const unknown = r.chance(0.04);
      const person = first && inc.applicant ? inc.applicant : unknown ? null : r.pick(st.adults).id;
      return {
        id, incident_id: inc.id, kusp_no: inc.kusp, person_id: person,
        role: first && inc.applicant ? "заявитель" : r.weighted(roles),
        note: person === null ? "неустановленное лицо" : r.chance(0.2) ? r.pick(["со слов заявителя", "опрошен на месте", "вызван повесткой", "отказался от объяснений"]) : null,
      };
    },
  });
}

// ==================================================================== cases

export function generateCases(ctx: WorldContext): void {
  const rng = ctx.rng("noise.cases");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "cases");
  const open = parseTs(CASE_START.c05);
  const per: [number, number][] = [[2015, 118]];
  for (let y = 2016; y <= 2025; y++) per.push([y, 40]);
  per.push([2026, 0]);
  const fixed = per.reduce((a, [, n]) => a + n, 0);
  per[per.length - 1][1] = Math.max(0, target - fixed);
  const rows: { row: Row; at: number }[] = [];
  for (const p of ctx.planted("cases")) {
    const at = parseTs(String(p.row.opened_at));
    st.casesAll.push({ id: String(p.row.id), opened: at });
    if (String(p.row.id).startsWith("15-")) st.cases2015.push({ id: String(p.row.id), opened: at });
  }
  const investigators = (t: number) =>
    activeStaff(ctx, t, ["следственный отдел", "ОУР"], false).filter((s) => s.rank);
  for (const [year, n] of per) {
    for (let k = 0; k < n; k++) {
      const lo = Date.UTC(year, 0, 1);
      const hi = year === 2026 ? open - 2 * DAY : Date.UTC(year, 11, 31, 23);
      // 2015: в основном январь–март (журнал «Сокола» I квартала)
      const at0 = year === 2015 && rng.chance(0.55) ? rng.float(lo, Date.UTC(2015, 2, 31)) : rng.float(lo, hi);
      const at = Math.floor(at0 / 1000) * 1000;
      const d = new Date(at);
      const id = `${String(year).slice(2)}-${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
      if (ctx.isReserved("case_id", id)) {
        k--;
        continue;
      }
      ctx.reserve("case_id", id);
      const applicant = rng.pick(st.adults);
      const inv = investigators(at);
      const investigator = year <= 2017 && rng.chance(0.12)
        ? "майор Ратников Л. Б."
        : inv.length > 0 ? staffTitle(rng.pick(inv)) : "майор Ратников Л. Б.";
      const title = rng.pick(CASE_TITLES)
        .replace("{n}", applicant.short)
        .replace("{s}", rng.pick(st.companies).name.replace(/^\S+\s/, "").replace(/[«»"]/g, ""))
        .replace("{st}", rng.pick(STREETS[rng.weighted(DISTRICT_WEIGHTS)]).street);
      const status = rng.weighted(CASE_STATUSES);
      const statusAt = Math.min(at + rng.float(20, 400) * DAY, open - DAY);
      rows.push({
        at,
        row: ctx.tryRow("cases", () => ({
          id, title, opened_at: fmtTs(at), applicant_text: applicant.short, investigator,
          status: year === 2026 && status === "направлено в суд" && rng.chance(0.5) ? "в производстве" : status,
          status_at: fmtDate(statusAt),
        })),
      });
      st.casesAll.push({ id, opened: at });
      if (year === 2015) st.cases2015.push({ id, opened: at });
    }
  }
  rows.sort((a, b) => a.at - b.at);
  for (const r of rows) ctx.write("cases", r.row);
  st.cases2015.sort((a, b) => a.opened - b.opened);
  st.casesAll.sort((a, b) => a.opened - b.opened);
}

// ==================================================================== doc_registry

const NINA = "Шустова Н. Ф.";
const OTHER_CLERKS = ["Сомова В. И.", "Голубева Е. П.", "Мухина Л. Р.", "Карпенко А. Н."];
const Q1_FROM = parseTs("2015-01-01 00:00:00");
const Q1_TO = parseTs("2015-03-31 23:59:59");
const RETRO_UNTIL = parseTs("2015-03-01 00:00:00");
/** Доля документов квартала на Шустову Н. Ф. (Д5: ровно 61 %) */
export const NINA_SHARE = 0.61;
const DRAFTS = 12;

/** Объяснения по делам 2015 года в журнале: case_id → номера (для statements.doc_reg_no) */
const explanationDocs = new WeakMap<WorldContext, Map<string, number[]>>();

export function generateDocRegistry(ctx: WorldContext): void {
  const rng = ctx.rng("noise.doc_registry");
  const st = noiseState(ctx);
  const total = 5850;
  const planted = ctx.takeDeferred("doc_registry");
  const anchors = planted.filter((p) => p.row.reg_no != null).map((p) => ({ id: Number(p.row.reg_no), key: p.key as number }));
  const holes = ctx.reservedValues("doc_reg_hole").map((v) => ({ id: Number(v), key: ctx.reservedRef<number>("doc_reg_hole", v) as number }));
  const registeredRows = total - DRAFTS - planted.filter((p) => p.row.reg_no == null).length;
  const regMax = registeredRows + holes.length;
  const segments = planOrdered([...anchors, ...holes], 1, regMax, Q1_FROM, Q1_TO);
  const docWeight = (t: number) => {
    const h = hourOfDay(t);
    const base = h < 7 ? 0.06 : h < 9 ? 0.5 : h < 19 ? 1 : h < 22 ? 0.3 : 0.08;
    return isWeekend(t) ? base * 0.35 : base;
  };
  const cases = st.cases2015.filter((c) => c.opened <= Q1_TO);
  const all: { row: Row; at: number; planted: boolean; ninaScore: number }[] = planted.map((p) => ({
    row: p.row, at: p.key as number, planted: true, ninaScore: 0,
  }));
  for (const seg of segments) {
    const times = sampleTimes(rng, seg.ids.length, seg.keyLo, seg.keyHi, docWeight);
    seg.ids.forEach((reg, i) => {
      const at = times[i];
      const row = ctx.tryRow("doc_registry", () => {
        const type = rng.weighted(DOC_TYPES_2015);
        const open = cases.filter((c) => c.opened <= at && c.id !== CASE_SAZONOV);
        const caseId = open.length > 0 && rng.chance(type === "объяснение" ? 0.85 : 0.35) ? rng.pick(open.slice(-25)).id : null;
        return {
          year: 2015, reg_no: reg, registered_at: fmtTs(at), doc_type: type, case_id: caseId, registered_by: null,
          note: rng.chance(0.25) ? rng.pick(["вх. из прокуратуры", "исх. в ГИБДД", "копия в дело", "по запросу суда", "передано следователю"]) : null,
        };
      });
      all.push({ row, at, planted: false, ninaScore: (at < RETRO_UNTIL ? 0.82 : 0.28) + rng.next() * 0.35 });
    });
  }
  for (let k = 0; k < DRAFTS; k++) {
    const at = Math.floor(rng.float(Q1_FROM + DAY, Q1_TO - DAY) / 1000) * 1000;
    all.push({
      row: { year: 2015, reg_no: null, registered_at: fmtTs(at), doc_type: rng.weighted(DOC_TYPES_2015), case_id: null, registered_by: null, note: "черновик" },
      at, planted: false, ninaScore: rng.next(),
    });
  }
  // Ровно 61 % документов квартала — на Шустову (посадки уже указали своё)
  const ninaPlanted = all.filter((d) => d.planted && d.row.registered_by === NINA).length;
  const needNina = Math.round(total * NINA_SHARE) - ninaPlanted;
  const free = all.filter((d) => !d.planted).sort((a, b) => b.ninaScore - a.ninaScore);
  free.forEach((d, i) => (d.row.registered_by = i < needNina ? NINA : rng.pick(OTHER_CLERKS)));

  all.sort((a, b) => a.at - b.at || Number(a.row.reg_no ?? 0) - Number(b.row.reg_no ?? 0));
  const expl = new Map<string, number[]>();
  for (const d of all) {
    ctx.write("doc_registry", { ...d.row, id: ctx.nextId("doc_registry") });
    if (d.row.doc_type === "объяснение" && d.row.case_id && d.row.reg_no != null && !d.planted) {
      const list = expl.get(String(d.row.case_id));
      if (list) list.push(Number(d.row.reg_no));
      else expl.set(String(d.row.case_id), [Number(d.row.reg_no)]);
    }
  }
  explanationDocs.set(ctx, expl);
}

// ==================================================================== statements

const STATEMENT_TEXTS = [
  "Ничего подозрительного не видел, был дома", "Подтверждаю, что видел двоих мужчин у гаражей около 22:00",
  "Кошелёк пропал в автобусе № 2, кто взял — не знаю", "Претензий к соседу не имею", "Машину оставил у подъезда, утром её не было",
  "Деньги переводил сам, по просьбе «сотрудника банка»", "Драку не видел, слышал крики", "Ключи от склада были только у меня и у мастера",
  "Ушёл с работы в 18:00, дальше был у родственников", "Опознаю похищенное имущество по царапине на корпусе",
];

export function generateStatements(ctx: WorldContext): void {
  const rng = ctx.rng("noise.statements");
  const st = noiseState(ctx);
  const expl = explanationDocs.get(ctx) ?? new Map<string, number[]>();
  const typists = [NINA, NINA, NINA, "Сомова В. И.", "Голубева Е. П."];
  const officers2015 = activeStaff(ctx, parseTs("2015-06-01"), ["ОУР", "следственный отдел", "УУП"], false).filter((s) => s.rank);

  // --- 2015: id «Сокола» 1001–2100 по моменту ввода
  const freeIds: number[] = [];
  for (let id = 1001; id <= 2100; id++) if (!ctx.isIdUsed("statements", id)) freeIds.push(id);
  const items2015 = freeIds.map(() => {
    const c = rng.pick(st.cases2015.filter((x) => x.id !== CASE_SAZONOV));
    const taken = Math.floor(Math.min(rng.float(c.opened, c.opened + 60 * DAY), parseTs("2015-12-30 18:00:00")) / 1000) * 1000;
    return { c, taken, entry: sokolEntryTime(rng, taken) };
  });
  items2015.sort((a, b) => a.entry - b.entry);
  items2015.forEach((it, i) => {
    const docs = expl.get(it.c.id);
    const inQ1 = it.taken <= Q1_TO;
    const row = ctx.tryRow("statements", () => ({
      id: freeIds[i], case_id: it.c.id, doc_reg_no: inQ1 && docs && docs.length > 0 && rng.chance(0.8) ? rng.pick(docs) : null,
      person_id: null, person_text: rng.pick(st.adults).short, taken_at: fmtTs(Math.max(it.taken, it.c.opened)),
      taken_by: officers2015.length > 0 ? staffTitle(rng.pick(officers2015)) : "майор Ратников Л. Б.",
      typed_by: rng.pick(typists), text: rng.pick(STATEMENT_TEXTS), status: "принято",
    }));
    ctx.write("statements", row);
  });

  // --- 2026: по времени, вокруг подделок призрака (5203, 5204, 5207)
  const from = parseTs("2026-04-15 00:00:00");
  const to = parseTs("2027-01-11 11:00:00");
  const total = 1300;
  const n2026 = Math.max(0, total - ctx.count("statements") - ctx.deferredCount("statements"));
  const anchors = ctx.anchors("statements").filter((a) => a.id > 5000).sort((a, b) => a.id - b.id);
  let idFrom = 5001;
  if (anchors.length > 0) {
    const before = Math.round(n2026 * Math.min(1, Math.max(0, (anchors[0].key - from) / (to - from))));
    idFrom = anchors[0].id - before;
  }
  const idTo = idFrom + n2026 + anchors.length + ctx.deferredCount("statements") - 1;
  const cases2026 = st.casesAll.filter((c) => c.opened >= parseTs("2025-06-01"));
  fillOrdered(ctx, {
    table: "statements", idFrom, idTo, keyFrom: from, keyTo: to, rng,
    keyOf: (r) => parseTs(String(r.taken_at)),
    sampleKeys: (r, n, lo, hi) => sampleTimes(r, n, lo, hi, officeWeight),
    build: (key, id, r) => {
      const person = r.pick(st.adults);
      const open = cases2026.filter((c) => c.opened <= key);
      const officer = activeStaff(ctx, key, ["ОУР", "следственный отдел", "УУП"]).filter((s) => s.rank);
      const taker = officer.length > 0 ? r.pick(officer) : null;
      return {
        id, case_id: open.length > 0 && r.chance(0.8) ? r.pick(open.slice(-40)).id : null, doc_reg_no: null,
        person_id: person.id, person_text: person.short, taken_at: fmtTs(key),
        taken_by: taker ? staffTitle(taker) : "дежурный", typed_by: taker ? taker.short : null,
        text: r.pick(STATEMENT_TEXTS), status: key > SEASON_START - 20 * DAY && r.chance(0.3) ? "на проверке" : "принято",
      };
    },
  });
}

// ==================================================================== evidence_registry

const EVIDENCE_TITLES = [
  "Нож кухонный, рукоять чёрная", "Запись камеры у подъезда", "Банковская выписка", "Протокол осмотра квартиры",
  "Детализация звонков", "Фото следов у гаража", "Ключи от склада", "Телефон потерпевшего", "Выписка из реестра ТС",
  "Объяснение свидетеля", "Чек из магазина", "Распечатка переписки",
];
const EVIDENCE_SOURCES = [
  ["incidents", "ПБД"], ["statements", "ПБД"], ["persons", "ПБД"], ["plate_reads", "Дорсеть"], ["vehicles", "ЗЕРКАЛО: город"],
  ["transactions", "ЗЕРКАЛО: Сияние"], ["messenger_events", "оператор"], ["intercom_events", "ЗЕРКАЛО: Сияние"],
] as const;

export function generateEvidenceRegistry(ctx: WorldContext): void {
  const rng = ctx.rng("noise.evidence_registry");
  const target = noiseTarget(ctx, "evidence_registry");
  const from = parseTs("2016-01-15");
  const to = SEASON_START - 3 * DAY;
  const times = sampleTimes(rng, target, from, to, officeWeight);
  const noise = times.map((t) => {
    const investigators = activeStaff(ctx, t, ["ОУР", "следственный отдел"]).filter((s) => s.login);
    const [table, cls] = rng.pick(EVIDENCE_SOURCES);
    return {
      key: t,
      row: ctx.tryRow("evidence_registry", () => ({
        pinned_at: fmtTs(t), pinned_by: investigators.length > 0 ? rng.pick(investigators).login : "k.melnik", node: null,
        card_title: rng.pick(EVIDENCE_TITLES), source_table: table, source_class: cls,
        key_json: JSON.stringify({ id: rng.int(1, 4000) }),
        value_hash: Array.from({ length: 16 }, () => "0123456789abcdef"[rng.int(0, 15)]).join(""),
        status: rng.weighted([["активна", 90], ["удалена", 8], ["призрак", 2]] as const),
      })),
    };
  });
  flushByTime(ctx, "evidence_registry", noise, "pinned_at");
}

// ==================================================================== attachments

export function generateAttachments(ctx: WorldContext): void {
  const rng = ctx.rng("noise.attachments");
  const st = noiseState(ctx);
  const from = parseTs("2026-06-01 09:00:00");
  const to = parseTs(CASE_START.c10) - DAY;
  const authors = st.staff.filter((s) => s.login && !s.cast && s.fired === null && ["ОУР", "следственный отдел", "дежурная часть", "ИТ-отдел"].includes(s.dept));
  const tables = [
    ["incidents", () => ({ id: rng.int(41, 1700) })], ["persons", () => ({ id: rng.int(1, 4300) })],
    ["statements", () => ({ id: rng.int(5040, 5200) })], ["vehicles", () => ({ plate: "см. ориентировку" })],
    ["doc_registry", () => ({ year: 2015, reg_no: rng.int(1, 5800) })], ["cases", () => ({ id: `2${rng.int(3, 6)}-0${rng.int(1, 9)}1${rng.int(0, 9)}` })],
  ] as const;
  const idFrom = 180;
  const idTo = idFrom + noiseTarget(ctx, "attachments") + ctx.plantedCount("attachments") - 1;
  fillOrdered(ctx, {
    table: "attachments", idFrom, idTo, keyFrom: from, keyTo: to, rng,
    keyOf: (r) => parseTs(String(r.created_at)),
    sampleKeys: (r, n, lo, hi) => sampleTimes(r, n, lo, hi, officeWeight),
    build: (key, id, r) => {
      const [table, makeKey] = r.pick(tables);
      return {
        id, author_login: r.pick(authors).login, table_name: table, row_key_json: JSON.stringify(makeKey()),
        created_at: fmtTs(key), note_no: null,
      };
    },
  });
}

// ==================================================================== migration_jobs

export function generateMigrationJobs(ctx: WorldContext): void {
  const rng = ctx.rng("noise.migration_jobs");
  const jobs = [
    ["VERIFY", "схема ПБД ↔ «Сокол»"], ["LOAD", "реестр ТС (ГИБДД) → ЗЕРКАЛО"], ["LOAD", "ЗАГС → ЗЕРКАЛО"],
    ["VERIFY", "контрольные суммы staging"], ["LOAD", "СКУД «Сияние.Ключ» → ЗЕРКАЛО"], ["REINDEX", "persons"],
    ["VERIFY", "doc_registry: сплошная нумерация"], ["CLEANUP", "sokol_stage_statements"], ["CLEANUP", "sokol_stage_persons"],
    ["LOAD", "архив «Глубина-Строя» → ЗЕРКАЛО"], ["VERIFY", "сироты logins / staff"], ["BACKUP", "ПБД, полная копия"],
  ] as const;
  let k = 0;
  fillOrdered(ctx, {
    table: "migration_jobs", idFrom: 1, idTo: 20, keyFrom: parseTs("2026-10-05 00:00:00"), keyTo: parseTs(CASE_START.c09) - DAY, rng,
    keyOf: (r) => parseTs(String(r.run_at)),
    // Между якорями 10 (14.12) и 17 (11.01) шум не заходит за старт Д9: таблица без горизонта
    sampleKeys: (r, n, lo, hi) => sampleTimes(r, n, lo, Math.min(hi, parseTs(CASE_START.c09) - DAY), (t) => (hourOfDay(t) >= 1 && hourOfDay(t) < 4 ? 1 : 0.02)),
    build: (key, id) => {
      const [action, target] = jobs[k++ % jobs.length];
      return { id, run_at: fmtTs(Math.floor(key / 60_000) * 60_000), action, target, responsible_login: "k.melnik", status: "выполнено" };
    },
  });
}

