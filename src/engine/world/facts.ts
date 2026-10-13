/**
 * Ключевые константы мира «Полыньи» (разд. 8.4 библии, верхняя таблица и
 * сквозная хроника вмешательств). Ими пользуются посадка core.ts, тесты
 * фактов и тексты дел. Значения здесь — правда сезона: менять их можно
 * только вместе с библией.
 *
 * Время — местное (UTC+3), дата-время всегда с секундами.
 */

export const WORLD_SEED = "POLYNYA-S1";
/** Версия генератора: входит в ключ кеша байтов мира (world:<version>:<seed>) */
export const WORLD_GENERATOR_VERSION = 2;

// ------------------------------------------------------------------ дела

export type CaseKey =
  | "c00" | "c01" | "c02" | "c03" | "c04" | "c05" | "c06"
  | "c07" | "c08" | "c09" | "c10" | "c11" | "c12";

export const CASE_KEYS: readonly CaseKey[] = [
  "c00", "c01", "c02", "c03", "c04", "c05", "c06", "c07", "c08", "c09", "c10", "c11", "c12",
];

/** Полные id дел (TECH_SPEC, разд. 2) */
export const CASE_IDS: Readonly<Record<CaseKey, string>> = {
  c00: "case-00-nulevoy-etazh",
  c01: "case-01-med",
  c02: "case-02-minus-41",
  c03: "case-03-polyarnaya",
  c04: "case-04-mertvaya-dusha",
  c05: "case-05-nomer-3312",
  c06: "case-06-polynya",
  c07: "case-07-sluzhebnaya-kvartira",
  c08: "case-08-prizrak",
  c09: "case-09-matryoshka",
  c10: "case-10-kopirka",
  c11: "case-11-chernovik",
  c12: "case-12-pervoe-solntse",
};

/** Игровое время старта каждого дела (разд. 5 и 6.10) */
export const CASE_START: Readonly<Record<CaseKey, string>> = {
  c00: "2026-12-02 18:05:00",
  c01: "2026-12-03 21:30:00",
  c02: "2026-12-07 13:00:00",
  c03: "2026-12-09 15:00:00",
  c04: "2026-12-11 10:00:00",
  c05: "2026-12-15 02:40:00",
  c06: "2026-12-17 08:40:00",
  c07: "2026-12-21 16:00:00",
  c08: "2026-12-24 09:00:00",
  c09: "2026-12-28 11:00:00",
  c10: "2026-12-31 09:00:00",
  c11: "2026-12-31 23:00:00",
  c12: "2027-01-11 11:30:00",
};

export const SEASON = {
  start: "2026-12-02 18:05:00",
  firstSunrise: "2027-01-11 12:58:00",
  finalization: "2027-01-11 13:00:00",
  /** Конец мира: последние живые строки финала */
  end: "2027-01-11 13:00:00",
  election: "2027-01-17",
} as const;

// ------------------------------------------------------------------ люди

/** persons.id каста и упомянутых (верхняя таблица разд. 8.4) */
export const PERSON = {
  granin: 1001,
  ratnikov: 1104,
  tamara: 1105,
  nina: 1210,
  sazonov: 1388,
  valentina: 1389,
  melnik: 1412,
  alla: 1530,
  gromov: 1550,
  shubin: 1602,
  petrov: 1777,
  burtsev: 2214,
  shpakov: 2307,
  pakhomova: 2588,
  oleg: 2589,
  kimSergey: 3070,
  dasha: 3071,
  loseva: 3112,
  eliseev: 3305,
  lapina: 3550,
  lapteva: 3611,
  misha: 3612,
  irina: 4127,
  lykov: 4210,
  kravets: 4301,
  player: 9000,
} as const;

/** Наряд охраны Бурцева 2015 года: приметы обнулены призраком */
export const GUARD_SQUAD_2015 = [1288, 1471, 2650, 3015, 3390] as const;

