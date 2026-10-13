/**
 * Тайники в данных (EASTER_EGGS.md — единственный источник правды): 22
 * необязательные находки — строки мира с фиксированными id и значениями,
 * которые ловит `SecretDef.trigger` (src/data/secrets.json, checkSecrets).
 *
 * Правила (EASTER_EGGS.md, разд. 1–2):
 * - сажаются последними (после c12) и до шума; ни один эталон задачи их не
 *   видит, сюжет от них не зависит;
 * - строки «живых» и упорядоченных таблиц — плавающие (`orderAt`), id им
 *   выдаёт шум по времени, поэтому `LIMIT 10` без ORDER BY их не показывает;
 * - уникальные ключи зарезервированы, шум не повторяет значения-триггеры;
 * - жители-пасхалки не попадают в пулы шума (их нет в `st.people`), у
 *   каждого есть отчество и прописка; шум не делает им тёзок-дублей
 *   (`EGG_PERSON_SHORT` в noise/people.ts).
 *
 * № 1 «Подпись на полях» — не данные, а комментарий в DDL `incidents`
 * (`TableDef.ddlComment`, schema.ts).
 */
import type { Row, WorldContext } from "../context";
import { DAY, fmtTs, parseTs } from "../rng";
import { shortName } from "../pools";
import { EGG_IDS, EGG_QUERY_LOG_TIMES, LOGIN, PERSON } from "../facts";

// ==================================================================== жители

interface EggPerson {
  id: number;
  last: string;
  first: string;
  middle: string;
  birth: string;
  sex: "М" | "Ж";
  createdAt: string;
  /** Ключ адреса из EGG_ADDRESSES и период прописки */
  address: string;
  from: string;
  to?: string;
  motherId?: number;
  specialMarks?: string;
  deathDate?: string;
}

/** Адреса пасхалок: улицы и дома — из catalog.ts (кроме «3-я Строителей») */
const EGG_ADDRESSES: readonly { key: string; id?: number; district: string; street: string; house: string; apt: string }[] = [
  { key: "mukhin", district: "Старый город", street: "Садовая", house: "9", apt: "21" },
  { key: "kalugina", district: "Старый город", street: "Мира", house: "8", apt: "41" },
  { key: "novoseltsev", district: "Шахтный", street: "Горняцкая", house: "3", apt: "12" },
  { key: "garaev", district: "Шахтный", street: "Шахтная", house: "5", apt: "2" },
  { key: "tikhonovy", district: "Шахтный", street: "Шахтная", house: "7", apt: "3" },
  { key: "samoylova", district: "Шахтный", street: "Забойная", house: "11", apt: "5" },
  { key: "tablitsyny", district: "Старый город", street: "Школьная", house: "14", apt: "3" },
  { key: "nulin", district: "Старый город", street: "Портовая", house: "15", apt: "1" },
  { key: "funtov", district: "Старый город", street: "Рыбацкая", house: "4", apt: "1" },
  { key: "dentov", district: "Старый город", street: "Северная", house: "11", apt: "42" },
  { key: "boumanov", district: "Старый город", street: "Мира", house: "22", apt: "9" },
  { key: "lukashin", id: 761, district: "Старый город", street: "3-я Строителей", house: "25", apt: "12" },
  { key: "sheveleva", id: 762, district: "Шахтный", street: "3-я Строителей", house: "25", apt: "12" },
  { key: "nevstruev", district: "Старый город", street: "Рыбацкая", house: "7", apt: "1" },
  { key: "gorbunkov", district: "Гавань", street: "Морская", house: "17", apt: "8" },
  { key: "ogurtsov", district: "Старый город", street: "Театральная", house: "3", apt: "10" },
  { key: "krylova", district: "Старый город", street: "Театральная", house: "5", apt: "22" },
  { key: "kirillov", district: "Старый город", street: "Школьная", house: "6", apt: "15" },
  { key: "frimonov", district: "Старый город", street: "Садовая", house: "4", apt: "13" },
  { key: "morozov", district: "Гавань", street: "Причальная", house: "12", apt: "6" },
  { key: "solntseva", district: "Старый город", street: "Мира", house: "12", apt: "7" },
];

/** Имя Бобби — строка с SQL-инъекцией (вставка — только параметром) */
export const BOBBY_FIRST_NAME = "Роберт'); DROP TABLE persons;--";

const SAMOYLOVA_ID = 2590;

