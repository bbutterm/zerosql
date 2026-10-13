/**
 * ЗЕРКАЛО, городские источники: vehicles, cameras, plate_reads,
 * intercom_events, heat_readings, delivery_orders, transit_taps,
 * zags_deaths, morgue_records, hospital_admissions.
 *
 * - Реестр ТС с историей: у проданной машины две строки (sold_at у прежнего
 *   владельца). Марки вымышлены и записаны по-разному.
 * - Камеры: пики 7–9 и 17–19, выходные слабее, ночью — такси, снегоуборщики,
 *   служебные; в мороз машин меньше. 0,5 % гомоглифов OCR.
 * - Столбцы-даты — 'YYYY-MM-DD', дата-время — с секундами. В таблицах без
 *   горизонта нет дат позже старта дела, которое их открывает.
 */
import type { Row, WorldContext } from "../context";
import { WorldGenError, flushByTime, sampleTimes } from "../context";
import type { Rng } from "../rng";
import { DAY, HOUR, MINUTE, dayOfYear, fmtDate, fmtTs, hourOfDay, parseTs } from "../rng";
import { homoglyphPlate, plateNoRegion } from "../pools";
import {
  BUS_ROUTES, COLORS, DEATH_CAUSES, HOSPITAL_DEPTS, MAKES, SHOPS, STREETS, doorbellWeight, shoppingWeight, trafficWeight,
} from "../catalog";
import { CASE_START, SEASON } from "../facts";
import { HEAT_FLATS } from "./people";
import { noiseState, noiseTarget, type NoisePerson, type NoiseVehicle } from "./state";

const YEAR = 365.25 * DAY;
const VEHICLES_OPEN = parseTs(CASE_START.c01);

// ==================================================================== vehicles

export function generateVehicles(ctx: WorldContext): void {
  const rng = ctx.rng("noise.vehicles");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "vehicles");
  const owners = st.adults.filter((p) => VEHICLES_OPEN - p.birth > 19 * YEAR);
  const fleet = st.companies.filter((c) => !c.planted && c.kind !== "ИП");
  const rows: { key: number; row: Row; v?: NoiseVehicle }[] = [];
  while (rows.length < target) {
    const m = rng.weighted(MAKES.map((x) => [x, x.weight] as const));
    const make = rng.pick(m.variants);
    const year = rng.int(1996, 2026);
    const plate = ctx.unique("plate", () => plateNoRegion(rng));
    const company = rng.chance(0.13) ? rng.pick(fleet) : null;
    const kind: NoiseVehicle["kind"] = company
      ? m.make === "Сайгак" || m.make === "Север-М" ? "грузовая" : "служебная"
      : rng.chance(0.05) ? "такси" : m.make === "Север-М" ? "грузовая" : "легковая";
    const color = kind === "такси" ? rng.pick(["жёлтый", "белый"]) : rng.weighted(COLORS);
    const firstOwner = company ? null : rng.pick(owners);
    const lo = Math.max(parseTs(`${year}-01-15`), firstOwner ? firstOwner.birth + 18 * YEAR : 0, company ? company.registered : 0);
    const hi = VEHICLES_OPEN - 3 * DAY;
    if (lo >= hi) continue;
    let registered = Math.floor(rng.float(lo, Math.min(hi, lo + 4 * YEAR)) / DAY) * DAY;
    const resold = !company && rng.chance(0.2) && rows.length + 1 < target;
    const scrapped = !resold && year < 2012 && rng.chance(0.3);
    const base = { plate, make, model: rng.pick(m.models), color, year };
    if (resold) {
      const sold = Math.floor(rng.float(registered + 0.5 * YEAR, Math.max(registered + YEAR, hi)) / DAY) * DAY;
      if (sold < hi) {
        rows.push({
          key: registered,
          row: { ...base, owner_person_id: firstOwner?.id ?? null, owner_company_id: null, owner_name: firstOwner?.full ?? null, registered_at: fmtDate(registered), sold_at: fmtDate(sold), deregistered_at: null },
        });
        registered = sold;
      }
    }
    const owner = company ? null : resold ? rng.pick(owners) : firstOwner;
    const deregistered = scrapped ? Math.floor(rng.float(registered + YEAR, hi) / DAY) * DAY : null;
    const row: Row = {
      ...base, owner_person_id: owner?.id ?? null, owner_company_id: company?.id ?? null, owner_name: owner ? owner.full : company?.name ?? null,
      registered_at: fmtDate(registered), sold_at: null, deregistered_at: deregistered && deregistered < hi ? fmtDate(deregistered) : null,
    };
    if (ctx.isExcluded("vehicles", row)) continue;
    rows.push({
      key: registered, row,
      v: { id: 0, plate, make, ownerPersonId: owner?.id ?? null, ownerCompanyId: company?.id ?? null, active: row.deregistered_at === null, kind },
    });
  }
  rows.sort((a, b) => a.key - b.key);
  for (const r of rows.slice(0, target)) {
    const id = ctx.nextId("vehicles");
    ctx.write("vehicles", { ...r.row, id });
    if (r.v) st.vehicles.push({ ...r.v, id });
  }
}

