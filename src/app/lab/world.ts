/**
 * Мир лаборатории (/lab): одна ночь 13–14 декабря 2026 года в ЦОД «Северный узел».
 *
 * Всё, что лаборатория показывает в таблице результата, — настоящий вывод SQLite через фасад
 * движка (createEmptyDatabase + executeSQL): тот же table-guard, те же ошибки, те же подсказки.
 * Состав один на всё: имя ↔ пропуск ↔ должность ↔ смена — один к одному (тест
 * src/__tests__/lab/world.test.ts). Распечатки улик в mock.ts — это вывод их же запросов.
 *
 * Хронология, которую должен видеть внимательный игрок:
 * - ночная смена — трое: Ахметов (B-0519), Лапин (B-0233), Рябов (B-0417);
 * - Рябов выходит в 23:58 («ушёл в полночь»), но его карта снова открывает северный шлюз в 01:52;
 * - Лапин входит через северный шлюз в 01:47, выхода нет;
 * - северный шлюз за ночь открывали девять раз;
 * - в 01:58 сброс через клапан № 3 скачком растёт с 41 до 86 МВт;
 * - в 02:12 на телефон Ахметова звонит номер, которого нет среди жителей;
 * - зеркало синхронизировано в 02:30: позже записей нет.
 */

import type { Database } from "sql.js";
import { createEmptyDatabase, executeSQL, getForeignKeys, getSchema } from "@/engine";
import type { ForeignKey, QueryResult, TableInfo } from "@/engine";

/* ---------- Состав ---------- */

export interface Person {
  id: number;
  name: string;
  born: string;
  address: string;
  phone: string;
  employer: string | null;
  /** Пропуск ЦОД — только у сотрудников */
  badge?: string;
  position?: string;
  shift?: "ночь" | "день" | "вечер" | "подряд" | "по вызову";
}

const NODE = "ЦОД «Северный узел»";

export const PEOPLE: Person[] = [
  { id: 1, name: "Игорь Лапин", born: "1991-03-08", address: "ул. Береговая, 14, кв. 9", phone: "+7 914 220-15-33", employer: NODE, badge: "B-0233", position: "сменный техник", shift: "ночь" },
  { id: 2, name: "Дмитрий Рябов", born: "1979-11-21", address: "ул. Полярная, 3, кв. 41", phone: "+7 914 220-48-02", employer: NODE, badge: "B-0417", position: "охранник", shift: "ночь" },
  { id: 3, name: "Тимур Ахметов", born: "1992-06-30", address: "пр. Энергетиков, 7, кв. 112", phone: "+7 914 220-77-19", employer: NODE, badge: "B-0519", position: "дежурный инженер", shift: "ночь" },
  { id: 4, name: "Олег Смирнов", born: "1984-01-17", address: "ул. Портовая, 22", phone: "+7 914 221-03-64", employer: "ООО «Теплообмен-Сервис»", badge: "B-0108", position: "подрядчик, теплообменники", shift: "подряд" },
  { id: 5, name: "Марина Ефимова", born: "1968-09-02", address: "ул. Береговая, 6, кв. 2", phone: "+7 914 220-90-11", employer: NODE, badge: "B-0485", position: "уборщица", shift: "вечер" },
  { id: 6, name: "Сергей Голубев", born: "1975-04-26", address: "ул. Шахтёров, 12, кв. 30", phone: "+7 914 222-31-80", employer: NODE, badge: "B-0284", position: "водитель", shift: "по вызову" },
  { id: 7, name: "Ксения Белых", born: "1996-12-11", address: "пр. Энергетиков, 15, кв. 4", phone: "+7 914 220-62-47", employer: NODE, badge: "B-0390", position: "кладовщица", shift: "вечер" },
  { id: 8, name: "Анна Ветрова", born: "1988-02-14", address: "ул. Полярная, 9, кв. 17", phone: "+7 914 223-14-58", employer: NODE, badge: "B-0326", position: "оператор диспетчерской", shift: "день" },
  { id: 9, name: "Павел Норкин", born: "1982-07-19", address: "ул. Портовая, 5, кв. 8", phone: "+7 914 220-25-96", employer: NODE, badge: "B-0389", position: "электрик", shift: "день" },
  { id: 10, name: "Руслан Хайруллин", born: "1990-10-03", address: "ул. Шахтёров, 4, кв. 51", phone: "+7 914 224-70-12", employer: NODE, badge: "B-0277", position: "инженер холодоснабжения", shift: "день" },
  { id: 11, name: "Николай Зуев", born: "1971-05-28", address: "ул. Береговая, 20, кв. 3", phone: "+7 914 220-83-40", employer: NODE, badge: "B-0455", position: "охранник", shift: "день" },
  { id: 12, name: "Евгения Тарасова", born: "1980-08-15", address: "ул. Полярная, 1, кв. 60", phone: "+7 914 225-01-77", employer: NODE, badge: "B-0231", position: "начальник смены", shift: "день" },
  // Не сотрудники ЦОД
  { id: 13, name: "Лидия Кравец", born: "1997-01-29", address: "ул. Мостовая, 2, кв. 14", phone: "+7 914 226-58-03", employer: "«Полярный канал»" },
  { id: 14, name: "Вера Соколова", born: "1980-03-12", address: "ул. Портовая, 11, кв. 26", phone: "+7 914 220-02-02", employer: "УМВД по г. Полярный" },
  { id: 15, name: "Галина Лапина", born: "1964-11-30", address: "ул. Береговая, 14, кв. 9", phone: "+7 914 220-15-34", employer: null },
  { id: 16, name: "Артём Седых", born: "1999-06-06", address: "ул. Шахтёров, 18, кв. 7", phone: "+7 914 227-44-91", employer: "АО «Полярная теплосеть»" },
];