export const EGG_PERSONS: readonly EggPerson[] = [
  // № 4 «Восемьдесят восемь»
  { id: 1985, last: "Мухин", first: "Мартын", middle: "Георгиевич", birth: "1968-06-09", sex: "М", createdAt: "2015-10-21 16:29:00", address: "mukhin", from: "2015-10-21" },
  // № 5 «Служебный роман по рублю»
  { id: 1977, last: "Калугина", first: "Людмила", middle: "Прокофьевна", birth: "1979-10-26", sex: "Ж", createdAt: "2017-03-14 10:05:00", address: "kalugina", from: "2015-06-01" },
  { id: 1978, last: "Новосельцев", first: "Анатолий", middle: "Ефимович", birth: "1982-04-12", sex: "М", createdAt: "2017-08-01 09:40:00", address: "novoseltsev", from: "2016-02-10" },
  // № 6 «Тимур и его команда»
  { id: 1940, last: "Гараев", first: "Тимур", middle: "Александрович", birth: "1948-09-01", sex: "М", createdAt: "2017-02-01 10:00:00", address: "garaev", from: "1979-08-15" },
  { id: 2022, last: "Тихонов", first: "Андрей", middle: "Павлович", birth: "1984-05-09", sex: "М", createdAt: "2017-04-03 11:00:00", address: "tikhonovy", from: "2010-04-01", to: "2022-12-03", deathDate: "2022-12-03" },
  { id: 2023, last: "Тихонова", first: "Ольга", middle: "Викторовна", birth: "1986-11-02", sex: "Ж", createdAt: "2017-04-03 11:05:00", address: "tikhonovy", from: "2010-04-01" },
  // № 7 «Матроскин нашёл дом»: соцработница из Д2 (c02 её в persons не заводит)
  { id: SAMOYLOVA_ID, last: "Самойлова", first: "Татьяна", middle: "Николаевна", birth: "1974-03-19", sex: "Ж", createdAt: "2017-05-22 09:30:00", address: "samoylova", from: "2008-06-01" },
  // № 8 «Маленький Бобби Таблицын»
  { id: 328, last: "Таблицына", first: "Анна", middle: "Сергеевна", birth: "1991-08-14", sex: "Ж", createdAt: "2018-05-04 11:00:00", address: "tablitsyny", from: "2018-05-04" },
  { id: 327, last: "Таблицын", first: BOBBY_FIRST_NAME, middle: "Олегович", birth: "2019-03-27", sex: "М", createdAt: "2019-03-29 10:15:00", address: "tablitsyny", from: "2019-03-29", motherId: 328 },
  // № 9 «Гражданин Нулин»: примета — строка 'NULL', не SQL NULL
  { id: 404, last: "Нулин", first: "Аркадий", middle: "Павлович", birth: "1961-06-06", sex: "М", createdAt: "2017-09-12 11:00:00", address: "nulin", from: "1999-03-02", specialMarks: "NULL" },
  // № 10 «Рога и копыта»
  { id: 1931, last: "Фунтов", first: "Семён", middle: "Ильич", birth: "1931-07-02", sex: "М", createdAt: "2016-03-25 11:00:00", address: "funtov", from: "1975-09-01" },
  // № 11 «Ответ — сорок два»
  { id: 4242, last: "Дентов", first: "Артур", middle: "Филиппович", birth: "1979-10-12", sex: "М", createdAt: "2024-05-20 10:00:00", address: "dentov", from: "2024-05-20" },
  // № 12 «Боюсь, я не могу этого сделать»
  { id: 2001, last: "Боуманов", first: "Дмитрий", middle: "Давидович", birth: "1992-01-12", sex: "М", createdAt: "2019-04-02 10:00:00", address: "boumanov", from: "2019-04-02" },
  // № 14 «С лёгким паром!»
  { id: 1975, last: "Лукашин", first: "Евгений", middle: "Михайлович", birth: "1976-01-01", sex: "М", createdAt: "2016-12-30 10:00:00", address: "lukashin", from: "2010-12-31" },
  { id: 1976, last: "Шевелёва", first: "Надежда", middle: "Васильевна", birth: "1979-12-31", sex: "Ж", createdAt: "2017-01-10 10:00:00", address: "sheveleva", from: "2012-12-31" },
  // № 15 «Янус Полуэктович»: прописка тоже идёт задом наперёд
  { id: 1965, last: "Невструев", first: "Янус", middle: "Полуэктович", birth: "1946-07-01", sex: "М", createdAt: "2026-02-21 10:00:00", address: "nevstruev", from: "2026-02-21", to: "1946-07-01" },
  // № 16 «Очнулся — гипс»
  { id: 1969, last: "Горбунков", first: "Семён", middle: "Семёнович", birth: "1971-04-28", sex: "М", createdAt: "2017-05-15 10:00:00", address: "gorbunkov", from: "2003-10-01" },
  // № 18 «Есть ли жизнь на Марсе»
  { id: 1956, last: "Огурцов", first: "Серафим", middle: "Иванович", birth: "1950-02-23", sex: "М", createdAt: "2017-03-01 10:00:00", address: "ogurtsov", from: "1988-04-01" },
  { id: 1957, last: "Крылова", first: "Елена", middle: "Андреевна", birth: "1995-12-31", sex: "Ж", createdAt: "2017-03-01 10:10:00", address: "krylova", from: "2013-09-01" },
  // № 19 «Счастье для всех, даром»
  { id: 1972, last: "Кириллов", first: "Артур", middle: "Сергеевич", birth: "2014-06-01", sex: "М", createdAt: "2017-07-03 10:00:00", address: "kirillov", from: "2014-06-10" },
  // № 20 «Все детали важны»
  { id: 2002, last: "Фримонов", first: "Леонид", middle: "Львович", birth: "1955-06-02", sex: "М", createdAt: "2017-03-01 09:00:00", address: "frimonov", from: "1989-04-01" },
  // № 21 «Дед Мороз на всех вышках»
  { id: 1951, last: "Морозов", first: "Николай", middle: "Степанович", birth: "1951-12-19", sex: "М", createdAt: "2017-01-10 10:00:00", address: "morozov", from: "1977-11-01", specialMarks: "седая окладистая борода" },
  // № 22 «Первая жительница 2027 года»
  { id: 2027, last: "Солнцева", first: "Елена", middle: "Игоревна", birth: "1996-08-11", sex: "Ж", createdAt: "2018-08-20 11:00:00", address: "solntseva", from: "2018-08-15" },
];

