/**
 * ЗЕРКАЛО «Сияния» и оператора: phones, accounts, transactions,
 * messenger_events, door_access, purchases.
 *
 * - Платежи: зарплаты 5-го (аванс) и 20-го, пенсии «СФР» 4-го, ЖКХ, карта,
 *   СБП между родственниками, МФО «Деньги Сразу» у части клиентов.
 *   Деньги группы Kordon и фонда — только посадки.
 * - Связь: у каждого 5–30 постоянных контактов, семейные кластеры; три
 *   строки «из будущего» от сбоя часов (2099 и ровно год вперёд).
 * - СКУД ГУ: контур Б0 (КПП-Б0, Серверная, Архив, лестницы) — все события,
 *   КПП-1 — гостевые круглосуточно, служебные только 20:00–08:00. Будни
 *   каста днём; ночей каста в шуме нет (их сажают дела). 2 % забытых
 *   выходов — только у шумовых сотрудников.
 */
import type { Row, WorldContext } from "../context";
import { WorldGenError, flushByTime, sampleTimes } from "../context";
import { DAY, HOUR, MINUTE, fmtDate, fmtTs, hourOfDay, isWeekend, parseTs, startOfDay, weekday } from "../rng";
import { fictionalPhone } from "../pools";
import { BANKS, CELL_CODES, SHOPS, messagingWeight, officeWeight, shoppingWeight, type District } from "../catalog";
import { BADGE, CASE_START } from "../facts";
import { GROUP_COMPANIES } from "./org";
import { noiseState, noiseTarget, type NoisePerson } from "./state";

const YEAR = 365.25 * DAY;

// ==================================================================== phones

export function generatePhones(ctx: WorldContext): void {
  const rng = ctx.rng("noise.phones");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "phones");
  const open = parseTs(CASE_START.c08) - 3 * DAY;
  const companies = st.companies.filter((c) => !c.planted && !c.liquidated);
  const companyPhones = Math.min(companies.length, Math.round(target * 0.07));
  const people = rng.shuffle(st.adults.filter((p) => parseTs("2026-12-01") - p.birth > 14 * YEAR));
  const rows: { key: number; row: Row }[] = [];
  for (let i = 0; i < target - companyPhones && i < people.length; i++) {
    const p = people[i];
    const msisdn = ctx.unique("phone", () => fictionalPhone(rng));
    const reg = Math.floor(rng.float(Math.max(p.birth + 14 * YEAR, parseTs("2008-01-01")), open) / DAY) * DAY;
    rows.push({ key: reg, row: { msisdn, person_id: p.id, company_id: null, registered_at: fmtDate(reg) } });
    st.phoneOf.set(p.id, msisdn);
  }
  for (const c of rng.sample(companies, target - rows.length)) {
    const msisdn = ctx.unique("phone", () => fictionalPhone(rng));
    const reg = Math.floor(rng.float(Math.max(c.registered, parseTs("2008-01-01")), open) / DAY) * DAY;
    rows.push({ key: reg, row: { msisdn, person_id: null, company_id: c.id, registered_at: fmtDate(reg) } });
  }
  // Плавающие посадки (номер Деда Мороза, EASTER_EGGS.md № 21) встают по дате регистрации:
  // первый взгляд на phones (LIMIT 10/20) их не показывает
  const floating = ctx.takeDeferred("phones").map((p) => ({ key: p.key ?? parseTs(String(p.row.registered_at)), row: p.row, planted: true }));
  const all = [...floating, ...rows.map((r) => ({ ...r, planted: false }))];
  all.sort((a, b) => a.key - b.key || (a.planted === b.planted ? 0 : a.planted ? -1 : 1));
  for (const r of all) if (r.planted || !ctx.isExcluded("phones", r.row)) ctx.write("phones", r.row);
}

// ==================================================================== accounts