// ==================================================================== cameras

const CAMERA_PLACES: readonly [string, string][] = [
  ["Мира / Школьная", "Старый город"], ["Портовая / Северная", "Старый город"], ["Театральная", "Старый город"],
  ["Садовая / Полярная", "Старый город"], ["Рыбацкая", "Старый город"], ["Рынок", "Старый город"],
  ["Строителей / Мира", "Старый город"], ["Порт — проходная", "Гавань"], ["Причальная / Морская", "Гавань"],
  ["Корабельная", "Гавань"], ["Таможенный склад", "Гавань"], ["Морская — разворот", "Гавань"],
  ["Энергетиков / Индустриальная", "Промзона"], ["Заводская", "Промзона"], ["Складская", "Промзона"],
  ["КПП «Глубины» — восток", "Промзона"], ["Подстанция «Промзона-2»", "Промзона"], ["Объездная — км 3", "Промзона"],
  ["Шахтная / Горняцкая", "Шахтный"], ["Забойная", "Шахтный"], ["Терриконная", "Шахтный"], ["Угольная — АЗС", "Шахтный"],
  ["Горняцкая — школа", "Шахтный"], ["Маячная", "Створ"], ["Створная — разворот", "Створ"],
];

export function generateCameras(ctx: WorldContext): void {
  const rng = ctx.rng("noise.cameras");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "cameras");
  for (const p of ctx.planted("cameras")) {
    st.cameras.push({ id: Number(p.row.id), district: String(p.row.district), status: String(p.row.status) });
  }
  for (let n = 0; n < target; n++) {
    const [place, district] = n < CAMERA_PLACES.length ? CAMERA_PLACES[n] : [`${rng.pick(CAMERA_PLACES)[0]} — ${n}`, rng.pick(CAMERA_PLACES)[1]];
    const roll = rng.next();
    const status = roll < 0.05 ? "неисправна" : roll < 0.08 ? "на обслуживании" : "работает";
    const row = {
      id: ctx.nextId("cameras"), name: place, district, status,
      status_reason: status === "неисправна" ? rng.pick(["обледенение объектива", "нет связи"]) : status === "на обслуживании" ? "замена блока питания" : null,
    };
    if (ctx.isExcluded("cameras", row)) continue;
    ctx.write("cameras", row);
    st.cameras.push({ id: row.id, district, status });
  }
}

// ==================================================================== plate_reads

const READS_FROM = parseTs("2026-11-15 00:00:00");
const READS_TO = parseTs("2027-01-11 11:00:00");