/** persons.id жителей-пасхалок: шум не берёт их в пулы событий и не делает им дублей */
export const EGG_PERSON_IDS: readonly number[] = EGG_PERSONS.map((p) => p.id);

/** Короткие ФИО жителей-пасхалок (и вариант без «ё»): шум не заводит тёзок (side-04) */
export const EGG_PERSON_SHORT: ReadonlySet<string> = new Set(
  EGG_PERSONS.flatMap((p) => {
    const s = shortName(p.last, p.first, p.middle);
    return [s, s.replace(/ё/g, "е").replace(/Ё/g, "Е")];
  })
);

/** addresses.id пасхалок (заполняется посадкой): шум не прописывает туда жильцов и не пишет домофон */
export const EGG_ADDRESS_IDS = new Set<number>();

const fullName = (p: EggPerson): string => `${p.last} ${p.first} ${p.middle}`;
const shortOf = (id: number): string => {
  const p = EGG_PERSONS.find((x) => x.id === id) as EggPerson;
  return shortName(p.last, p.first, p.middle);
};

// ==================================================================== ключи

/** Номера и значения, которые шум не должен повторить (EASTER_EGGS.md, разд. 6) */
const PHONE_DED_MOROZ = "+7 900 000-01-01";
const PHONE_GATEWAY = "+7 900 000-00-00";
const KIDS_PHONES = Array.from({ length: 13 }, (_, i) => `+7 900 000-70-${String(i + 1).padStart(2, "0")}`);
const PLATE_DELOREAN = "М088АК";
const ACC = { novoseltsev: "ACC-19771", kalugina: "ACC-19772", garaev: "ACC-19400", samoylova: "ACC-25900" } as const;
const CARD_FICUS = "Л-00015";
const INN_HORNS = "5190193101";
const COMPANY_HORNS = "ООО «Рога и копыта»";
const CASE_FRIMONOV = "19-0302";
const KUSP_EGGS = [3437] as const;
const ACT_TIKHONOV = "А-2022-0688";
const GS_EXT_SERVICE = "0-00";
const LOGIN_DENTOV = "a.dentov";
const LOGIN_FRIMONOV = "l.frimonov";
const BADGE_DENTOV = "B-4242";
const BADGE_FRIMONOV = "B-2002";

function reserveKeys(ctx: WorldContext): void {
  for (const p of [PHONE_DED_MOROZ, PHONE_GATEWAY, ...KIDS_PHONES]) ctx.reserve("phone", p);
  ctx.reserve("plate", PLATE_DELOREAN);
  for (const a of Object.values(ACC)) ctx.reserve("account", a);
  ctx.reserve("login", LOGIN_DENTOV);
  ctx.reserve("login", LOGIN_FRIMONOV);
  ctx.reserve("badge", BADGE_DENTOV);
  ctx.reserve("badge", BADGE_FRIMONOV);
  ctx.reserve("card_no", CARD_FICUS);
  ctx.reserve("inn", INN_HORNS);
  ctx.reserve("company_name", COMPANY_HORNS);
  ctx.reserve("case_id", CASE_FRIMONOV);
  for (const k of KUSP_EGGS) ctx.reserve("kusp:2026", String(k));
  ctx.reserve("act_no", ACT_TIKHONOV);
  ctx.reserve("zags:person", "2022");
  ctx.reserve("gs_ext", GS_EXT_SERVICE);
  // Офицер в вызовах-тайниках: шум сделает его действующим полицейским
  ctx.reserve("staff:officer", String(EGG_IDS.officer), { hiredBefore: "2026-08-01", active: true });
}

// ==================================================================== строки

