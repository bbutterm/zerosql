/**
 * Сквозные посадки сезона (разд. 8.4 библии, верхняя таблица) и хроника
 * вмешательств (разд. 8.1, п. 3; разд. 3.0) — в той мере, в какой на неё
 * опираются несколько дел. Каждое событие хроники одновременно меняет
 * данные и оставляет след: строку audit_log, дыру в id, old_value/new_value.
 *
 * Факты одного дела здесь не сажаются — они в plants/cNN.ts (см. README).
 */
import type { Row, WorldContext } from "../context";
import { WorldGenError, fitSequence } from "../context";
import { DAY, MINUTE, dayOfYear, fmtTs, hourOfDay, isWeekend, localToUnix, parseTs, weekday } from "../rng";
import type { Rng } from "../rng";
import { randomName, shortName } from "../pools";
import { DISTRICTS, INCIDENT_TEXT, STREETS, personCreatedAt } from "../catalog";
import * as F from "../facts";

const ts = parseTs;

export function plant(ctx: WorldContext): void {
  plantPeople(ctx);
  plantStaffAndLogins(ctx);
  plantWorkstations(ctx);
  plantCompanies(ctx);
  plantCastResidence(ctx);
  plantCamerasAndVehicles(ctx);
  plantPhonesAndAccounts(ctx);
  plantMoney(ctx);
  plantSokol2015(ctx);
  plantGlubinaStroy2015(ctx);
  plantNightOfHit(ctx);
  plantDeaths(ctx);
  plantChronicle(ctx);
  plantExclusions(ctx);
}

// ==================================================================== люди

/** id шумовых жителей, которые обязаны быть взрослыми: на них ссылаются посадки */
export const ADULT_PERSON_IDS = [2051, 2052, 2053, 2054, 2055, 2056, 2057, 2058, 2060, 2061, 2062, 2063] as const;

function plantPeople(ctx: WorldContext): void {
  for (const p of F.CAST_PERSONS) {
    ctx.insert("persons", {
      id: p.id,
      last_name: p.last,
      first_name: p.first,
      patronymic: p.middle,
      birth_date: p.birth,
      sex: p.sex,
      father_id: p.father ?? null,
      mother_id: p.mother ?? null,
      prev_last_name: p.prevLast ?? null,
      special_marks: p.marks ?? null,
      death_date: p.death ?? null,
      created_at: p.createdAt ?? fmtTs(personCreatedAt(p.id)),
    });
  }
  // Жители, чьи фамилии Ирина «исправила» 17.11 (акростих): в ПБД уже верное написание
  for (const a of F.ACROSTIC) {
    ctx.insert("persons", {
      id: a.personId,
      last_name: a.right,
      first_name: a.first,
      patronymic: a.middle,
      birth_date: a.birth,
      sex: a.sex,
      father_id: null,
      mother_id: null,
      prev_last_name: null,
      special_marks: null,
      death_date: null,
      created_at: fmtTs(personCreatedAt(a.personId)),
    });
  }
  ctx.reserveId("persons", F.PERSON.player);
  for (const id of ADULT_PERSON_IDS) ctx.reserve("person:adult", String(id));
  // Инженеры ревизий ПД-117 (строки сажает c06): взрослые, живые, не дубли
  for (const id of F.PD117_ENGINEERS) ctx.reserve("person:adult", String(id), F.PD117_ENGINEER_BORN);
}

/** Поля верхней таблицы разд. 8.4 вне persons: Портовая, 3 (Сазоновы, Лапина), работа Петрова и Олега */
function plantCastResidence(ctx: WorldContext): void {
  for (const a of Object.values(F.ADDRESS)) {
    ctx.insert("addresses", { id: a.id, district: a.district, street: a.street, house: a.house, apt: a.apt });
  }
  const castFlats = new Set<number>(Object.values(F.ADDRESS).map((a) => a.id));
  ctx.exclude("registrations", (r) => castFlats.has(Number(r.address_id)), "в квартирах Сазоновых и Лапиной шум не прописан");
  for (const r of F.CAST_REGISTRATIONS) {
    ctx.insert("registrations", {
      person_id: r.person, address_id: F.ADDRESS[r.address].id, from_date: r.from, to_date: r.to,
    }, { orderAt: ts(r.from) });
  }
  for (const e of F.CAST_EMPLOYMENT) {
    ctx.insert("employment", {
      person_id: e.person, company_id: e.company, position: e.position, from_date: e.from, to_date: e.to,
    }, { orderAt: ts(e.from) });
  }
}

// ==================================================================== сотрудники

interface StaffFact {
  id: number;
  person: number;
  name: string;
  login: string;
  rank: string | null;
  position: string;
  dept: string;
  ws: string;
  badge: string;
  hired: string;
  fired?: string;
}

const CAST_STAFF: readonly StaffFact[] = [
  { id: F.STAFF.nina, person: F.PERSON.nina, name: "Шустова Н. Ф.", login: F.LOGIN.nina, rank: null, position: "архивариус", dept: "ОЦР", ws: "АРХ-01", badge: F.BADGE.nina, hired: "1981-08-17" },
  { id: F.STAFF.ratnikov, person: F.PERSON.ratnikov, name: "Ратников Л. Б.", login: F.LOGIN.ratnikov, rank: "подполковник", position: "начальник ОЦР", dept: "ОЦР", ws: "WS-01", badge: F.BADGE.ratnikov, hired: "1990-09-03" },
  { id: F.STAFF.melnik, person: F.PERSON.melnik, name: "Мельник К. И.", login: F.LOGIN.melnik, rank: "майор", position: "начальник ИТ-отдела", dept: "ИТ-отдел", ws: "WS-IT-01", badge: F.BADGE.melnik, hired: "2008-07-01" },
  { id: F.STAFF.lykov, person: F.PERSON.lykov, name: "Лыков А. С.", login: F.LOGIN.lykov, rank: null, position: "системный администратор", dept: "ИТ-отдел", ws: "WS-IT-02", badge: F.BADGE.lykov, hired: "2024-06-03" },
  { id: F.STAFF.irina, person: F.PERSON.irina, name: "Вальц И. П.", login: F.LOGIN.irina, rank: null, position: "аналитик ОЦР", dept: "ОЦР", ws: F.WORKSTATION.irinaDesk, badge: F.BADGE.irina, hired: "2025-03-03", fired: "2026-11-19" },
  { id: F.STAFF.dasha, person: F.PERSON.dasha, name: "Ким Д. С.", login: F.LOGIN.dasha, rank: "старший лейтенант", position: "оперуполномоченный ОЦР", dept: "ОЦР", ws: "WS-05", badge: F.BADGE.dasha, hired: "2026-12-01" },
];

/** Офицеры, на которых ссылаются висяки 2015 года и ночь наезда: шум делает их полицейскими */
const OFFICERS_2015 = [9, 17, 21, 26, 30, 33, 38, 41, 47] as const;
const OFFICERS_2026 = [131, 139] as const;