/**
 * Резерв шумового жителя под посадку (ctx.reserve("person:adult", id, ref)):
 * шум кладёт на этот id живого взрослого, рождённого в [bornFrom, bornTo],
 * и никогда — дубль карточки. Без ref — 30–65 лет на 01.12.2026.
 */
export interface AdultReservation {
  bornFrom: string;
  bornTo: string;
}

/**
 * Инженеры, подписавшие ревизии ПД-117 (разд. 8.4, Д6): construction_docs
 * 101 → 1620, 102 → 1641, 103 → 1702, 105 → 1755, 106 → 1810, 107 → 1843,
 * 108 → 1641 (104 — Гранин). Строки сажает c06; core держит эти id за
 * взрослыми, которым в 2014–2017 годах было 30–60 лет.
 */
export const PD117_ENGINEERS = [1620, 1641, 1702, 1755, 1810, 1843] as const;
export const PD117_ENGINEER_BORN: AdultReservation = { bornFrom: "1956-01-01", bornTo: "1984-12-31" };

/**
 * Верхняя таблица разд. 8.4, поля без отдельного столбца в библии:
 * «соседка Сазоновых (Портовая, 3)», «врач, АНО «Медсанчасть Створ»»,
 * «курьер «Сияние.Доставки»». Номера квартир и даты — решения генератора.
 */
export const ADDRESS = {
  /** Портовая, 3 — квартира Сазоновых (адрес строки 6) */
  sazonovs: { id: 303, district: "Старый город", street: "Портовая", house: "3", apt: "12" },
  /** Портовая, 3 — квартира соседки Лапиной Г. П. (подделка 5204) */
  lapina: { id: 305, district: "Старый город", street: "Портовая", house: "3", apt: "14" },
} as const;

export const CAST_REGISTRATIONS: readonly { person: number; address: keyof typeof ADDRESS; from: string; to: string | null }[] = [
  { person: 1388, address: "sazonovs", from: "1996-05-14", to: null },
  { person: 1389, address: "sazonovs", from: "1996-05-14", to: null },
  { person: 3550, address: "lapina", from: "1979-08-01", to: "2019-10-11" },
];

export const CAST_EMPLOYMENT: readonly { person: number; company: number; position: string; from: string; to: string | null }[] = [
  { person: 1777, company: 90, position: "врач-терапевт", from: "2010-05-17", to: null },
  { person: 2589, company: 1, position: "курьер «Сияние.Доставки»", from: "2024-03-11", to: null },
];
/** Настоящие карточки сотрудников с опечатками в staff.person_id (Д4) */
export const STAFF_TYPO_PERSONS = [1402, 2771, 3095, 3308] as const;

export interface PersonFact {
  id: number;
  last: string;
  first: string;
  /** null — только у игрока */
  middle: string | null;
  sex: "М" | "Ж";
  birth: string;
  death?: string;
  father?: number;
  mother?: number;
  prevLast?: string;
  marks?: string;
  createdAt?: string;
}

/**
 * Посаженные жители. Даты рождения без источника в библии подобраны по
 * возрасту из разд. 2. Приметы наряда 2015 года и Бурцева обнулены
 * призраком (19–21.11.2026): в ПБД special_marks = NULL.
 */
