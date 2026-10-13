import type { Row, WorldContext } from "../context";
import { DAY, fmtTs, hourOfDay, parseTs } from "../rng";
import * as F from "../facts";

/**
 * Посадка дела `case-01-med` — «Медь» (разд. 5.1 и 8.4 библии, блок «Д1»).
 *
 * - incidents 1683, 1690, 1697 — утренние заявления о краже кабеля
 *   с ПС «Промзона-2» (КУСП 4688, 4703, 4717), якоря по времени.
 *   Плюс две плавающие строки: ночной звонок сторожа 02.12 (вид не «кража» —
 *   отсекает запрос без фильтра по виду) и кража кабеля 12.11 в Гавани
 *   (вне окна — отсекает запрос без BETWEEN).
 * - vehicles: ровно 14 «Сайгаков», 5 из них записаны как 'Сайгак'; синих —
 *   два: К372ОК Шпакова (с учёта не снят, не продан) и М537ТН (снят 2024-04-11).
 *   Е372ВХ — белая «Вега Гранд» врача; Р037АА — хлебовоз («Сайгак Next»).
 *   id машин — цифры номера, как у К404ТО (404) и О114РБ (114).
 * - plate_reads: камера 12 в ночи 30.11, 01.12, 02.12 (окно 01:00–04:00):
 *   К372ОК 02:47, K372OK (латиница, ошибка OCR) 02:41, К372ОК 02:52,
 *   Е372ВХ 03:30. Дневные проезды К372ОК через ту же камеру и ночные через
 *   камеру 3 — чтобы «в эти ночи» и «через камеру 12» были нужны.
 *   Транзитный А372ТМ на камере 2 в окне — ловит забытый camera_id.
 *   Хлебовоз Р037АА — каждую ночь через камеру 12 в 05:00–05:10.
 *
 * Шум: ни одной машины «Сайгак» и ни одного номера с «372» в шуме; на
 * камере 12 в ночи 29.11–03.12 нет номеров с «37», кроме посаженных;
 * кражи «кабел…» с 16.11 — только посаженные.
 */

/** Ключевые значения дела «Медь» (для тестов дела и для соседних посадок) */
export const C01 = {
  incidents: {
    first: { id: 1683, kusp: 4688, at: "2026-11-30 08:20:00" },
    second: { id: 1690, kusp: 4703, at: "2026-12-01 08:05:00" },
    third: { id: 1697, kusp: 4717, at: "2026-12-02 08:15:00" },
  },
  theftText: "Срезан медный кабель, ПС «Промзона-2»",
  substationAddress: "Энергетиков, 21 (ПС «Промзона-2»)",
  watchmanCall: "2026-12-02 02:55:00",
  earlierCableTheft: "2026-11-12 10:25:00",
  camera: F.CAMERA.promzonaExit,
  plates: {
    van: F.PLATE.shpakovVan,
    /** Ошибка OCR: все три буквы латинские. В vehicles такого номера нет */
    vanLatin: "K372OK",
    vega: "Е372ВХ",
    scrapped: "М537ТН",
    bread: "Р037АА",
    /** Транзит (в реестре города нет): камера 2, в окне второй ночи */
    transit: "А372ТМ",
    /** «Сайгак» доставки ПАО «Сияние» — ложный след камеры 7 в Д3 можно брать отсюда */
    deliveryVan: "В615КР",
  },
  vehicleIds: { van: 372, scrapped: 537, vega: 1372, bread: 37 },
  /** Проезды фургона через камеру 12 в три ночи (задача 1.4) */
  vanNightReads: [
    { at: "2026-11-30 02:47:00", plate: "К372ОК" },
    { at: "2026-12-01 02:41:00", plate: "K372OK" },
    { at: "2026-12-02 02:52:00", plate: "К372ОК" },
  ],
  vegaRead: "2026-12-01 03:30:00",
  nights: ["2026-11-30", "2026-12-01", "2026-12-02"],
  /** Окно задач 1.2 и 1.4: с 01:00:00 до 04:00:00 каждой из трёх ночей */
  window: { from: "01:00:00", to: "04:00:00" },
  saigakTotal: 14,
  saigakExact: 5,
} as const;

