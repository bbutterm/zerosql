/**
 * Журналы ПБД: audit_log и query_log.
 *
 * audit_log: id — порядок репликации, а не времени. Офлайн-станции
 * (выездные ноутбуки) отдают правки пачками, поэтому у их строк ts раньше
 * соседей по id. Легальные правки — ИТ (Мельник ~600 UPDATE с WS-IT-01),
 * дежурная часть и Нина. Маскируется только old_value полей ПДн.
 *
 * query_log: запросы сотрудников по времени; дыры в id — стёртые запросы
 * Ирины (посадка core), строка nol 22.12 — тоже посадка.
 */
import type { Row, WorldContext } from "../context";
import { fillOrdered, sampleTimes } from "../context";
import type { Rng } from "../rng";
import { DAY, HOUR, fmtDate, fmtTs, hourOfDay, isWeekend, parseTs } from "../rng";
import { DISTRICTS, INCIDENT_KINDS, officeWeight } from "../catalog";
import { INCIDENT, LOGIN, PERSON, WORKSTATION } from "../facts";
import { QUERY_LOG_FROM, QUERY_LOG_TARGET, QUERY_LOG_TO, IRINA_QUERY_COUNT } from "../plants/core";
import { OFFLINE_WORKSTATIONS } from "./police";
import { noiseState, type NoiseStaff } from "./state";

const AUDIT_FROM = parseTs("2026-09-01 00:00:00");
const AUDIT_TO = parseTs("2027-01-11 11:00:00");
const AUDIT_TOTAL = 3800;
const PII_MASK = "[ПДн скрыто]";
const PII_FIELDS = new Set(["special_marks", "passport", "phone", "home_address"]);

/** Ключевые строки М5 и другие сюжетные цели: легальных правок по ним нет */
const SENSITIVE_ROWS = new Set([
  `persons:${PERSON.burtsev}`, `persons:1288`, `persons:1471`, `persons:2650`, `persons:3015`, `persons:3390`,
  `persons:${PERSON.kravets}`, `persons:${PERSON.irina}`, `incidents:${INCIDENT.theftClaim}`, `incidents:${INCIDENT.hitAndRun}`,
  `incident_persons:1205`, `incident_persons:1209`, "logins:zero", "logins:i.valts", "workstations:WS-07",
]);

/** Ритм записи в ПБД: рабочий день плюс круглосуточная дежурная часть */
function auditWeight(t: number): number {
  const h = hourOfDay(t);
  const duty = h >= 1 && h < 6 ? 0.12 : 0.25;
  return Math.min(1, officeWeight(t) * 0.8 + duty);
}

interface Actor {
  login: string;
  workstation: string;
  kind: "melnik" | "it" | "duty" | "nina" | "lykov" | "staff" | "field";
}

function actors(ctx: WorldContext, t: number): { list: Actor[]; weights: number[] } {
  const st = noiseState(ctx);
  const alive = (s: NoiseStaff) => s.login && s.hired <= t && (s.fired === null || s.fired > t);
  const list: Actor[] = [];
  const weights: number[] = [];
  const h = hourOfDay(t);
  const day = h >= 8 && h < 19 && !isWeekend(t);
  const push = (a: Actor, w: number) => {
    list.push(a);
    weights.push(w);
  };
  // Мельник — ~600 легальных UPDATE с WS-IT-01 (ложный след Д4)
  push({ login: LOGIN.melnik, workstation: "WS-IT-01", kind: "melnik" }, day ? 42 : 4);
  push({ login: LOGIN.nina, workstation: "АРХ-01", kind: "nina" }, day ? 9 : 0.3);
  if (day) push({ login: LOGIN.lykov, workstation: "WS-IT-02", kind: "lykov" }, 3);
  for (const s of st.staff) {
    if (s.cast || !alive(s)) continue;
    if (s.dept === "ИТ-отдел") push({ login: s.login as string, workstation: s.workstation ?? "WS-IT-03", kind: "it" }, day ? 5 : 0.8);
    else if (s.dept === "дежурная часть") push({ login: s.login as string, workstation: s.workstation ?? "ДЧ-01", kind: "duty" }, 3);
    else if (s.dept === "ППС" || s.dept === "ГИБДД" || s.dept === "УУП") {
      push({ login: s.login as string, workstation: OFFLINE_WORKSTATIONS[s.id % OFFLINE_WORKSTATIONS.length], kind: "field" }, day ? 0.45 : 0.1);
    } else push({ login: s.login as string, workstation: s.workstation ?? "WS-10", kind: "staff" }, day ? 0.7 : 0.03);
  }
  return { list, weights };
}