export function generateAccounts(ctx: WorldContext): void {
  const rng = ctx.rng("noise.accounts");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "accounts");
  const open = parseTs(CASE_START.c07) - 3 * DAY;
  const companies = st.companies.filter((c) => !c.planted || (!GROUP_COMPANIES.has(c.id) && !ctx.planted("accounts").some((a) => Number(a.row.holder_company_id) === c.id) && c.id !== 61 && c.id !== 60));
  const companyCount = Math.min(companies.length, Math.round(target * 0.11));
  const people = rng.shuffle(st.adults);
  const rows: { key: number; row: Row }[] = [];
  const newId = () => ctx.unique("account", () => `ACC-${String(rng.int(10_100, 49_999)).padStart(5, "0")}`);
  for (let i = 0; i < target - companyCount && i < people.length; i++) {
    const p = people[i];
    const id = newId();
    const opened = Math.floor(rng.float(Math.max(p.birth + 16 * YEAR, parseTs("2009-01-01")), open) / DAY) * DAY;
    rows.push({ key: opened, row: { id, holder_person_id: p.id, holder_company_id: null, holder_name: p.short, bank: rng.weighted(BANKS), opened_at: fmtDate(opened) } });
    st.accountOf.set(p.id, id);
  }
  for (const c of rng.sample(companies, target - rows.length)) {
    const id = newId();
    const opened = Math.floor(rng.float(Math.max(c.registered, parseTs("2009-01-01")), Math.max(open, c.registered + DAY)) / DAY) * DAY;
    rows.push({ key: opened, row: { id, holder_person_id: null, holder_company_id: c.id, holder_name: c.name, bank: rng.weighted(BANKS), opened_at: fmtDate(Math.min(opened, open)) } });
    st.companyAccounts.set(c.id, id);
  }
  rows.sort((a, b) => a.key - b.key);
  for (const r of rows) if (!ctx.isExcluded("accounts", r.row)) ctx.write("accounts", r.row);
}

// ==================================================================== transactions

const TX_FROM = parseTs("2025-06-01 00:00:00");
const TX_TO = parseTs("2027-01-11 11:00:00");

function monthly(day: number, f: (at: number) => void): void {
  for (let y = 2025, m = 5; ; ) {
    let at = Date.UTC(y, m, day);
    // Выплата в выходной уходит на пятницу
    while (weekday(at) === 0 || weekday(at) === 6) at -= DAY;
    if (at > TX_TO) break;
    if (at >= TX_FROM) f(at);
    m++;
    if (m === 12) {
      m = 0;
      y++;
    }
  }
}