/** Кириллица в номерах — латинские двойники OCR (как в pools.HOMOGLYPHS) */
const LATIN_TO_CYR: Readonly<Record<string, string>> = {
  A: "А", B: "В", E: "Е", K: "К", M: "М", H: "Н", O: "О", P: "Р", C: "С", T: "Т", Y: "У", X: "Х",
};
const cyr = (plate: string) => [...plate].map((c) => LATIN_TO_CYR[c] ?? c).join("");

const OFFICERS_2026 = [131, 139] as const; // действующие полицейские из core (staff:officer)

interface VehicleFact {
  id: number;
  plate: string;
  make: string;
  model: string;
  color: string;
  year: number;
  personId?: number;
  companyId?: number;
  /** Владелец не значится в ПБД: persons — не весь город, а только «попавшие» в полицию */
  ownerName?: string;
  registered: string;
  deregistered?: string;
}

/**
 * Все 14 «Сайгаков» мира. Написания марки: 'Сайгак' ×5, 'САЙГАК' ×4,
 * 'СайгаК' ×2, 'Сайгак Next' ×3. Синих — два (К372ОК и М537ТН).
 */
const SAIGAKS: readonly VehicleFact[] = [
  { id: 372, plate: "К372ОК", make: "САЙГАК", model: "фургон", color: "синий", year: 2016, personId: F.PERSON.shpakov, registered: "2019-06-14" },
  { id: 537, plate: "М537ТН", make: "Сайгак", model: "фургон", color: "синий", year: 2005, companyId: F.COMPANY.ukShakhtny, registered: "2011-03-22", deregistered: "2024-04-11" },
  { id: 166, plate: "Т166АВ", make: "Сайгак", model: "фургон", color: "красный", year: 2012, companyId: F.COMPANY.ukShakhtny, registered: "2013-05-30" },
  { id: 829, plate: "Х829ОМ", make: "Сайгак", model: "грузопассажирский", color: "серебристый", year: 2015, companyId: F.COMPANY.bank, registered: "2016-09-12" },
  { id: 463, plate: "С463ТЕ", make: "Сайгак", model: "фургон", color: "зелёный", year: 2009, ownerName: "Мамонтов Игорь Васильевич", registered: "2014-07-03" },
  { id: 281, plate: "Е281РМ", make: "Сайгак", model: "грузопассажирский", color: "чёрный", year: 2011, ownerName: "Белоусова Наталья Олеговна", registered: "2015-10-08" },
  { id: 744, plate: "О744МУ", make: "САЙГАК", model: "ГФ-2", color: "серый", year: 2018, companyId: F.COMPANY.glubina, registered: "2019-11-20" },
  { id: 726, plate: "М726ВС", make: "САЙГАК", model: "ГФ-2", color: "белый", year: 2013, companyId: F.COMPANY.medsanchast, registered: "2014-01-17" },
  { id: 154, plate: "Н154ОР", make: "САЙГАК", model: "фургон", color: "белый", year: 2021, ownerName: "Зайнуллин Артур Ренатович", registered: "2021-12-06" },
  { id: 951, plate: "А951ЕК", make: "СайгаК", model: "грузопассажирский", color: "белый", year: 2020, companyId: F.COMPANY.glubina, registered: "2021-02-02" },
  { id: 590, plate: "У590НВ", make: "СайгаК", model: "фургон", color: "жёлтый", year: 2017, ownerName: "Остапенко Виктор Андреевич", registered: "2018-04-25" },
  { id: 615, plate: "В615КР", make: "Сайгак Next", model: "фургон", color: "белый", year: 2022, companyId: F.COMPANY.siyanie, registered: "2022-08-09" },
  { id: 208, plate: "Н208ХС", make: "Сайгак Next", model: "фургон", color: "белый", year: 2023, companyId: F.COMPANY.siyanie, registered: "2023-03-15" },
  { id: 37, plate: "Р037АА", make: "Сайгак Next", model: "фургон", color: "белый", year: 2019, ownerName: "Гасанов Рамиз Эльдарович", registered: "2020-01-28" },
];