function pickActor(rng: Rng, a: { list: Actor[]; weights: number[] }): Actor {
  const total = a.weights.reduce((x, y) => x + y, 0);
  let r = rng.next() * total;
  for (let i = 0; i < a.list.length; i++) {
    r -= a.weights[i];
    if (r < 0) return a.list[i];
  }
  return a.list[a.list.length - 1];
}

const EDITS: readonly { table: string; field: string; range: [number, number]; values: (rng: Rng) => [string | null, string | null] }[] = [
  { table: "incidents", field: "status", range: [41, 1990], values: (r) => r.pick([["зарегистрировано", "проверка"], ["проверка", "передано в ОУР"], ["проверка", "отказано в ВУД"], ["зарегистрировано", "закрыто"]] as const).slice() as [string, string] },
  { table: "incidents", field: "address_text", range: [41, 1990], values: (r) => [`Мира, ${r.int(1, 30)}`, `Мира, ${r.int(1, 30)}`] },
  { table: "incidents", field: "officer_staff_id", range: [41, 1990], values: (r) => [String(r.int(1, 150)), String(r.int(1, 150))] },
  { table: "persons", field: "last_name", range: [1, 4300], values: (r) => r.pick([["Кузнецва", "Кузнецова"], ["Попов ", "Попов"], ["Смирнова", "Смирнова-Лебедева"], ["Ковалев", "Ковалёв"], ["Соловьев", "Соловьёв"]] as const).slice() as [string, string] },
  { table: "persons", field: "birth_date", range: [1, 4300], values: (r) => { const y = r.int(1950, 2005); return [`${y}-0${r.int(1, 9)}-1${r.int(0, 9)}`, `${y}-1${r.int(0, 2)}-0${r.int(1, 9)}`]; } },
  { table: "persons", field: "special_marks", range: [1, 4300], values: () => [PII_MASK, "шрам на левой щеке"] },
  { table: "persons", field: "phone", range: [1, 4300], values: (r) => [PII_MASK, `+7 900 000-${r.int(10, 99)}-${r.int(10, 99)}`] },
  { table: "persons", field: "home_address", range: [1, 4300], values: (r) => [PII_MASK, `Полярная, ${r.int(1, 40)}-${r.int(1, 80)}`] },
  { table: "staff", field: "position", range: [1, 150], values: (r) => r.pick([["участковый уполномоченный", "старший участковый уполномоченный"], ["оперуполномоченный", "старший оперуполномоченный"]] as const).slice() as [string, string] },
  { table: "staff", field: "workstation", range: [1, 150], values: (r) => [`WS-${r.int(10, 23)}`, `WS-${r.int(10, 23)}`] },
  { table: "logins", field: "role", range: [0, 0], values: () => ["user", "duty"] },
  { table: "cases", field: "status", range: [0, 0], values: (r) => r.pick([["в производстве", "приостановлено"], ["в производстве", "направлено в суд"], ["приостановлено", "в производстве"]] as const).slice() as [string, string] },
  { table: "statements", field: "status", range: [5040, 5240], values: () => ["на проверке", "принято"] },
  { table: "evidence_registry", field: "status", range: [1, 300], values: () => ["активна", "удалена"] },
  { table: "doc_registry", field: "note", range: [1, 5850], values: (r) => [null, r.pick(["копия в дело", "передано следователю", "уточнено по описи"])] },
];

function legalEdit(rng: Rng, actor: Actor, logins: readonly string[], caseIds: readonly string[]): Partial<Row> {
  const action = actor.kind === "melnik" || actor.kind === "lykov"
    ? rng.weighted([["UPDATE", 94], ["SESSION", 4], ["EXPORT", 2]] as const)
    : rng.weighted([["UPDATE", 70], ["INSERT", 19], ["DELETE", 3], ["EXPORT", 4], ["SESSION", 4]] as const);
  if (action === "SESSION") {
    return { action, table_name: "logins", row_id: actor.login, field: "session", old_value: null, new_value: rng.pick(["вход в систему", "смена пароля", "выход по таймауту"]) };
  }
  if (action === "EXPORT") {
    const t = rng.pick(["incidents", "statements", "persons", "cases"]);
    return { action, table_name: t, row_id: null, field: null, old_value: null, new_value: `CSV: ${rng.int(3, 180)} строк, по запросу ${rng.pick(["суда", "прокуратуры", "следователя", "начальника ОЦР"])}` };
  }
  if (action === "INSERT") {
    const t = rng.pick(["incidents", "statements", "incident_persons", "evidence_registry"]);
    return { action, table_name: t, row_id: String(rng.int(1, 2000)), field: null, old_value: null, new_value: rng.pick(["новая запись", "регистрация КУСП", "приобщено к делу", "объяснение принято"]) };
  }
  if (action === "DELETE") {
    const t = rng.pick(["incident_persons", "evidence_registry", "attachments"]);
    return { action, table_name: t, row_id: String(rng.int(1, 1500)), field: null, old_value: "дубль записи", new_value: null };
  }
  const e = rng.pick(EDITS);
  let rowId: string;
  if (e.table === "logins") rowId = rng.pick(logins);
  else if (e.table === "cases") rowId = rng.pick(caseIds);
  else rowId = String(rng.int(e.range[0], e.range[1]));
  const [oldV, newV] = e.values(rng);
  return {
    action, table_name: e.table, row_id: rowId, field: e.field,
    old_value: PII_FIELDS.has(e.field) ? PII_MASK : oldV, new_value: newV,
  };
}