export function generatePlateReads(ctx: WorldContext): void {
  const rng = ctx.rng("noise.plate_reads");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "plate_reads");
  const working = st.cameras.filter((c) => c.status === "работает");
  const byDistrict = new Map<string, number[]>();
  for (const c of working) {
    const list = byDistrict.get(c.district);
    if (list) list.push(c.id);
    else byDistrict.set(c.district, [c.id]);
  }
  const allCams = working.map((c) => c.id);
  // Маршрут машины: 2–4 камеры вокруг дома владельца и центра
  const active = rng.sample(st.vehicles.filter((v) => v.active), 520);
  const routes = new Map<number, number[]>();
  for (const v of active) {
    const owner = v.ownerPersonId !== null ? st.byId.get(v.ownerPersonId) : undefined;
    const home = byDistrict.get(owner?.district ?? "Старый город") ?? allCams;
    const center = byDistrict.get("Старый город") ?? allCams;
    routes.set(v.id, [...rng.sample(home, Math.min(2, home.length)), ...rng.sample(center, rng.int(1, 2))]);
  }
  const night = active.filter((v) => v.kind === "такси" || v.kind === "служебная" || v.kind === "грузовая");
  const commuters = active.filter((v) => v.kind === "легковая");
  const directions = (cam: number) => (cam === 12 || cam === 15 ? ["въезд", "выезд"] : ["в центр", "из центра"]);
  const times = sampleTimes(rng, target, READS_FROM, READS_TO, trafficWeight);
  const out: { key: number; row: Row; registry: boolean }[] = [];
  for (const t of times) {
    let registry = false;
    const row = ctx.maybeRow("plate_reads", () => {
      const h = hourOfDay(t);
      const nightTime = h < 5.5 || h >= 23;
      const pool = nightTime ? night : rng.chance(0.82) ? commuters : night;
      registry = false;
      if (rng.chance(0.025)) {
        // Чужие номера: в реестре города их нет (транзит)
        const cam = rng.pick(allCams);
        return { camera_id: cam, plate: plateNoRegion(rng), read_at: fmtTs(t), confidence: round2(rng.float(0.8, 0.98)), direction: rng.pick(directions(cam)) };
      }
      const v = rng.pick(pool);
      const cam = rng.pick(routes.get(v.id) ?? allCams);
      registry = true;
      return { camera_id: cam, plate: v.plate, read_at: fmtTs(t), confidence: round2(rng.float(0.86, 0.995)), direction: rng.pick(directions(cam)) };
    });
    if (row) out.push({ key: t, row, registry });
  }
  applyOcrHomoglyphs(ctx, rng, out);
  flushByTime(ctx, "plate_reads", out, "read_at");
}

/**
 * Гомоглифы OCR (0,5 %, разд. 8.3) — ровно заданное число строк: ★ Д10 «Все
 * номера, считанные латиницей» — 17 строк на часах Д10, из них одна посажена
 * в Д1 (K372OK), остальные 16 — шум до старта Д10. Ещё 4 — после Нового года.
 */
export const OCR_LATIN_READS = { beforeC10: 16, afterNewYear: 4 } as const;

function applyOcrHomoglyphs(ctx: WorldContext, rng: Rng, out: { key: number; row: Row; registry: boolean }[]): void {
  const c10 = parseTs(CASE_START.c10);
  const newYear = parseTs("2027-01-01 00:00:00");
  const convert = (eligible: number[], n: number) => {
    let made = 0;
    for (const i of rng.shuffle(eligible)) {
      if (made >= n) break;
      const plate = homoglyphPlate(rng, String(out[i].row.plate));
      if (!/[A-Z]/.test(plate)) continue;
      const row = { ...out[i].row, plate, confidence: round2(rng.float(0.55, 0.8)) };
      if (ctx.isExcluded("plate_reads", row)) continue;
      out[i].row = row;
      made++;
    }
    if (made < n) throw new WorldGenError(`plate_reads: гомоглифов ${made} из ${n}`);
  };
  const idx = out.map((_, i) => i).filter((i) => out[i].registry);
  convert(idx.filter((i) => out[i].key < c10), OCR_LATIN_READS.beforeC10);
  convert(idx.filter((i) => out[i].key >= newYear), OCR_LATIN_READS.afterNewYear);
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const round1 = (x: number) => Math.round(x * 10) / 10;

// ==================================================================== intercom_events

export function generateIntercom(ctx: WorldContext): void {
  const rng = ctx.rng("noise.intercom");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "intercom_events");
  const flats = rng.sample([...st.residents.entries()].filter(([id]) => st.addressById.get(id)?.apt), 90);
  const codes = Array.from({ length: 40 }, () => String(rng.int(1000, 9999)));
  const times = sampleTimes(rng, target, parseTs("2026-08-01 00:00:00"), parseTs("2027-01-11 11:00:00"), doorbellWeight);
  const out: { key: number; row: Row }[] = [];
  for (const t of times) {
    const row = ctx.maybeRow("intercom_events", () => {
      const [addressId, residents] = rng.pick(flats);
      const resident = st.byId.get(rng.pick(residents)) as NoisePerson;
      const method = rng.weighted([["ключ жильца", 55], ["приложение", 15], ["гостевой код", 20], ["вызов квартиры", 10]] as const);
      const guest = method === "гостевой код";
      return {
        ts: fmtTs(t), address_id: addressId, method, code: guest ? rng.pick(codes) : null,
        key_owner: method === "ключ жильца" || method === "приложение" ? resident.short : null,
        guest_name: guest && rng.chance(0.55) ? rng.pick(st.adults).short.replace(/ (\S)\. \S\.$/, " $1.") : null,
      };
    });
    if (row) out.push({ key: t, row });
  }
  flushByTime(ctx, "intercom_events", out, "ts");
}