function plantStaffAndLogins(ctx: WorldContext): void {
  for (const s of CAST_STAFF) {
    ctx.insert("staff", {
      id: s.id,
      person_id: s.person,
      full_name: s.name,
      login: s.login,
      rank: s.rank,
      position: s.position,
      dept: s.dept,
      workstation: s.ws,
      badge_id: s.badge,
      hired_at: s.hired,
      fired_at: s.fired ?? null,
      contract_no: null,
    });
    ctx.reserve("badge", s.badge);
  }
  ctx.reserveId("staff", F.STAFF.player);
  ctx.reserve("badge", F.BADGE.player);
  for (const id of OFFICERS_2015) ctx.reserve("staff:officer", String(id), { hiredBefore: "2014-12-31", active: false });
  for (const id of OFFICERS_2026) ctx.reserve("staff:officer", String(id), { hiredBefore: "2026-11-01", active: true });

  const logins: Row[] = [
    { login: F.LOGIN.ratnikov, staff_id: F.STAFF.ratnikov, role: "user", created_at: "2017-03-15 10:02:00", created_by: "system", enabled: 1, last_login_at: "2026-12-11 08:47:12" },
    { login: F.LOGIN.nina, staff_id: F.STAFF.nina, role: "archive", created_at: "2017-03-15 10:05:00", created_by: "system", enabled: 1, last_login_at: "2026-12-11 08:03:41" },
    { login: F.LOGIN.melnik, staff_id: F.STAFF.melnik, role: "admin", created_at: "2017-03-14 18:40:00", created_by: "system", enabled: 1, last_login_at: "2026-12-11 09:12:05" },
    { login: F.LOGIN.lykov, staff_id: F.STAFF.lykov, role: "admin", created_at: "2024-06-03 11:15:00", created_by: F.LOGIN.melnik, enabled: 1, last_login_at: "2026-12-11 09:58:30" },
    // Так и не отключён: под ним работает призрак
    { login: F.LOGIN.irina, staff_id: F.STAFF.irina, role: "analyst", created_at: "2025-03-03 10:20:00", created_by: F.LOGIN.melnik, enabled: 1, last_login_at: F.GHOST_SESSIONS[5].start },
    { login: F.LOGIN.dasha, staff_id: F.STAFF.dasha, role: "user", created_at: "2026-12-01 09:40:00", created_by: F.LOGIN.melnik, enabled: 1, last_login_at: "2026-12-10 18:20:44" },
    // Служебная учётка «Сокола»: отключена в 2017-м, включена Ириной 16.11.2026.
    // last_login_at движок обновляет в начале каждого дела (патч case.logins).
    { login: F.LOGIN.zero, staff_id: null, role: "service", created_at: "2015-03-01 00:00:00", created_by: "system", enabled: 1, last_login_at: "2026-12-02 03:12:00" },
  ];
  for (const l of logins) ctx.insert("logins", l);
  for (const l of Object.values(F.LOGIN)) ctx.reserve("login", l);
  ctx.reserve("login", "admin");
  ctx.reserve("login", "system");
}

function plantWorkstations(ctx: WorldContext): void {
  const rows: Row[] = [
    { id: "WS-03", room: "Б0-03", floor: "Б0", kind: "рабочая станция", note: "стол аналитика ОЦР" },
    { id: "WS-07", room: "Б0-11", floor: "Б0", kind: "рабочая станция", note: WS07_NOTE_INITIAL },
    { id: "CRON-01", room: null, floor: null, kind: "виртуальная", note: "планировщик заданий ПБД" },
    ...F.WORKSTATION.it.map((id) => ({ id, room: "2-08", floor: "2", kind: "рабочая станция", note: "ИТ-отдел" })),
  ];
  for (const r of rows) {
    ctx.insert("workstations", r);
    ctx.reserve("workstation", String(r.id));
  }
  ctx.reserve("workstation", F.WORKSTATION.glbCore);
}

export const WS07_NOTE_INITIAL = "серверная; резервная станция ИТ";
export const WS07_NOTE_AGENT = "агент синхронизации v2";
export const WS07_NOTE_REMOVED = "агент удалён 31.12.2026";

// ==================================================================== компании

const COMPANY_FACTS: readonly { id: number; inn: string; kind: string; reg: string; liq?: string; director: number | null }[] = [
  { id: 1, inn: "5190043127", kind: "ПАО", reg: "2012-05-16", director: 2051 },
  { id: 2, inn: "5190051733", kind: "АО", reg: "2013-02-11", director: 2052 },
  { id: 3, inn: "5190060218", kind: "фонд", reg: "2015-03-01", director: 2053 },
  { id: 4, inn: "5190078842", kind: "ООО", reg: "2019-10-01", director: 2054 },
  { id: 12, inn: "9909411823", kind: "иностранная компания", reg: "2011-08-23", director: null },
  { id: 13, inn: "5190049960", kind: "ООО", reg: "2012-11-05", director: F.PERSON.eliseev },
  { id: 14, inn: "5190055104", kind: "ООО", reg: "2014-04-17", director: 2055 },
  { id: 15, inn: "5190063391", kind: "ООО", reg: "2016-02-09", director: 2056 },
  { id: 16, inn: "5190063402", kind: "ООО", reg: "2016-02-09", director: 2057 },
  { id: 17, inn: "5190057716", kind: "ЧОП", reg: "2014-09-30", director: F.PERSON.burtsev },
  { id: 18, inn: "5190052081", kind: "ООО", reg: "2013-03-04", liq: "2017-06-30", director: F.PERSON.granin },
  { id: 60, inn: "5190071125", kind: "ООО", reg: "2019-03-12", director: 2058 },
  // ИП: директор — сам предприниматель (Мельник Е. А.), её карточку сажает c09
  { id: 61, inn: "519012345671", kind: "ИП", reg: "2025-05-20", director: null },
  { id: 80, inn: "5190033348", kind: "ООО", reg: "2009-07-01", director: 2060 },
  { id: 90, inn: "5190037702", kind: "АНО", reg: "2010-04-14", director: 2061 },
  { id: 95, inn: "5190069950", kind: "МФО", reg: "2018-01-22", director: 2062 },
  { id: 96, inn: "5190011207", kind: "банк", reg: "1994-06-08", director: 2063 },
];

function plantCompanies(ctx: WorldContext): void {
  for (const c of COMPANY_FACTS) {
    ctx.insert("companies", {
      id: c.id,
      name: F.COMPANY_NAME[c.id],
      inn: c.inn,
      kind: c.kind,
      registered_at: c.reg,
      liquidated_at: c.liq ?? null,
      director_person_id: c.director,
    });
    ctx.reserve("inn", c.inn);
    ctx.reserve("company_name", F.COMPANY_NAME[c.id]);
  }
}

// ==================================================================== камеры и машины

function plantCamerasAndVehicles(ctx: WorldContext): void {
  const cams: [number, string, string, string?, string?][] = [
    [F.CAMERA.trudaSquare, "пл. Труда", "Старый город"],
    [F.CAMERA.bypass, "Объездная", "Промзона"],
    [F.CAMERA.polyarnayaMira, "Полярная / Мира", "Старый город"],
    [F.CAMERA.promzonaExit, "Промзона — выезд (Энергетиков)", "Промзона"],
    [F.CAMERA.shchitBase, "Промзона — база ЧОП «Щит»", "Промзона"],
    [F.CAMERA.shoreHighway, "Береговое шоссе", "Створ", "отключена", "по запросу собственника территории (ЧОП «Щит»)"],
    [F.CAMERA.dormitory, "Общежитие, ул. Строителей", "Старый город"],
  ];
  for (const [id, name, district, status = "работает", reason = null] of cams) {
    ctx.insert("cameras", { id, name, district, status, status_reason: reason });
  }
  ctx.insert("vehicles", {
    id: F.VEHICLE_ID.taiga, plate: F.PLATE.taiga, make: "Тайга", model: "4×4", color: "тёмно-серый", year: 2021,
    owner_person_id: null, owner_company_id: F.COMPANY.shchit, owner_name: F.COMPANY_NAME[F.COMPANY.shchit],
    registered_at: "2021-04-14", sold_at: null, deregistered_at: null,
  });
  ctx.insert("vehicles", {
    id: F.VEHICLE_ID.bastion, plate: F.PLATE.bastion, make: "Бастион", model: "Б-7", color: "чёрный", year: 2023,
    owner_person_id: null, owner_company_id: F.COMPANY.shchit, owner_name: F.COMPANY_NAME[F.COMPANY.shchit],
    registered_at: "2023-09-02", sold_at: null, deregistered_at: null,
  });
  for (const p of Object.values(F.PLATE)) ctx.reserve("plate", p);
}