const VEGA: VehicleFact = {
  id: 1372, plate: "Е372ВХ", make: "Вега", model: "Гранд", color: "белый", year: 2020, companyId: F.COMPANY.medsanchast, registered: "2020-11-03",
};

const ts = parseTs;

export function plant(ctx: WorldContext): void {
  plantIncidents(ctx);
  plantVehicles(ctx);
  plantPlateReads(ctx);
  plantExclusions(ctx);
}

// ==================================================================== incidents

function plantIncidents(ctx: WorldContext): void {
  const { first, second, third } = C01.incidents;
  const thefts = [
    { ...first, applicant: "Корнеев В. А. (мастер ПС «Промзона-2»)", officer: OFFICERS_2026[0] },
    { ...second, applicant: "Корнеев В. А. (мастер ПС «Промзона-2»)", officer: OFFICERS_2026[1] },
    { ...third, applicant: "Дежурный ПС «Промзона-2» Ляхов С. Т.", officer: OFFICERS_2026[0] },
  ];
  for (const t of thefts) {
    ctx.insert("incidents", {
      id: t.id, kusp_no: t.kusp, reported_at: t.at, kind: "кража", district: "Промзона",
      address_text: C01.substationAddress, description: C01.theftText, vehicle_id: null,
      applicant_text: t.applicant, officer_staff_id: t.officer, status: "проверка", x_m: null, y_m: null,
    }, { orderAt: ts(t.at) });
    ctx.reserve("kusp:2026", String(t.kusp));
  }

  // Ночной звонок сторожа: «Сайгак», «вроде 372». Не «кража» — заявление пришло утром
  ctx.insert("incidents", {
    reported_at: C01.watchmanCall, kind: "сообщение гражданина", district: "Промзона",
    address_text: C01.substationAddress,
    description: "Сторож подстанции: от ограды отъехал синий фургон «Сайгак», номер вроде 372, в кузове кабель. Наряд прибыл в 03:20, никого",
    vehicle_id: null, applicant_text: "Валиев Р. Н. (сторож ПС «Промзона-2»)", officer_staff_id: OFFICERS_2026[1],
    status: "проверка", x_m: null, y_m: null,
  }, { orderAt: ts(C01.watchmanCall) });

  // Кража кабеля до серии и в другом районе: без BETWEEN строк больше трёх
  ctx.insert("incidents", {
    reported_at: C01.earlierCableTheft, kind: "кража", district: "Гавань", address_text: "Причальная, 6 (склад порта)",
    description: "Кража кабеля со склада порта, вскрыт контейнер", vehicle_id: null,
    applicant_text: "Тимофеев Д. Е. (кладовщик)", officer_staff_id: OFFICERS_2026[0], status: "передано в ОУР", x_m: null, y_m: null,
  }, { orderAt: ts(C01.earlierCableTheft) });
}

// ==================================================================== vehicles

function vehicleRow(v: VehicleFact): Row {
  const companyName = v.companyId !== undefined ? F.COMPANY_NAME[v.companyId] : undefined;
  const person = v.personId !== undefined ? F.CAST_PERSONS.find((p) => p.id === v.personId) : undefined;
  const personName = person ? [person.last, person.first, person.middle].filter(Boolean).join(" ") : undefined;
  return {
    id: v.id, plate: v.plate, make: v.make, model: v.model, color: v.color, year: v.year,
    owner_person_id: v.personId ?? null, owner_company_id: v.companyId ?? null,
    owner_name: personName ?? companyName ?? v.ownerName ?? null,
    registered_at: v.registered, sold_at: null, deregistered_at: v.deregistered ?? null,
  };
}

function plantVehicles(ctx: WorldContext): void {
  for (const v of [...SAIGAKS, VEGA]) {
    ctx.insert("vehicles", vehicleRow(v));
    ctx.reserve("plate", v.plate);
  }
  ctx.reserve("plate", C01.plates.vanLatin);
  ctx.reserve("plate", C01.plates.transit);
}

// ==================================================================== plate_reads