/** Строки тайников по таблицам (без id; адрес — ключом EGG_ADDRESSES в поле `address`) */
function eggRows(): Record<string, Row[]> {
  const rows: Record<string, Row[]> = {};
  const add = (table: string, row: Row) => (rows[table] ??= []).push(row);
  const officer = EGG_IDS.officer;

  // № 2 «Совы не то, чем кажутся». КУСП 4161 и 4168 — только желаемые: между ними
  // за 14 часов шум кладёт больше вызовов, чем номеров, поэтому номера выдаёт
  // генератор КУСП по плотности (триггер от номера не зависит)
  add("incidents", {
    reported_at: "2026-10-24 11:30:00", kind: "сообщение гражданина", district: "Промзона", address_text: "Энергетиков, 2",
    description: "Третью ночь на градирнях «Глубины» сидят совы и смотрят в сторону города. Совы не то, чем кажутся. Прошу принять меры",
    vehicle_id: null, applicant_text: "Поленова М. (пришла с поленом)", officer_staff_id: officer, status: "проверка", x_m: null, y_m: null,
  });
  add("incidents", {
    reported_at: "2026-10-25 01:30:00", kind: "рапорт", district: "Промзона", address_text: "Энергетиков, 2",
    description: "По сообщению Поленовой М.: на градирне № 3 две полярные совы. Чем кажутся — не установлено. Кофе в термосе у наряда чертовски хороший. Признаков преступления нет",
    vehicle_id: null, applicant_text: "дежурный", officer_staff_id: officer, status: "проверка", x_m: null, y_m: null,
  });
  // № 8: «хлебная крошка» Бобби
  add("incidents", {
    kusp_no: 3437, reported_at: "2026-09-02 09:27:00", kind: "сообщение гражданина", district: "Старый город", address_text: "Школьная, 5",
    description: "Директор школы № 5: после зачисления первоклассника Таблицына Р. О. из электронного журнала исчезли все ученики. Мать мальчика по телефону: «Надеюсь, теперь вы научитесь проверять ввод»",
    vehicle_id: null, applicant_text: "директор школы № 5", officer_staff_id: officer, status: "закрыто", x_m: null, y_m: null,
  });

  // № 3 «Кот Шрёдингера»: два прохода одной картой в одну секунду
  for (const [route, stop] of [["5", "Садовая"], ["9", "Мира"]] as const) {
    add("transit_taps", { ts: "2026-12-02 15:21:07", card_no: CARD_FICUS, card_kind: "льготная", holder_text: "Фикус (кот, архив Б0-05)", route, stop });
  }

  // № 4 «Восемьдесят восемь»: проезд по камере 2
  add("plate_reads", { camera_id: 2, plate: PLATE_DELOREAN, read_at: "2026-11-15 22:04:00", confidence: 0.88, direction: "в центр" });

  // № 5 «Служебный роман по рублю»: 28 вечеров по рублю и один ответ
  const special: Record<number, string> = {
    1: "Людмила Прокофьевна, простите. День 1",
    7: "Простите. День 7. Вы не мымра. Это я дурак",
    13: "Простите. День 13. Минус сорок один, а я опять мимо ваших окон",
    20: "Простите. День 20. Поменял лампочку у вас в подъезде",
    28: "Простите. День 28. Самая длинная ночь. Дальше будет светлее",
  };
  const day1 = parseTs("2026-11-24 21:15:00");
  for (let n = 1; n <= 28; n++) {
    add("transactions", {
      ts: fmtTs(day1 + (n - 1) * DAY), account_id: ACC.novoseltsev, amount: -1, counterparty: shortOf(1977),
      counterparty_account: ACC.kalugina, channel: "СБП", purpose: special[n] ?? `Простите. День ${n}`,
    });
  }
  add("transactions", {
    ts: "2026-12-21 23:58:00", account_id: ACC.kalugina, amount: -1, counterparty: shortOf(1978), counterparty_account: ACC.novoseltsev,
    channel: "СБП", purpose: "Заходите. Код 1977. Без цветов — их тут всё равно нет",
  });
  for (const ts of ["2026-12-22 19:30:00", "2026-12-26 20:10:00", "2026-12-31 21:40:00"]) {
    add("intercom_events", { ts, address: "kalugina", method: "гостевой код", code: "1977", key_owner: null, guest_name: "Новосельцев А." });
  }
  add("intercom_events", { ts: "2027-01-09 20:05:00", address: "kalugina", method: "ключ жильца", code: null, key_owner: shortOf(1978), guest_name: null });

  // № 6 «Тимур и его команда»: 48 месяцев ЖКУ за чужую квартиру
  for (let k = 0; k < 48; k++) {
    const y = 2023 + Math.floor(k / 12);
    const m = (k % 12) + 1;
    add("transactions", {
      ts: `${y}-${String(m).padStart(2, "0")}-10 10:15:00`, account_id: ACC.garaev, amount: -5630, counterparty: "УК «Шахтный»",
      counterparty_account: null, channel: "перевод", purpose: "ЖКУ за Тихоновых: Шахтная, 7-3, л/с 07-003",
    });
  }

  // № 7 «Матроскин нашёл дом»
  const matroskin: [string, number, string, string][] = [
    ["2026-12-08 18:20:00", -1190, "Зоомагазин «Лапа»", "переноска для кошки"],
    ["2026-12-08 18:21:00", -340, "Зоомагазин «Лапа»", "корм для кошек"],
    ["2026-12-08 19:30:00", -650, "Ветклиника «Айболит»", "осмотр и прививка: кот Матроскин, 9 лет"],
    ["2026-12-15 18:40:00", -340, "Зоомагазин «Лапа»", "корм для кошек"],
    ["2026-12-19 11:15:00", -290, "Гравёрная мастерская (рынок)", "адресник на ошейник: «Матроскин»"],
    ["2026-12-22 18:35:00", -340, "Зоомагазин «Лапа»", "корм для кошек"],
    ["2026-12-29 18:50:00", -340, "Зоомагазин «Лапа»", "корм для кошек"],
    ["2027-01-05 18:30:00", -340, "Зоомагазин «Лапа»", "корм для кошек"],
  ];
  for (const [ts, amount, counterparty, purpose] of matroskin) {
    add("transactions", { ts, account_id: ACC.samoylova, amount, counterparty, counterparty_account: null, channel: "карта", purpose });
  }

  // № 11 «Ответ — сорок два»
  const q = (logged_at: string, query_text: string, rows_returned: number, status: string) =>
    add("query_log", {
      logged_at, login: LOGIN_DENTOV, terminal: "WS-IT-04", query_text, rows_returned, status,
      ts_real: null, case_id: null, objective_id: null, run_id: null,
    });
  const [t1, t2, t3] = EGG_QUERY_LOG_TIMES;
  q(t1, "SELECT ответ FROM главный_вопрос_жизни_вселенной_и_всего_такого;", 0, "error");
  q(t2, "SELECT 6 * 9 AS ответ; -- 54. Значит, неправильно задан сам вопрос", 1, "ok");
  q(t3, "SELECT 42 AS ответ; -- без вопроса. Главное — не паниковать", 1, "ok");

  // № 12 «Боюсь, я не могу этого сделать»
  add("statements", {
    case_id: null, doc_reg_no: null, person_id: 2001, person_text: shortOf(2001), taken_at: "2026-10-09 10:01:00", taken_by: "дежурный", typed_by: null,
    text: "Вечером 08.10 попросил «Сияние.Ключ» открыть ворота гаража во дворе дома Мира, 22. Голосовой помощник ответил: «Извините, Дмитрий, боюсь, я не могу этого сделать». Повторил трижды — ответ тот же. Ворота открыл ключом. Прошу проверить, кто управляет помощником",
    status: "принято",
  });

  // № 13 «Край эпохи»: момент записи на шлюзе — в orderAt, ts_unix — сбитые часы
  add("gs_comms_2015", {
    orderAt: "2015-11-24 07:40:00", ts_unix: 0, kind: "sms", from_ext: GS_EXT_SERVICE, to_number: PHONE_GATEWAY, recipient_name: "дежурный связист",
    duration_sec: null, text: "ТЕСТ ШЛЮЗА ПОСЛЕ ОТКЛЮЧЕНИЯ ПИТАНИЯ. ЧАСЫ НЕ ВЫСТАВЛЕНЫ",
  });
  add("gs_comms_2015", {
    orderAt: "2016-01-19 06:14:00", ts_unix: -2147483648, kind: "sms", from_ext: GS_EXT_SERVICE, to_number: PHONE_GATEWAY, recipient_name: "дежурный связист",
    duration_sec: null, text: "ТЕСТ ШЛЮЗА: ЧАСЫ ПЕРЕВЕДЕНЫ НА 19.01.2038 06:14:08. ПРОВЕРКА ПЕРЕХОДА",
  });

  // № 14 «С лёгким паром!»
  add("purchases", {
    ts: "2026-12-31 15:20:00", merchant: "Баня № 1 (Портовая)", payer_person_id: 1975, payer_name: shortOf(1975), item: "общий зал, билет", qty: 4, amount: 2000,
  });
  add("intercom_events", { ts: "2026-12-31 23:52:00", address: "sheveleva", method: "ключ жильца", code: null, key_owner: shortOf(1975), guest_name: null });
  add("intercom_events", { ts: "2027-01-01 08:20:00", address: "sheveleva", method: "гостевой код", code: "2512", key_owner: null, guest_name: "Ипполит Г." });

  // № 15, 16, 22: больница
  add("hospital_admissions", {
    person_id: 1965, full_name: fullName(EGG_PERSONS.find((p) => p.id === 1965) as EggPerson), admitted_at: "2026-02-21 10:00:00",
    discharged_at: "2026-02-14 16:00:00", department: "неврология ГБ № 1", diagnosis: "со слов: помнит завтрашний день лучше вчерашнего",
  });
  add("hospital_admissions", {
    person_id: 1969, full_name: fullName(EGG_PERSONS.find((p) => p.id === 1969) as EggPerson), admitted_at: "2025-12-12 23:40:00",
    discharged_at: "2025-12-19 11:00:00", department: "травматология ГБ № 1",
    diagnosis: "закрытый перелом руки, гипсовая лонгета. Со слов: «Поскользнулся, упал. Очнулся — гипс»",
  });
  add("hospital_admissions", {
    person_id: 2027, full_name: fullName(EGG_PERSONS.find((p) => p.id === 2027) as EggPerson), admitted_at: "2027-01-01 00:35:00",
    discharged_at: null, department: "родильное отделение ГБ № 1",
    diagnosis: "роды вне стационара, в машине скорой помощи: 01.01.2027 00:00:41 — девочка, 3380 г, 52 см; мать и ребёнок здоровы",
  });

  // № 17 «Последняя пачка»: одна пачка 30.11, потом 41 утро жвачки
  const dasha = PERSON.dasha;
  const kim = "Ким Д. С.";
  const shop = "Продукты 24 (Мира, 5)";
  add("purchases", { ts: "2026-11-30 22:10:00", merchant: shop, payer_person_id: dasha, payer_name: kim, item: "сигареты «Сполох», пачка", qty: 1, amount: 210 });
  const gum0 = parseTs("2026-12-01 08:42:00");
  for (let d = 0; d < 41; d++) {
    add("purchases", { ts: fmtTs(gum0 + d * DAY), merchant: shop, payer_person_id: dasha, payer_name: kim, item: "жевательная резинка «Ледокол», мята", qty: 2, amount: 118 });
  }
  add("purchases", { ts: "2026-12-31 22:41:00", merchant: shop, payer_person_id: dasha, payer_name: kim, item: "мандарины, кг", qty: 3, amount: 597 });

  // № 18 и 19: заявки в фонд
  add("grant_requests", {
    requested_at: "2021-11-02 10:12:00", requester_person_id: 1956, org_text: "ДК «Полярник»",
    request_text: "Новогодний вечер провести серьёзно: вступительный доклад (коротенько, минут на сорок), лекция «Есть ли жизнь на Марсе», танцы — после согласования",
    status: "отклонено",
  });
  add("grant_requests", {
    requested_at: "2021-11-03 16:40:00", requester_person_id: 1957, org_text: "ДК «Полярник», молодёжный ансамбль",
    request_text: "Новогодний вечер с оркестром и песнями. На поздравления — пять минут, не больше", status: "исполнено",
  });
  add("grant_requests", {
    requested_at: "2022-10-12 16:05:00", requester_person_id: 1972, org_text: "Школа № 2, 2 «Б»",
    request_text: "СЧАСТЬЕ ДЛЯ ВСЕХ, ДАРОМ, И ПУСТЬ НИКТО НЕ УЙДЁТ ОБИЖЕННЫЙ", status: "на рассмотрении",
  });

  // № 20 «Все детали важны»
  const keyJson = JSON.stringify({ case_id: CASE_FRIMONOV });
  add("evidence_registry", {
    pinned_at: "2020-02-28 17:40:00", pinned_by: LOGIN_FRIMONOV, node: null,
    card_title: "Кукольная мебель 1:12, 14 предметов (комод, стулья, часы с маятником — не доделаны). Все детали важны",
    source_table: "cases", source_class: "ПБД", key_json: keyJson, value_hash: hash16(keyJson), status: "активна",
  });

  // № 21 «Дед Мороз на всех вышках»: 13 сот за 13 секунд, от Гавани к маяку
  const cells = ["ПРЧ-04", "МРС-07", "ПРТ-02", "ПЛР-03", "МИР-05", "СЕВ-08", "ТРД-01", "ЭНР-06", "ИНД-09", "ШХТ-11", "ГРН-10", "МЯК-12", "БРГ-13"];
  cells.forEach((cell_id, i) => {
    const ts = `2027-01-01 00:00:${String(i).padStart(2, "0")}`;
    add("messenger_events", {
      ts, created_at: ts, from_msisdn: PHONE_DED_MOROZ, to_msisdn: KIDS_PHONES[i], kind: "голос", size_kb: 41, cell_id, status: "доставлено",
    });
  });
  return rows;
}