export const STAFF = PEOPLE.filter((p): p is Person & Required<Pick<Person, "badge" | "position" | "shift">> => Boolean(p.badge));

/* ---------- Журнал пропусков ---------- */

type Gate = "главный вход" | "северный шлюз" | "погрузочная" | "машинный зал";

/** [пропуск, проход, вход, выход] — время «ДД ЧЧ:ММ», день 13 или 14 декабря */
const ACCESS: Array<[string, Gate, string, string | null]> = [
  // день 13-го
  ["B-0231", "главный вход", "13 07:48", "13 20:12"],
  ["B-0326", "главный вход", "13 07:52", "13 20:05"],
  ["B-0389", "главный вход", "13 07:55", "13 19:58"],
  ["B-0277", "главный вход", "13 08:03", "13 20:21"],
  ["B-0455", "главный вход", "13 08:10", "13 20:30"],
  ["B-0277", "машинный зал", "13 09:14", "13 11:02"],
  ["B-0389", "северный шлюз", "13 10:40", "13 10:52"],
  ["B-0455", "северный шлюз", "13 12:00", "13 12:09"],
  ["B-0485", "главный вход", "13 14:02", "13 22:58"],
  ["B-0390", "главный вход", "13 14:05", "13 23:30"],
  ["B-0284", "погрузочная", "13 15:20", "13 15:44"],
  ["B-0389", "машинный зал", "13 16:10", "13 17:25"],
  ["B-0277", "северный шлюз", "13 17:30", "13 17:41"],
  ["B-0284", "погрузочная", "13 18:50", "13 19:06"],
  ["B-0326", "машинный зал", "13 19:15", "13 19:40"],
  ["B-0108", "главный вход", "13 21:40", "14 00:52"],
  // ночь на 14-е
  ["B-0417", "главный вход", "13 22:06", "13 23:58"],
  ["B-0233", "главный вход", "13 22:10", "14 01:40"],
  ["B-0519", "главный вход", "13 22:12", "14 02:23"],
  ["B-0485", "машинный зал", "13 22:18", "13 22:35"],
  ["B-0417", "северный шлюз", "13 22:31", "13 22:44"],
  ["B-0108", "погрузочная", "13 22:40", "14 00:26"],
  ["B-0519", "машинный зал", "13 22:47", "13 23:30"],
  ["B-0233", "машинный зал", "13 22:52", "13 23:37"],
  ["B-0390", "погрузочная", "13 23:05", "13 23:21"],
  ["B-0417", "северный шлюз", "13 23:12", "13 23:19"],
  ["B-0108", "северный шлюз", "13 23:24", "13 23:41"],
  ["B-0519", "машинный зал", "13 23:46", "14 01:44"],
  ["B-0233", "северный шлюз", "13 23:48", "14 00:05"],
  ["B-0284", "погрузочная", "14 00:15", "14 00:38"],
  ["B-0233", "машинный зал", "14 00:20", "14 01:12"],
  ["B-0108", "северный шлюз", "14 00:31", "14 00:47"],
  ["B-0284", "северный шлюз", "14 00:41", "14 00:50"],
  ["B-0284", "главный вход", "14 01:03", "14 01:09"],
  ["B-0233", "северный шлюз", "14 01:18", "14 01:26"],
  ["B-0233", "северный шлюз", "14 01:47", null],
  ["B-0417", "северный шлюз", "14 01:52", null],
  ["B-0519", "машинный зал", "14 02:10", "14 02:21"],
];