export const CAST_PERSONS: readonly PersonFact[] = [
  { id: 1001, last: "Гранин", first: "Эдуард", middle: "Витальевич", sex: "М", birth: "1967-08-30" },
  { id: 1104, last: "Ратников", first: "Лев", middle: "Борисович", sex: "М", birth: "1968-02-11" },
  { id: 1105, last: "Ратникова", first: "Тамара", middle: "Викторовна", sex: "Ж", birth: "1970-06-23", death: "2016-03-14" },
  { id: 1210, last: "Шустова", first: "Нина", middle: "Фёдоровна", sex: "Ж", birth: "1959-05-02" },
  { id: 1288, last: "Тарасов", first: "Игорь", middle: "Петрович", sex: "М", birth: "1979-03-14" },
  { id: 1388, last: "Сазонов", first: "Пётр", middle: "Ильич", sex: "М", birth: "1968-04-17" },
  { id: 1389, last: "Вальц", first: "Валентина", middle: "Сергеевна", sex: "Ж", birth: "1968-09-01", prevLast: "Сазонова" },
  { id: 1402, last: "Корнилов", first: "Дмитрий", middle: "Олегович", sex: "М", birth: "1983-10-07" },
  { id: 1412, last: "Мельник", first: "Константин", middle: "Игоревич", sex: "М", birth: "1985-03-19" },
  { id: 1471, last: "Гусев", first: "Роман", middle: "Викторович", sex: "М", birth: "1981-12-02" },
  { id: 1530, last: "Мирошник", first: "Алла", middle: "Дмитриевна", sex: "Ж", birth: "1977-01-23" },
  { id: 1550, last: "Громов", first: "Павел", middle: "Андреевич", sex: "М", birth: "1951-11-04" },
  { id: 1602, last: "Шубин", first: "Аркадий", middle: "Алексеевич", sex: "М", birth: "1964-05-28" },
  { id: 1777, last: "Петров", first: "Виктор", middle: "Семёнович", sex: "М", birth: "1961-09-15" },
  { id: 2214, last: "Бурцев", first: "Валерий", middle: "Николаевич", sex: "М", birth: "1972-10-05" },
  { id: 2307, last: "Шпаков", first: "Георгий", middle: "Ильич", sex: "М", birth: "1979-04-11" },
  { id: 2588, last: "Пахомова", first: "Зинаида", middle: "Павловна", sex: "Ж", birth: "1947-03-12", death: "2026-12-06" },
  { id: 2589, last: "Пахомов", first: "Олег", middle: "Викторович", sex: "М", birth: "1990-07-21" },
  { id: 2650, last: "Зуев", first: "Андрей", middle: "Михайлович", sex: "М", birth: "1984-06-30" },
  { id: 2771, last: "Савельева", first: "Ольга", middle: "Игоревна", sex: "Ж", birth: "1988-01-19" },
  { id: 3015, last: "Рябов", first: "Сергей", middle: "Юрьевич", sex: "М", birth: "1977-08-08" },
  { id: 3070, last: "Ким", first: "Сергей", middle: "Андреевич", sex: "М", birth: "1969-11-20" },
  { id: 3071, last: "Ким", first: "Дарья", middle: "Сергеевна", sex: "Ж", birth: "2001-06-14", father: 3070 },
  { id: 3095, last: "Фролов", first: "Артём", middle: "Денисович", sex: "М", birth: "1992-04-25" },
  { id: 3112, last: "Лосева", first: "Полина", middle: "Андреевна", sex: "Ж", birth: "2001-09-03" },
  { id: 3305, last: "Елисеев", first: "Кирилл", middle: "Андреевич", sex: "М", birth: "1988-02-16" },
  { id: 3308, last: "Белова", first: "Марина", middle: "Сергеевна", sex: "Ж", birth: "1994-12-11" },
  { id: 3390, last: "Осипов", first: "Денис", middle: "Владимирович", sex: "М", birth: "1986-05-05" },
  { id: 3550, last: "Лапина", first: "Галина", middle: "Петровна", sex: "Ж", birth: "1941-02-17", death: "2019-10-11" },
  { id: 3611, last: "Лаптева", first: "Елена", middle: "Викторовна", sex: "Ж", birth: "1990-10-02" },
  { id: 3612, last: "Лаптев", first: "Михаил", middle: "Андреевич", sex: "М", birth: "2018-03-09", mother: 3611 },
  { id: 4127, last: "Вальц", first: "Ирина", middle: "Петровна", sex: "Ж", birth: "1997-04-03", father: 1388, mother: 1389 },
  { id: 4210, last: "Лыков", first: "Антон", middle: "Сергеевич", sex: "М", birth: "2002-07-19" },
  { id: 4301, last: "Кравец", first: "Николай", middle: "Николаевич", sex: "М", birth: "1958-11-02", createdAt: "2026-11-20 02:22:00" },
];

