/**
 * Население: persons, addresses, registrations.
 *
 * - Семьи: отчество ребёнка выводится из имени отца по father_id, фамилия —
 *   отцовская, у жены — prev_last_name (девичья).
 * - Демография северного города: мало пожилых, много 25–45.
 * - 5 % дублей (ё/е, опечатки, перестановки), ~6 % с особыми приметами.
 * - death_date в ПБД заполнена не у всех: полиция верит ЗАГСу.
 * - Адреса: пятиэтажки с квартирами и частный сектор; ~1 % с хвостовым
 *   пробелом в street (у посаженных адресов пробелов нет).
 */
import type { WorldContext } from "../context";
import { WorldGenError } from "../context";
import type { Rng } from "../rng";
import { DAY, fmtDate, fmtTs, parseTs } from "../rng";
import {
  FEMALE_NAMES, FEMALE_NAMES_EXTRA, MALE_NAMES, MALE_NAMES_EXTRA, PATRONYMICS, SURNAMES, feminineSurname,
  patronymicOf, shortName,
} from "../pools";
import { DISTRICT_WEIGHTS, SPECIAL_MARKS, STREETS, type District, officeMoment, personCreatedAt } from "../catalog";
import { CAST_PERSONS, CASE_START, KEY_TIMES, type AdultReservation } from "../facts";
import { addressKey, noiseState, noiseTarget, type NoisePerson } from "./state";

const NOW = parseTs("2026-12-01 00:00:00");
const YEAR = 365.25 * DAY;
/** Таблица persons открывается в Д3: позже её старта дат в ней нет */
const PERSONS_OPEN = parseTs(CASE_START.c03);
const REG_OPEN = parseTs(CASE_START.c06);
/**
 * «Мёртвая душа» 4301 — последняя карточка ПБД (id растут со временем): шумовые
 * карточки заведены до смерти Ирины, и created_at после неё есть только у Кравца.
 */
const NOISE_CREATED_MAX = parseTs(KEY_TIMES.hitAndRun) - 3 * 3_600_000;

const CAST_SHORT = new Set(CAST_PERSONS.map((p) => shortName(p.last, p.first, p.middle)));

const ADULT_AGES: readonly (readonly [readonly [number, number], number])[] = [
  [[18, 24], 10], [[25, 34], 26], [[35, 44], 27], [[45, 54], 18], [[55, 64], 12], [[65, 74], 5], [[75, 90], 2],
];

function birthForAge(rng: Rng, minAge: number, maxAge: number): number {
  const age = rng.float(minAge, maxAge + 0.999);
  return Math.floor((NOW - age * YEAR) / DAY) * DAY;
}

function firstName(rng: Rng, sex: "М" | "Ж"): string {
  if (sex === "М") return rng.chance(0.04) ? rng.pick(MALE_NAMES_EXTRA) : rng.pick(MALE_NAMES);
  return rng.chance(0.05) ? rng.pick(FEMALE_NAMES_EXTRA) : rng.pick(FEMALE_NAMES);
}

function surname(rng: Rng, sex: "М" | "Ж"): string {
  const male = rng.pick(SURNAMES);
  return sex === "Ж" ? feminineSurname(male) : male;
}

function randomPatronymic(rng: Rng, sex: "М" | "Ж"): string | null {
  if (rng.chance(0.012)) return null;
  const [m, f] = rng.pick(PATRONYMICS);
  return sex === "М" ? m : f;
}

interface Draft {
  last: string;
  first: string;
  middle: string | null;
  sex: "М" | "Ж";
  birth: number;
  prevLast: string | null;
  father?: Draft;
  mother?: Draft;
  household: number;
  id?: number;
}

function adultDraft(rng: Rng, sex: "М" | "Ж", birth: number, household: number): Draft {
  return { last: surname(rng, sex), first: firstName(rng, sex), middle: randomPatronymic(rng, sex), sex, birth, prevLast: null, household };
}