// ==================================================================== телефоны и счета

function plantPhonesAndAccounts(ctx: WorldContext): void {
  const phones: [string, number, string][] = [
    [F.PHONE.sazonov, F.PERSON.sazonov, "2009-05-12"],
    [F.PHONE.valentina, F.PERSON.valentina, "2008-10-01"],
    [F.PHONE.burtsev, F.PERSON.burtsev, "2013-02-01"],
    [F.PHONE.irina, F.PERSON.irina, "2015-04-10"],
    [F.PHONE.lykov, F.PERSON.lykov, "2020-08-15"],
  ];
  for (const [msisdn, person, reg] of phones) {
    ctx.insert("phones", { msisdn, person_id: person, company_id: null, registered_at: reg });
  }
  // Номера вида «id человека» закреплены за кастом: шум их не выдаёт
  for (const p of F.CAST_PERSONS) ctx.reserve("phone", F.castPhoneFor(p.id));
  for (const p of Object.values(F.PHONE)) ctx.reserve("phone", p);
  ctx.reserve("phone", F.castPhoneFor(F.PERSON.player));

  const accounts: Row[] = [
    { id: F.ACCOUNT.pakhomova, holder_person_id: F.PERSON.pakhomova, holder_company_id: null, holder_name: "Пахомова З. П.", bank: "Северный кредит", opened_at: "2012-04-16" },
    { id: F.ACCOUNT.fund, holder_person_id: null, holder_company_id: F.COMPANY.fund, holder_name: F.COMPANY_NAME[F.COMPANY.fund], bank: "Северный кредит", opened_at: "2015-03-02" },
    { id: F.ACCOUNT.ladogaInvest, holder_person_id: null, holder_company_id: F.COMPANY.ladogaInvest, holder_name: F.COMPANY_NAME[F.COMPANY.ladogaInvest], bank: "Северный кредит", opened_at: "2014-05-05" },
    { id: F.ACCOUNT.shchit, holder_person_id: null, holder_company_id: F.COMPANY.shchit, holder_name: F.COMPANY_NAME[F.COMPANY.shchit], bank: "Северный кредит", opened_at: "2014-10-06" },
    { id: F.ACCOUNT.mfo, holder_person_id: null, holder_company_id: F.COMPANY.mfo, holder_name: F.COMPANY_NAME[F.COMPANY.mfo], bank: "Сияние.Pay", opened_at: "2018-02-01" },
  ];
  for (const a of accounts) {
    ctx.insert("accounts", a);
    ctx.reserve("account", String(a.id));
  }
}

// ==================================================================== деньги

function plantMoney(ctx: WorldContext): void {
  const rng = ctx.rng("core.money");
  const fund = F.COMPANY_NAME[F.COMPANY.fund];
  // Фонд → Пахомова: 139 × 7 000 «матпомощь», 05.03.2015 … 05.09.2026, затем возврат (М3)
  let n = 0;
  for (let y = 2015, m = 2; ; ) {
    const at = Date.UTC(y, m, 5, 10, rng.int(0, 119), rng.int(0, 59));
    if (at > ts("2026-09-05 23:59:59")) break;
    ctx.insert("transactions", {
      ts: fmtTs(at), account_id: F.ACCOUNT.pakhomova, amount: 7000, counterparty: fund,
      counterparty_account: F.ACCOUNT.fund, channel: "перевод", purpose: "матпомощь ветерану «Глубина-Строя»",
    }, { orderAt: at });
    n++;
    m++;
    if (m === 12) {
      m = 0;
      y++;
    }
  }
  if (n !== 139) throw new WorldGenError(`core: платежей фонда Пахомовой ${n}, а должно быть 139`);
  const refund = ts("2026-09-07 11:16:42");
  ctx.insert("transactions", {
    ts: fmtTs(refund), account_id: F.ACCOUNT.pakhomova, amount: -7000, counterparty: fund,
    counterparty_account: F.ACCOUNT.fund, channel: "перевод", purpose: "возврат: отказ получателя",
  }, { orderAt: refund });

  // «Щит» гасит микрозайм Лыкова (12.11) и получает 300 000 «доп. соглашение № 7» (20.11)
  const loan = ts(F.KEY_TIMES.lykovLoanPaid);
  ctx.insert("transactions", {
    ts: F.KEY_TIMES.lykovLoanPaid, account_id: F.ACCOUNT.shchit, amount: -380000,
    counterparty: F.COMPANY_NAME[F.COMPANY.mfo], counterparty_account: F.ACCOUNT.mfo, channel: "перевод",
    purpose: "погашение займа за Лыкова А. С.",
  }, { orderAt: loan });
  const bonus = ts(F.KEY_TIMES.shchitBonus);
  ctx.insert("transactions", {
    ts: F.KEY_TIMES.shchitBonus, account_id: F.ACCOUNT.shchit, amount: 300000,
    counterparty: F.COMPANY_NAME[F.COMPANY.ladogaInvest], counterparty_account: F.ACCOUNT.ladogaInvest,
    channel: "перевод", purpose: "доп. соглашение № 7",
  }, { orderAt: bonus });
}

// ==================================================================== «Сокол», I квартал 2015

/** Ожидаемый номер КУСП по времени: ~14 сообщений в сутки, номер годовой */
export function kuspEstimate(ms: number): number {
  return Math.floor((dayOfYear(ms) - 1 + hourOfDay(ms) / 24) * 14.05) + 1;
}

/** Ожидаемый номер журнала «Сокола» 2015 года (~65 документов в сутки) от ближайшего якоря */
export function docRegEstimate(ms: number): number {
  const anchors: [number, number][] = [
    [ts("2015-02-20 01:05:00"), F.DOC_REG.rapport],
    [ts("2015-02-21 10:15:00"), F.DOC_REG.forgedB],
  ];
  const rate = 64.5 / DAY;
  if (ms < anchors[0][0]) return anchors[0][1] - (anchors[0][0] - ms) * rate;
  const a = ms < anchors[1][0] ? anchors[0] : anchors[1];
  return a[1] + (ms - a[0]) * rate;
}

const SOKOL_ENTRY_FROM = ts("2015-03-01 09:00:00");
const SOKOL_ENTRY_TO = ts("2015-12-31 18:00:00");

/** Момент ввода объяснения 2015 года в «Сокол»: январь–февраль Нина набивала задним числом */
export function sokolEntryTime(rng: Rng, taken: number): number {
  if (taken < SOKOL_ENTRY_FROM) return SOKOL_ENTRY_FROM + rng.float(1, 60) * DAY;
  return taken + rng.float(0.2, 3) * DAY;
}

/** Ожидаемый id объяснения 2015 года по моменту ввода в «Сокол» (id 1001–2100) */
export function sokolStatementIdEstimate(entry: number): number {
  return 1001 + ((entry - SOKOL_ENTRY_FROM) / (SOKOL_ENTRY_TO - SOKOL_ENTRY_FROM)) * 1099;
}

const RATNIKOV_2015 = "майор Ратников Л. Б.";
const NINA_SHORT = "Шустова Н. Ф.";