/**
 * Акростих Ирины (Д4 → Д10): 17.11.2026, WS-03 офлайн, одна пачка с id
 * 2101–2110. По времени первые буквы дают «СПРОСИНИНУ», по id — «НИСПУИРОСН».
 */
export const ACROSTIC: readonly {
  auditId: number;
  ts: string;
  personId: number;
  wrong: string;
  right: string;
  first: string;
  middle: string;
  sex: "М" | "Ж";
  birth: string;
}[] = [
  { auditId: 2103, ts: "2026-11-17 01:02:00", personId: 2604, wrong: "Сидорв", right: "Сидоров", first: "Геннадий", middle: "Павлович", sex: "М", birth: "1974-02-09" },
  { auditId: 2104, ts: "2026-11-17 01:06:00", personId: 2477, wrong: "Пертов", right: "Петров", first: "Олег", middle: "Николаевич", sex: "М", birth: "1986-07-30" },
  { auditId: 2107, ts: "2026-11-17 01:11:00", personId: 3233, wrong: "Рыбкна", right: "Рыбкина", first: "Светлана", middle: "Игоревна", sex: "Ж", birth: "1991-03-17" },
  { auditId: 2108, ts: "2026-11-17 01:15:00", personId: 2952, wrong: "Орлва", right: "Орлова", first: "Татьяна", middle: "Сергеевна", sex: "Ж", birth: "1979-11-05" },
  { auditId: 2109, ts: "2026-11-17 01:19:00", personId: 3718, wrong: "Семнов", right: "Семёнов", first: "Артём", middle: "Викторович", sex: "М", birth: "1995-05-21" },
  { auditId: 2102, ts: "2026-11-17 01:24:00", personId: 2366, wrong: "Иваов", right: "Иванов", first: "Сергей", middle: "Андреевич", sex: "М", birth: "1969-09-12" },
  { auditId: 2101, ts: "2026-11-17 01:28:00", personId: 3459, wrong: "Никтин", right: "Никитин", first: "Павел", middle: "Олегович", sex: "М", birth: "1983-01-26" },
  { auditId: 2106, ts: "2026-11-17 01:33:00", personId: 2879, wrong: "Ильна", right: "Ильина", first: "Наталья", middle: "Викторовна", sex: "Ж", birth: "1988-08-14" },
  { auditId: 2110, ts: "2026-11-17 01:37:00", personId: 3127, wrong: "Носва", right: "Носова", first: "Елена", middle: "Дмитриевна", sex: "Ж", birth: "1975-12-03" },
  { auditId: 2105, ts: "2026-11-17 01:41:00", personId: 3864, wrong: "Ульнов", right: "Ульянов", first: "Михаил", middle: "Юрьевич", sex: "М", birth: "1990-06-19" },
];
/** Время досинхронизации офлайн-пачки WS-03 с акростихом */
export const ACROSTIC_SYNC_AT = "2026-11-17 08:55:00";

// ------------------------------------------------------------------ сотрудники

/** staff.id каста. 118, 151 и 64 заданы библией, остальные подобраны по дате приёма */
export const STAFF = {
  nina: 3,
  ratnikov: 12,
  gromov: 64,
  melnik: 72,
  lykov: 112,
  irina: 118,
  dasha: 150,
  player: 151,
} as const;

/** staff.id с опечатками в person_id (Д4): 23 → 14020, 57 → 27710, 91 → 30950, 133 → 33080 */
export const STAFF_TYPOS: readonly { staffId: number; personId: number; typo: number }[] = [
  { staffId: 23, personId: 1402, typo: 14020 },
  { staffId: 57, personId: 2771, typo: 27710 },
  { staffId: 91, personId: 3095, typo: 30950 },
  { staffId: 133, personId: 3308, typo: 33080 },
];

export const LOGIN = {
  ratnikov: "l.ratnikov",
  nina: "n.shustova",
  melnik: "k.melnik",
  lykov: "a.lykov",
  irina: "i.valts",
  dasha: "d.kim",
  gromov: "p.gromov",
  player: "nol",
  zero: "zero",
  test: "test1",
} as const;

