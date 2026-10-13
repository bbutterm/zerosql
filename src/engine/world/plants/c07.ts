import type { Row, WorldContext } from "../context";
import { WorldGenError } from "../context";
import type { Rng } from "../rng";
import { DAY, HOUR, fmtDate, fmtTs, parseTs, weekday } from "../rng";
import { personCreatedAt } from "../catalog";
import { FEMALE_NAMES, MALE_NAMES, PATRONYMICS, SURNAMES, feminineSurname, shortName } from "../pools";
import * as F from "../facts";

/**
 * Посадка дела `case-07-sluzhebnaya-kvartira` — «Служебная квартира»
 * (разд. 5.7 и 8.4 библии, блок «Д7»).
 *
 * - properties 401–422: 22 квартиры жилфонда «Глубина-Строя» на Северной, 14 и 16,
 *   выданы с марта по декабрь 2015 года; 18 строителям и четверым посторонним:
 *   Ратников (14-27, 2015-12-18), Шубин (14-31), Мирошник (16-4), Петров (16-9).
 *   Ещё три квартиры «Глубина-Строй» выдал строителям вне окна задачи 7.1
 *   (08.2014, 02.2015 и 06.2016, Заводская, 3): фильтр «с марта по декабрь 2015»
 *   не пустой, и «весь 2015 год» тоже даёт лишнюю строку.
 * - employment: строители — в «Глубина-Строе» (18); Петров — в АНО «Медсанчасть
 *   Створ» (90), в должности упомянута стройка («проверь, что значит поле»);
 *   четыре внешних подрядчика «Глубина-Строя» без person_id — ловушка NOT IN.
 * - Фонд → Ратников: 24 × 25 000 (01.2016–12.2017), 24 возврата «возврат: отказ
 *   получателя», два из них — одинаковые строки 2016-11-08 (UNION даст 47).
 *   Шубину 36 × 40 000, Мирошник 24 × 30 000, возвратов нет. Переселенцам
 *   Старого Створа — 57 разовых «матпомощь». Счета получателей — свои.
 * - door_access: B-9000, КПП-1, «выход», 2026-12-21 23:41:00.
 * - hospital_admissions 601 вставляет патч c07.admission (scene_end допроса);
 *   шум не кладёт в больницу ни Ратникова, ни кого-либо вечером 21.12 —
 *   иначе `ORDER BY admitted_at DESC LIMIT 1` нашёл бы чужую строку.
 *
 * Строители и переселенцы — посаженные жители (id выдаёт аллокатор, в тестах
 * их ищут запросами, а не по id). У каждого есть прописка: «мёртвых душ»
 * (side-06) посадка не добавляет.
 */

// ==================================================================== константы дела

const GS = F.COMPANY.glubinaStroy;
const FUND_NAME = F.COMPANY_NAME[F.COMPANY.fund];

/** Ключевые значения дела — для тестов и соседних посадок (c09: получатели фонда) */
export const C07 = {
  company: GS,
  fundName: FUND_NAME,
  fundAccount: F.ACCOUNT.fund,
  /** properties.id квартир жилфонда, выданных с марта по декабрь 2015 */
  flatIdFrom: 401,
  flatIdTo: 422,
  /** Квартиры «Глубина-Строя» вне окна 7.1 (08.2014, 02.2015, 06.2016) */
  outOfWindowFlatIds: [398, 399, 423] as const,
  window: { from: "2015-03-01", to: "2015-12-31" },
  account: {
    ratnikov: "ACC-41104",
    shubin: "ACC-41602",
    miroshnik: "ACC-41530",
  },
  purpose: {
    ratnikov: "матпомощь: лечение члена семьи",
    refund: "возврат: отказ получателя",
    shubin: "оплата экспертных услуг",
    miroshnik: "грант: информационное сопровождение программ фонда",
    resettler: "матпомощь переселенцу Старого Створа",
  },
  /** Два одинаковых возврата Ратникова одним днём */
  doubleRefundAt: "2016-11-08 10:14:00",
  ratnikovPayment: 25_000,
  shubinPayment: 40_000,
  miroshnikPayment: 30_000,
  resettlerPayment: 15_000,
  resettlers: 57,
  builders: 18,
  playerExit: "2026-12-21 23:41:00",
} as const;

