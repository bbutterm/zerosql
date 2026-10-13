/**
 * Организации: companies, company_owners, employment, contracts,
 * grant_requests, share_deals, properties.
 *
 * Правила, на которых держатся дела:
 * - «Щит» в названиях больше нигде не встречается; кавычки «» и "" вперемешку.
 * - Владельцев посаженных компаний шум не трогает и сами посаженные компании
 *   владельцами не делает: цепочка «Щита» и цикл 15 ↔ 16 — только посадки c09.
 *   Шумовые владения образуют лес без циклов (владелец-компания старше).
 * - Сумма долей каждой компании — ровно 100 (по текущим строкам).
 * - Договоры компаний группы Kordon не бывают с физлицами (person_id NULL):
 *   рекурсия вниз от Kordon находит единственный договор с человеком — ТБ-2026/117.
 * - 3 % строк employment без person_id (внешние подрядчики) — ловушка NOT IN.
 */
import type { Row, WorldContext } from "../context";
import { WorldGenError, planOrdered } from "../context";
import type { Rng } from "../rng";
import { DAY, fmtDate, parseTs } from "../rng";
import { COMPANY_FORMS, COMPANY_NAME_WORDS, JOB_TITLES } from "../catalog";
import { CASE_START, COMPANY, PLAYER_CONTRACT } from "../facts";
import { noiseState, noiseTarget, type NoiseCompany, type NoisePerson } from "./state";

/** Компании группы Kordon (вниз от Kordon Holdings) — их владения и договоры сажает c09 */
export const GROUP_COMPANIES: ReadonlySet<number> = new Set([
  COMPANY.siyanie, COMPANY.glubina, COMPANY.fund, COMPANY.siyaniePay, COMPANY.kordon, COMPANY.severnyKordon,
  COMPANY.ladogaInvest, COMPANY.ladogaLogistik, COMPANY.kordonServis, COMPANY.shchit, COMPANY.glubinaStroy,
]);

const YEAR = 365.25 * DAY;
const COMPANIES_OPEN = parseTs(CASE_START.c03);
const D7_OPEN = parseTs(CASE_START.c07);
const D9_OPEN = parseTs(CASE_START.c09);

function quoted(rng: Rng, word: string): string {
  return rng.chance(0.62) ? `«${word}»` : `"${word}"`;
}

function randomDate(rng: Rng, lo: number, hi: number): number {
  return Math.floor(rng.float(lo, hi) / DAY) * DAY;
}

function adult(rng: Rng, pool: readonly NoisePerson[], minAge = 21): NoisePerson {
  const now = parseTs("2026-12-01");
  for (let i = 0; i < 50; i++) {
    const p = rng.pick(pool);
    if (now - p.birth >= minAge * YEAR) return p;
  }
  return rng.pick(pool);
}

// ==================================================================== companies

export function generateCompanies(ctx: WorldContext): void {
  const rng = ctx.rng("noise.companies");
  const st = noiseState(ctx);
  for (const p of ctx.planted("companies")) {
    const r = p.row;
    st.companies.push({
      id: Number(r.id), name: String(r.name), kind: String(r.kind), registered: parseTs(String(r.registered_at)),
      liquidated: r.liquidated_at ? parseTs(String(r.liquidated_at)) : null, planted: true,
    });
  }
  const target = noiseTarget(ctx, "companies");
  const words = rng.shuffle(COMPANY_NAME_WORDS);
  let wi = 0;
  for (let n = 0; n < target; n++) {
    const form = rng.weighted(COMPANY_FORMS);
    const director = adult(rng, st.adults, 25);
    let name: string;
    if (form === "ИП") name = `ИП ${director.short}`;
    else {
      const base = wi < words.length ? words[wi++] : `${rng.pick(COMPANY_NAME_WORDS)}-${rng.int(2, 9)}`;
      name = `${form} ${quoted(rng, base)}`;
    }
    if (ctx.isReserved("company_name", name)) name = `${name} ${rng.int(2, 9)}`;
    ctx.reserve("company_name", name);
    const inn = ctx.unique("inn", () =>
      form === "ИП" ? `5190${String(rng.int(0, 99_999_999)).padStart(8, "0")}` : `5190${String(rng.int(0, 999_999)).padStart(6, "0")}`
    );
    const registered = randomDate(rng, parseTs("1996-01-01"), COMPANIES_OPEN - 10 * DAY);
    // Ликвидация — не раньше двух лет после регистрации и не позже старта Д3 (таблица без горизонта)
    const liqFrom = registered + 2 * YEAR;
    const liqTo = COMPANIES_OPEN - 10 * DAY;
    const liquidated = rng.chance(0.08) && liqFrom < liqTo ? randomDate(rng, liqFrom, liqTo) : null;
    const row = ctx.tryRow("companies", () => ({
      id: ctx.nextId("companies"), name, inn, kind: form, registered_at: fmtDate(registered),
      liquidated_at: liquidated && liquidated > registered ? fmtDate(liquidated) : null, director_person_id: director.id,
    }));
    ctx.write("companies", row);
    st.companies.push({
      id: Number(row.id), name, kind: form, registered, liquidated: row.liquidated_at ? liquidated : null, planted: false,
    });
  }
}