/** Пропуска СКУД: 'B-' + persons.id (латинская B) */
export const BADGE = {
  ratnikov: "B-1104",
  nina: "B-1210",
  melnik: "B-1412",
  dasha: "B-3071",
  irina: "B-4127",
  lykov: "B-4210",
  player: "B-9000",
} as const;

export const WORKSTATION = {
  irinaDesk: "WS-03",
  serverRoom: "WS-07",
  cron: "CRON-01",
  it: ["WS-IT-01", "WS-IT-02", "WS-IT-03", "WS-IT-04", "WS-IT-05"],
  /** Не в ГУ; появляется только в пост-титрах (патч postcredits.glb) */
  glbCore: "GLB-CORE",
} as const;

// ------------------------------------------------------------------ связь, машины, счета

/** Все телефоны — в вымышленном диапазоне +7 900 000-XX-XX */
export const PHONE = {
  sazonov: "+7 900 000-12-19",
  valentina: "+7 900 000-13-89",
  burtsev: "+7 900 000-22-14",
  irina: "+7 900 000-41-27",
  lykov: "+7 900 000-42-10",
} as const;

/**
 * Номера вида «id человека» (11-04 у Ратникова и т. п.) зарезервированы за
 * кастом: шум их не выдаёт, дела могут посадить их, если понадобятся.
 */
export function castPhoneFor(personId: number): string {
  const s = String(personId).padStart(4, "0");
  return `+7 900 000-${s.slice(0, 2)}-${s.slice(2)}`;
}

/** Госномера (кириллица) */
export const PLATE = {
  taiga: "К404ТО",
  bastion: "О114РБ",
  sazonovCar: "Т117АУ",
  shpakovVan: "К372ОК",
} as const;

export const VEHICLE_ID = { taiga: 404, bastion: 114 } as const;

export const COMPANY = {
  siyanie: 1,
  glubina: 2,
  fund: 3,
  siyaniePay: 4,
  kordon: 12,
  severnyKordon: 13,
  ladogaInvest: 14,
  ladogaLogistik: 15,
  kordonServis: 16,
  shchit: 17,
  glubinaStroy: 18,
  vozvrat: 60,
  ipMelnik: 61,
  ukShakhtny: 80,
  medsanchast: 90,
  mfo: 95,
  bank: 96,
} as const;

export const COMPANY_NAME: Readonly<Record<number, string>> = {
  1: "ПАО «Сияние»",
  2: "АО «Глубина»",
  3: "Фонд «Тёплый берег»",
  4: "ООО «Сияние.Pay»",
  12: "Kordon Holdings Ltd",
  13: "ООО «Северный кордон»",
  14: "ООО «Ладога Инвест»",
  15: "ООО «Ладога-Логистик»",
  16: "ООО «Кордон-Сервис»",
  17: "ЧОП «Щит»",
  18: "ООО «Глубина-Строй»",
  60: "ООО «Возврат»",
  61: "ИП Мельник Е. А.",
  80: "УК «Шахтный»",
  90: "АНО «Медсанчасть Створ»",
  95: "МФО «Деньги Сразу»",
  96: "Банк «Северный кредит»",
};

/** Счета ЗЕРКАЛА ('ACC-nnnnn') */
export const ACCOUNT = {
  pakhomova: "ACC-30518",
  fund: "ACC-10003",
  ladogaInvest: "ACC-10014",
  shchit: "ACC-10017",
  mfo: "ACC-10095",
} as const;

/** Камеры «Дорсети» с сюжетной ролью */
export const CAMERA = {
  trudaSquare: 2,
  bypass: 3,
  polyarnayaMira: 7,
  promzonaExit: 12,
  shchitBase: 15,
  shoreHighway: 22,
  dormitory: 31,
} as const;

// ------------------------------------------------------------------ 2015 год

export const CASE_SAZONOV = "15-0219";