function streetAddress(rng: Rng, district: (typeof DISTRICTS)[number]): string {
  const s = rng.pick(STREETS[district]);
  return `${s.street}, ${rng.int(1, s.houses)}`;
}

const CAST_SURNAMES = new Set(F.CAST_PERSONS.map((p) => p.last.replace(/а$/, "")));

/** Случайный свидетель 2015 года: «Фамилия И. О.», не однофамилец каста */
function witnessName(rng: Rng): string {
  for (;;) {
    const n = randomName(rng);
    if (!CAST_SURNAMES.has(n.last.replace(/а$/, ""))) return shortName(n.last, n.first, n.middle);
  }
}

function plantSokol2015(ctx: WorldContext): void {
  const rng = ctx.rng("core.sokol2015");

  // --- incidents 1–40: висяки «Сокола» I квартала 2015 года, по порядку времени (М1)
  const t6 = ts("2015-02-19 23:20:00");
  const t7 = ts("2015-02-19 23:58:00");
  const randTimes = (n: number, lo: number, hi: number) =>
    Array.from({ length: n }, () => Math.floor(rng.float(lo, hi) / 1000) * 1000).sort((a, b) => a - b);
  const times = [
    ...randTimes(5, ts("2015-01-03 08:00:00"), ts("2015-02-18 20:00:00")),
    t6,
    t7,
    ...randTimes(33, ts("2015-02-21 08:00:00"), ts("2015-03-31 21:00:00")),
  ];
  const kusp = fitSequence(times.map(kuspEstimate), 0, 1_000_000);
  const otherOfficers = rng.sample(
    Array.from({ length: 40 }, (_, i) => i + 1).filter((id) => id !== 6 && id !== 7),
    9
  );
  const hangerKinds = [["кража", 30], ["угон", 10], ["сообщение гражданина", 25], ["заявление", 25], ["ДТП", 10]] as const;
  for (let i = 0; i < 40; i++) {
    const id = i + 1;
    const at = times[i];
    let row: Row;
    if (id === F.INCIDENT.row6) {
      row = {
        kind: "заявление", district: "Старый город", address_text: "Портовая, 3",
        description: "Муж уехал после звонка с работы, не отвечает", applicant_text: "Сазонова В. С.",
        x_m: 2140.5, y_m: 1482.0,
      };
    } else if (id === F.INCIDENT.row7) {
      row = {
        kind: "сообщение гражданина", district: "Створ", address_text: "Старый причал (Береговая)",
        description:
          "Заявитель Ким С. А. (Береговая, 4): у Старого причала под водой свет, похоже на фары. " +
          "Проверено нарядом охраны стройплощадки «Глубина-Строй» (проверка 00:30, ст. наряда Бурцев В. Н.): " +
          "ничего не обнаружено, отблеск прожекторов стройки",
        applicant_text: "Ким С. А. (Береговая, 4)", x_m: F.GEO.row7.x, y_m: F.GEO.row7.y,
      };
    } else {
      const kind = rng.weighted(hangerKinds);
      const district = rng.pick(DISTRICTS);
      row = {
        kind, district, address_text: streetAddress(rng, district), description: rng.pick(INCIDENT_TEXT[kind]),
        applicant_text: witnessName(rng),
        x_m: Math.round(rng.float(300, 5200) * 10) / 10, y_m: Math.round(rng.float(200, 3300) * 10) / 10,
      };
    }
    ctx.insert("incidents", {
      id, kusp_no: kusp[i], reported_at: fmtTs(at), vehicle_id: null,
      officer_staff_id: otherOfficers.includes(id) ? OFFICERS_2015[otherOfficers.indexOf(id)] : F.STAFF.ratnikov,
      status: "приостановлено", ...row,
    }, { orderAt: at });
  }

  // --- дело 15-0219
  ctx.insert("cases", {
    id: F.CASE_SAZONOV, title: "Безвестное исчезновение Сазонова Петра Ильича", opened_at: "2015-02-19 23:20:00",
    applicant_text: "Сазонова В. С. (жена)", investigator: RATNIKOV_2015, status: "приостановлено", status_at: "2015-05-20",
  });
  ctx.reserve("case_id", F.CASE_SAZONOV);

  // --- объяснения по 15-0219: 60 настоящих (id из «Сокола»), подделки — в хронике
  for (const id of F.STATEMENTS_MISSING_IN_PBD) ctx.reserveId("statements", id);
  const takenTimes = [
    ts("2015-02-20 10:30:00"), ts("2015-02-20 14:10:00"), ts("2015-02-20 16:45:00"),
    ...randWorkTimes(rng, 37, ts("2015-02-21 12:00:00"), ts("2015-03-27 18:00:00")),
    ...randWorkTimes(rng, 20, ts("2015-04-01 09:00:00"), ts("2015-05-15 18:00:00")),
  ];
  const entries = takenTimes.map((t) => sokolEntryTime(rng, t));
  const order = takenTimes.map((_, i) => i).sort((a, b) => entries[a] - entries[b]);
  const reserved = new Set<number>(F.STATEMENTS_MISSING_IN_PBD);
  const ids = fitSequence(order.map((i) => sokolStatementIdEstimate(entries[i])), 1000, 2101, (v) => reserved.has(v));
  const statementId = new Map<number, number>();
  order.forEach((i, k) => statementId.set(i, ids[k]));

  // Документы журнала по делу (якоря номеров) — номера считаются от плотности ~65 в сутки
  interface DocFact { at: number; reg?: number; type: string; note: string | null }
  const docs: DocFact[] = [
    { at: ts("2015-02-19 23:25:00"), type: "заявление", note: "Сазонова В. С.: о безвестном исчезновении мужа" },
    { at: ts("2015-02-20 01:05:00"), reg: F.DOC_REG.rapport, type: "рапорт о выезде", note: "выезд на Береговую, 4 по сообщению Ким С. А." },
    { at: ts("2015-02-20 01:55:00"), reg: F.DOC_REG.scheme, type: "схема места происшествия", note: "составлена несовершеннолетней Ким Д. С., 13 л., к объяснению № 3312" },
    // 3320 и 3322 правлены призраком через staging (были «запрос в ГИБДД» и «рапорт о ДТП»)
    { at: ts("2015-02-21 09:40:00"), reg: F.DOC_REG.forgedA, type: "объяснение", note: null },
    { at: ts("2015-02-21 10:15:00"), reg: F.DOC_REG.forgedB, type: "объяснение", note: null },
  ];
  const witnesses = takenTimes.map((_, i) => (i === 0 ? "Сазонова В. С." : witnessName(rng)));
  const statementDoc = new Map<number, DocFact>();
  takenTimes.forEach((t, i) => {
    if (t < ts("2015-03-31 00:00:00")) {
      const doc: DocFact = { at: t + rng.int(25, 70) * MINUTE, type: "объяснение", note: `объяснение: ${witnesses[i]}` };
      statementDoc.set(i, doc);
      docs.push(doc);
    }
  });
  assignDocRegNumbers(docs);
  for (const d of docs) {
    ctx.insert("doc_registry", {
      year: 2015, reg_no: d.reg as number, registered_at: fmtTs(d.at), doc_type: d.type, case_id: F.CASE_SAZONOV,
      registered_by: NINA_SHORT, note: d.note,
    }, { orderAt: d.at });
  }
  // Объяснение Даши № 3312 изъято из журнала в 2015 году: номер — дыра
  ctx.reserve("doc_reg_hole", String(F.DOC_REG.missing), ts("2015-02-20 01:40:00"));

  takenTimes.forEach((t, i) => {
    const doc = statementDoc.get(i);
    ctx.insert("statements", {
      id: statementId.get(i) as number, case_id: F.CASE_SAZONOV,
      doc_reg_no: doc ? (doc.reg as number) : null,
      person_id: null, person_text: witnesses[i], taken_at: fmtTs(t),
      taken_by: rng.chance(0.85) ? RATNIKOV_2015 : "капитан Дьячков Е. М.",
      typed_by: rng.chance(0.9) ? NINA_SHORT : "Воронина Т. А.",
      text: i === 0 ? SAZONOVA_TEXT : rng.pick(SAZONOV_WITNESS_TEXTS), status: "принято",
    });
  });
}