function noiseCompanies(ctx: WorldContext): NoiseCompany[] {
  return noiseState(ctx).companies.filter((c) => !c.planted);
}

// ==================================================================== company_owners

const SPLITS: readonly (readonly number[])[] = [[100], [100], [100], [50, 50], [51, 49], [60, 40], [70, 30], [34, 33, 33], [50, 25, 25], [60, 25, 15]];

export function generateCompanyOwners(ctx: WorldContext): void {
  const rng = ctx.rng("noise.company_owners");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "company_owners");
  const plantedOwned = new Set(ctx.planted("company_owners").map((p) => Number(p.row.company_id)));
  const companies = noiseCompanies(ctx).filter((c) => c.kind !== "ИП" && !plantedOwned.has(c.id)).sort((a, b) => a.id - b.id);
  const nominees = rng.sample(st.adults.filter((p) => parseTs("2026-12-01") - p.birth > 30 * YEAR), 3);
  // Компании берутся целиком: срез по объёму не должен отрезать часть текущих долей (сумма — 100)
  const owned = new Map<number, Row[]>();
  let count = 0;
  const seenCompanies: NoiseCompany[] = [];
  for (const c of companies) {
    const split = rng.pick(SPLITS);
    if (count + split.length > target) break;
    const since = fmtDate(c.registered);
    const list: Row[] = [];
    for (const share of split) {
      let ownerType = "person";
      let ownerId: number;
      const roll = rng.next();
      // Владелец-компания — шумовая, с меньшим id (лес без циклов) и уже существовавшая
      const elder = seenCompanies.filter((x) => x.registered <= c.registered);
      if (roll < 0.16 && elder.length > 0) {
        ownerType = "company";
        ownerId = rng.pick(elder).id;
      } else if (roll < 0.3) ownerId = rng.pick(nominees).id;
      else ownerId = adult(rng, st.adults, 23).id;
      list.push({ company_id: c.id, owner_type: ownerType, owner_id: ownerId, share, since, until: null });
    }
    owned.set(c.id, list);
    count += list.length;
    seenCompanies.push(c);
  }
  // История: прежние владельцы (until заполнен) до нужного объёма. Прежний владелец владел
  // долей с её прежнего since до даты передачи, нынешний — с даты передачи: периоды не пересекаются
  const ownedIds = [...owned.keys()];
  let guard = 0;
  while (count < target && guard++ < target * 10 && ownedIds.length > 0) {
    const list = owned.get(rng.pick(ownedIds)) as Row[];
    const victim = rng.pick(list.filter((r) => r.until === null));
    const from = parseTs(String(victim.since));
    const cut = randomDate(rng, from + YEAR, COMPANIES_OPEN - 30 * DAY);
    if (cut <= from + YEAR) continue;
    list.push({
      company_id: victim.company_id, owner_type: "person", owner_id: adult(rng, st.adults, 23).id, share: victim.share,
      since: victim.since, until: fmtDate(cut),
    });
    victim.since = fmtDate(cut);
    count++;
  }
  const rows = [...owned.values()].flat();
  rows.sort((a, b) => String(a.since).localeCompare(String(b.since)) || Number(a.company_id) - Number(b.company_id));
  for (const r of rows) {
    const row = { id: ctx.nextId("company_owners"), ...r };
    if (!ctx.isExcluded("company_owners", row)) ctx.write("company_owners", row);
  }
}

// ==================================================================== employment

/** Посаженные компании, где шум может держать работников */
const EMPLOYER_CORE = [COMPANY.siyanie, COMPANY.glubina, COMPANY.siyaniePay, COMPANY.glubinaStroy, COMPANY.ukShakhtny, COMPANY.medsanchast, COMPANY.mfo, COMPANY.bank];