export function generateTransactions(ctx: WorldContext): void {
  const rng = ctx.rng("noise.transactions");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "transactions");
  const holders = rng.shuffle(st.adults.filter((p) => st.accountOf.has(p.id)));
  const out: { key: number; row: Row }[] = [];
  const add = (at: number, account: string, amount: number, counterparty: string, cpAcc: string | null, channel: string, purpose: string) => {
    const t = Math.floor(at / 1000) * 1000;
    const row = { ts: fmtTs(t), account_id: account, amount, counterparty, counterparty_account: cpAcc, channel, purpose };
    if (!ctx.isExcluded("transactions", row)) out.push({ key: t, row });
  };
  const nonGroup = st.companies.filter((c) => !GROUP_COMPANIES.has(c.id) && c.id !== 60 && c.id !== 61 && c.id !== 3);
  let i = 0;
  // Зарплаты 5-го (аванс) и 20-го
  for (; i < 34 && i < holders.length; i++) {
    const p = holders[i];
    const employer = nonGroup.find((c) => c.id === p.employer) ?? rng.pick(nonGroup.filter((c) => !c.planted));
    const salary = Math.round(rng.float(38, 115)) * 1000;
    const acc = st.accountOf.get(p.id) as string;
    monthly(5, (d) => add(d + rng.float(9, 12) * HOUR, acc, Math.round(salary * 0.4), employer.name, st.companyAccounts.get(employer.id) ?? null, "перевод", "аванс"));
    monthly(20, (d) => add(d + rng.float(9, 12) * HOUR, acc, Math.round(salary * 0.6), employer.name, st.companyAccounts.get(employer.id) ?? null, "перевод", "заработная плата"));
  }
  // Пенсии «СФР» 4-го (название контрагента одинаковое во всех строках)
  const pensioners = holders.filter((p) => parseTs("2026-12-01") - p.birth >= 62 * YEAR).slice(0, 14);
  for (const p of pensioners) {
    const acc = st.accountOf.get(p.id) as string;
    const pension = Math.round(rng.float(17, 31) * 100) * 10;
    monthly(4, (d) => add(d + rng.float(8, 11) * HOUR, acc, pension, "СФР", null, "перевод", "пенсия"));
  }
  // ЖКХ ежемесячно
  const utilities = ["УК «Шахтный»", "Северэнерго", "Водоканал «Полынья»", "УК «Гавань-Дом»", "УК «Старый город»"];
  for (const p of holders.slice(i, i + 40)) {
    const acc = st.accountOf.get(p.id) as string;
    const uk = rng.pick(utilities);
    const bill = Math.round(rng.float(3.5, 9.8) * 100) * 10;
    monthly(rng.int(10, 25), (d) => add(d + rng.float(10, 22) * HOUR, acc, -bill - rng.int(0, 400), uk, null, rng.pick(["СБП", "карта"]), "оплата ЖКУ"));
  }
  i += 40;
  // Клиенты МФО «Деньги Сразу» (шум, понадобится в Д8)
  for (const p of holders.slice(i, i + 22)) {
    const acc = st.accountOf.get(p.id) as string;
    const loan = Math.round(rng.float(5, 60)) * 1000;
    let at = rng.float(TX_FROM, TX_TO - 120 * DAY);
    add(at, acc, loan, "МФО «Деньги Сразу»", null, "перевод", "выдача займа");
    for (let k = rng.int(2, 6); k > 0; k--) {
      at += rng.float(12, 35) * DAY;
      add(at, acc, -Math.round(loan / 3 + rng.float(500, 4000)), "МФО «Деньги Сразу»", null, "СБП", "погашение займа");
    }
  }
  i += 22;
  // Карта и СБП — до объёма
  const shops = SHOPS.filter((s) => !s.staffOnly);
  const everyday = holders.slice(i);
  const times = sampleTimes(rng, Math.max(0, target - out.length), TX_FROM, TX_TO, shoppingWeight);
  for (const t of times) {
    const p = rng.pick(everyday.length > 0 ? everyday : holders);
    const acc = st.accountOf.get(p.id) as string;
    if (rng.chance(0.72)) {
      const shop = rng.pick(shops);
      const [item, price] = rng.pick(shop.items);
      add(t, acc, -(price * rng.int(1, 3) + rng.int(0, 900)), shop.merchant, null, "карта", item);
    } else {
      const other = rng.pick(holders);
      const sum = Math.round(rng.float(3, 150)) * 100;
      const sign = rng.chance(0.5) ? 1 : -1;
      add(t, acc, sign * sum, other.short, st.accountOf.get(other.id) ?? null, "СБП", sign > 0 ? "перевод по номеру телефона" : rng.pick(["перевод по номеру телефона", "долг", "на продукты"]));
    }
  }
  out.sort((a, b) => a.key - b.key);
  flushByTime(ctx, "transactions", out.slice(0, target), "ts");
}

// ==================================================================== messenger_events

const MSG_FROM = parseTs("2026-09-01 00:00:00");
const MSG_TO = parseTs("2027-01-11 11:00:00");
/** Потолок часов Д8 (case-08-prizrak, clock.cap) */
const D8_CLOCK_CAP = "2026-12-24 13:00:00";