/** Первый номер записи журнала: зеркало хранит хвост большого журнала */
export const FIRST_ACCESS_ID = 1024;

const at = (s: string) => `2026-12-${s.slice(0, 2)} ${s.slice(3)}`;

/* ---------- Сброс тепла: телеметрия раз в минуту, 20:00–02:30 ---------- */

const OUTLETS = [
  { name: "клапан-1", base: 12.4 },
  { name: "клапан-2", base: 9.1 },
  { name: "клапан-3", base: 41.2 },
] as const;

/** Детерминированная мелкая дрожь показаний: ±0,3 МВт */
function jitter(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return Math.round((x - Math.floor(x) - 0.5) * 6) / 10;
}

function heatRows(): Array<[string, number, string]> {
  const rows: Array<[string, number, string]> = [];
  const start = 20 * 60; // 13-го 20:00
  const end = 24 * 60 + 2 * 60 + 30; // 14-го 02:30
  const valve = 24 * 60 + 60 + 58; // 14-го 01:58 — клапан № 3 переведён в ручной режим
  for (let t = start, i = 0; t <= end; t++, i++) {
    const day = t >= 24 * 60 ? 14 : 13;
    const m = t % (24 * 60);
    const stamp = `2026-12-${day} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    OUTLETS.forEach((o, k) => {
      let mw = o.base + jitter(i, k);
      if (o.name === "клапан-3" && t >= valve) mw = 86.4 + jitter(i, 9) * 0.5;
      // Ровно 41,2 и 86,4 там, где их цитирует распечатка
      if (o.name === "клапан-3" && t === valve - 3) mw = 41.2;
      if (o.name === "клапан-3" && t === valve) mw = 86.4;
      rows.push([stamp, Math.round(mw * 10) / 10, o.name]);
    });
  }
  return rows;
}

/* ---------- SQL мира ---------- */

const q = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`;
const values = (rows: Array<Array<string | number | null | undefined>>) =>
  rows.map((r) => `(${r.map(q).join(", ")})`).join(",\n");

export const UNLOCKED_TABLES = ["residents", "staff", "access_log", "heat_output", "calls", "vehicles"];

export const TABLE_NOTES: Record<string, string> = {
  residents: "Жители города: ФИО, адрес, телефон, работодатель.",
  staff: "Сотрудники ЦОД и их пропуска.",
  access_log: "Журнал пропусков: кто, где и когда прошёл.",
  heat_output: "Телеметрия сброса тепла в залив, раз в минуту.",
  calls: "Звонки по городу: метаданные, без записи.",
  vehicles: "Зарегистрированный транспорт.",
};

export function worldSql(): string {
  const staffRows = STAFF.map((p, i) => [i + 1, p.id, p.badge, p.position, p.shift]);
  const accessRows = ACCESS.map(([badge, gate, inAt, outAt], i) => [
    FIRST_ACCESS_ID + i,
    badge,
    gate,
    at(inAt),
    outAt === null ? null : at(outAt),
  ]);
  const heat = heatRows().map(([measured, mw, outlet], i) => [i + 1, measured, mw, outlet]);
  const phone = (id: number) => PEOPLE.find((p) => p.id === id)!.phone;
  const calls = [
    [1, phone(12), phone(8), "2026-12-13 21:05", 62],
    [2, phone(15), phone(1), "2026-12-13 22:41", 184],
    [3, phone(4), "+7 914 221-00-00", "2026-12-13 23:02", 35],
    [4, phone(1), phone(15), "2026-12-14 00:11", 96],
    [5, phone(13), phone(14), "2026-12-14 00:58", 23],
    [6, phone(3), phone(1), "2026-12-14 01:36", 17],
    [7, phone(2), "+7 914 229-40-15", "2026-12-14 01:49", 52],
    [8, phone(1), phone(15), "2026-12-14 01:50", 0],
    [9, "+7 914 220-31-07", phone(3), "2026-12-14 02:12", 41],
    [10, phone(13), phone(16), "2026-12-14 02:14", 71],
    [11, phone(14), phone(3), "2026-12-14 02:26", 48],
  ];
  const vehicles = [
    [1, "А 214 КМ 87", 2, "Лада Нива"],
    [2, "О 902 РТ 87", 4, "УАЗ Патриот"],
    [3, "М 377 ЕН 87", 9, "Toyota Hilux"],
    [4, "В 051 АО 87", 12, "Kia Sportage"],
    [5, "К 618 ХС 87", 13, "Лада Гранта"],
    [6, "Т 440 МУ 87", 6, "ГАЗель Next"],
    [7, "Е 123 ВВ 87", 14, "Toyota Land Cruiser"],
    [8, "Н 785 СК 87", 10, "Hyundai Creta"],
  ];
  return `
CREATE TABLE residents (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  born TEXT,
  address TEXT,
  phone TEXT,
  employer TEXT
);
CREATE TABLE staff (
  id INTEGER PRIMARY KEY,
  resident_id INTEGER NOT NULL REFERENCES residents(id),
  badge_id TEXT NOT NULL UNIQUE,
  position TEXT,
  shift TEXT
);
CREATE TABLE access_log (
  id INTEGER PRIMARY KEY,
  badge_id TEXT NOT NULL REFERENCES staff(badge_id),
  gate TEXT NOT NULL,
  entered_at TEXT NOT NULL,
  exited_at TEXT
);
CREATE TABLE heat_output (
  id INTEGER PRIMARY KEY,
  measured_at TEXT NOT NULL,
  megawatts REAL NOT NULL,
  outlet TEXT
);
CREATE TABLE calls (
  id INTEGER PRIMARY KEY,
  caller TEXT NOT NULL,
  callee TEXT NOT NULL,
  started_at TEXT NOT NULL,
  seconds INTEGER
);
CREATE TABLE vehicles (
  id INTEGER PRIMARY KEY,
  plate TEXT NOT NULL,
  owner_id INTEGER REFERENCES residents(id),
  model TEXT
);
CREATE TABLE bank_transfers (
  id INTEGER PRIMARY KEY,
  from_account TEXT,
  to_account TEXT,
  amount REAL,
  sent_at TEXT
);
CREATE TABLE sealed_cases (
  id INTEGER PRIMARY KEY,
  title TEXT,
  closed_at TEXT
);
INSERT INTO residents VALUES
${values(PEOPLE.map((p) => [p.id, p.name, p.born, p.address, p.phone, p.employer]))};
INSERT INTO staff VALUES
${values(staffRows)};
INSERT INTO access_log VALUES
${values(accessRows)};
INSERT INTO heat_output VALUES
${values(heat)};
INSERT INTO calls VALUES
${values(calls)};
INSERT INTO vehicles VALUES
${values(vehicles)};
INSERT INTO bank_transfers VALUES
(1, '40817810300014471', '40702810900000031', 480000, '2026-12-12 16:20'),
(2, '40702810900000031', '40817810500220917', 2400000, '2026-12-13 09:02');
INSERT INTO sealed_cases VALUES
(1, 'Утопленник у сброса, 2019', '2020-02-11'),
(2, 'Пропажа техника ЦОД, 2023', '2023-04-30');
`;
}

/* ---------- Зеркало лаборатории ---------- */

export interface LabWorld {
  db: Database;
  /** Схема всех таблиц (открытые и засекреченные) */
  schema: TableInfo[];
  foreignKeys: ForeignKey[];
  /** Запрос через фасад: доступ, выполнение, объяснение ошибки */
  run: (sql: string) => QueryResult;
}

/**
 * Движок даёт пустую базу, лаборатория накатывает в неё ночь в ЦОД. Дальше — только фасад.
 */
export async function createLabWorld(): Promise<LabWorld> {
  const db = await createEmptyDatabase();
  db.run(worldSql());
  const schema = getSchema(db);
  const foreignKeys = getForeignKeys(db);
  const open = schema.filter((t) => UNLOCKED_TABLES.includes(t.name));
  return {
    db,
    schema,
    foreignKeys,
    run: (sql: string) => executeSQL(db, sql, UNLOCKED_TABLES, { schema: open }),
  };
}

let shared: Promise<LabWorld> | null = null;

/** Одно зеркало на всю страницу лаборатории */
export function labWorld(): Promise<LabWorld> {
  if (!shared) {
    shared = createLabWorld().catch((e) => {
      shared = null;
      throw e;
    });
  }
  return shared;
}

/* ---------- Запросы, которые лаборатория показывает ---------- */

export const SAMPLE_SQL = `SELECT a.id, r.full_name, a.badge_id, a.gate,
       a.entered_at, a.exited_at
FROM access_log AS a
JOIN staff s ON s.badge_id = a.badge_id
JOIN residents r ON r.id = s.resident_id
WHERE a.entered_at >= '2026-12-13 22:00' -- ночь на 14-е
ORDER BY a.entered_at;`;

/** Ответ задания 3: кто вошёл после Лапина (01:47) и ещё не вышел */
export const ANSWER_SQL = `SELECT * FROM access_log
WHERE entered_at > '2026-12-14 01:47'
  AND exited_at IS NULL;`;

/** Широкий результат: сотрудник целиком, для «ещё N столбцов справа» на узком столе */
export const WIDE_SQL = `SELECT r.full_name, s.badge_id, s.position, s.shift,
       r.born, r.address, r.phone, r.employer
FROM staff s
JOIN residents r ON r.id = s.resident_id
ORDER BY s.badge_id;`;

export const LAB_QUERIES = {
  empty: "SELECT * FROM access_log\nWHERE gate = 'северный шлюз'\n  AND badge_id = 'B-0108'\n  AND entered_at > '2026-12-14 01:00';",
  long: "SELECT * FROM heat_output;",
  error: "SELECT full_nam\nFROM residents;",
  syntax: "SELECT *\nFORM access_log;",
  locked: "SELECT * FROM bank_transfers;",
  readOnly: "DELETE FROM access_log\nWHERE badge_id = 'B-0417';",
} as const;