export function generateEmployment(ctx: WorldContext): void {
  const rng = ctx.rng("noise.employment");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "employment");
  const employers = [
    ...noiseCompanies(ctx).filter((c) => c.kind !== "ИП"),
    ...st.companies.filter((c) => EMPLOYER_CORE.includes(c.id as (typeof EMPLOYER_CORE)[number])),
  ];
  const rows: Row[] = [];
  const workers = rng.shuffle(st.adults.filter((p) => parseTs("2026-12-01") - p.birth < 68 * YEAR));
  for (const p of workers) {
    if (rows.length >= target) break;
    const jobs = rng.weighted([[1, 70], [2, 25], [3, 5]] as const);
    let start = Math.max(p.birth + rng.float(18, 24) * YEAR, parseTs("1998-01-01"));
    for (let j = 0; j < jobs && rows.length < target; j++) {
      const c = rng.pick(employers);
      const from = Math.max(start, c.registered);
      const last = j === jobs - 1;
      let to: number | null = last && rng.chance(0.85) ? null : from + rng.float(0.5, 9) * YEAR;
      if (c.liquidated !== null && (to === null || to > c.liquidated)) to = c.liquidated;
      if (to !== null && to > D7_OPEN - 2 * DAY) to = null;
      if (from > D7_OPEN - 2 * DAY || (to !== null && to <= from)) continue;
      // Глубина-Строй — только 2013–2017
      const gs = c.id === COMPANY.glubinaStroy;
      rows.push({
        person_id: p.id, company_id: c.id, position: gs ? rng.pick(["бетонщик", "монтажник", "крановщик", "прораб", "геодезист", "водитель"]) : rng.pick(JOB_TITLES),
        from_date: fmtDate(from), to_date: to === null ? null : fmtDate(to),
      });
      if (to === null) p.employer = c.id;
      start = (to ?? from) + rng.float(0.05, 1) * YEAR;
    }
  }
  // Внешние подрядчики без person_id: 3 %
  const contractors = Math.round(target * 0.03);
  for (let i = 0; i < contractors && rows.length < target + contractors; i++) {
    const c = rng.pick(employers);
    const from = Math.max(c.registered, parseTs("2018-01-01")) + rng.float(0, 3) * YEAR;
    if (from > D7_OPEN - 2 * DAY) continue;
    rows.push({ person_id: null, company_id: c.id, position: "подрядчик (внешний)", from_date: fmtDate(from), to_date: null });
  }
  rows.sort((a, b) => String(a.from_date).localeCompare(String(b.from_date)));
  // Плавающие посадки (ctx.insert с orderAt, без id) получают id по from_date вперемешку с шумом
  const all = [
    ...ctx.takeDeferred("employment").map((p) => ({ row: p.row, planted: true })),
    ...rows.slice(0, target).filter((r) => !ctx.isExcluded("employment", r)).map((row) => ({ row, planted: false })),
  ].sort((a, b) => String(a.row.from_date).localeCompare(String(b.row.from_date)) || (a.planted === b.planted ? 0 : a.planted ? -1 : 1));
  for (const r of all) ctx.write("employment", { ...r.row, id: ctx.nextId("employment") });
}

// ==================================================================== contracts

const GRANT_SUBJECTS = [
  "грант: детский дом № 1, ремонт спальных корпусов", "грант: хоккейная секция «Норд», форма и лёд",
  "грант: ДК «Полярник», новогодняя программа", "грант: школа № 2, компьютерный класс",
  "грант: секция лыжных гонок, инвентарь", "грант: дом престарелых «Сосны», тёплые вещи",
];
const CONTRACT_SUBJECTS = [
  "поставка оборудования", "охрана объекта", "аренда помещения", "подряд на ремонт кровли", "транспортные услуги",
  "поставка топлива", "уборка снега", "обслуживание котельной", "консультационные услуги", "поставка продуктов",
];