export function generateMessenger(ctx: WorldContext): void {
  const rng = ctx.rng("noise.messenger");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "messenger_events");
  const owners = rng.sample(st.adults.filter((p) => st.phoneOf.has(p.id)), 280);
  const byHousehold = new Map<number, NoisePerson[]>();
  for (const p of st.adults) {
    if (!st.phoneOf.has(p.id)) continue;
    const list = byHousehold.get(p.household);
    if (list) list.push(p);
    else byHousehold.set(p.household, [p]);
  }
  const contacts = new Map<number, NoisePerson[]>();
  const allWithPhone = st.adults.filter((p) => st.phoneOf.has(p.id));
  for (const p of owners) {
    const family = (byHousehold.get(p.household) ?? []).filter((x) => x.id !== p.id);
    const sameDistrict = allWithPhone.filter((x) => x.district === p.district && x.id !== p.id);
    const k = rng.int(5, 30);
    contacts.set(p.id, [...family, ...rng.sample(sameDistrict, Math.max(0, k - family.length))]);
  }
  const cell = (p: NoisePerson) => `${rng.pick(CELL_CODES[(p.district ?? "Старый город") as District])}-${String(rng.int(1, 24)).padStart(2, "0")}`;
  // Пока идут часы Д8 (24.12 09:00–13:00), шум молчит: ★М17 «последнее событие каждого
  // номера» за дело не меняется. Окно сдвигаем за потолок — поток rng и число строк те же
  const d8From = parseTs(CASE_START.c08);
  const d8To = parseTs(D8_CLOCK_CAP);
  const times = sampleTimes(rng, target, MSG_FROM, MSG_TO, messagingWeight)
    .map((t) => (t >= d8From && t <= d8To ? t + (d8To - d8From) + MINUTE : t))
    .sort((a, b) => a - b);
  const out: { key: number; row: Row }[] = [];
  // Сбой часов: три строки «из будущего» (настоящая — только у Ирины). Все три созданы
  // до старта Д8 (горизонт — created_at): в Д8 их видно вместе с голосовым Ирины
  const glitchBefore = parseTs(CASE_START.c08) - 3 * DAY;
  const early = times.findIndex((t) => t >= glitchBefore);
  const span = early < 0 ? times.length : early;
  const glitch = new Map<number, string>([
    [rng.int(Math.floor(span * 0.05), Math.floor(span * 0.3)), "2099-01-01 00:00:00"],
    [rng.int(Math.floor(span * 0.35), Math.floor(span * 0.6)), "2099-12-31 23:59:00"],
    [rng.int(Math.floor(span * 0.65), span - 1), "year"],
  ]);
  times.forEach((t, idx) => {
    const row = ctx.maybeRow("messenger_events", () => {
      const from = rng.pick(owners);
      const to = rng.pick(contacts.get(from.id) as NoisePerson[]);
      const kind = rng.weighted([["текст", 55], ["голос", 14], ["фото", 14], ["звонок", 17]] as const);
      const g = glitch.get(idx);
      const ts = g === undefined ? fmtTs(t) : g === "year" ? fmtTs(Date.UTC(new Date(t).getUTCFullYear() + 1, new Date(t).getUTCMonth(), new Date(t).getUTCDate()) + (t - startOfDay(t))) : g;
      return {
        ts, created_at: fmtTs(t), from_msisdn: st.phoneOf.get(from.id), to_msisdn: st.phoneOf.get(to.id), kind,
        size_kb: kind === "голос" ? rng.int(12, 900) : kind === "фото" ? rng.int(250, 4200) : null,
        cell_id: cell(from), status: rng.weighted([["прочитано", 70], ["доставлено", 25], ["не доставлено", 5]] as const),
      };
    });
    if (row) out.push({ key: t, row });
  });
  flushByTime(ctx, "messenger_events", out, "created_at");
}

// ==================================================================== door_access

const DOOR_FROM = parseTs("2026-09-01 00:00:00");
const DOOR_TO = parseTs("2027-01-11 11:00:00");

interface B0Person {
  badge: string;
  kind: "ocr" | "archive" | "it";
  from?: number;
  until?: number;
  cast: boolean;
  /** Дни без выхода на работу (командировка, больничный — разд. 8.4, Д8) */
  absent?: string[];
}