/** 16 hex-знаков, как value_hash шума, — детерминированно от текста (два FNV-1a по 32 бита) */
function hash16(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
    return h.toString(16).padStart(8, "0");
  };
  return fnv(0x811c9dc5) + fnv(0x050c5d1f);
}

/** Ключ порядка плавающей строки: столбец времени таблицы */
const ORDER_COLUMN: Readonly<Record<string, string>> = {
  incidents: "reported_at", transit_taps: "ts", plate_reads: "read_at", transactions: "ts", intercom_events: "ts",
  query_log: "logged_at", statements: "taken_at", gs_comms_2015: "orderAt", purchases: "ts", hospital_admissions: "admitted_at",
  grant_requests: "requested_at", evidence_registry: "pinned_at", messenger_events: "created_at",
};

const EGG_ROWS = eggRows();

/** Совпадает ли строка базы со строкой тайника (id, адрес и служебный ключ порядка не сравниваются) */
function sameRow(egg: Row, row: Row): boolean {
  let compared = 0;
  for (const [k, v] of Object.entries(egg)) {
    if (k === "address" || k === "orderAt" || row[k] === undefined) continue;
    if ((row[k] ?? null) !== (v ?? null)) return false;
    compared++;
  }
  return compared > 0;
}

/**
 * Предикаты строк тайников по таблицам: практика, сводки и мини-задачи не
 * берут эти строки в шаблоны и эталоны (EASTER_EGGS.md, разд. 2, п. 8).
 */