export function generateContracts(ctx: WorldContext): void {
  const rng = ctx.rng("noise.contracts");
  const st = noiseState(ctx);
  ctx.reserve("contract_no", PLAYER_CONTRACT.docNo);
  const target = noiseTarget(ctx, "contracts") - 1; // +1 — договор игрока (патч p0.player)
  const parties = st.companies.filter((c) => c.id !== COMPANY.vozvrat && c.id !== COMPANY.ipMelnik);
  const rows: { row: Row; at: number }[] = [];
  for (let n = 0; n < target; n++) {
    const c = rng.pick(parties);
    const group = GROUP_COMPANIES.has(c.id);
    const fund = c.id === COMPANY.fund;
    const lo = Math.max(c.registered, parseTs("2013-01-01"));
    const hi = Math.min(c.liquidated ?? Infinity, D9_OPEN - 3 * DAY);
    if (hi <= lo) {
      n--;
      continue;
    }
    const at = randomDate(rng, lo, hi);
    const year = new Date(at).getUTCFullYear();
    const prefix = companyPrefix(c);
    const docNo = ctx.unique("contract_no", () => `${prefix}-${year}/${String(rng.int(1, 240)).padStart(3, "0")}`);
    const withPerson = !group && rng.chance(0.22);
    const person = withPerson ? adult(rng, st.adults, 20) : null;
    const counterparty = fund
      ? rng.pick(["Детский дом № 1", "Хоккейная секция «Норд»", "ДК «Полярник»", "Школа № 2", "Дом престарелых «Сосны»", "Секция лыжных гонок"])
      : person
        ? person.short
        : rng.pick(st.companies.filter((x) => x.id !== c.id)).name;
    rows.push({
      at,
      row: {
        doc_no: docNo, company_id: c.id, person_id: person?.id ?? null, counterparty_text: counterparty,
        subject: fund ? rng.pick(GRANT_SUBJECTS) : person ? "договор подряда с физлицом" : rng.pick(CONTRACT_SUBJECTS),
        signed_at: fmtDate(at), clause: rng.chance(0.12) ? "п. 5.1 Стороны освобождаются от ответственности при форс-мажоре" : null,
        amount: Math.round(rng.float(20, 4000)) * 1000,
      },
    });
  }
  rows.sort((a, b) => a.at - b.at);
  for (const r of rows) if (!ctx.isExcluded("contracts", r.row)) ctx.write("contracts", r.row);
}