// ==================================================================== heat_readings

/**
 * Подъезд 2 дома Шахтная, 12: шесть квартир, каждые 20 минут
 * 06.12 00:00 – 07.12 23:40. Район без тепла 06.12 10:00–19:00, стояк
 * подъезда перемёрз — тепло вернули 07.12 в 10:00. Посадка c02 заменяет
 * ряд ШХ-12-31 своим (исключение по flat_id).
 */
export function generateHeatReadings(ctx: WorldContext): void {
  const rng = ctx.rng("noise.heat");
  const st = noiseState(ctx);
  const from = parseTs("2026-12-06 00:00:00");
  const outage = parseTs("2026-12-06 10:00:00");
  const restored = parseTs("2026-12-07 10:00:00");
  const out: { key: number; row: Row }[] = [];
  for (const apt of HEAT_FLATS) {
    const flatId = `ШХ-12-${apt}`;
    if (ctx.isExcluded("heat_readings", { flat_id: flatId })) continue;
    const addressId = ctx.reservedRef<number>("address", `Шахтная|12|${apt}`) ?? st.addressByKey.get(`Шахтная|12|${apt}`);
    if (addressId === undefined) throw new WorldGenError(`heat_readings: нет адреса Шахтная, 12-${apt}`);
    const t0 = rng.float(20.5, 23);
    const tau = apt === 31 ? 13 : rng.float(16, 30);
    const floor = apt === 31 ? -2 : rng.float(9, 15.5);
    let sentinelAt = apt === 26 ? from + rng.int(80, 120) * 20 * MINUTE : -1;
    for (let k = 0; k < 144; k++) {
      const t = from + k * 20 * MINUTE;
      let temp: number;
      if (t < outage) temp = t0 + rng.float(-0.3, 0.3);
      else if (t < restored) {
        const hours = (t - outage) / HOUR;
        temp = floor + (t0 - floor) * Math.exp(-hours / tau) + rng.float(-0.2, 0.2);
      } else {
        const cold = floor + (t0 - floor) * Math.exp(-24 / tau);
        temp = Math.min(t0, cold + ((t - restored) / HOUR) * 1.8) + rng.float(-0.2, 0.2);
      }
      const value = t === sentinelAt ? -999 : round1(temp);
      if (t === sentinelAt) sentinelAt = -1;
      const row = { flat_id: flatId, address_id: addressId, ts: fmtTs(t), temp_c: value };
      if (!ctx.isExcluded("heat_readings", row)) out.push({ key: t + apt, row });
    }
  }
  flushByTime(ctx, "heat_readings", out, "ts");
}

// ==================================================================== delivery_orders

export function generateDeliveries(ctx: WorldContext): void {
  const rng = ctx.rng("noise.delivery");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "delivery_orders");
  const couriers = rng.sample(st.adults.filter((p) => parseTs("2026-12-01") - p.birth < 45 * YEAR), 11);
  const free = new Map<number, number>(couriers.map((c) => [c.id, 0]));
  const shops = SHOPS.filter((s) => !s.staffOnly && s.merchant !== "АЗС «Полюс» (Объездная)");
  const times = sampleTimes(rng, target, parseTs("2026-12-01 07:00:00"), parseTs("2026-12-07 23:30:00"), shoppingWeight);
  const out: { key: number; row: Row }[] = [];
  for (const t of times) {
    const ready = couriers.filter((c) => (free.get(c.id) as number) <= t);
    const courier = ready.length > 0 ? rng.pick(ready) : rng.pick(couriers);
    const row = ctx.maybeRow("delivery_orders", () => {
      const ride = rng.int(14, 52) * MINUTE + rng.int(0, 59) * 1000;
      const cancelled = rng.chance(0.03);
      const district = rng.pick(["Старый город", "Шахтный", "Гавань"] as const);
      const s = rng.pick(STREETS[district]);
      return {
        courier_person_id: courier.id, courier_name: courier.short, accepted_at: fmtTs(t),
        delivered_at: cancelled ? null : fmtTs(t + ride), pickup_text: rng.pick(shops).merchant,
        drop_text: s.flats ? `${s.street}, ${rng.int(1, s.houses)}-${rng.int(1, 80)}` : `${s.street}, ${rng.int(1, s.houses)}`,
        amount: Math.round(rng.float(150, 3200)),
      };
    });
    if (!row) continue;
    free.set(courier.id, t + (row.delivered_at ? parseTs(String(row.delivered_at)) - t : 10 * MINUTE));
    out.push({ key: t, row });
  }
  flushByTime(ctx, "delivery_orders", out, "accepted_at");
}