/**
 * Координаты (м, местная сетка): точка строки 7, новый оголовок (ПД-117/изм.3,
 * в 18 м) и старый (ПД-117, в 2 140 м к востоку). Нужны посадкам c06.
 */
export const GEO = {
  row7: { x: 1250, y: 830 },
  outfallNew: { x: 1260.8, y: 844.4 },
  outfallOld: { x: 3390, y: 830 },
} as const;

/** Номера журнала «Сокола» 2015 года */
export const DOC_REG = {
  rapport: 3311,
  missing: 3312,
  scheme: 3313,
  forgedA: 3320,
  forgedB: 3322,
  /** Пропуск «кофе пролила» (Д5) — сажает c05 */
  coffee: 4471,
} as const;

/** id объяснений 2015 года, которых нет в ПБД (дамп 2017 года шёл по журналу) */
export const STATEMENTS_MISSING_IN_PBD = [1187, 1342, 1468, 1590, 1723, 1856, 1914, 2033, 2071, 2072, 2098] as const;
/** Подделки призрака в statements */
export const FORGED_STATEMENTS = [5203, 5204, 5207] as const;

// ------------------------------------------------------------------ хроника 2026

/** incidents и КУСП ночи наезда (core сажает 1612 и 1615; остальные — c03) */
export const INCIDENT = {
  row6: 6,
  row7: 7,
  hitAndRun: 1612,
  theftClaim: 1615,
} as const;
export const KUSP = { hitAndRun: 4515, theftClaim: 4518 } as const;

/** Сеансы призрака под i.valts с WS-07 (разд. 8.4) */
export interface GhostSession {
  n: number;
  start: string;
  end: string;
  total: number;
  deletes: number;
  exports: number;
  /** Время входа Лыкова на КПП-Б0 */
  lykovIn: string;
  /** Две чашки чабреца в «Кипятке» — за 15 минут до начала */
  tea: string;
  /** Время синхронизации пачки (сеанс 1 WS-07 отдала только 10.12) */
  syncAt?: string;
}

export const GHOST_SESSIONS: readonly GhostSession[] = [
  { n: 1, start: "2026-11-19 01:50:00", end: "2026-11-19 02:58:00", total: 60, deletes: 56, exports: 0, lykovIn: "2026-11-19 01:38:00", tea: "2026-11-19 01:35:00", syncAt: "2026-12-10 11:20:00" },
  { n: 2, start: "2026-11-20 01:55:00", end: "2026-11-20 02:41:00", total: 31, deletes: 25, exports: 0, lykovIn: "2026-11-20 01:43:00", tea: "2026-11-20 01:40:00" },
  { n: 3, start: "2026-11-21 02:05:00", end: "2026-11-21 02:57:00", total: 45, deletes: 41, exports: 0, lykovIn: "2026-11-21 01:53:00", tea: "2026-11-21 01:50:00" },
  { n: 4, start: "2026-11-27 01:40:00", end: "2026-11-27 02:12:00", total: 25, deletes: 25, exports: 0, lykovIn: "2026-11-27 01:28:00", tea: "2026-11-27 01:25:00" },
  { n: 5, start: "2026-12-03 02:00:00", end: "2026-12-03 02:31:00", total: 22, deletes: 12, exports: 10, lykovIn: "2026-12-03 01:48:00", tea: "2026-12-03 01:45:00" },
  { n: 6, start: "2026-12-09 01:58:00", end: "2026-12-09 02:30:00", total: 31, deletes: 21, exports: 10, lykovIn: "2026-12-09 01:46:00", tea: "2026-12-09 01:43:00" },
  { n: 7, start: "2026-12-22 02:20:00", end: "2026-12-22 02:51:00", total: 17, deletes: 3, exports: 14, lykovIn: "2026-12-22 02:08:00", tea: "2026-12-22 02:05:00" },
];

/** Ключевые правки призрака (М5 и разд. 8.4) */
export const GHOST_KEY_EDITS = {
  burtsevMarks: "2026-11-19 02:10:00",
  kusp4518Time: "2026-11-20 02:14:00",
  kravetsInsert: "2026-11-20 02:22:00",
  victimUnlinked: "2026-11-21 02:31:00",
  lastBeforeC04: "2026-12-09 02:30:00",
} as const;

