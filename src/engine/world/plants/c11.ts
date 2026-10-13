import type { Database, SqlValue } from "sql.js";
import type { WorldContext } from "../context";
import type { Rng } from "../rng";
import * as F from "../facts";
import type { LateFillers } from "./types";

/**
 * Посадка дела `case-11-chernovik` — Интерлюдия «Черновик» (разд. 5.11, 8.4 «И»).
 *
 * В базовом мире у дела фактов нет: всё, что нужно, — поздние таблицы
 * draft_statements / draft_persons / draft_publication. Их создаёт патч
 * `late.drafts` на старте дела (живое событие после вступления), а наполняют
 * наполнители ниже — из уже готового мира (statements, persons) и списка
 * строк черновика публикации.
 *
 * Состав (разд. 8.4):
 *  - draft_statements 200: все 63 строки дела 15-0219 из statements (60 настоящих
 *    и подделки 5203, 5204, 5207) и 137 строк других дел. 11 пропавших (2071, 2072, …)
 *    в черновик не попадают, дублей импорта нет ни на одной ветке.
 *  - draft_persons 100: копия строк persons, в том числе 2214 (примета обнулена,
 *    как в ПБД) и ещё 99, у части которых примета не NULL — так UPDATE без WHERE
 *    виден: подзапрос перезаписывает их значением из архива или NULL.
 *  - draft_publication 50: id 7 и 19 — Ким Д. С. (13 лет на дату показаний),
 *    id 12 и 33 — Шпаков Г. И. («информатор»), остальные 46 — документы,
 *    сотрудники и взрослые свидетели. Все ts различны, а порядок id не совпадает
 *    с порядком ts (без ORDER BY витрина И.4 идёт не по времени).
 */
export function plant(ctx: WorldContext): void {
  void ctx;
}

/** Момент, на который снимается черновик: старт дела. Позже строк нет (разд. 6.14, п. 3) */
export const DRAFT_AT = F.CASE_START.c11;

export const DRAFT = {
  statements: 200,
  persons: 100,
  publication: 50,
  /** Ким Д. С. в черновике публикации: объяснение 3312 и схема 3313 */
  minorRows: [7, 19],
  /** Шпаков Г. И., информатор */
  informantRows: [12, 33],
} as const;

/** Строка черновика публикации: id, person_id, person_text, person_birth_date, source_role, ts, place, what, source_class */
type PubRow = [number, number | null, string | null, string | null, string, string, string, string, string];

const P = F.PERSON;
const DASHA: [number, string, string] = [P.dasha, "Ким Д. С.", "2001-06-14"];
const KIM_S: [number, string, string] = [P.kimSergey, "Ким С. А.", "1969-11-20"];
const SHPAKOV: [number, string, string] = [P.shpakov, "Шпаков Г. И.", "1979-04-11"];
const RATNIKOV: [number, string, string] = [P.ratnikov, "Ратников Л. Б.", "1968-02-11"];
const NINA: [number, string, string] = [P.nina, "Шустова Н. Ф.", "1959-05-02"];
const VALENTINA: [number, string, string] = [P.valentina, "Сазонова В. С.", "1968-09-01"];
const IRINA: [number, string, string] = [P.irina, "Вальц И. П.", "1997-04-03"];
const OLEG: [number, string, string] = [P.oleg, "Пахомов О. В.", "1990-07-21"];
const ALLA: [number, string, string] = [P.alla, "Мирошник А. Д.", "1977-01-23"];

const doc = (id: number, ts: string, place: string, what: string, cls: string): PubRow => [id, null, null, null, "документ", ts, place, what, cls];
const who = (id: number, p: [number, string, string], role: string, ts: string, place: string, what: string, cls: string): PubRow => [id, p[0], p[1], p[2], role, ts, place, what, cls];

/**
 * Черновик публикации (50 строк). ts уникальны; id перемешаны относительно ts.
 * source_class — классы источников доски (SourceClass).
 */