const HOLIDAYS = new Set(["2026-11-04", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-05", "2027-01-06", "2027-01-07", "2027-01-08"]);

export function generateDoorAccess(ctx: WorldContext): void {
  const rng = ctx.rng("noise.door_access");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "door_access");
  const people: B0Person[] = [
    { badge: BADGE.ratnikov, kind: "ocr", cast: true },
    { badge: BADGE.nina, kind: "archive", cast: true, absent: ["2026-11-27"] },
    { badge: BADGE.melnik, kind: "it", cast: true, absent: ["2026-12-03", "2026-12-09"] },
    { badge: BADGE.lykov, kind: "it", cast: true },
    { badge: BADGE.irina, kind: "ocr", cast: true, until: parseTs("2026-11-18 20:00:00") },
    { badge: BADGE.dasha, kind: "ocr", cast: true, from: parseTs("2026-12-01 00:00:00") },
    ...st.staff.filter((s) => !s.cast && s.dept === "ИТ-отдел" && s.fired === null).map((s) => ({ badge: s.badge, kind: "it" as const, cast: false })),
  ];
  const visitors = st.staff.filter((s) => !s.cast && s.fired === null && ["ОУР", "следственный отдел", "дежурная часть", "канцелярия"].includes(s.dept));
  const out: { key: number; row: Row }[] = [];
  const ev = (t: number, badge: string | null, door: string, direction: string, note: string | null = null) => {
    const ts = Math.floor(t / 1000) * 1000;
    const row = { ts: fmtTs(ts), badge_id: badge, door, direction, note };
    if (!ctx.isExcluded("door_access", row)) out.push({ key: ts, row });
  };
  const at = (day: number, h1: number, h2: number) => day + rng.float(h1, h2) * HOUR;
  /**
   * Визиты одного человека за день не пересекаются (иначе в ленте «вход, вход,
   * выход, выход» и LEAD по пропуску врёт): окно [t, t + длительность] берётся,
   * только если оно не задевает уже занятые с запасом в 3 минуты.
   */
  const visits = (day: number, k: number, h1: number, h2: number, minLen: number, maxLen: number, busy: [number, number][]) => {
    const out: [number, number][] = [];
    for (let i = 0; i < k; i++) {
      const t = at(day, h1, h2);
      const end = t + rng.float(minLen, maxLen) * MINUTE;
      if ([...busy, ...out].some(([a, b]) => t < b + 3 * MINUTE && end > a - 3 * MINUTE)) continue;
      out.push([t, end]);
    }
    return out.sort((a, b) => a[0] - b[0]);
  };
  for (let day = startOfDay(DOOR_FROM); day < DOOR_TO; day += DAY) {
    if (isWeekend(day) || HOLIDAYS.has(fmtDate(day))) continue;
    for (const p of people) {
      if ((p.from && day < startOfDay(p.from)) || (p.until && day > p.until) || p.absent?.includes(fmtDate(day))) continue;
      if (!rng.chance(p.cast ? 0.93 : 0.85)) continue;
      const forget = !p.cast && rng.chance(0.02);
      if (p.kind === "it" && !p.cast) {
        // Шумовой ИТ: визиты в серверную
        for (const [t, out1] of visits(day, rng.weighted([[0, 45], [1, 45], [2, 10]] as const), 9.5, 17, 15, 80, [])) {
          ev(t, p.badge, "КПП-Б0", "вход");
          ev(t + rng.float(1, 2) * MINUTE, p.badge, "Серверная", "вход");
          ev(out1, p.badge, "Серверная", "выход");
          if (!forget) ev(out1 + rng.float(1, 3) * MINUTE, p.badge, "КПП-Б0", "выход");
        }
        continue;
      }
      const tin = p.kind === "archive" ? at(day, 7.8, 8.6) : at(day, 8.25, 9.6);
      const tout = at(day, 17.3, 19.4);
      // До 08:00 служебный пропуск фиксирует и КПП-1 (ночное окно 20:00–08:00)
      if (tin < day + 8 * HOUR) ev(tin - rng.float(2, 4) * MINUTE, p.badge, "КПП-1", "вход");
      ev(tin, p.badge, "КПП-Б0", "вход");
      if (p.kind === "archive") {
        ev(tin + rng.float(1, 3) * MINUTE, p.badge, "Архив", "вход");
        ev(tout - rng.float(2, 6) * MINUTE, p.badge, "Архив", "выход");
      }
      // Обед вне контура Б0; серверная — только пока человек внутри контура
      const lunch: [number, number][] = rng.chance(0.18) ? visits(day, 1, 12.4, 12.9, 30, 55, []) : [];
      if (p.kind === "it") {
        for (const [t, end] of visits(day, rng.int(1, 2), 10, 16.5, 10, 70, lunch)) {
          ev(t, p.badge, "Серверная", "вход");
          ev(end, p.badge, "Серверная", "выход");
        }
      }
      for (const [t, back] of lunch) {
        ev(t, p.badge, "КПП-Б0", "выход");
        ev(back, p.badge, "КПП-Б0", "вход");
      }
      if (rng.chance(0.15)) ev(at(day, 10, 17), p.badge, rng.pick(["Лестница А", "Лестница Б"]), rng.pick(["вход", "выход"]));
      if (!forget) ev(tout, p.badge, "КПП-Б0", "выход");
    }
    // Сотрудники других отделов — в архив
    for (let k = rng.weighted([[0, 45], [1, 40], [2, 15]] as const); k > 0 && visitors.length > 0; k--) {
      const s = rng.pick(visitors);
      const t = at(day, 9.5, 17.5);
      ev(t, s.badge, "КПП-Б0", "вход");
      ev(t + 60_000, s.badge, "Архив", "вход");
      const back = t + rng.float(8, 45) * MINUTE;
      ev(back, s.badge, "Архив", "выход");
      // Редкие гости контура выходы не забывают: иначе LEAD растянул бы визит на недели
      ev(back + rng.float(1, 3) * MINUTE, s.badge, "КПП-Б0", "выход");
    }
  }
  // Гости КПП-1 (круглосуточно) — до объёма. Будни сотрудников должны оставлять им место:
  // обрезать ленту по времени нельзя (пропали бы события конца сезона)
  if (out.length > target - 150) throw new WorldGenError(`door_access: будних событий ${out.length} при цели ${target}`);
  while (out.length + 1 < target) {
    const t = Math.floor(rng.float(DOOR_FROM, DOOR_TO) / 1000) * 1000;
    if (!rng.chance(Math.max(0.05, officeWeight(t)))) continue;
    // Принимающий — шумовой сотрудник в штате на этот день: гость «к Вальц И. П.» после
    // её смерти или «к Ратникову» в кардиологии был бы ложной уликой
    const hosts = st.staff.filter((s) => !s.cast && s.hired <= t && (s.fired === null || s.fired > t));
    if (hosts.length === 0) continue;
    const badge = ctx.unique("badge", () => `G-${String(rng.int(1, 9999)).padStart(4, "0")}`);
    const guest = rng.pick(st.adults);
    const host = rng.pick(hosts);
    const note = `гость: ${guest.short} (к ${host.short})`;
    ev(t, badge, "КПП-1", "вход", note);
    ev(t + rng.float(15, 120) * MINUTE, badge, "КПП-1", "выход", note);
  }
  out.sort((a, b) => a.key - b.key);
  flushByTime(ctx, "door_access", out, "ts");
}

// ==================================================================== purchases

const BUY_FROM = parseTs("2026-09-01 00:00:00");
const BUY_TO = parseTs("2027-01-11 11:00:00");

export function generatePurchases(ctx: WorldContext): void {
  const rng = ctx.rng("noise.purchases");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "purchases");
  const staffPeople = st.staff.filter((s) => !s.cast && s.fired === null).map((s) => st.byId.get(s.personId)).filter((p): p is NoisePerson => !!p);
  const times = sampleTimes(rng, target, BUY_FROM, BUY_TO, shoppingWeight);
  const out: { key: number; row: Row }[] = [];
  for (const t of times) {
    const row = ctx.maybeRow("purchases", (attempt) => {
      const h = hourOfDay(t);
      const inOffice = h >= 7.5 && h < 21 && !isWeekend(t);
      const shop = rng.weighted(SHOPS.filter((s) => !s.staffOnly || inOffice).map((s) => [s, s.weight] as const));
      const payer = shop.staffOnly ? rng.pick(staffPeople) : rng.pick(st.adults);
      const [item, price] = rng.pick(shop.items);
      const qty = attempt > 5 ? 1 : rng.weighted([[1, 85], [2, 12], [3, 3]] as const);
      return { ts: fmtTs(t), merchant: shop.merchant, payer_person_id: payer.id, payer_name: payer.short, item, qty, amount: price * qty };
    });
    if (row) out.push({ key: t, row });
  }
  flushByTime(ctx, "purchases", out, "ts");
}