/** Четверо посторонних среди получателей (persons.id → квартира) */
export const C07_OUTSIDERS: readonly { person: number; apt: string; house: string; acquired: string; registered: string }[] = [
  { person: F.PERSON.ratnikov, house: "14", apt: "27", acquired: "2015-12-18", registered: "2015-12-21" },
  { person: F.PERSON.shubin, house: "14", apt: "31", acquired: "2015-12-11", registered: "2015-12-14" },
  { person: F.PERSON.alla, house: "16", apt: "4", acquired: "2015-12-04", registered: "2015-12-08" },
  { person: F.PERSON.petrov, house: "16", apt: "9", acquired: "2015-09-01", registered: "2015-09-07" },
];

/** Квартиры строителей в окне 7.1: дом, квартира, дата выдачи (дом 14 сдан весной, дом 16 — летом и осенью) */
const BUILDER_FLATS: readonly [house: string, apt: string, acquired: string][] = [
  ["14", "3", "2015-03-16"], ["14", "7", "2015-03-16"], ["14", "12", "2015-03-27"], ["14", "15", "2015-04-08"],
  ["14", "19", "2015-04-08"], ["14", "22", "2015-04-21"], ["14", "36", "2015-05-14"], ["14", "40", "2015-06-02"],
  ["16", "2", "2015-07-06"], ["16", "6", "2015-07-06"], ["16", "11", "2015-07-20"], ["16", "14", "2015-08-11"],
  ["16", "17", "2015-08-11"], ["16", "20", "2015-09-15"], ["16", "23", "2015-10-05"], ["16", "25", "2015-10-19"],
  ["16", "28", "2015-11-09"], ["16", "33", "2015-11-27"],
];

/** Квартиры «Глубина-Строя» вне окна: [id, квартира в Заводской, 3, дата] */
const EARLY_LATE_FLATS: readonly [id: number, apt: string, acquired: string][] = [
  [398, "5", "2014-08-12"],
  [399, "9", "2015-02-10"],
  [423, "14", "2016-06-14"],
];

const GS_POSITIONS = ["бетонщик", "монтажник", "крановщик", "прораб", "геодезист", "водитель", "электромонтёр", "сварщик", "мастер участка", "плотник"] as const;

// ==================================================================== посадка

export function plant(ctx: WorldContext): void {
  const rng = ctx.rng("c07");
  const people = makePeople(ctx, rng);
  plantFlats(ctx, rng, people.builders);
  plantEmployment(ctx, rng, people.builders);
  plantResettlers(ctx, rng, people.resettlers);
  plantMoney(ctx, rng);
  plantPlayerExit(ctx);
  plantExclusions(ctx);
}

// ==================================================================== люди

/**
 * Свободный id таблицы (без резервирования): ctx.insert сам пометит его
 * занятым. ctx.nextId здесь не годится — он резервирует id, и insert
 * посчитал бы его чужим.
 */
const idCursor = new WeakMap<WorldContext, Map<string, number>>();

/** Наименьший свободный id: курсор по таблице, чтобы не сканировать с единицы на каждой вставке */
function freeId(ctx: WorldContext, table: string): number {
  let cursors = idCursor.get(ctx);
  if (!cursors) idCursor.set(ctx, (cursors = new Map()));
  let id = cursors.get(table) ?? 1;
  while (ctx.isIdUsed(table, id)) id++;
  cursors.set(table, id);
  return id;
}

interface Planted {
  id: number;
  last: string;
  first: string;
  middle: string;
  sex: "М" | "Ж";
  short: string;
  birth: string;
}

/** Фамилии каста (без женского «а»): посаженные жители не должны путаться с ними */
const CAST_SURNAMES = new Set(F.CAST_PERSONS.map((p) => p.last.replace(/а$/, "")));
const ACROSTIC_SHORT = new Set(F.ACROSTIC.map((a) => shortName(a.right, a.first, a.middle)));