export const EGG_ROW_KEYS: Readonly<Record<string, (row: Row) => boolean>> = {
  ...Object.fromEntries(Object.entries(EGG_ROWS).map(([table, list]) => [table, (row: Row) => list.some((e) => sameRow(e, row))])),
  persons: (row) => EGG_PERSON_IDS.includes(Number(row.id)),
  staff: (row) => (EGG_IDS.staff as readonly number[]).includes(Number(row.id)),
  companies: (row) => (EGG_IDS.companies as readonly number[]).includes(Number(row.id)),
  vehicles: (row) => (EGG_IDS.vehicles as readonly number[]).includes(Number(row.id)),
  addresses: (row) => EGG_ADDRESS_IDS.has(Number(row.id)),
  cases: (row) => row.id === CASE_FRIMONOV,
  logins: (row) => row.login === LOGIN_DENTOV || row.login === LOGIN_FRIMONOV,
  phones: (row) => row.msisdn === PHONE_DED_MOROZ,
  accounts: (row) => (Object.values(ACC) as string[]).includes(String(row.id)),
  zags_deaths: (row) => row.act_no === ACT_TIKHONOV,
};

// ==================================================================== посадка

function plantPeople(ctx: WorldContext): Map<string, number> {
  const addressIds = new Map<string, number>();
  for (const a of EGG_ADDRESSES) {
    const row = { district: a.district, street: a.street, house: a.house, apt: a.apt };
    if (a.id !== undefined) ctx.insert("addresses", { id: a.id, ...row });
    else ctx.insert("addresses", row); // id выдаёт аллокатор
    const planted = ctx.planted("addresses");
    const id = Number(planted[planted.length - 1].row.id);
    addressIds.set(a.key, id);
    EGG_ADDRESS_IDS.add(id);
  }
  for (const p of EGG_PERSONS) {
    ctx.insert("persons", {
      id: p.id, last_name: p.last, first_name: p.first, patronymic: p.middle, birth_date: p.birth, sex: p.sex,
      father_id: null, mother_id: p.motherId ?? null, prev_last_name: null, special_marks: p.specialMarks ?? null,
      death_date: p.deathDate ?? null, created_at: p.createdAt,
    });
    // Прописка есть у каждого (иначе житель стал бы «мёртвой душой» side-06)
    ctx.insert(
      "registrations",
      { person_id: p.id, address_id: addressIds.get(p.address) as number, from_date: p.from, to_date: p.to ?? null },
      { orderAt: parseTs(p.from) }
    );
  }
  return addressIds;
}