export const KEY_TIMES = {
  /** Ирина включает zero */
  zeroEnabled: "2026-11-16 22:41:00",
  /** Голосовое Ирины: создано / доставка на первом солнце */
  voiceCreated: "2026-11-18 23:05:00",
  voiceDelivery: "2027-01-11 12:58:00",
  /** Наезд на Полярной */
  hitAndRun: "2026-11-18 23:10:00",
  theftClaimOriginal: "2026-11-18 23:52:00",
  theftClaimEdited: "2026-11-18 22:40:00",
  /** Выгрузка дела 15-0219 под nol с WS-07 (седьмой сеанс) */
  nolExport: "2026-12-22 02:47:19",
  /** Агент синхронизации на WS-07 */
  agentInstalled: "2026-12-21 03:04:00",
  /** Платежи группы «Щита» */
  shchitBonus: "2026-11-20 14:05:00",
  lykovLoanPaid: "2026-11-12 11:47:00",
  /** Ночная загрузка журнала «Сокола» через staging */
  sokolLoad: "2026-12-14 01:30:00",
} as const;

/** Задания cron Ирины (М6): created_at и дело, после которого задание проверяется */
export const CRON_JOBS: readonly { id: number; createdAt: string; fireAfter: CaseKey; condition: string; sql: string }[] = [
  {
    id: 1, createdAt: "2026-11-16 22:41:00", fireAfter: "c05",
    condition: '{"live":"после o5_1","branch":{"a":{"seen_all":["doc_registry:3311","doc_registry:3313"]},"b":{"seen_any":["doc_registry:3311","doc_registry:3313"]},"c":{"seen_none":["doc_registry:3311","doc_registry:3313"]}}}',
    sql: "SELECT * FROM doc_registry WHERE year = 2015 AND reg_no = 4471; -- не там. Кофе тут ни при чём.",
  },
  {
    id: 2, createdAt: "2026-11-16 22:43:00", fireAfter: "c05",
    condition: '{"seen":"doc_registry:3313"}',
    sql: "SELECT * FROM addresses WHERE street = 'Береговая' AND house = '4'; -- Береговая, 4.",
  },
  {
    id: 3, createdAt: "2026-11-16 22:45:00", fireAfter: "c05",
    condition: '{"not_seen":"construction_docs:ПД-117/изм.3:signed_by_person_id"}',
    sql: "SELECT doc_no, signed_at, signed_by_person_id FROM construction_docs WHERE doc_no LIKE 'ПД-117%'; -- кто подписал перенос?",
  },
  {
    id: 4, createdAt: "2026-11-16 22:47:00", fireAfter: "c06",
    condition: '{"not_seen":"gs_comms_2015:sms:2-14:2015-02-19"}',
    sql: "SELECT * FROM gs_comms_2015 WHERE datetime(ts_unix, 'unixepoch', '+3 hours') BETWEEN '2015-02-19 21:30:00' AND '2015-02-19 22:30:00'; -- его последний вечер. Часы там чужие.",
  },
  {
    id: 5, createdAt: "2026-11-16 22:49:00", fireAfter: "c06", condition: '{"always":true}',
    sql: "SELECT address_text, acquired_at FROM properties WHERE address_text LIKE 'Северная, 14%' AND acquired_at LIKE '2015%'; -- Северная, 14.",
  },
  {
    id: 6, createdAt: "2026-11-16 22:51:00", fireAfter: "c06", condition: '{"always":true}',
    sql: "SELECT counterparty, COUNT(*) FROM transactions WHERE counterparty LIKE '%Тёплый берег%' AND ts < '2016-01-01 00:00:00' GROUP BY counterparty; -- спроси, кому платит «Тёплый берег».",
  },
  {
    id: 7, createdAt: "2026-11-16 22:53:00", fireAfter: "c08", condition: '{"always":true}',
    sql: "SELECT * FROM share_deals WHERE deal_date = '2015-12-07'; -- седьмое декабря пятнадцатого.",
  },
  {
    id: 8, createdAt: "2026-11-16 22:55:00", fireAfter: "c09", condition: '{"always":true}',
    sql: "SELECT COUNT(*) FROM statements WHERE case_id = '15-0219'; -- шестьдесят три. В пятнадцатом было не так.",
  },
  {
    id: 9, createdAt: "2026-11-16 22:58:00", fireAfter: "c09", condition: '{"always":true}',
    sql: "SELECT * FROM doc_registry WHERE year = 2015 AND reg_no IN (3320, 3322); -- двадцать первое февраля. Таких бумаг не было.",
  },
];