const SAZONOVA_TEXT =
  "19.02 около 21:50 мужу позвонили с работы, он сказал «вызывают, я быстро» и уехал на своей машине. " +
  "Больше на связь не выходил. Долгов у него не было, вещи дома";

const SAZONOV_WITNESS_TEXTS = [
  "Сазонова видел последний раз 19.02 около 17:30 в бухгалтерии, был спокоен",
  "О долгах и конфликтах Сазонова не знаю, по работе характеризую положительно",
  "19.02 вечером у конторы «Глубина-Строя» машин не видел, было темно и мело",
  "Сазонов в последние дни часто задерживался, сверял ведомости по переселению",
  "Про отъезд Сазонова ничего не знаю, с ним не общался",
  "Видел, как Сазонов разговаривал по телефону у проходной, разговор был на повышенных тонах",
  "Сазонов просил меня поднять расходные ордера за январь, зачем — не объяснил",
  "19.02 работал во вторую смену на площадке, посторонних не видел",
  "Сазонов говорил, что собирается в отпуск летом, никуда не собирался уезжать",
  "О том, что Сазонов пропал, узнал от коллег 20.02 утром",
];

function randWorkTimes(rng: Rng, n: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  while (out.length < n) {
    const t = Math.floor(rng.float(lo, hi) / 1000) * 1000;
    const h = hourOfDay(t);
    if (h >= 9 && h <= 18.5 && weekday(t) !== 0) out.push(t);
  }
  return out.sort((a, b) => a - b);
}

/** Номера журнала для документов дела: якоря фиксированы, остальные — по плотности между ними */
function assignDocRegNumbers(docs: { at: number; reg?: number }[]): void {
  docs.sort((a, b) => a.at - b.at);
  const fixed = docs.map((d, i) => (d.reg !== undefined ? i : -1)).filter((i) => i >= 0);
  const holes = new Set<number>([F.DOC_REG.missing, F.DOC_REG.coffee]);
  let prevIdx = -1;
  let prevReg = 0;
  for (const fi of [...fixed, docs.length]) {
    const run = docs.slice(prevIdx + 1, fi);
    if (run.length > 0) {
      const hi = fi < docs.length ? (docs[fi].reg as number) : 1_000_000;
      const regs = fitSequence(run.map((d) => docRegEstimate(d.at)), prevReg, hi, (v) => holes.has(v));
      run.forEach((d, k) => (d.reg = regs[k]));
    }
    if (fi < docs.length) {
      prevIdx = fi;
      prevReg = docs[fi].reg as number;
    }
  }
}

// ==================================================================== «Глубина-Строй», 19.02.2015

function plantGlubinaStroy2015(ctx: WorldContext): void {
  const call = ts("2015-02-19 21:47:00");
  const sms = ts("2015-02-19 21:56:00");
  ctx.insert("gs_comms_2015", {
    ts_unix: localToUnix(call), kind: "call", from_ext: "2-14", to_number: F.PHONE.sazonov,
    recipient_name: null, duration_sec: 60, text: null,
  }, { orderAt: call });
  ctx.insert("gs_comms_2015", {
    ts_unix: localToUnix(sms), kind: "sms", from_ext: "2-14", to_number: F.PHONE.burtsev,
    recipient_name: "ст. наряда Бурцев", duration_sec: null, text: "ГОСТЬ ЕДЕТ К СТАРОМУ ПРИЧАЛУ. ВСТРЕТЬ.",
  }, { orderAt: sms });
  ctx.insert("gs_phonebook", {
    ext: "2-14", room: "приёмная директора", holder_person_id: F.PERSON.granin, from_date: "2013-04-01", to_date: "2017-06-30",
  });
  ctx.reserve("gs_ext", "2-14");
}

// ==================================================================== ночь 18.11.2026

function plantNightOfHit(ctx: WorldContext): void {
  const hit = ts(F.KEY_TIMES.hitAndRun);
  ctx.insert("incidents", {
    id: F.INCIDENT.hitAndRun, kusp_no: F.KUSP.hitAndRun, reported_at: F.KEY_TIMES.hitAndRun, kind: "ДТП",
    district: "Старый город", address_text: "Полярная, 17",
    description: "Наезд на пешехода у дома 17, водитель с места ДТП скрылся. Пострадавшая — женщина ~30 лет",
    vehicle_id: null, applicant_text: "Самохин А. В. (прохожий)", officer_staff_id: OFFICERS_2026[0],
    status: "приостановлено", x_m: null, y_m: null,
  }, { orderAt: hit });
  // reported_at уже правлен призраком (было 23:52:00); id и КУСП — по моменту настоящей регистрации
  const claim = ts(F.KEY_TIMES.theftClaimOriginal);
  ctx.insert("incidents", {
    id: F.INCIDENT.theftClaim, kusp_no: F.KUSP.theftClaim, reported_at: F.KEY_TIMES.theftClaimEdited, kind: "угон",
    district: "Промзона", address_text: "Энергетиков, 40 (база ЧОП «Щит»)",
    description: "Угон автомобиля «Тайга 4×4» К404ТО со стоянки ЧОП «Щит», ключи оставлены в салоне",
    vehicle_id: F.VEHICLE_ID.taiga, applicant_text: "Бурцев В. Н.", officer_staff_id: OFFICERS_2026[1],
    status: "приостановлено", x_m: null, y_m: null,
  }, { orderAt: claim });
  ctx.reserve("kusp:2026", String(F.KUSP.hitAndRun));
  ctx.reserve("kusp:2026", String(F.KUSP.theftClaim));

  // person_id уже отвязан призраком (было 4127)
  ctx.insert("incident_persons", {
    id: 1205, incident_id: F.INCIDENT.hitAndRun, kusp_no: F.KUSP.hitAndRun, person_id: null, role: "потерпевшая",
    note: "женщина ~30 лет, документов нет; при себе ключ с биркой «Б0-03»; телефон не обнаружен",
  }, { orderAt: F.INCIDENT.hitAndRun });
  ctx.insert("incident_persons", {
    id: 1209, incident_id: F.INCIDENT.theftClaim, kusp_no: F.KUSP.theftClaim, person_id: F.PERSON.burtsev,
    role: "заявитель", note: "директор ЧОП «Щит»",
  }, { orderAt: F.INCIDENT.theftClaim });

  // Маршрут «Тайги» (Дорсеть не правится ни изнутри, ни снаружи)
  const route: [string, number, string, number][] = [
    ["2026-11-18 22:52:00", F.CAMERA.shchitBase, "выезд", 0.97],
    ["2026-11-18 23:08:00", F.CAMERA.polyarnayaMira, "в центр", 0.94],
    ["2026-11-18 23:21:00", F.CAMERA.bypass, "из центра", 0.96],
    ["2026-11-18 23:34:00", F.CAMERA.shchitBase, "въезд", 0.98],
    ["2026-11-19 03:10:00", F.CAMERA.shchitBase, "выезд", 0.95],
  ];
  for (const [at, camera, direction, confidence] of route) {
    ctx.insert("plate_reads", { camera_id: camera, plate: F.PLATE.taiga, read_at: at, confidence, direction }, { orderAt: ts(at) });
  }

  ctx.insert("morgue_records", {
    id: 311, kusp_no: F.KUSP.hitAndRun, received_at: "2026-11-19 00:40:00", full_name_text: "Вальц Ирина Петровна",
    person_id: F.PERSON.irina, identified_at: "2026-11-19 09:30:00", identified_by: "Вальц В. С. (мать)",
  });

  // Последнее голосовое Ирины матери: создано 18.11 в 23:05, доставка — на первом солнце (М17)
  ctx.insert("messenger_events", {
    ts: F.KEY_TIMES.voiceDelivery, created_at: F.KEY_TIMES.voiceCreated, from_msisdn: F.PHONE.irina,
    to_msisdn: F.PHONE.valentina, kind: "голос", size_kb: 412, cell_id: "ПЛР-17", status: "запланировано",
  }, { orderAt: ts(F.KEY_TIMES.voiceCreated) });
}