function plantRecords(ctx: WorldContext): void {
  // № 4: машина, снятая с учёта за 30 лет до регистрации
  ctx.insert("vehicles", {
    id: EGG_IDS.vehicles[0], plate: PLATE_DELOREAN, make: "Нордика", model: "Купе", color: "серебристый", year: 1985,
    owner_person_id: 1985, owner_company_id: null, owner_name: "Мухин Мартын Георгиевич", registered_at: "2015-10-21", sold_at: null,
    deregistered_at: "1985-10-26",
  });
  // № 5, 6, 7: счета
  const account = (id: string, person: number, opened: string) =>
    ctx.insert("accounts", { id, holder_person_id: person, holder_company_id: null, holder_name: shortOf(person), bank: "Северный кредит", opened_at: opened });
  account(ACC.novoseltsev, 1978, "2016-02-15");
  account(ACC.kalugina, 1977, "2015-07-01");
  account(ACC.garaev, 1940, "2012-03-01");
  account(ACC.samoylova, SAMOYLOVA_ID, "2014-09-01");
  // № 6: смерть Тихонова в ЗАГС
  ctx.insert("zags_deaths", {
    act_no: ACT_TIKHONOV, person_id: 2022, died_at: "2022-12-03 06:20:00", cause: "несчастный случай на производстве", registered_at: "2022-12-05 10:30:00",
  });
  // № 10: однодневка с 84-летним директором
  ctx.insert("companies", {
    id: EGG_IDS.companies[0], name: COMPANY_HORNS, inn: INN_HORNS, kind: "ООО", registered_at: "2016-04-01", liquidated_at: "2016-10-01",
    director_person_id: 1931,
  });
  ctx.insert("company_owners", { company_id: EGG_IDS.companies[0], owner_type: "person", owner_id: 1931, share: 100, since: "2016-04-01", until: "2016-10-01" });
  // № 11: инженер-программист (гражданский, как Лыков)
  ctx.insert("staff", {
    id: 42, person_id: 4242, full_name: shortOf(4242), login: LOGIN_DENTOV, rank: null, position: "инженер-программист", dept: "ИТ-отдел",
    workstation: "WS-IT-04", badge_id: BADGE_DENTOV, hired_at: "2024-05-25", fired_at: null, contract_no: null,
  });
  ctx.insert("logins", {
    login: LOGIN_DENTOV, staff_id: 42, role: "admin", created_at: "2024-05-25 10:00:00", created_by: LOGIN.melnik, enabled: 1,
    last_login_at: "2026-12-10 09:12:00",
  });
  // № 20: опер ломбардной группы, уволен 29.02.2020
  ctx.insert("staff", {
    id: 13, person_id: 2002, full_name: shortOf(2002), login: LOGIN_FRIMONOV, rank: "капитан", position: "оперуполномоченный (ломбардная группа)",
    dept: "ОУР", workstation: null, badge_id: BADGE_FRIMONOV, hired_at: "2006-10-02", fired_at: "2020-02-29", contract_no: null,
  });
  ctx.insert("logins", {
    login: LOGIN_FRIMONOV, staff_id: 13, role: "user", created_at: "2017-03-01 09:00:00", created_by: "system", enabled: 0,
    last_login_at: "2020-02-28 17:55:00",
  });
  ctx.insert("cases", {
    id: CASE_FRIMONOV, title: "Скупка краденого через ломбард «Янтарь»", opened_at: "2019-03-02 11:00:00", applicant_text: "рапорт ОУР",
    investigator: "капитан Фримонов Л. Л.", status: "направлено в суд", status_at: "2019-11-20",
  });
  // № 21: номер Деда Мороза (детские номера в phones не записаны). Плавающий: шум
  // ставит его по дате регистрации, иначе он стоял бы в первых строках phones
  ctx.insert("phones", { msisdn: PHONE_DED_MOROZ, person_id: 1951, company_id: null, registered_at: "2015-12-31" }, { orderAt: parseTs("2015-12-31") });
}