/** Варианты текста задания 1 (М6, Д5) — по увиденным 3311 и 3313 */
export const CRON_JOB1_VARIANTS = {
  a: "SELECT * FROM doc_registry WHERE year = 2015 AND reg_no = 4471; -- не там. Кофе тут ни при чём.",
  b: "SELECT * FROM doc_registry WHERE year = 2015 AND reg_no BETWEEN 3311 AND 3313; -- соседи помнят больше, чем номер.",
  c: "SELECT * FROM doc_registry WHERE year = 2015 AND reg_no BETWEEN 3300 AND 3320; -- Ноль, номера идут подряд. Кроме одного.",
} as const;

/** Расписание финализации (migration_jobs 17–20) */
export const MIGRATION_FINAL: readonly { id: number; runAt: string; blackmailRunAt?: string; action: string; target: string }[] = [
  { id: 17, runAt: "2027-01-11 12:20:00", blackmailRunAt: "2027-01-11 12:32:00", action: "DROP", target: "sokol_stage_registry" },
  { id: 18, runAt: "2027-01-11 12:40:00", blackmailRunAt: "2027-01-11 12:52:00", action: "DROP", target: "sokol_stage_statements" },
  { id: 19, runAt: "2027-01-11 13:00:00", action: "DROP", target: "sokol_stage_persons" },
  { id: 20, runAt: "2027-01-11 13:00:00", action: "FINALIZE", target: "Сокол → ПБД" },
];

/** Договор игрока (вставляется патчем p0.player) */
export const PLAYER_CONTRACT = {
  docNo: "ТБ-2026/117",
  signedAt: "2026-11-25",
  subject: "грант на ставку аналитика ОЦР на период миграции",
  clause:
    "п. 4.2 Исполнитель несёт персональную ответственность за полноту переноса архивных данных в ходе финализации. " +
    "п. 4.3 Фонд погашает образовательный кредит Исполнителя в банке «Северный кредит» после подписания акта финализации",
} as const;

/** Все глобальные факты одним объектом (для фасада) */
export const worldFacts = {
  WORLD_SEED,
  CASE_IDS,
  CASE_START,
  SEASON,
  PERSON,
  CAST_PERSONS,
  GUARD_SQUAD_2015,
  PD117_ENGINEERS,
  ADDRESS,
  CAST_REGISTRATIONS,
  CAST_EMPLOYMENT,
  STAFF_TYPO_PERSONS,
  ACROSTIC,
  ACROSTIC_SYNC_AT,
  STAFF,
  STAFF_TYPOS,
  LOGIN,
  BADGE,
  WORKSTATION,
  PHONE,
  PLATE,
  VEHICLE_ID,
  COMPANY,
  COMPANY_NAME,
  ACCOUNT,
  CAMERA,
  CASE_SAZONOV,
  GEO,
  DOC_REG,
  STATEMENTS_MISSING_IN_PBD,
  FORGED_STATEMENTS,
  INCIDENT,
  KUSP,
  GHOST_SESSIONS,
  GHOST_KEY_EDITS,
  KEY_TIMES,
  CRON_JOBS,
  CRON_JOB1_VARIANTS,
  MIGRATION_FINAL,
  PLAYER_CONTRACT,
} as const;