export function generateAuditLog(ctx: WorldContext): void {
  const rng = ctx.rng("noise.audit_log");
  const st = noiseState(ctx);
  const logins = st.staff.filter((s) => s.login && !s.cast).map((s) => s.login as string);
  const caseIds = st.casesAll.filter((c) => c.opened > parseTs("2020-01-01")).map((c) => c.id);
  const cache = new Map<number, { list: Actor[]; weights: number[] }>();
  const actorsAt = (t: number) => {
    const bucket = Math.floor(t / HOUR);
    let a = cache.get(bucket);
    if (!a) {
      a = actors(ctx, t);
      cache.set(bucket, a);
    }
    return a;
  };
  fillOrdered(ctx, {
    table: "audit_log", idFrom: 1, idTo: AUDIT_TOTAL, keyFrom: AUDIT_FROM, keyTo: AUDIT_TO, rng,
    keyOf: (r) => parseTs(String(r.ts)),
    sampleKeys: (r, n, lo, hi) => sampleTimes(r, n, lo, hi, auditWeight),
    build: (key, id, r) => {
      const actor = pickActor(r, actorsAt(key));
      // Офлайн-ноутбук: правка сделана раньше, в базу легла при синхронизации
      const offline = actor.kind === "field" && r.chance(0.8);
      const at = offline ? Math.max(AUDIT_FROM, key - r.float(1, 36) * HOUR) : key;
      let workstation = actor.workstation;
      if (actor.kind === "melnik") {
        // WS-07 в серверной — на территории Мельника: днём он иногда правит и оттуда (ложный след Д4)
        const daytime = hourOfDay(key) > 9 && hourOfDay(key) < 18;
        workstation = r.chance(0.86) ? "WS-IT-01" : daytime && r.chance(0.35) ? WORKSTATION.serverRoom : "WS-IT-03";
      }
      const edit = legalEdit(r, actor, logins, caseIds);
      if (SENSITIVE_ROWS.has(`${edit.table_name}:${edit.row_id}`)) return null;
      return { id, ts: fmtTs(Math.floor(at / 1000) * 1000), login: actor.login, workstation, ...edit };
    },
  });
}


// ==================================================================== query_log