function makePeople(ctx: WorldContext, rng: Rng): { builders: Planted[]; resettlers: Planted[] } {
  const used = new Set<string>();
  const person = (sex: "М" | "Ж", birthFrom: string, birthTo: string): Planted => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const male = rng.pick(SURNAMES);
      if (CAST_SURNAMES.has(male)) continue;
      const last = sex === "Ж" ? feminineSurname(male) : male;
      const first = sex === "М" ? rng.pick(MALE_NAMES) : rng.pick(FEMALE_NAMES);
      const [m, f] = rng.pick(PATRONYMICS);
      const middle = sex === "М" ? m : f;
      const short = shortName(last, first, middle);
      if (used.has(short) || ACROSTIC_SHORT.has(short)) continue;
      used.add(short);
      const lo = parseTs(birthFrom);
      const hi = parseTs(birthTo);
      const birth = fmtDate(Math.floor(rng.float(lo, hi) / DAY) * DAY);
      const id = freeId(ctx, "persons");
      const row = {
        id, last_name: last, first_name: first, patronymic: middle, birth_date: birth, sex,
        father_id: null, mother_id: null, prev_last_name: null, special_marks: null, death_date: null,
        created_at: fmtTs(personCreatedAt(id)),
      };
      // Случайные ФИО — как у шума: чужие исключения (резервы фамилий других посадок) соблюдаются
      if (ctx.isExcluded("persons", row)) continue;
      ctx.insert("persons", row);
      return { id, last, first, middle, sex, short, birth };
    }
    throw new WorldGenError("c07: не удалось подобрать уникальное ФИО");
  };
  // Строители: 18 в окне 7.1 и трое с квартирами 2014 и 2016 года — почти все мужчины
  const builders = Array.from({ length: C07.builders + EARLY_LATE_FLATS.length }, (_, i) =>
    person(i % 9 === 4 ? "Ж" : "М", "1964-01-01", "1991-12-31")
  );
  // Переселенцы Старого Створа: рыбацкие семьи, по одному получателю на домохозяйство
  const resettlers = Array.from({ length: C07.resettlers }, () =>
    person(rng.chance(0.45) ? "Ж" : "М", "1942-01-01", "1987-12-31")
  );
  return { builders, resettlers };
}

// ==================================================================== квартиры и прописки

function address(ctx: WorldContext, district: string, street: string, house: string, apt: string): number {
  const id = freeId(ctx, "addresses");
  ctx.insert("addresses", { id, district, street, house, apt });
  return id;
}

function registration(ctx: WorldContext, person: number, addressId: number, from: string, to: string | null): void {
  ctx.insert("registrations", { id: freeId(ctx, "registrations"), person_id: person, address_id: addressId, from_date: from, to_date: to });
}