export const DRAFT_PUBLICATION: readonly PubRow[] = [
  doc(1, "2015-03-10 11:00:00", "банк, касса", "Первый из 16 взносов наличными на счёт Kordon Holdings; вноситель указан в выписке", "bank"),
  doc(2, "2015-02-19 21:47:00", "АТС ГС, вн. 2-14", "Звонок с номера приёмной директора 2-14 на номер Сазонова П. И.", "gs_archive"),
  who(3, VALENTINA, "заявитель", "2015-02-20 09:15:00", "ОП-2, дежурная часть", "Заявление о пропаже мужа: ушёл на смену 19.02 и не вернулся", "pbd"),
  doc(4, "2026-11-18 23:08:00", "камера 7, Полярная / Мира", "«Тайга» К404ТО проходит перекрёсток Полярной и Мира", "mirror_city"),
  doc(5, "2015-11-30 15:20:00", "банк, касса", "Шестнадцатый взнос на счёт Kordon Holdings; итого 31 820 000 ₽", "bank"),
  who(6, RATNIKOV, "сотрудник", "2015-02-20 01:30:00", "ОП-2, кабинет 14", "Начал приём объяснений по сообщению о машине в воде", "sokol_2016"),
  who(7, DASHA, "свидетель", "2015-02-20 01:40:00", "ОП-2, кабинет 14", "Объяснение № 3312: две машины без фар, одну столкнули в воду у причала", "sokol_2016"),
  doc(8, "2015-11-18 10:00:00", "проектный архив ГС", "ПД-117/изм.5: рыбозащитное устройство на новом оголовке", "pbd"),
  doc(9, "2026-11-19 00:40:00", "морг ГБ № 1", "Запись № 311 по КУСП 4515: Вальц И. П.", "pbd"),
  who(10, KIM_S, "свидетель", "2015-02-20 02:10:00", "ОП-2, кабинет 14", "Объяснение: видел свет у причала; старший охраны стройки сказал — прожектора", "sokol_2016"),
  doc(11, "2026-11-12 10:05:00", "«Северный кредит»", "ЧОП «Щит» перечисляет 380 000 ₽ в МФО «Деньги Сразу»", "bank"),
  who(12, SHPAKOV, "информатор", "2026-12-05 21:10:00", "по телефону", "Сообщил, где ночевала «Тайга» К404ТО после 18 ноября", "witness"),
  doc(13, "2015-02-19 21:56:00", "АТС ГС, вн. 2-14", "SMS с номера приёмной директора на номер Сазонова П. И.", "gs_archive"),
  who(14, NINA, "сотрудник", "2015-02-20 01:45:00", "ОП-2, машбюро", "Напечатала объяснение № 3312 под диктовку", "carbon"),
  doc(15, "2015-03-16 12:00:00", "Росреестр", "Квартиры на Северной, 14 переданы «от работодателя» одним днём", "pbd"),
  who(16, IRINA, "сотрудник", "2026-11-16 22:45:00", "ГУ, подвал, WS-07", "Аналитик ОЦР ставит девять заданий на сервер «Зеркала»", "pbd"),
  doc(17, "2026-11-20 02:22:00", "ПБД, persons", "Создана карточка 4301 «Кравец Н. Н.»: ни прописки, ни телефона, ни работы", "pbd"),
  doc(18, "2015-03-12 08:00:00", "гидропост, выпуск ТЭЦ", "Начало еженедельных замеров температуры сброса", "hydropost"),
  who(19, DASHA, "свидетель", "2015-02-20 01:55:00", "ОП-2, кабинет 14", "Схема № 3313: где стояли машины и куда светили фары", "sokol_2016"),
  doc(20, "2026-11-18 23:05:00", "«Сияние.Связь»", "Голосовое сообщение 412 КБ, статус «запланировано», отправка 11.01.2027", "operator"),
  doc(21, "2015-12-07 14:30:00", "банк, счёт Kordon Holdings", "Оплата сделок СД-0146 и СД-0147 с того же счёта", "bank"),
  doc(22, "2026-12-14 06:00:00", "гидропост, выпуск ТЭЦ", "Суточный минимум температуры сброса: +0,6 °C", "hydropost"),
  who(23, OLEG, "свидетель", "2026-12-07 15:30:00", "Шахтная, 12", "Видел, как к матери в квартиру 31 ходили посторонние", "witness"),
  doc(24, "2026-11-18 22:52:00", "камера 15, промзона", "«Тайга» К404ТО выезжает с базы ЧОП «Щит»", "mirror_city"),
  doc(25, "2015-02-20 08:00:00", "журнал «Сокола»", "Рапорт о происшествии у причала 3 зарегистрирован под № 3311", "sokol_2016"),
  who(26, ALLA, "свидетель", "2026-12-17 10:20:00", "редакция «Створ-Медиа»", "Подтвердила, что квартиру на Северной, 16 получила по списку фонда", "witness"),
  doc(27, "2026-11-20 02:14:00", "ПБД, incidents", "КУСП 4518: время поступления переписано задним числом", "pbd"),
  doc(28, "2018-07-14 13:00:00", "водолазная станция ГС", "Отчёт водолазов: у оголовка «предметов не обнаружено»", "hydropost"),
  doc(29, "2026-11-25 12:00:00", "фонд «Тёплый берег»", "Договор ТБ-2026/117: ставка аналитика ОЦР на период миграции", "pbd"),
  doc(30, "2015-02-21 11:20:00", "ПБД, statements", "Объяснение 5203 «видел Сазонова в аэропорту» вставлено задним числом в ноябре 2026", "pbd"),
  doc(31, "2026-11-19 02:10:00", "ПБД, audit_log", "Примета Бурцева В. Н. обнулена под логином i.valts", "pbd"),
  doc(32, "2026-11-20 10:00:00", "банк, счёт ЧОП «Щит»", "Возврат 300 000 ₽ от «Ладога Инвест» на счёт ЧОП «Щит»", "bank"),
  who(33, SHPAKOV, "информатор", "2026-12-29 01:15:00", "по телефону", "Сообщил, что «Щит» держит на промзоне машины без номеров", "witness"),
  doc(34, "2015-02-21 12:05:00", "ПБД, statements", "Объяснение 5204 «соседка видела чемоданы» вставлено задним числом в ноябре 2026", "pbd"),
  who(35, RATNIKOV, "сотрудник", "2015-03-02 17:00:00", "ОП-2", "Приостановил проверку по сообщению о машине в воде", "pbd"),
  doc(36, "2016-09-30 18:00:00", "сервер «Сокола»", "Последний ночной снимок базы перед миграцией", "sokol_2016"),
  doc(37, "2026-11-18 23:21:00", "камера 3, Объездная", "«Тайга» К404ТО уходит на Объездную", "mirror_city"),
  doc(38, "2015-02-21 15:40:00", "ПБД, statements", "Объяснение 5207 от имени Пахомовой З. П. вставлено задним числом в ноябре 2026", "pbd"),
  who(39, VALENTINA, "заявитель", "2015-03-16 10:00:00", "ОП-2, приёмная", "Повторное заявление: просит проверить причал 3", "pbd"),
  doc(40, "2026-12-22 02:47:19", "ПБД, query_log", "Выгрузка дела 15-0219 под логином nol с WS-07", "pbd"),
  who(41, DASHA, "сотрудник", "2026-12-07 14:10:00", "Шахтная, 12", "Выезд ОЦР в квартиру 31, запись бодикамеры приобщена", "witness"),
  doc(42, "2015-03-12 10:00:00", "проектный архив ГС", "ПД-117/изм.3: перенос оголовка сброса", "pbd"),
  doc(43, "2026-11-17 08:55:00", "ПБД, audit_log", "Пачка правок с WS-03 синхронизирована разом: десять фамилий", "pbd"),
  doc(44, "2026-12-06 08:00:00", "ЗАГС", "Зарегистрирована смерть Пахомовой З. П.", "pbd"),
  who(45, KIM_S, "свидетель", "2026-12-17 16:40:00", "ОЦР, по телефону", "Подтвердил объяснение 2015 года: свет у причала был не от прожекторов", "witness"),
  doc(46, "2026-11-18 23:34:00", "камера 15, промзона", "«Тайга» К404ТО возвращается на базу ЧОП «Щит»", "mirror_city"),
  doc(47, "2015-02-20 08:05:00", "журнал «Сокола»", "Номер 3312 пропущен: следующий документ — схема № 3313", "sokol_2016"),
  who(48, NINA, "сотрудник", "2016-09-30 23:40:00", "ОП-2, машбюро", "Сохранила копирку четырёх объяснений и диск с последним снимком", "carbon"),
  doc(49, "2026-12-21 03:04:00", "WS-07", "На станции в серверной запущен агент под чужим логином", "pbd"),
  doc(50, "2026-11-19 09:30:00", "морг ГБ № 1", "Опознание по записи № 311: опознала мать", "pbd"),
];