function queryTemplates(rng: Rng, ctx: WorldContext): { text: string; rows: number; status: "ok" | "error" | "denied" } {
  const st = noiseState(ctx);
  const p = rng.pick(st.adults);
  const v = st.vehicles.length > 0 ? rng.pick(st.vehicles) : null;
  const inc = st.incidents.length > 0 ? rng.pick(st.incidents) : null;
  const c = st.casesAll.length > 0 ? rng.pick(st.casesAll) : null;
  const d = fmtDate(parseTs("2026-09-01") + rng.int(0, 120) * DAY);
  const roll = rng.int(0, 15);
  switch (roll) {
    case 0: return { text: `SELECT * FROM persons WHERE last_name = '${p.last}' AND first_name = '${p.first}'`, rows: rng.int(1, 3), status: "ok" };
    case 1: return { text: `SELECT id, kusp_no, reported_at, description FROM incidents WHERE district = '${rng.pick(DISTRICTS)}' AND reported_at >= '${d} 00:00:00'`, rows: rng.int(3, 60), status: "ok" };
    case 2: return { text: `SELECT * FROM incidents WHERE kusp_no = ${inc?.kusp ?? 1200}`, rows: 1, status: "ok" };
    case 3: return { text: `SELECT plate, make, model, owner_name FROM vehicles WHERE plate = '${v?.plate ?? "А001АА"}'`, rows: rng.int(1, 2), status: "ok" };
    case 4: return { text: `SELECT COUNT(*) FROM incidents WHERE kind = '${rng.weighted(INCIDENT_KINDS)}' AND reported_at LIKE '${d.slice(0, 7)}%'`, rows: 1, status: "ok" };
    case 5: return { text: `SELECT * FROM statements WHERE case_id = '${c?.id ?? "26-0301"}'`, rows: rng.int(0, 9), status: "ok" };
    case 6: return { text: `SELECT full_name, birth_date FROM persons WHERE birth_date = '${fmtDate(p.birth)}'`, rows: rng.int(1, 4), status: "ok" };
    case 7: return { text: `SELECT * FROM persons WHERE full_name LIKE '${p.last}%'`, rows: rng.int(1, 12), status: "ok" };
    case 8: return { text: `SELEC * FROM persons WHERE last_name = '${p.last}'`, rows: 0, status: "error" };
    case 9: return { text: `SELECT * FROM person WHERE id = ${p.id}`, rows: 0, status: "error" };
    case 10: return { text: `SELECT * FROM incidents WHERE reported_at >= '${d.split("-").reverse().join(".")}'`, rows: 0, status: "ok" };
    case 11: return { text: `SELECT login, last_login_at FROM logins WHERE enabled = 1`, rows: 0, status: "denied" };
    case 12: return { text: `SELECT * FROM incident_persons WHERE person_id = ${p.id}`, rows: rng.int(0, 3), status: "ok" };
    case 13: return { text: `SELECT reported_at, kind, address_text FROM incidents WHERE address_text LIKE '${rng.pick(["Мира", "Полярная", "Шахтная", "Портовая", "Морская"])}%' ORDER BY reported_at DESC LIMIT 20`, rows: 20, status: "ok" };
    case 14: return { text: `SELECT id, title, status FROM cases WHERE investigator LIKE '%${p.last.slice(0, 5)}%'`, rows: rng.int(0, 6), status: "ok" };
    default: return { text: `SELECT * FROM persons WHERE id = ${p.id}`, rows: 1, status: "ok" };
  }
}

export function generateQueryLog(ctx: WorldContext): void {
  const rng = ctx.rng("noise.query_log");
  const st = noiseState(ctx);
  const users = st.staff.filter((s) => s.login && !s.cast && ["ОУР", "следственный отдел", "дежурная часть", "УУП", "ИТ-отдел", "канцелярия"].includes(s.dept));
  const castUsers = [
    { login: LOGIN.ratnikov, terminal: "WS-01", from: 0 },
    { login: LOGIN.nina, terminal: "АРХ-01", from: 0 },
    { login: LOGIN.melnik, terminal: "WS-IT-01", from: 0 },
    { login: LOGIN.dasha, terminal: "WS-05", from: parseTs("2026-12-01 09:00:00") },
  ];
  const total = QUERY_LOG_TARGET + IRINA_QUERY_COUNT;
  fillOrdered(ctx, {
    table: "query_log", idFrom: 1, idTo: total, keyFrom: QUERY_LOG_FROM, keyTo: QUERY_LOG_TO, rng,
    keyOf: (r) => parseTs(String(r.logged_at)),
    sampleKeys: (r, n, lo, hi) => sampleTimes(r, n, lo, hi, (t) => Math.min(1, officeWeight(t) + 0.06)),
    build: (key, id, r) => {
      const alive = users.filter((s) => s.hired <= key && (s.fired === null || s.fired > key));
      let login: string;
      let terminal: string;
      // Каст в шуме — только в рабочие часы будней: ночи каста сажают дела (Д8)
      const workHours = !isWeekend(key) && hourOfDay(key) >= 9 && hourOfDay(key) < 19;
      const cast = castUsers.filter((c) => c.from <= key && !(c.login === LOGIN.ratnikov && key > parseTs("2026-12-21 16:00:00")));
      if (workHours && r.chance(0.12) && cast.length > 0) {
        const c = r.pick(cast);
        login = c.login;
        terminal = c.terminal;
      } else {
        const s = r.pick(alive);
        login = s.login as string;
        terminal = s.workstation ?? "ДЧ-01";
      }
      const q = queryTemplates(r, ctx);
      return {
        id, logged_at: fmtTs(key), login, terminal, query_text: q.text, rows_returned: q.status === "ok" ? q.rows : 0,
        status: q.status, ts_real: null, case_id: null, objective_id: null, run_id: null,
      };
    },
  });
}