// ==================================================================== смерти (ЗАГС)

function plantDeaths(ctx: WorldContext): void {
  const deaths: [string, number, string, string, string][] = [
    ["А-2016-0213", F.PERSON.tamara, "2016-03-14 05:40:00", "хроническая обструктивная болезнь лёгких, пневмония", "2016-03-15 11:00:00"],
    ["А-2019-0402", F.PERSON.gromov, "2019-06-02 04:30:00", "острая сердечная недостаточность", "2019-06-04 10:00:00"],
    ["А-2019-0655", F.PERSON.lapina, "2019-10-11 03:15:00", "ишемическая болезнь сердца", "2019-10-14 10:30:00"],
    ["А-2021-0318", F.PERSON.kimSergey, "2021-05-02 14:20:00", "острая сердечная недостаточность", "2021-05-04 09:40:00"],
    ["А-2026-0911", F.PERSON.irina, F.KEY_TIMES.hitAndRun, "сочетанная травма (ДТП)", "2026-11-20 11:00:00"],
    ["А-2026-0997", F.PERSON.pakhomova, "2026-12-06 22:50:00", "переохлаждение; острая сердечная недостаточность", "2026-12-08 11:30:00"],
  ];
  for (const [act, person, died, cause, reg] of deaths) {
    ctx.insert("zags_deaths", { act_no: act, person_id: person, died_at: died, cause, registered_at: reg });
    ctx.reserve("act_no", act);
    ctx.reserve("zags:person", String(person));
  }
}

// ==================================================================== хроника вмешательств

interface AuditRow extends Row {
  ts: string;
  login: string;
  workstation: string;
  action: "UPDATE" | "INSERT" | "DELETE" | "EXPORT" | "SESSION";
  table_name: string;
  row_id: string | null;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
}

/** Начало и конец фонового query_log; плотность для id дыр Ирины */
export const QUERY_LOG_FROM = ts("2026-09-01 00:00:00");
export const QUERY_LOG_TO = ts("2027-01-11 11:00:00");
export const QUERY_LOG_TARGET = 1200;
/** Запросов Ирины (все стёрты призраком): 180 DELETE к 11.12 и ещё 3 в седьмом сеансе */
export const IRINA_QUERY_COUNT = 183;

const PII_MASK = "[ПДн скрыто]";