function plantRows(ctx: WorldContext, addressIds: ReadonlyMap<string, number>): void {
  for (const [table, list] of Object.entries(EGG_ROWS)) {
    for (const egg of list) {
      const { address, orderAt, ...row } = egg;
      if (address !== undefined) row.address_id = addressIds.get(String(address)) as number;
      // Плавающая строка: id выдаст шум по времени (fillOrdered / flushByTime)
      ctx.insert(table, row, { orderAt: parseTs(String(orderAt ?? egg[ORDER_COLUMN[table]])) });
    }
  }
}

const LATIN_TO_CYR: Readonly<Record<string, string>> = { A: "А", B: "В", E: "Е", K: "К", M: "М", H: "Н", O: "О", P: "Р", C: "С", T: "Т", Y: "У", X: "Х" };
const cyrPlate = (plate: string) => plate.toUpperCase().replace(/[ABEKMHOPCTYX]/g, (c) => LATIN_TO_CYR[c]);

function plantExclusions(ctx: WorldContext): void {
  const note = "eggs: значение-триггер есть только у тайника";
  ctx.exclude("persons", (r) => r.special_marks === "NULL", note);
  ctx.exclude("addresses", (r) => String(r.street ?? "").trim() === "3-я Строителей", note);
  ctx.exclude("registrations", (r) => EGG_ADDRESS_IDS.has(Number(r.address_id)), "eggs: в адреса пасхалок шум не прописывает");
  ctx.exclude(
    "intercom_events",
    (r) => EGG_ADDRESS_IDS.has(Number(r.address_id)) || r.code === "1977" || r.code === "2512",
    "eggs: домофон адресов пасхалок и их коды — только посадки"
  );
  ctx.exclude("transactions", (r) => r.amount === -1 || r.amount === -5630, note);
  ctx.exclude(
    "vehicles",
    (r) => r.deregistered_at != null && r.registered_at != null && String(r.deregistered_at) < String(r.registered_at),
    note
  );
  ctx.exclude("plate_reads", (r) => r.plate !== undefined && cyrPlate(String(r.plate)) === PLATE_DELOREAN, "eggs: М088АК — один проезд, без гомоглифов");
  ctx.exclude(
    "purchases",
    (r) => Number(r.payer_person_id) === PERSON.dasha && /сигарет/i.test(String(r.item ?? "")),
    "eggs: у Даши одна пачка"
  );
}

export function plant(ctx: WorldContext): void {
  reserveKeys(ctx);
  const addressIds = plantPeople(ctx);
  plantRecords(ctx);
  plantRows(ctx, addressIds);
  plantExclusions(ctx);
}