function plantFlats(ctx: WorldContext, rng: Rng, builders: readonly Planted[]): void {
  interface Flat { house: string; apt: string; acquired: string; owner: number; registered: string }
  const shift = (date: string, days: number) => fmtDate(parseTs(date) + days * DAY);
  const flats: Flat[] = [
    ...BUILDER_FLATS.map(([house, apt, acquired], i) => ({
      house, apt, acquired, owner: builders[i].id, registered: shift(acquired, rng.int(2, 12)),
    })),
    ...C07_OUTSIDERS.map((o) => ({ house: o.house, apt: o.apt, acquired: o.acquired, owner: o.person, registered: o.registered })),
  ].sort((a, b) => a.acquired.localeCompare(b.acquired) || Number(a.house) - Number(b.house) || Number(a.apt) - Number(b.apt));
  if (flats.length !== C07.flatIdTo - C07.flatIdFrom + 1) throw new WorldGenError(`c07: квартир ${flats.length}, а не 22`);

  flats.forEach((f, i) => {
    const addressId = address(ctx, "Старый город", "Северная", f.house, f.apt);
    ctx.insert("properties", {
      id: C07.flatIdFrom + i, address_id: addressId, address_text: `Северная, ${f.house}-${f.apt}`, owner_person_id: f.owner,
      acquired_at: f.acquired, basis: "передача от работодателя", grantor_company_id: GS,
    });
    registration(ctx, f.owner, addressId, f.registered, null);
    // Тамара Викторовна прожила на Северной, 14-27 три месяца
    if (f.owner === F.PERSON.ratnikov) registration(ctx, F.PERSON.tamara, addressId, f.registered, "2016-03-14");
  });

  // Квартиры «Глубина-Строя» вне окна 7.1 — тоже строителям
  EARLY_LATE_FLATS.forEach(([id, apt, acquired], i) => {
    const owner = builders[C07.builders + i];
    const addressId = address(ctx, "Промзона", "Заводская", "3", apt);
    ctx.insert("properties", {
      id, address_id: addressId, address_text: `Заводская, 3-${apt}`, owner_person_id: owner.id, acquired_at: acquired,
      basis: "передача от работодателя", grantor_company_id: GS,
    });
    registration(ctx, owner.id, addressId, shift(acquired, rng.int(3, 15)), null);
  });

  // Ловушка 7.1 «по основанию, без дарителя»: в 2015-м служебную квартиру дал и
  // другой работодатель. Шум даёт такие строки редко и не в каждом мире — сажаем
  ctx.reserve("person:adult", String(C07_DECOY_FLAT.owner), { bornFrom: "1962-01-01", bornTo: "1988-12-31" });
  const decoyAddress = address(ctx, "Старый город", "Мира", C07_DECOY_FLAT.house, C07_DECOY_FLAT.apt);
  ctx.insert("properties", {
    id: freeId(ctx, "properties"), address_id: decoyAddress, address_text: `Мира, ${C07_DECOY_FLAT.house}-${C07_DECOY_FLAT.apt}`,
    owner_person_id: C07_DECOY_FLAT.owner, acquired_at: C07_DECOY_FLAT.acquired, basis: "передача от работодателя",
    grantor_company_id: F.COMPANY.medsanchast,
  });
}

/** Служебная квартира «Медсанчасти» 2015 года (житель шума, взрослый) — ловушка задачи 7.1 */
export const C07_DECOY_FLAT = { owner: 2733, house: "31", apt: "6", acquired: "2015-09-14" } as const;

// ==================================================================== работа

function plantEmployment(ctx: WorldContext, rng: Rng, builders: readonly Planted[]): void {
  const job = (person: number | null, company: number, position: string, from: string, to: string | null) =>
    ctx.insert("employment", { id: freeId(ctx, "employment"), person_id: person, company_id: company, position, from_date: from, to_date: to });
  const randomDate = (from: string, to: string) => fmtDate(Math.floor(rng.float(parseTs(from), parseTs(to)) / DAY) * DAY);

  // Строители: на стройке до квартиры и до ликвидации «Глубина-Строя» (2017-06-30) или раньше
  builders.forEach((b, i) => {
    const early = i >= C07.builders && i < C07.builders + 2;
    const from = early ? randomDate("2013-04-01", "2014-03-31") : randomDate("2013-04-01", "2014-12-31");
    const to = rng.chance(0.7) ? "2017-06-30" : randomDate("2016-07-01", "2017-05-31");
    job(b.id, GS, rng.pick(GS_POSITIONS), from, to);
  });

  // Петров (ложный след 7.2) — «врач-терапевт» АНО «Медсанчасть Створ» (90): строку сажает core (F.CAST_EMPLOYMENT)

  // Внешние подрядчики «Глубина-Строя»: person_id нет — NOT IN по employment даёт ноль строк
  const contractors: [string, string | null][] = [
    ["2014-03-11", "2015-11-30"], ["2014-06-02", "2016-04-29"], ["2015-02-16", "2016-10-31"], ["2015-08-03", "2017-06-30"],
  ];
  for (const [from, to] of contractors) job(null, GS, "подрядчик (внешний)", from, to);
}

// ==================================================================== переселенцы