function plantPlateReads(ctx: WorldContext): void {
  const read = (at: string, camera: number, plate: string, direction: string, confidence: number) =>
    ctx.insert("plate_reads", { camera_id: camera, plate, read_at: at, confidence, direction }, { orderAt: ts(at) });
  const cam12 = C01.camera;
  const bypass = F.CAMERA.bypass;
  const van = C01.plates.van;

  // Три ночи: камера 12 на выезде из Промзоны, затем камера 3 на Объездной
  read("2026-11-30 02:47:00", cam12, van, "выезд", 0.93);
  read("2026-11-30 02:58:13", bypass, van, "из центра", 0.92);
  read("2026-12-01 02:41:00", cam12, C01.plates.vanLatin, "выезд", 0.68);
  read("2026-12-01 02:53:40", bypass, van, "из центра", 0.91);
  read("2026-12-02 02:52:00", cam12, van, "выезд", 0.94);
  read("2026-12-02 03:04:05", bypass, van, "из центра", 0.93);
  // Тот же фургон через камеру 12 днём (за металлом на Складскую): «в эти ночи» — не любое время
  read("2026-11-27 13:14:26", cam12, van, "въезд", 0.96);
  read("2026-12-01 14:22:51", cam12, van, "въезд", 0.97);
  read("2026-12-03 10:41:09", cam12, van, "выезд", 0.95);
  // Белая «Вега» врача: ночной вызов в Промзону
  read(C01.vegaRead, cam12, C01.plates.vega, "въезд", 0.95);
  // Транзит с «372» на другой камере в окне второй ночи
  read("2026-12-01 02:15:37", F.CAMERA.trudaSquare, C01.plates.transit, "в центр", 0.9);

  // Хлебовоз: каждую ночь через камеру 12 в 05:00–05:10 (ни одна строка не на границе)
  const rng = ctx.rng("plant.c01.bread");
  const from = ts("2026-11-15 00:00:00");
  const to = ts("2027-01-11 00:00:00");
  for (let day = from; day <= to; day += DAY) {
    const at = day + 5 * 3_600_000 + rng.int(60, 9 * 60 + 59) * 1000;
    read(fmtTs(at), cam12, C01.plates.bread, "въезд", Math.round(rng.float(0.9, 0.99) * 100) / 100);
  }
}

// ==================================================================== исключения для шума

const SAIGAK_RE = /сайгак/i;
const CABLE_RE = /кабел/i;
const PLANTED_PLATES = new Set<string>([...SAIGAKS, VEGA].map((v) => v.plate).concat(C01.plates.transit));
const NIGHTS_FROM = ts("2026-11-29 00:00:00");
const NIGHTS_TO = ts("2026-12-04 00:00:00");
const CABLE_FROM = ts("2026-11-16 00:00:00");

function plantExclusions(ctx: WorldContext): void {
  // Ровно 14 «Сайгаков» — все посажены; номеров с «372» в реестре — два
  ctx.exclude("vehicles", (r) => SAIGAK_RE.test(String(r.make ?? "")) || String(r.plate ?? "").includes("372"), "c01: «Сайгаки» и «372» — только посадки");

  ctx.exclude("plate_reads", (r) => {
    const plate = String(r.plate ?? "");
    if (plate.includes("372")) return true;
    if (PLANTED_PLATES.has(cyr(plate))) return true;
    if (Number(r.camera_id) !== C01.camera || !plate.includes("37") || r.read_at === undefined) return false;
    const t = ts(String(r.read_at));
    return t >= NIGHTS_FROM && t < NIGHTS_TO && hourOfDay(t) < 6;
  }, "c01: камера 12 в три ночи — только посаженные «372» и хлебовоз");

  // Кражи кабеля с 16.11 — только посаженные (задача 1.1: ровно три строки)
  ctx.exclude("incidents", (r) => {
    if (r.description === undefined || r.reported_at === undefined) return false;
    return CABLE_RE.test(String(r.description)) && ts(String(r.reported_at)) >= CABLE_FROM;
  }, "c01: кражи кабеля в ноябре–декабре — только посадки");
}