function ids(db: Database, sql: string, params: SqlValue[] = []): number[] {
  const res = db.exec(sql, params);
  return res.length === 0 ? [] : res[0].values.map((r) => Number(r[0]));
}

function inList(values: readonly number[]): string {
  return values.map((v) => String(Math.trunc(v))).join(", ");
}

/** draft_statements: 63 строки 15-0219 и 137 строк других дел, как в statements */
function fillStatements(db: Database, rng: Rng): void {
  const sazonov = ids(db, "SELECT id FROM main.statements WHERE case_id = ? AND taken_at <= ? ORDER BY id", [F.CASE_SAZONOV, DRAFT_AT]);
  const others = ids(
    db,
    "SELECT id FROM main.statements WHERE case_id IS NOT ? AND taken_at <= ? ORDER BY id",
    [F.CASE_SAZONOV, DRAFT_AT]
  );
  const picked = rng.sample(others, Math.max(0, DRAFT.statements - sazonov.length)).sort((a, b) => a - b);
  const all = [...sazonov, ...picked];
  db.run(
    `INSERT INTO main.draft_statements (id, case_id, doc_reg_no, person_id, person_text, taken_at, taken_by, typed_by, text, status)
     SELECT id, case_id, doc_reg_no, person_id, person_text, taken_at, taken_by, typed_by, text, status
     FROM main.statements WHERE id IN (${inList(all)}) ORDER BY id`
  );
}