function plantChronicle(ctx: WorldContext): void {
  const rng = ctx.rng("core.chronicle");

  // --- запросы Ирины в query_log: строк нет, остались дыры в id
  const irinaTimes = irinaQueryTimes(rng);
  const total = QUERY_LOG_TARGET + IRINA_QUERY_COUNT;
  const span = QUERY_LOG_TO - QUERY_LOG_FROM;
  // Плавающие строки тайников (eggs.ts) идут в общий ряд как «фантомы»: их id
  // остаются свободными, и в серии запросов Ирины для них всегда найдётся место
  const eggTimes = F.EGG_QUERY_LOG_TIMES.map(ts);
  const series = [...irinaTimes.map((t) => ({ t, irina: true })), ...eggTimes.map((t) => ({ t, irina: false }))]
    .sort((a, b) => a.t - b.t || (a.irina === b.irina ? 0 : a.irina ? -1 : 1));
  const seriesIds = fitSequence(series.map((x) => 1 + ((x.t - QUERY_LOG_FROM) / span) * (total - 1)), 0, total + 1);
  const holeIds: number[] = [];
  series.forEach((x, i) => {
    if (!x.irina) return;
    ctx.hole("query_log", seriesIds[i], x.t);
    holeIds.push(seriesIds[i]);
  });
  // Призрак стирает с конца: в первую ночь — последние недели её работы
  const deletable = holeIds.map((id, i) => ({ id, at: irinaTimes[i] })).reverse();

  // --- 16.11: Ирина включает zero и заводит 9 заданий (WS-03, на связи)
  const irina = (at: string, row: Partial<AuditRow>): AuditRow => ({
    ts: at, login: F.LOGIN.irina, workstation: F.WORKSTATION.irinaDesk, action: "UPDATE", table_name: "",
    row_id: null, field: null, old_value: null, new_value: null, ...row,
  });
  auditFloat(ctx, irina(F.KEY_TIMES.zeroEnabled, { table_name: "logins", row_id: F.LOGIN.zero, field: "enabled", old_value: "0", new_value: "1" }));
  for (const job of F.CRON_JOBS) {
    auditFloat(ctx, irina(job.createdAt, {
      action: "INSERT", table_name: "cron_jobs", row_id: String(job.id),
      new_value: JSON.stringify({ id: job.id, fire_after_case: F.CASE_IDS[job.fireAfter] }),
    }));
    ctx.insert("cron_jobs", {
      id: job.id, created_at: job.createdAt, created_by: F.LOGIN.irina, condition_json: job.condition,
      sql_template: job.sql, fire_after_case: F.CASE_IDS[job.fireAfter], fired_at: null,
    });
  }

  // --- 17.11: акростих, офлайн-пачка WS-03 с id 2101–2110
  for (const a of F.ACROSTIC) {
    ctx.insert("audit_log", {
      id: a.auditId, ...irina(a.ts, { table_name: "persons", row_id: String(a.personId), field: "last_name", old_value: a.wrong, new_value: a.right }),
    }, { orderAt: ts(F.ACROSTIC_SYNC_AT) });
  }

  // --- сеансы призрака под i.valts с WS-07
  for (const s of F.GHOST_SESSIONS) {
    const victims = deletable.splice(0, s.deletes);
    if (victims.length !== s.deletes) throw new WorldGenError("core: не хватает строк Ирины для удаления");
    const rows = ghostSession(rng, s, victims);
    const syncKey = s.syncAt ? ts(s.syncAt) : undefined;
    for (const r of rows) ctx.insert("audit_log", r, { orderAt: syncKey ?? ts(r.ts) });

    // Следы сеанса в ЗЕРКАЛЕ: две чашки чабреца и проход Лыкова на КПП-Б0
    const tea = ts(s.tea);
    ctx.insert("purchases", {
      ts: s.tea, merchant: "Кипяток (ГУ, холл)", payer_person_id: F.PERSON.lykov, payer_name: "Лыков А. С.",
      item: "чай с чабрецом", qty: 2, amount: 70,
    }, { orderAt: tea });
    door(ctx, s.lykovIn, F.BADGE.lykov, "КПП-Б0", "вход");
    if (s.n < 7) {
      // Разд. 8.4, Д8: «выход около 03:10» — после конца сеанса, 03:05–03:15
      const out = Math.max(ts(s.end) + 5 * MINUTE, ts(`${s.start.slice(0, 10)} 03:05:00`)) + rng.int(0, 10 * 60) * 1000;
      door(ctx, fmtTs(out), F.BADGE.lykov, "КПП-Б0", "выход");
    }
  }
  if (deletable.length !== 0) throw new WorldGenError(`core: ${deletable.length} запросов Ирины не удалены`);

  // --- подделки призрака в statements (вставлены в сеансах 2 и 3; id — по моменту вставки)
  const forgeries: [number, string, number, string, number, string, string][] = [
    [5203, "2026-11-20 02:24:40", F.PERSON.kravets, "Кравец Н. Н.", F.DOC_REG.forgedA, "2015-02-21 11:20:00", "Видел Сазонова в аэропорту 21.02.2015, был с двумя чемоданами"],
    [5204, "2026-11-20 02:26:10", F.PERSON.lapina, "Лапина Г. П.", F.DOC_REG.forgedA, "2015-02-21 12:05:00", "19.02 в 20:00 грузил чемоданы в машину у подъезда (Портовая, 3)"],
    [5207, "2026-11-21 02:34:50", F.PERSON.pakhomova, "Пахомова З. П.", F.DOC_REG.forgedB, "2015-02-21 15:40:00", "Деньги выдала лично Сазонову, по его распоряжению"],
  ];
  for (const [id, insertedAt, person, text, doc, taken, body] of forgeries) {
    ctx.insert("statements", {
      id, case_id: F.CASE_SAZONOV, doc_reg_no: doc, person_id: person, person_text: text, taken_at: taken,
      taken_by: RATNIKOV_2015, typed_by: NINA_SHORT, text: body, status: "принято",
    }, { orderAt: ts(insertedAt) });
  }

  // --- 21.12: агент синхронизации на WS-07 (сеанса в эту ночь нет)
  door(ctx, "2026-12-21 02:55:00", F.BADGE.lykov, "КПП-Б0", "вход");
  door(ctx, "2026-12-21 02:58:00", F.BADGE.lykov, "Серверная", "вход");
  door(ctx, "2026-12-21 03:21:00", F.BADGE.lykov, "Серверная", "выход");
  door(ctx, "2026-12-21 03:24:00", F.BADGE.lykov, "КПП-Б0", "выход");
  auditFloat(ctx, {
    ts: F.KEY_TIMES.agentInstalled, login: F.LOGIN.lykov, workstation: F.WORKSTATION.serverRoom, action: "UPDATE",
    table_name: "workstations", row_id: F.WORKSTATION.serverRoom, field: "note", old_value: WS07_NOTE_INITIAL,
    new_value: WS07_NOTE_AGENT,
  });

  // --- 22.12, седьмой сеанс: выгрузка дела 15-0219 под логином игрока
  ctx.insert("query_log", {
    logged_at: F.KEY_TIMES.nolExport, login: F.LOGIN.player, terminal: F.WORKSTATION.serverRoom,
    query_text: "SELECT * FROM statements WHERE case_id = '15-0219'", rows_returned: 63, status: "ok",
    ts_real: null, case_id: null, objective_id: null, run_id: null,
  }, { orderAt: ts(F.KEY_TIMES.nolExport) });

  // --- миграция «Сокола»: загрузка в staging, перенос 14.12, расписание финализации
  const jobs: Row[] = [
    { id: 5, run_at: "2026-11-10 01:30:00", action: "LOAD", target: "дамп «Сокола» 2017 → sokol_stage_registry", responsible_login: F.LOGIN.melnik, status: "выполнено" },
    { id: 9, run_at: F.KEY_TIMES.sokolLoad, action: "LOAD", target: "sokol_stage_registry → doc_registry", responsible_login: F.LOGIN.melnik, status: "выполнено" },
    { id: 10, run_at: "2026-12-14 02:10:00", action: "CLEANUP", target: "sokol_stage_registry", responsible_login: F.LOGIN.melnik, status: "выполнено" },
    ...F.MIGRATION_FINAL.map((j) => ({ id: j.id, run_at: j.runAt, action: j.action, target: j.target, responsible_login: F.LOGIN.player, status: "запланировано" })),
  ];
  for (const j of jobs) ctx.insert("migration_jobs", j, { orderAt: ts(String(j.run_at)) });
}

function auditFloat(ctx: WorldContext, row: AuditRow): void {
  ctx.insert("audit_log", row, { orderAt: ts(row.ts) });
}

function door(ctx: WorldContext, at: string, badge: string, doorName: string, direction: string): void {
  ctx.insert("door_access", { ts: at, badge_id: badge, door: doorName, direction, note: null }, { orderAt: ts(at) });
}

/** 183 момента запросов Ирины: будни 10–19, пятничные вечера, до 18.11 */
function irinaQueryTimes(rng: Rng): number[] {
  const lo = ts("2026-09-01 09:00:00");
  const hi = ts("2026-11-18 20:30:00");
  const out: number[] = [];
  while (out.length < IRINA_QUERY_COUNT) {
    const t = Math.floor(rng.float(lo, hi) / 1000) * 1000;
    const h = hourOfDay(t);
    const friday = weekday(t) === 5;
    const ok = (!isWeekend(t) && h >= 10 && h < 19) || (friday && h >= 21 && h < 23);
    if (ok && rng.chance(friday && h >= 21 ? 0.9 : 0.5)) out.push(t);
  }
  return out.sort((a, b) => a - b);
}