// ==================================================================== transit_taps

export function generateTransitTaps(ctx: WorldContext): void {
  const rng = ctx.rng("noise.transit");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "transit_taps");
  const now = parseTs("2026-12-02");
  const kids = st.people.filter((p) => !p.dup && p.death === null && now - p.birth >= 7 * YEAR && now - p.birth < 17 * YEAR);
  const elders = st.adults.filter((p) => now - p.birth >= 60 * YEAR);
  const cards = new Map<string, { kind: string; holder: string | null }>();
  const newCard = (kind: string): string => {
    const prefix = kind === "школьная" ? "Ш" : kind === "льготная" ? "Л" : "В";
    const no = ctx.unique("card_no", () => `${prefix}-${String(rng.int(1, 99_999)).padStart(5, "0")}`);
    const holder = kind === "школьная" ? rng.pick(kids).short : kind === "льготная" ? rng.pick(elders).short : rng.chance(0.2) ? rng.pick(st.adults).short : null;
    cards.set(no, { kind, holder });
    return no;
  };
  const routes = Object.keys(BUS_ROUTES);
  const from = parseTs("2026-12-02 15:00:00");
  const to = parseTs(SEASON.start);
  const times = sampleTimes(rng, target, from, to, (t) => (hourOfDay(t) < 16.5 ? 0.8 : 1));
  const out: { key: number; row: Row }[] = [];
  for (const t of times) {
    const row = ctx.maybeRow("transit_taps", () => {
      const kind = rng.weighted([["взрослая", 65], ["школьная", hourOfDay(t) < 17 ? 26 : 10], ["льготная", 15]] as const);
      const reuse = [...cards.entries()].filter(([, c]) => c.kind === kind);
      const no = reuse.length > 6 && rng.chance(0.25) ? rng.pick(reuse)[0] : newCard(kind);
      const route = rng.pick(routes);
      return { ts: fmtTs(t), card_no: no, card_kind: kind, holder_text: cards.get(no)?.holder ?? null, route, stop: rng.pick(BUS_ROUTES[route]) };
    });
    if (row) out.push({ key: t, row });
  }
  flushByTime(ctx, "transit_taps", out, "ts");
}

// ==================================================================== ЗАГС, морг, больницы

export function generateZags(ctx: WorldContext): void {
  const rng = ctx.rng("noise.zags");
  const st = noiseState(ctx);
  const dead = st.people.filter((p) => p.death !== null).sort((a, b) => (a.death as number) - (b.death as number));
  for (const p of dead) {
    const died = p.death as number;
    const age = (died - p.birth) / YEAR;
    const cause = age > 62 ? rng.pick(DEATH_CAUSES.slice(0, 6)) : rng.pick(DEATH_CAUSES);
    const reg = died + rng.float(1, 4) * DAY;
    const registered = Math.floor((Math.floor(reg / DAY) * DAY + rng.float(9, 17) * HOUR) / 1000) * 1000;
    const year = new Date(died).getUTCFullYear();
    const act = ctx.unique("act_no", () => `А-${year}-${String(Math.min(9999, Math.floor(dayOfYear(died) * 2.8) + rng.int(-25, 25) + 1)).padStart(4, "0")}`);
    const row = { act_no: act, person_id: p.id, died_at: fmtTs(died), cause, registered_at: fmtTs(registered) };
    if (ctx.isExcluded("zags_deaths", row)) continue;
    ctx.write("zags_deaths", row);
    (p as NoisePerson & { cause?: string }).cause = cause;
  }
}