function plantResettlers(ctx: WorldContext, rng: Rng, resettlers: readonly Planted[]): void {
  // Новые дома для переселенцев в конце Горняцкой (шум улицу дальше дома 22 не застраивает)
  const houses: [string, number][] = [["23", 30], ["25", 27]];
  let k = 0;
  for (const [house, flats] of houses) {
    for (let apt = 1; apt <= flats && k < resettlers.length; apt++, k++) {
      const p = resettlers[k];
      const addressId = address(ctx, "Шахтный", "Горняцкая", house, String(apt));
      const moved = fmtDate(Math.floor(rng.float(parseTs("2014-11-03"), parseTs("2015-06-30")) / DAY) * DAY);
      registration(ctx, p.id, addressId, moved, null);
    }
  }
  if (k !== resettlers.length) throw new WorldGenError("c07: не всем переселенцам хватило квартир");

  const fund = { counterparty: FUND_NAME, counterparty_account: C07.fundAccount, channel: "перевод" };
  for (const p of resettlers) {
    const account = ctx.unique("account", () => `ACC-${rng.int(42_000, 48_999)}`);
    const opened = Math.floor(rng.float(parseTs("2015-03-10"), parseTs("2015-05-29")) / DAY) * DAY;
    ctx.insert("accounts", {
      id: account, holder_person_id: p.id, holder_company_id: null, holder_name: p.short, bank: "Северный кредит",
      opened_at: fmtDate(opened),
    });
    const paid = Math.floor((opened + rng.float(20, 200) * DAY) / DAY) * DAY + workTime(rng);
    tx(ctx, { ts: fmtTs(paid), account_id: account, amount: C07.resettlerPayment, ...fund, purpose: C07.purpose.resettler });
  }
}

// ==================================================================== деньги фонда

function workTime(rng: Rng): number {
  return Math.floor(rng.float(9.5, 16.5) * HOUR / 1000) * 1000;
}

function tx(ctx: WorldContext, row: Row): void {
  ctx.insert("transactions", row, { orderAt: parseTs(String(row.ts)) });
}

/** Число месяца; выходной — на пятницу (как у фонда с Пахомовой: платёжный день) */
function payday(year: number, month: number, day: number): number {
  let at = Date.UTC(year, month, day);
  while (weekday(at) === 0 || weekday(at) === 6) at -= DAY;
  return at;
}