/** Действия одного сеанса призрака с моментами (соседние не дальше 4 минут) */
function ghostSession(rng: Rng, s: F.GhostSession, victims: { id: number; at: number }[]): AuditRow[] {
  const base = (at: number, row: Partial<AuditRow>): AuditRow => ({
    ts: fmtTs(at), login: F.LOGIN.irina, workstation: F.WORKSTATION.serverRoom, action: "UPDATE", table_name: "",
    row_id: null, field: null, old_value: null, new_value: null, ...row,
  });
  const day = s.start.slice(0, 10);
  const at = (hms: string) => ts(`${day} ${hms}`);
  const nullMarks = (hms: string, personId: number) =>
    ({ at: at(hms), row: { table_name: "persons", row_id: String(personId), field: "special_marks", old_value: PII_MASK, new_value: null } as Partial<AuditRow> });

  let specials: { at: number; row: Partial<AuditRow> }[] = [];
  if (s.n === 1) {
    specials = [
      nullMarks("02:10:00", F.PERSON.burtsev),
      nullMarks("02:12:40", 1288),
      nullMarks("02:15:10", 1471),
      nullMarks("02:17:55", 2650),
    ];
  } else if (s.n === 2) {
    specials = [
      nullMarks("02:05:30", 3015),
      { at: at("02:14:00"), row: { table_name: "incidents", row_id: String(F.INCIDENT.theftClaim), field: "reported_at", old_value: F.KEY_TIMES.theftClaimOriginal, new_value: F.KEY_TIMES.theftClaimEdited } },
      { at: at("02:22:00"), row: { action: "INSERT", table_name: "persons", row_id: String(F.PERSON.kravets), new_value: "Кравец Николай Николаевич, 1958-11-02" } },
      { at: at("02:24:40"), row: { action: "INSERT", table_name: "statements", row_id: "5203", new_value: "Кравец Н. Н.: видел Сазонова в аэропорту 21.02.2015" } },
      { at: at("02:26:10"), row: { action: "INSERT", table_name: "statements", row_id: "5204", new_value: "Лапина Г. П.: 19.02 в 20:00 грузил чемоданы" } },
      { at: at("02:31:20"), row: { table_name: "sokol_stage_registry", row_id: String(F.DOC_REG.forgedA), field: "doc_type", old_value: "запрос в ГИБДД", new_value: "объяснение" } },
    ];
  } else if (s.n === 3) {
    specials = [
      nullMarks("02:20:15", 3390),
      { at: at("02:31:00"), row: { table_name: "incident_persons", row_id: "1205", field: "person_id", old_value: String(F.PERSON.irina), new_value: null } },
      { at: at("02:34:50"), row: { action: "INSERT", table_name: "statements", row_id: "5207", new_value: "Пахомова З. П.: деньги выдала лично Сазонову" } },
      { at: at("02:44:30"), row: { table_name: "sokol_stage_registry", row_id: String(F.DOC_REG.forgedB), field: "doc_type", old_value: "рапорт о ДТП", new_value: "объяснение" } },
    ];
  }
  const start = ts(s.start);
  const end = ts(s.end);
  const freeCount = s.total - specials.length;
  const fixed = [start, ...specials.map((x) => x.at), end].sort((a, b) => a - b);
  const interior = distributeTimes(rng, fixed, freeCount - 2);
  const freeTimes = [start, ...interior, end].sort((a, b) => a - b);

  const exportTargets = ghostExportTargets(s.n);
  const free: Partial<AuditRow>[] = [
    ...victims.map((v) => ({
      action: "DELETE" as const, table_name: "query_log", row_id: String(v.id),
      old_value: `${F.LOGIN.irina} · ${F.WORKSTATION.irinaDesk} · ${fmtTs(v.at)}`,
    })),
    ...Array.from({ length: s.exports }, (_, i) => ({
      action: "EXPORT" as const, table_name: exportTargets[i % exportTargets.length][0],
      new_value: exportTargets[i % exportTargets.length][1],
    })),
  ];
  if (free.length !== freeTimes.length) throw new WorldGenError(`core: сеанс ${s.n} — ${free.length} действий на ${freeTimes.length} моментов`);
  const rows = [
    ...free.map((r, i) => base(freeTimes[i], r)),
    ...specials.map((x) => base(x.at, x.row)),
  ].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  if (rows.length !== s.total) throw new WorldGenError(`core: сеанс ${s.n} — ${rows.length} действий вместо ${s.total}`);
  for (let i = 1; i < rows.length; i++) {
    const gap = ts(rows[i].ts) - ts(rows[i - 1].ts);
    if (gap > 4 * MINUTE || gap < 0) throw new WorldGenError(`core: сеанс ${s.n}, разрыв ${gap / 1000} с`);
  }
  return rows;
}

function ghostExportTargets(n: number): [string, string][] {
  if (n === 7) {
    return [
      ["statements", "CSV: case_id = '15-0219' (63 строки)"],
      ["query_log", "CSV: login = 'nol'"],
      ["doc_registry", "CSV: year = 2015, reg_no 3300–3330"],
      ["persons", "CSV: id = 9000"],
    ];
  }
  return [
    ["query_log", "CSV: login = 'nol'"],
    ["audit_log", "CSV: login = 'i.valts'"],
    ["statements", "CSV: case_id = '15-0219'"],
  ];
}

/** count моментов внутри интервалов между fixed (пропорционально длине, с дрожанием) */
function distributeTimes(rng: Rng, fixed: number[], count: number): number[] {
  const gaps = fixed.slice(1).map((t, i) => t - fixed[i]);
  const totalSpan = gaps.reduce((a, b) => a + b, 0);
  const shares = gaps.map((g) => (g / totalSpan) * count);
  const alloc = shares.map(Math.floor);
  let rest = count - alloc.reduce((a, b) => a + b, 0);
  const order = shares.map((s, i) => [s - Math.floor(s), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest-- <= 0) break;
    alloc[i]++;
  }
  const out: number[] = [];
  gaps.forEach((g, i) => {
    const k = alloc[i];
    for (let j = 0; j < k; j++) {
      const f = (j + 0.5 + rng.float(-0.3, 0.3)) / k;
      out.push(Math.floor((fixed[i] + g * f) / 1000) * 1000);
    }
  });
  return out;
}

// ==================================================================== исключения для шума

function plantExclusions(ctx: WorldContext): void {
  const ghostOnly = new Set<string>([F.LOGIN.irina, F.LOGIN.player, F.LOGIN.zero, F.LOGIN.gromov, F.LOGIN.test]);
  // Под этими логинами пишут только посадки и патчи (214 действий i.valts к 11.12 — ровно)
  ctx.exclude("audit_log", (r) => ghostOnly.has(String(r.login)), "логины призрака, игрока и сирот");
  ctx.exclude("audit_log", (r) => r.login === F.LOGIN.lykov && r.workstation === F.WORKSTATION.serverRoom, "Лыков на WS-07 — только агент");
  ctx.exclude("query_log", (r) => ghostOnly.has(String(r.login)), "запросы Ирины стёрты, nol и zero — посадки");

  const after = (badge: string, at: string) => (r: Row) => r.badge_id === badge && String(r.ts) > at;
  ctx.exclude("door_access", after(F.BADGE.irina, "2026-11-18 20:00:00"), "Ирина погибла 18.11");
  ctx.exclude("door_access", after(F.BADGE.lykov, "2026-12-22 02:08:00"), "Лыков с 22.12 02:08 живёт в серверной");
  ctx.exclude("door_access", after(F.BADGE.ratnikov, "2026-12-21 16:00:00"), "Ратников в кардиологии с 21.12");
  ctx.exclude("door_access", (r) => r.badge_id === F.BADGE.player, "проходы игрока — только посадки дел");
  ctx.exclude("door_access", (r) => r.badge_id === F.BADGE.dasha && String(r.ts) < "2026-12-01 00:00:00", "Даша в ОЦР с 01.12");
  ctx.exclude("purchases", (r) => r.item === "чай с чабрецом" && Number(r.qty) >= 2, "«две чашки» — только посадки (М15)");

  const groupWords = /Тёплый берег|Ладога|Щит|Kordon|кордон|Возврат|Мельник|Глубина-Строй/;
  ctx.exclude("transactions", (r) => groupWords.test(String(r.counterparty ?? "")), "деньги группы — только посадки");
  const castPhones = new Set<string>(Object.values(F.PHONE));
  ctx.exclude("gs_comms_2015", (r) => castPhones.has(String(r.to_number)), "телефоны каста");
  const eveningFrom = localToUnix(ts("2015-02-19 00:00:00"));
  const eveningTo = localToUnix(ts("2015-02-20 12:00:00"));
  ctx.exclude("gs_comms_2015", (r) => r.from_ext === "2-14" && Number(r.ts_unix) >= eveningFrom && Number(r.ts_unix) < eveningTo, "вечер 19.02 у 2-14 — только посадки");
  // Последний вечер Сазонова (Д6, задание 4 cron): в окне 18:00–03:00 местного только звонок и SMS
  // с 2-14; тогда и ловушка UTC держится — «21:00–22:00» без '+3 hours' (00:00–01:00 местного) пусто
  const nightFrom = localToUnix(ts("2015-02-19 18:00:00"));
  const nightTo = localToUnix(ts("2015-02-20 03:00:00"));
  ctx.exclude("gs_comms_2015", (r) => Number(r.ts_unix) >= nightFrom && Number(r.ts_unix) < nightTo, "вечер 19.02 — только посадки");
  ctx.exclude("plate_reads", (r) => r.plate === F.PLATE.taiga || r.plate === F.PLATE.bastion, "машины «Щита» — только посадки");
}