export function generateMorgue(ctx: WorldContext): void {
  const rng = ctx.rng("noise.morgue");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "morgue_records");
  // КУСП морга не совпадает ни с номерами происшествий, ни с посаженными (4515 — только Ирина)
  const usedKusp = new Set(st.incidents.map((i) => `${new Date(i.at).getUTCFullYear()}:${i.kusp}`));
  const kuspFor = (t: number) => {
    const year = new Date(t).getUTCFullYear();
    let k = Math.floor(dayOfYear(t) * 14) + rng.int(0, 13);
    while (usedKusp.has(`${year}:${k}`) || ctx.isReserved(`kusp:${year}`, String(k))) k++;
    usedKusp.add(`${year}:${k}`);
    return k;
  };
  const violent = new Set(["переохлаждение", "отравление алкоголем", "механическая асфиксия", "сочетанная травма (ДТП)", "утопление"]);
  const from = parseTs("2019-01-01");
  const dead = st.people.filter((p) => p.death !== null && (p.death as number) >= from);
  const out: { key: number; row: Row }[] = [];
  const relations = ["сын", "дочь", "жена", "муж", "брат", "сестра", "соседка", "мать"];
  for (const p of dead) {
    if (out.length >= target) break;
    const cause = (p as NoisePerson & { cause?: string }).cause ?? "";
    if (!violent.has(cause) && !rng.chance(0.45)) continue;
    const received = Math.floor(((p.death as number) + rng.float(1, 10) * HOUR) / 1000) * 1000;
    const identified = received + rng.float(2, 40) * HOUR;
    const late = identified > parseTs("2026-11-28");
    out.push({
      key: received,
      row: {
        kusp_no: violent.has(cause) ? kuspFor(received) : null, received_at: fmtTs(received),
        full_name_text: p.full, person_id: p.id, identified_at: late ? null : fmtTs(Math.floor(identified / 1000) * 1000),
        identified_by: late ? null : `${rng.pick(st.adults).short} (${rng.pick(relations)})`,
      },
    });
  }
  // Неопознанные и приезжие (нет в ПБД) — до объёма
  while (out.length < target) {
    const received = Math.floor(rng.float(from, parseTs("2027-01-10")) / 1000) * 1000;
    const unknown = rng.chance(0.5);
    const identified = received + rng.float(10, 200) * HOUR;
    out.push({
      key: received,
      row: {
        kusp_no: kuspFor(received), received_at: fmtTs(received),
        full_name_text: unknown ? null : `${rng.pick(["Иванов", "Сафин", "Ткаченко", "Мамедов", "Гусев"])} ${rng.pick(["Сергей", "Олег", "Виктор", "Руслан"])} ${rng.pick(["Петрович", "Иванович", "Ильич"])}`,
        person_id: null, identified_at: unknown || identified > parseTs("2026-11-28") ? null : fmtTs(Math.floor(identified / 1000) * 1000),
        identified_by: unknown ? null : "по дактилокарте",
      },
    });
  }
  flushByTime(ctx, "morgue_records", out.filter((r) => !ctx.isExcluded("morgue_records", r.row)).slice(0, target), "received_at");
}

export function generateHospital(ctx: WorldContext): void {
  const rng = ctx.rng("noise.hospital");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "hospital_admissions");
  // id 601 — живая строка Д7 (патч c07.admission)
  ctx.reserveId("hospital_admissions", 601);
  const from = parseTs("2024-01-10 00:00:00");
  const to = parseTs("2027-01-11 10:00:00");
  const times = sampleTimes(rng, target, from, to, (t) => (hourOfDay(t) >= 8 && hourOfDay(t) < 22 ? 1 : 0.35));
  const kids = st.people.filter((p) => !p.dup && p.death === null && parseTs("2026-12-01") - p.birth < 17 * YEAR);
  const out: { key: number; row: Row }[] = [];
  for (const t of times) {
    const row = ctx.maybeRow("hospital_admissions", () => {
      const child = rng.chance(0.1) && kids.length > 0;
      const p = child ? rng.pick(kids) : rng.pick(st.adults);
      const [dept, diagnoses] = child ? HOSPITAL_DEPTS[HOSPITAL_DEPTS.length - 1] : rng.pick(HOSPITAL_DEPTS.slice(0, -1));
      const discharge = t + rng.float(2, 18) * DAY;
      // Выписка в будущем не видна: у поступивших в сезон выписки ещё нет
      const discharged = discharge < parseTs("2026-11-28") ? fmtTs(Math.floor(discharge / 1000) * 1000) : null;
      return { person_id: p.id, full_name: p.full, admitted_at: fmtTs(t), discharged_at: discharged, department: dept, diagnosis: rng.pick(diagnoses) };
    });
    if (row) out.push({ key: t, row });
  }
  flushByTime(ctx, "hospital_admissions", out, "admitted_at");
}