/** draft_persons: каст дела, наряд 2015 года, люди с приметами и случайные взрослые */
function fillPersons(db: Database, rng: Rng): void {
  const cast = [
    P.burtsev, P.dasha, P.kimSergey, P.shpakov, P.granin, P.ratnikov, P.nina, P.sazonov, P.valentina,
    ...F.GUARD_SQUAD_2015,
  ];
  const chosen = new Set<number>(cast);
  const marked = ids(
    db,
    `SELECT id FROM main.persons WHERE special_marks IS NOT NULL AND death_date IS NULL
       AND id NOT IN (${inList([...chosen])}) ORDER BY id`
  );
  for (const id of rng.sample(marked, 30)) chosen.add(id);
  const rest = ids(
    db,
    `SELECT id FROM main.persons WHERE id < ? AND birth_date <= '2008-12-31' AND id NOT IN (${inList([...chosen])}) ORDER BY id`,
    [P.player]
  );
  for (const id of rng.sample(rest, DRAFT.persons - chosen.size)) chosen.add(id);
  db.run(
    `INSERT INTO main.draft_persons (id, last_name, first_name, patronymic, birth_date, sex, father_id, mother_id,
       prev_last_name, special_marks, death_date, created_at)
     SELECT id, last_name, first_name, patronymic, birth_date, sex, father_id, mother_id,
       prev_last_name, special_marks, death_date, created_at
     FROM main.persons WHERE id IN (${inList([...chosen])}) ORDER BY id`
  );
}

function fillPublication(db: Database): void {
  const stmt = db.prepare(
    `INSERT INTO main.draft_publication (id, person_id, person_text, person_birth_date, source_role, ts, place, what, source_class)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  try {
    for (const row of DRAFT_PUBLICATION) stmt.run(row as unknown as SqlValue[]);
  } finally {
    stmt.free();
  }
}

/**
 * Наполнители поздних таблиц дела: патч `late.drafts` создаёт таблицы и
 * вызывает их по порядку draft_statements → draft_persons → draft_publication.
 */
export const late: LateFillers = {
  draft_statements: (db, rng) => fillStatements(db, rng),
  draft_persons: (db, rng) => fillPersons(db, rng),
  draft_publication: (db) => fillPublication(db),
};