function plantMoney(ctx: WorldContext, rng: Rng): void {
  const holders: Row[] = [
    { id: C07.account.ratnikov, holder_person_id: F.PERSON.ratnikov, holder_company_id: null, holder_name: "Ратников Л. Б.", bank: "Северный кредит", opened_at: "2009-04-20" },
    { id: C07.account.shubin, holder_person_id: F.PERSON.shubin, holder_company_id: null, holder_name: "Шубин А. А.", bank: "Северный кредит", opened_at: "2011-02-14" },
    { id: C07.account.miroshnik, holder_person_id: F.PERSON.alla, holder_company_id: null, holder_name: "Мирошник А. Д.", bank: "Северный кредит", opened_at: "2012-09-03" },
  ];
  for (const a of holders) {
    ctx.insert("accounts", a);
    ctx.reserve("account", String(a.id));
  }
  const fund = { counterparty: FUND_NAME, counterparty_account: C07.fundAccount, channel: "перевод" };

  // Ратников: 24 платежа «на лечение» и 24 возврата. Сентябрьский и октябрьский
  // 2016 года он держал два месяца и вернул одним днём — две одинаковые строки.
  const double = parseTs(C07.doubleRefundAt);
  let refunds = 0;
  for (let i = 0; i < 24; i++) {
    const y = 2016 + Math.floor(i / 12);
    const m = i % 12;
    const at = payday(y, m, 10) + workTime(rng);
    tx(ctx, { ts: fmtTs(at), account_id: C07.account.ratnikov, amount: C07.ratnikovPayment, ...fund, purpose: C07.purpose.ratnikov });
    const held = y === 2016 && (m === 8 || m === 9);
    let back = held ? double : Math.floor((at + rng.int(2, 6) * DAY) / DAY) * DAY + workTime(rng);
    while (!held && (weekday(back) === 0 || weekday(back) === 6)) back += DAY;
    tx(ctx, { ts: fmtTs(back), account_id: C07.account.ratnikov, amount: -C07.ratnikovPayment, ...fund, purpose: C07.purpose.refund });
    refunds++;
  }
  if (refunds !== 24) throw new WorldGenError("c07: возвратов Ратникова должно быть 24");

  // Шубин: 36 × 40 000 (01.2016–12.2018), Мирошник: 24 × 30 000 (04.2015–03.2017); возвратов нет
  for (let i = 0; i < 36; i++) {
    const at = payday(2016 + Math.floor(i / 12), i % 12, 15) + workTime(rng);
    tx(ctx, { ts: fmtTs(at), account_id: C07.account.shubin, amount: C07.shubinPayment, ...fund, purpose: C07.purpose.shubin });
  }
  for (let i = 0; i < 24; i++) {
    const month = 3 + i;
    const at = payday(2015 + Math.floor(month / 12), month % 12, 6) + workTime(rng);
    tx(ctx, { ts: fmtTs(at), account_id: C07.account.miroshnik, amount: C07.miroshnikPayment, ...fund, purpose: C07.purpose.miroshnik });
  }

  // Обычная жизнь на счёте Ратникова: денежное довольствие и аптека — лента без фильтра длиннее 48 строк
  for (let y = 2025, m = 5; y * 12 + m <= 2026 * 12 + 11; ) {
    const at = payday(y, m, 20) + Math.floor(rng.float(9, 11) * HOUR / 1000) * 1000;
    if (at < parseTs(F.CASE_START.c07)) {
      tx(ctx, {
        ts: fmtTs(at), account_id: C07.account.ratnikov, amount: 61_400, counterparty: "ГУ МВД по г. Полынья",
        counterparty_account: null, channel: "перевод", purpose: "денежное довольствие",
      });
    }
    m++;
    if (m === 12) {
      m = 0;
      y++;
    }
  }
  for (const at of ["2026-09-14 18:22:41", "2026-10-27 19:05:13", "2026-12-03 17:48:09"]) {
    tx(ctx, {
      ts: at, account_id: C07.account.ratnikov, amount: -186, counterparty: "Аптека «Северная»", counterparty_account: null,
      channel: "карта", purpose: "нитроглицерин",
    });
  }
}

// ==================================================================== СКУД

/** Пропуск игрока выходит из здания в 23:41 (часы Д7 встают на 23:30): М14 */
function plantPlayerExit(ctx: WorldContext): void {
  ctx.insert("door_access", { ts: C07.playerExit, badge_id: F.BADGE.player, door: "КПП-1", direction: "выход", note: null }, { orderAt: parseTs(C07.playerExit) });
}

// ==================================================================== исключения для шума

function plantExclusions(ctx: WorldContext): void {
  const outsiders = new Set<number>(C07_OUTSIDERS.map((o) => o.person));
  ctx.exclude("properties", (r) => r.grantor_company_id === GS || /^Северная, 1[46](-|$)/.test(String(r.address_text ?? "")),
    "жилфонд «Глубина-Строя» и дома Северная, 14 и 16 — только посадка c07");
  ctx.exclude("employment", (r) => r.company_id === GS && (r.person_id === null || r.person_id === undefined || outsiders.has(Number(r.person_id))),
    "подрядчики «Глубина-Строя» и посторонние — только посадка c07");
  const eveningFrom = F.CASE_START.c07;
  const eveningTo = "2026-12-22 00:00:00";
  ctx.exclude("hospital_admissions", (r) =>
    r.person_id === F.PERSON.ratnikov || /^Ратников/.test(String(r.full_name ?? "")) ||
    (String(r.admitted_at) >= eveningFrom && String(r.admitted_at) < eveningTo),
    "7.6: последняя госпитализация вечера 21.12 — только живая строка 601");
}