function companyPrefix(c: NoiseCompany): string {
  const known: Record<number, string> = { 1: "СЯ", 2: "ГЛ", 3: "ТБ", 4: "СП", 12: "KH", 13: "СК", 14: "ЛИ", 15: "ЛЛ", 16: "КС", 17: "ЩТ", 18: "ГС" };
  if (known[c.id]) return known[c.id];
  const word = c.name.replace(/^(ООО|АО|ПАО|АНО|МУП|ТСЖ|ИП|МФО|Банк|УК)\s*/, "").replace(/[«»"]/g, "");
  const letters = word.split(/[\s-]+/).map((w) => w[0]).join("").toUpperCase();
  return (letters.length >= 2 ? letters : (word.slice(0, 2) || "ДГ").toUpperCase()).slice(0, 3);
}

// ==================================================================== grant_requests

const GRANT_ORGS = [
  "Детский дом № 1", "Хоккейная секция «Норд»", "ДК «Полярник»", "Школа № 2", "Школа № 5", "Дом престарелых «Сосны»",
  "Общество рыбаков «Створ»", "Секция лыжных гонок", "Музыкальная школа", "Совет ветеранов «Глубина-Строя»",
];
const GRANT_TEXTS = [
  "просим помочь с ремонтом", "нужна новая форма для команды", "просим оплатить поездку на соревнования",
  "требуется материальная помощь к зиме", "просим оплатить новогодние подарки детям", "нужны компьютеры для класса",
];

export function generateGrantRequests(ctx: WorldContext): void {
  const rng = ctx.rng("noise.grant_requests");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "grant_requests");
  const rows: { row: Row; at: number }[] = [];
  for (let n = 0; n < target; n++) {
    const at = Math.floor(rng.float(parseTs("2015-04-01"), D9_OPEN - 8 * DAY) / 1000) * 1000;
    const recent = at > D9_OPEN - 40 * DAY;
    rows.push({
      at,
      row: ctx.tryRow("grant_requests", () => ({
        requested_at: fmtDate(at) + ` ${String(rng.int(9, 17)).padStart(2, "0")}:${String(rng.int(0, 59)).padStart(2, "0")}:${String(rng.int(0, 59)).padStart(2, "0")}`,
        requester_person_id: adult(rng, st.adults, 25).id, org_text: rng.pick(GRANT_ORGS), request_text: rng.pick(GRANT_TEXTS),
        status: recent ? rng.pick(["на рассмотрении", "исполнено"]) : rng.weighted([["исполнено", 62], ["отклонено", 30], ["отозвано", 8]] as const),
      })),
    });
  }
  // Плавающие посадки (тайники, EASTER_EGGS.md № 18–19) встают по времени вместе с шумом
  const floating = ctx.takeDeferred("grant_requests").map((p) => ({ at: p.key ?? parseTs(String(p.row.requested_at)), row: p.row, planted: true }));
  const all = [...floating, ...rows.map((r) => ({ ...r, planted: false }))];
  all.sort((a, b) => a.at - b.at || (a.planted === b.planted ? 0 : a.planted ? -1 : 1));
  for (const r of all) ctx.write("grant_requests", { ...r.row, id: ctx.nextId("grant_requests") });
}

// ==================================================================== share_deals

/**
 * Реестр акционеров «Сияния» 2015–2016: номера СД-NNNN идут по дате. Сделки
 * Kordon сажает c09 с фиксированными номерами — шум встаёт между ними.
 */
export function generateShareDeals(ctx: WorldContext): void {
  const rng = ctx.rng("noise.share_deals");
  const st = noiseState(ctx);
  const planted = ctx.planted("share_deals").map((p) => ({
    id: Number(String(p.row.deal_no).replace(/\D/g, "")),
    key: parseTs(String(p.row.deal_date)),
  }));
  for (const p of planted) ctx.reserve("deal_no", `СД-${String(p.id).padStart(4, "0")}`);
  const total = 300;
  const lo = parseTs("2015-01-12");
  const hi = parseTs("2016-12-28");
  const buyers = noiseCompanies(ctx).filter((c) => c.kind !== "ИП" && c.registered < hi);
  const segments = planOrdered(planted, 1, total, lo - DAY, hi + DAY);
  for (const seg of segments) {
    const days = seg.ids.map(() => randomDate(rng, Math.max(seg.keyLo, lo), Math.min(seg.keyHi, hi) + DAY - 1)).sort((a, b) => a - b);
    seg.ids.forEach((n, i) => {
      const at = Math.min(Math.max(days[i], seg.keyLo), seg.keyHi);
      const shares = rng.int(10, 400) * 100;
      const price = 52 + ((at - lo) / (hi - lo)) * 30 + rng.float(-3, 3);
      const row = ctx.tryRow("share_deals", () => ({
        deal_no: `СД-${String(n).padStart(4, "0")}`, deal_date: fmtDate(at), buyer_company_id: rng.pick(buyers).id,
        seller_text: rng.chance(0.55) ? "физлица (миноритарии)" : rng.chance(0.5) ? adult(rng, st.adults, 30).short : rng.pick(buyers).name,
        shares, amount: Math.round(shares * price / 100) * 100,
      }));
      ctx.write("share_deals", row);
    });
  }
  if (segments.reduce((a, s) => a + s.ids.length, 0) + planted.length < total) {
    throw new WorldGenError("share_deals: не хватает номеров");
  }
}

// ==================================================================== properties

export function generateProperties(ctx: WorldContext): void {
  const rng = ctx.rng("noise.properties");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "properties");
  const grantors = noiseCompanies(ctx).filter((c) => c.kind !== "ИП");
  const rows: { row: Row; at: number }[] = [];
  const addresses = rng.shuffle(st.addresses.filter((a) => !ctx.planted("addresses").some((p) => Number(p.row.id) === a.id)));
  let i = 0;
  while (rows.length < target) {
    const a = addresses[i % addresses.length];
    i++;
    if (i > addresses.length * 3) throw new WorldGenError("properties: не хватает адресов");
    const residents = st.residents.get(a.id) ?? [];
    const ownerPerson = residents.length > 0 && rng.chance(0.85)
      ? st.byId.get(rng.pick(residents))
      : adult(rng, st.adults, 22);
    if (!ownerPerson || ownerPerson.dup) continue;
    const basis = rng.weighted([["купля-продажа", 46], ["приватизация", 24], ["наследство", 14], ["дарение", 7], ["мена", 3], ["передача от работодателя", 6]] as const);
    const lo = Math.max(ownerPerson.birth + 18 * YEAR, parseTs(basis === "приватизация" ? "1993-01-01" : "1997-01-01"));
    const hi = basis === "приватизация" ? parseTs("2012-12-31") : D7_OPEN - 3 * DAY;
    if (hi <= lo) continue;
    const at = randomDate(rng, lo, hi);
    const grantor = basis === "передача от работодателя" ? rng.pick(grantors) : null;
    const text = a.apt ? `${a.street}, ${a.house}-${a.apt}` : `${a.street}, ${a.house}`;
    const row = {
      address_id: a.id, address_text: text, owner_person_id: ownerPerson.id, acquired_at: fmtDate(at), basis,
      grantor_company_id: grantor?.id ?? null,
    };
    if (ctx.isExcluded("properties", row)) continue;
    rows.push({ row, at });
  }
  rows.sort((a, b) => a.at - b.at);
  for (const r of rows) ctx.write("properties", { id: ctx.nextId("properties"), ...r.row });
}