/** Семьи и одиночки до нужного числа людей */
function draftPopulation(rng: Rng, count: number): Draft[] {
  const out: Draft[] = [];
  let hh = 0;
  while (out.length < count) {
    hh++;
    const r = rng.next();
    if (r < 0.34) {
      const range = rng.weighted(ADULT_AGES);
      out.push(adultDraft(rng, rng.chance(0.5) ? "М" : "Ж", birthForAge(rng, range[0], range[1]), hh));
      continue;
    }
    const fatherAge = r < 0.46 ? rng.int(22, 82) : rng.int(26, 72);
    const father = adultDraft(rng, "М", birthForAge(rng, fatherAge, fatherAge), hh);
    const motherBirth = father.birth + rng.int(-3, 8) * YEAR + rng.int(0, 300) * DAY;
    const maiden = surname(rng, "Ж");
    const married = feminineSurname(father.last);
    const mother: Draft = {
      last: married, first: firstName(rng, "Ж"), middle: randomPatronymic(rng, "Ж"), sex: "Ж",
      birth: Math.floor(motherBirth / DAY) * DAY, prevLast: maiden !== married ? maiden : null, household: hh,
    };
    out.push(father, mother);
    if (r < 0.46) continue;
    const kids = rng.weighted([[1, 45], [2, 40], [3, 15]] as const);
    for (let k = 0; k < kids && out.length < count; k++) {
      const birth = Math.floor((mother.birth + rng.float(20, 40) * YEAR) / DAY) * DAY;
      if (birth > parseTs("2026-06-01")) continue;
      const sex = rng.chance(0.5) ? "М" : "Ж";
      out.push({
        last: sex === "М" ? father.last : feminineSurname(father.last),
        first: firstName(rng, sex),
        middle: patronymicOf(father.first, sex === "М" ? "M" : "F"),
        sex, birth, prevLast: null, father, mother, household: hh,
      });
    }
  }
  return out.slice(0, count);
}

const VOWEL_SWAP: Readonly<Record<string, string>> = { ё: "е", Ё: "Е", е: "ё" };

/** Дубль карточки: ё/е, пропуск или удвоение буквы, перестановка соседних букв */
function misspell(rng: Rng, word: string): string {
  const kind = rng.int(0, 3);
  const chars = [...word];
  if (kind === 0) {
    const i = chars.findIndex((c) => c === "ё" || c === "Ё");
    if (i >= 0) {
      chars[i] = VOWEL_SWAP[chars[i]];
      return chars.join("");
    }
  }
  const i = rng.int(1, Math.max(1, chars.length - 2));
  if (kind === 1 && chars.length > 4) chars.splice(i, 1);
  else if (kind === 2) chars.splice(i, 0, chars[i]);
  else if (i + 1 < chars.length) [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
  return chars.join("");
}

export function generatePersons(ctx: WorldContext): void {
  const rng = ctx.rng("noise.persons");
  const st = noiseState(ctx);
  const maxId = Math.max(4300, ...ctx.planted("persons").map((p) => Number(p.row.id)).filter((id) => id < 9000));
  const freeIds: number[] = [];
  for (let id = 1; id <= maxId; id++) if (!ctx.isIdUsed("persons", id)) freeIds.push(id);
  const dupCount = Math.round(freeIds.length * 0.05);
  const baseCount = freeIds.length - dupCount;

  let drafts = draftPopulation(rng, baseCount).filter((d) => !CAST_SHORT.has(shortName(d.last, d.first, d.middle)));
  while (drafts.length < baseCount) {
    const extra = draftPopulation(rng, baseCount - drafts.length).filter((d) => !CAST_SHORT.has(shortName(d.last, d.first, d.middle)));
    drafts = drafts.concat(extra.map((d) => ({ ...d, father: undefined, mother: undefined, household: d.household + 100_000 })));
  }

  // Порядок id: перемешиваем, но взрослые резервы (директора, инженеры ПД-117 и т. п.)
  // получают взрослых нужного возраста и никогда не становятся дублями карточек
  const shuffled = rng.shuffle(drafts);
  const adultIds = new Set(ctx.reservedValues("person:adult").map(Number).filter((id) => freeIds.includes(id)));
  const others = rng.shuffle(freeIds.filter((id) => !adultIds.has(id)));
  const baseIds = [...adultIds, ...others.slice(0, baseCount - adultIds.size)].sort((a, b) => a - b);
  const baseSet = new Set(baseIds);
  const dupIds = freeIds.filter((id) => !baseSet.has(id));
  const fits = (d: Draft, id: number): boolean => {
    const ref = ctx.reservedRef<AdultReservation | true>("person:adult", String(id));
    if (ref && ref !== true) return d.birth >= parseTs(ref.bornFrom) && d.birth <= parseTs(ref.bornTo);
    return NOW - d.birth > 30 * YEAR && NOW - d.birth < 65 * YEAR;
  };
  const assigned = new Set<Draft>();
  for (const id of baseIds) {
    if (adultIds.has(id)) {
      const d = shuffled.find((x) => !assigned.has(x) && fits(x, id));
      if (!d) throw new WorldGenError(`persons: не хватает взрослых для резерва ${id}`);
      d.id = id;
      assigned.add(d);
    }
  }
  let cursor = 0;
  for (const id of baseIds) {
    if (adultIds.has(id)) continue;
    while (assigned.has(shuffled[cursor])) cursor++;
    shuffled[cursor].id = id;
    assigned.add(shuffled[cursor]);
    cursor++;
  }

  // Смерти: столько, сколько нужно ЗАГСу; в основном пожилые, не резервы
  const deathTarget = noiseTarget(ctx, "zags_deaths");
  const deathCandidates = shuffled
    .filter((d) => !adultIds.has(d.id as number))
    .sort((a, b) => a.birth - b.birth);
  const deaths = new Map<Draft, number>();
  const old = deathCandidates.slice(0, Math.floor(deathCandidates.length * 0.3));
  for (const d of rng.sample(old, Math.min(old.length, Math.round(deathTarget * 0.85)))) {
    deaths.set(d, deathMoment(rng, d.birth));
  }
  const young = deathCandidates.filter((d) => !deaths.has(d) && NOW - d.birth > 18 * YEAR);
  for (const d of rng.sample(young, deathTarget - deaths.size)) deaths.set(d, deathMoment(rng, d.birth));

  const markRate = 0.065;
  for (const d of shuffled) {
    const id = d.id as number;
    const death = deaths.get(d) ?? null;
    const createdAt = Math.max(personCreatedAt(id), officeMoment(d.birth + rng.int(1, 40) * DAY, id));
    const deathDate = death !== null && death < PERSONS_OPEN - 7 * DAY && rng.chance(0.7) ? fmtDate(death) : null;
    const row = {
      id, last_name: d.last, first_name: d.first, patronymic: d.middle, birth_date: fmtDate(d.birth), sex: d.sex,
      father_id: d.father?.id ?? null, mother_id: d.mother?.id ?? null, prev_last_name: d.prevLast,
      special_marks: NOW - d.birth > 16 * YEAR && rng.chance(markRate) ? rng.pick(SPECIAL_MARKS) : null,
      death_date: deathDate, created_at: fmtTs(Math.min(createdAt, NOISE_CREATED_MAX)),
    };
    if (ctx.isExcluded("persons", row)) continue;
    ctx.write("persons", row);
    const p: NoisePerson = {
      id, last: d.last, first: d.first, middle: d.middle, sex: d.sex, birth: d.birth, death,
      short: shortName(d.last, d.first, d.middle), full: [d.last, d.first, d.middle].filter(Boolean).join(" "),
      dup: false, household: d.household,
    };
    st.people.push(p);
    st.byId.set(id, p);
  }

  // Дубли карточек: только шумовые люди, взрослые
  const dupPool = st.people.filter((p) => NOW - p.birth > 18 * YEAR);
  const sources = rng.sample(dupPool, dupIds.length);
  dupIds.forEach((id, i) => {
    // Исключения посадок (ctx.exclude) действуют и на дубли: до 20 попыток с другим источником
    for (let attempt = 0; attempt < 20; attempt++) {
      if (writeDup(id, attempt === 0 ? sources[i] : rng.pick(dupPool))) return;
    }
  });

  function writeDup(id: number, src: NoisePerson): boolean {
    const variant = rng.int(0, 4);
    let last = src.last;
    let first = src.first;
    let birth = src.birth;
    if (variant <= 1) last = misspell(rng, last);
    else if (variant === 2) first = misspell(rng, first);
    else if (variant === 3) [last, first] = [first, last];
    else {
      last = misspell(rng, last);
      const d = new Date(birth);
      if (d.getUTCDate() <= 12) birth = Date.UTC(d.getUTCFullYear(), d.getUTCDate() - 1, d.getUTCMonth() + 1);
    }
    // Дубль заводят тогда же, когда и любую карточку с этим id (id растут со временем)
    const row = {
      id, last_name: last, first_name: first, patronymic: src.middle, birth_date: fmtDate(birth), sex: src.sex,
      father_id: null, mother_id: null, prev_last_name: null, special_marks: null, death_date: null,
      created_at: fmtTs(Math.min(personCreatedAt(id), NOISE_CREATED_MAX)),
    };
    if (ctx.isExcluded("persons", row)) return false;
    ctx.write("persons", row);
    const p: NoisePerson = {
      id, last, first, middle: src.middle, sex: src.sex, birth, death: null,
      short: shortName(last, first, src.middle), full: [last, first, src.middle].filter(Boolean).join(" "),
      dup: true, household: -1,
    };
    st.byId.set(id, p);
    return true;
  }

  st.adults = st.people.filter((p) => p.death === null && NOW - p.birth >= 18 * YEAR && NOW - p.birth <= 80 * YEAR);
}

function deathMoment(rng: Rng, birth: number): number {
  const lo = Math.max(parseTs("2015-01-01"), birth + 18 * YEAR);
  const hi = parseTs("2027-01-10 12:00:00");
  // Чаще недавние годы: ЗЕРКАЛО полнее с 2019-го
  const f = Math.sqrt(rng.next());
  return Math.floor((lo + (hi - lo) * f) / 1000) * 1000;
}

// ==================================================================== адреса

export function generateAddresses(ctx: WorldContext): void {
  const rng = ctx.rng("noise.addresses");
  const st = noiseState(ctx);
  // Посаженные адреса: известны по ключу, шум их не повторяет
  for (const p of ctx.planted("addresses")) {
    const r = p.row;
    const key = addressKey(String(r.street), String(r.house), r.apt == null ? null : String(r.apt));
    ctx.reserve("address", key, r.id);
    const a = { id: Number(r.id), district: r.district as District, street: String(r.street).trim(), house: String(r.house), apt: r.apt == null ? null : String(r.apt) };
    st.addresses.push(a);
    st.addressById.set(a.id, a);
    st.addressByKey.set(key, a.id);
  }
  const target = noiseTarget(ctx, "addresses");
  const wanted: { district: District; street: string; house: string; apt: string | null }[] = [];
  // Обязательные адреса: подъезд 2 дома Шахтная, 12 (датчики «Сияние.Дом»)
  for (const apt of HEAT_FLATS) wanted.push({ district: "Шахтный", street: "Шахтная", house: "12", apt: String(apt) });

  const seen = new Set<string>();
  const add = (w: (typeof wanted)[number]) => {
    const key = addressKey(w.street, w.house, w.apt);
    if (seen.has(key) || ctx.isReserved("address", key)) return false;
    seen.add(key);
    const street = rng.chance(0.011) ? `${w.street} ` : w.street;
    const probe = { district: w.district, street, house: w.house, apt: w.apt };
    if (ctx.isExcluded("addresses", probe)) return false;
    const id = ctx.nextId("addresses");
    const row = { id, ...probe };
    ctx.write("addresses", row);
    const a = { id, district: w.district, street: w.street, house: w.house, apt: w.apt };
    st.addresses.push(a);
    st.addressById.set(id, a);
    st.addressByKey.set(key, id);
    return true;
  };
  let made = 0;
  for (const w of wanted) if (add(w)) made++;
  let guard = 0;
  while (made < target) {
    if (guard++ > target * 50) throw new WorldGenError("addresses: не удалось набрать уникальные адреса");
    const district = rng.weighted(DISTRICT_WEIGHTS);
    const s = rng.pick(STREETS[district]);
    const house = String(rng.int(1, s.houses));
    if (s.flats && rng.chance(0.85)) {
      // Пятиэтажка: несколько квартир одного дома
      const flats = rng.int(2, 6);
      for (let k = 0; k < flats && made < target; k++) {
        if (add({ district, street: s.street, house, apt: String(rng.int(1, 80)) })) made++;
      }
    } else if (add({ district, street: s.street, house, apt: null })) made++;
  }
}

/** Квартиры подъезда 2 дома Шахтная, 12 с датчиками «Сияние.Дом» (Д2) */
export const HEAT_FLATS = [26, 28, 29, 31, 33, 35] as const;

// ==================================================================== прописки

export function generateRegistrations(ctx: WorldContext): void {
  const rng = ctx.rng("noise.registrations");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "registrations");
  const households = new Map<number, NoisePerson[]>();
  for (const p of st.people) {
    const list = households.get(p.household);
    if (list) list.push(p);
    else households.set(p.household, [p]);
  }
  const flats = st.addresses.filter((a) => a.apt !== null);
  const houses = st.addresses.filter((a) => a.apt === null);
  const order = rng.shuffle([...households.values()]);
  let made = 0;
  const pending: { person: NoisePerson; address: number; from: number; to: number | null }[] = [];
  for (const members of order) {
    if (made >= target) break;
    const pool = rng.chance(0.78) ? flats : houses;
    const adultsBirth = Math.min(...members.map((m) => m.birth));
    const movedIn = Math.max(adultsBirth + 18 * YEAR, parseTs("1990-01-01") + rng.float(0, 36) * YEAR);
    const from = Math.min(Math.floor(movedIn / DAY) * DAY, REG_OPEN - 30 * DAY);
    let address = rng.pick(pool);
    for (let attempt = 0; attempt < 20; attempt++) {
      const probe = { person_id: members[0].id, address_id: address.id, from_date: fmtDate(from), to_date: null };
      if (!ctx.isExcluded("registrations", probe)) break;
      address = rng.pick(pool);
    }
    for (const m of members) {
      if (made >= target) break;
      const start = Math.max(from, m.birth);
      const closed = m.death !== null && m.death < REG_OPEN ? Math.floor(m.death / DAY) * DAY : null;
      // У части жителей до этого была другая прописка
      if (rng.chance(0.16) && made + 1 < target && start - m.birth > 20 * YEAR) {
        const prev = rng.pick(st.addresses);
        const prevFrom = Math.floor((m.birth + rng.float(18, (start - m.birth) / YEAR - 1) * YEAR) / DAY) * DAY;
        if (prevFrom < start - DAY && prev.id !== address.id) {
          pending.push({ person: m, address: prev.id, from: prevFrom, to: start - DAY });
          made++;
        }
      }
      pending.push({ person: m, address: address.id, from: start, to: closed });
      made++;
      m.home = address.id;
      m.district = address.district;
      const list = st.residents.get(address.id);
      if (list) list.push(m.id);
      else st.residents.set(address.id, [m.id]);
    }
  }
  // Плавающие посадки (ctx.insert с orderAt, без id) получают id по from_date вперемешку с шумом
  const all = [
    ...ctx.takeDeferred("registrations").map((p) => ({ key: p.key ?? parseTs(String(p.row.from_date)), row: p.row, planted: true })),
    ...pending.map((r) => ({
      key: r.from, planted: false,
      row: { person_id: r.person.id, address_id: r.address, from_date: fmtDate(r.from), to_date: r.to === null ? null : fmtDate(r.to) },
    })),
  ].sort((a, b) => a.key - b.key || (a.planted === b.planted ? 0 : a.planted ? -1 : 1));
  for (const r of all) {
    if (!r.planted && ctx.isExcluded("registrations", r.row)) continue;
    ctx.write("registrations", { ...r.row, id: ctx.nextId("registrations") });
  }
  // Незарегистрированным жителям — район по весам (для событий)
  for (const p of st.people) if (!p.district) p.district = rng.weighted(DISTRICT_WEIGHTS);
}
