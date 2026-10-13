import type { Database, SqlValue } from "sql.js";
import type { WorldContext } from "../context";
import type { Rng } from "../rng";
import { parseTs } from "../rng";
import * as F from "../facts";
import type { LateFillerContext, LateFillers } from "./types";

/**
 * Посадка дела `case-10-kopirka` — «Копирка» (разд. 5.10 и 8.4 библии).
 *
 * В мир до шума — только якоря диктофона Ирины в `attachments` (записи 2–10,
 * id 201–209, `author_login` 'i.valts'). Остальное core уже посадил:
 * подделки 5203 / 5204 / 5207, Кравец 4301, дыры 11 сирот в statements,
 * обнулённые приметы Бурцева и наряда, акростих 2101–2110.
 *
 * Диск Нины и копирка — поздние таблицы. Их наполняют `late`-функции этого
 * модуля в момент патча (`c10.import`, `late.nina_carbon`) из состояния базы
 * дела, поэтому снимок согласован с ПБД по построению:
 *
 * - `sokol_stage_statements` (→ `arch16_statements`): объяснения 2015 года из
 *   statements без трёх подделок (1 089) + 11 пропавших = 1 100. Без Тохи
 *   (`tokha_turned` не поднят) старый ридер «Сокола» пишет без первичного
 *   ключа и задваивает 37 строк, которые и так есть в ПБД (не 15-0219).
 * - `sokol_stage_persons` (→ `arch16_persons`): 1 500 жителей, родившихся до
 *   снимка (Кравца на диске нет). Приметы совпадают с ПБД, кроме 27: у 21
 *   было и стало не NULL (законные изменения), у шести призрак стёр примету.
 * - `sokol_stage_registry` (→ `arch16_registry`): том журнала 16.02–03.03.2015,
 *   1 000 номеров, даты 'ДД.ММ.ГГГГ'. 3320 — «запрос в ГИБДД», 3322 — «рапорт
 *   о ДТП», 3312 нет и здесь (изъят ещё в 2015 году).
 * - `nina_carbon`: четыре копии, среди них 3312 (Даша) и Ким С. А.
 */

// ------------------------------------------------------------------ якоря диктофона

/** attachments 201–209 (разд. 8.4): записи 2–10 диктофона «Сверчок» */
export const IRINA_ANCHORS: readonly { id: number; table: string; key: Record<string, string | number>; at: string; note: number }[] = [
  { id: 201, table: "sokol_stage_registry", key: { year: 2015, reg_no: 3311 }, at: "2026-10-29 21:40:00", note: 2 },
  { id: 202, table: "persons", key: { id: 1388 }, at: "2026-11-03 22:15:00", note: 3 },
  { id: 203, table: "persons", key: { id: 2214 }, at: "2026-11-05 20:30:00", note: 4 },
  { id: 204, table: "sokol_stage_registry", key: { registered_by: "Шустова Н. Ф." }, at: "2026-11-06 21:05:00", note: 5 },
  { id: 205, table: "construction_docs", key: { doc_no: "ПД-117/изм.3" }, at: "2026-11-09 22:50:00", note: 6 },
  { id: 206, table: "properties", key: { address_text: "Северная, 14-27" }, at: "2026-11-11 21:20:00", note: 7 },
  { id: 207, table: "purchases", key: { payer_person_id: 4127, item: "чай с чабрецом", date: "2026-11-13" }, at: "2026-11-13 21:45:00", note: 8 },
  { id: 208, table: "audit_log", key: { login: "i.valts", table_name: "logins", row_id: "zero" }, at: "2026-11-16 22:59:00", note: 9 },
  { id: 209, table: "messenger_events", key: { from_msisdn: "+7 900 000-41-27", ts: "2027-01-11 12:58:00" }, at: "2026-11-18 23:06:00", note: 10 },
];

export function plant(ctx: WorldContext): void {
  for (const a of IRINA_ANCHORS) {
    ctx.insert(
      "attachments",
      { id: a.id, author_login: F.LOGIN.irina, table_name: a.table, row_key_json: JSON.stringify(a.key), created_at: a.at, note_no: a.note },
      { orderAt: parseTs(a.at) }
    );
  }
  // Закладки сотрудников — без номеров записей и не от имени Ирины
  ctx.exclude("attachments", (r) => r.author_login === F.LOGIN.irina || (r.note_no !== null && r.note_no !== undefined));
}

// ------------------------------------------------------------------ диск Нины

/** Снимок «Сокола»: последний ночной бэкап 30.09.2016 */
export const SNAPSHOT_AT = "2016-09-30 23:59:59";
/** Объём снимков (разд. 8.2) */
export const ARCH16_SIZE = { persons: 1500, statements: 1100, registry: 1000, duplicates: 37, legalMarks: 21 } as const;

/** Объяснение № 3312 — слова тринадцатилетней Даши, напечатанные Ниной (М22) */
export const TEXT_3312 =
  "Я проснулась, собака лаяла. Из окна видно причал. Там были две машины без фар. Одну столкнули в воду, она сначала плавала, потом нет. " +
  "Я разбудила папу. Потом дядя с усами пришёл к нам, держался за косяк, у него на пальце кусочка не было. Он сказал папе — это прожектора. " +
  "Это были не прожектора. Я не вру.";
/** Объяснение Ким С. А. (2072) */
export const TEXT_KIM_FATHER =
  "Около полуночи дочь разбудила, сказала — у Старого причала машину столкнули. Видел свет у причала, фар не видел. " +
  "Потом пришёл старший охраны стройки, сказал — прожектора, монтаж. Больше ничего не видел.";

/**
 * 11 объяснений 2015 года, которых нет в ПБД: в журнале им не нашлось записи,
 * и дамп 2017 года, снятый через журнал, их не взял (разд. 8.4).
 */
export const MISSING_STATEMENTS: readonly {
  id: number; case_id: string; doc_reg_no: number | null; person_text: string; taken_at: string; taken_by: string; typed_by: string; text: string;
}[] = [
  { id: 1187, case_id: "15-0210", doc_reg_no: null, person_text: "Ковалёва Е. М.", taken_at: "2015-03-15 10:12:40", taken_by: "капитан Семёнова К. П.", typed_by: "Шустова Н. Ф.", text: "Муж машину оставил у подъезда, ключи были только у него" },
  { id: 1342, case_id: "15-0218", doc_reg_no: null, person_text: "Поляков Д. В.", taken_at: "2015-03-30 23:10:05", taken_by: "майор Зайцев К. Д.", typed_by: "Шустова Н. Ф.", text: "Брат ушёл с работы в 18:00, у нас был до утра" },
  { id: 1468, case_id: "15-0328", doc_reg_no: null, person_text: "Титова О. С.", taken_at: "2015-04-10 22:05:51", taken_by: "подполковник Ершов М. А.", typed_by: "Голубева Е. П.", text: "Кошелёк был в сумке, сумка на коленях, в автобусе № 2 давка" },
  { id: 1590, case_id: "15-0131", doc_reg_no: null, person_text: "Лебедев Г. А.", taken_at: "2015-02-17 01:20:12", taken_by: "майор Шарова А. Т.", typed_by: "Сомова В. И.", text: "Жена переводила деньги при мне, звонивший представился банком" },
  { id: 1723, case_id: "15-0619", doc_reg_no: null, person_text: "Иванова Т. Н.", taken_at: "2015-06-28 07:02:14", taken_by: "капитан Романова З. А.", typed_by: "Шустова Н. Ф.", text: "Мужчина в серой куртке стоял вплотную, вышел на «Музыкальной школе»" },
  { id: 1856, case_id: "15-0827", doc_reg_no: null, person_text: "Борисова Л. Т.", taken_at: "2015-09-15 02:31:40", taken_by: "майор Шарова А. Т.", typed_by: "Шустова Н. Ф.", text: "Около 22:00 у гаражей кричали двое, один был в белой шапке" },
  { id: 1914, case_id: "15-1017", doc_reg_no: null, person_text: "Иванов П. В.", taken_at: "2015-10-21 03:40:22", taken_by: "майор Ткаченко Р. И.", typed_by: "Шустова Н. Ф.", text: "Был дома с отцом, ночью никуда не выходили" },
  { id: 2033, case_id: "15-1218", doc_reg_no: null, person_text: "Шестаков Ю. Р.", taken_at: "2015-12-30 18:00:00", taken_by: "майор Назаров А. Г.", typed_by: "Шустова Н. Ф.", text: "В драке не участвовал, разнимал" },
  { id: 2071, case_id: F.CASE_SAZONOV, doc_reg_no: F.DOC_REG.missing, person_text: "Ким Д. С., 13 л.", taken_at: "2015-02-20 01:40:00", taken_by: "майор Ратников Л. Б.", typed_by: "Шустова Н. Ф.", text: TEXT_3312 },
  { id: 2072, case_id: F.CASE_SAZONOV, doc_reg_no: null, person_text: "Ким С. А.", taken_at: "2015-02-20 01:20:00", taken_by: "майор Ратников Л. Б.", typed_by: "Шустова Н. Ф.", text: TEXT_KIM_FATHER },
  { id: 2098, case_id: "15-1211", doc_reg_no: null, person_text: "Кузьмина В. И.", taken_at: "2015-12-30 18:00:00", taken_by: "старший лейтенант Белов А. Ф.", typed_by: "Шустова Н. Ф.", text: "Телефон опознаю по трещине в углу экрана" },
];

/** Приметы, которые призрак стёр 19–21.11.2026 (на диске они есть) */
export const ERASED_MARKS: Readonly<Record<number, string>> = {
  [F.PERSON.burtsev]: "отсутствует ногтевая фаланга 4-го пальца левой кисти",
  1288: "татуировка «ВДВ» на левом плече",
  1471: "шрам над левой бровью",
  2650: "татуировка «якорь» на правом предплечье",
  3015: "золотая коронка на верхнем зубе",
  3390: "ожог на тыльной стороне правой кисти",
};

/** Чем отличалась законная примета в 2016 году (было не NULL и стало не NULL) */
const MARKS_2016 = [
  "шрам на левой щеке",
  "родинка над верхней губой",
  "шрам над правой бровью",
  "хромает на правую ногу",
  "золотая коронка на нижнем зубе",
  "татуировка-надпись на шее",
] as const;

/** Журнал 2016 года: что стояло под номерами, которые призрак переписал в ПБД */
const REGISTRY_2016: Readonly<Record<number, { doc_type: string; reg_date: string; case_id: string }>> = {
  [F.DOC_REG.rapport]: { doc_type: "рапорт о выезде", reg_date: "20.02.2015", case_id: F.CASE_SAZONOV },
  [F.DOC_REG.scheme]: { doc_type: "схема места происшествия", reg_date: "20.02.2015", case_id: F.CASE_SAZONOV },
  [F.DOC_REG.forgedA]: { doc_type: "запрос в ГИБДД", reg_date: "21.02.2015", case_id: F.CASE_SAZONOV },
  [F.DOC_REG.forgedB]: { doc_type: "рапорт о ДТП", reg_date: "21.02.2015", case_id: F.CASE_SAZONOV },
};

function rows(db: Database, sql: string, params: SqlValue[] = []): SqlValue[][] {
  const res = db.exec(sql, params);
  return res.length ? (res[0].values as SqlValue[][]) : [];
}

function insertAll(db: Database, table: string, columns: readonly string[], data: readonly SqlValue[][]): void {
  const stmt = db.prepare(`INSERT INTO main.${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`);
  try {
    for (const r of data) stmt.run(r);
  } finally {
    stmt.free();
  }
}

/** 'YYYY-MM-DD…' → 'ДД.ММ.ГГГГ' (так «Сокол» писал даты журнала) */
const legacyDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

const STATEMENT_COLS = ["id", "case_id", "doc_reg_no", "person_text", "taken_at", "taken_by", "typed_by", "text"] as const;

function fillStatements(db: Database, rng: Rng, { flags }: LateFillerContext): void {
  const forged = F.FORGED_STATEMENTS.map(Number);
  const live = rows(
    db,
    `SELECT ${STATEMENT_COLS.join(", ")} FROM main.statements
     WHERE taken_at <= ? AND id NOT IN (${forged.join(", ")}) ORDER BY id`,
    [SNAPSHOT_AT]
  );
  const missing = MISSING_STATEMENTS.map((m) => STATEMENT_COLS.map((c) => m[c] as SqlValue));
  const all = [...live, ...missing].sort((a, b) => Number(a[0]) - Number(b[0]));
  const dupes = new Set<number>();
  if (!flags.tokha_turned) {
    // Старый ридер «Сокола» пишет без первичного ключа и задваивает строки
    db.run("DROP TABLE IF EXISTS main.sokol_stage_statements");
    db.run(
      "CREATE TABLE main.sokol_stage_statements (id INTEGER, case_id TEXT, doc_reg_no INTEGER, person_text TEXT, taken_at TEXT, taken_by TEXT, typed_by TEXT, text TEXT)"
    );
    const pool = live.filter((r) => r[1] !== F.CASE_SAZONOV).map((r) => Number(r[0]));
    for (const id of rng.sample(pool, ARCH16_SIZE.duplicates)) dupes.add(id);
  }
  const out: SqlValue[][] = [];
  for (const r of all) {
    out.push(r);
    if (dupes.has(Number(r[0]))) out.push(r);
  }
  insertAll(db, "sokol_stage_statements", STATEMENT_COLS, out);
}

const PERSON_COLS = ["id", "last_name", "first_name", "patronymic", "birth_date", "special_marks", "death_date"] as const;

function fillPersons(db: Database, rng: Rng): void {
  const born = rows(
    db,
    `SELECT ${PERSON_COLS.join(", ")} FROM main.persons
     WHERE birth_date <= ? AND id <> ? AND id < 9000 ORDER BY id`,
    [SNAPSHOT_AT.slice(0, 10), F.PERSON.kravets]
  );
  const cast = new Set<number>(F.CAST_PERSONS.map((p) => p.id));
  const must = born.filter((r) => cast.has(Number(r[0])));
  const rest = born.filter((r) => !cast.has(Number(r[0])));
  const chosen = [...must, ...rng.sample(rest, ARCH16_SIZE.persons - must.length)].sort((a, b) => Number(a[0]) - Number(b[0]));
  // 21 законное расхождение: только у тех, у кого примета есть и сейчас
  const marked = chosen.filter((r) => !cast.has(Number(r[0])) && r[5] !== null).map((r) => Number(r[0]));
  const legal = new Set(rng.sample(marked, ARCH16_SIZE.legalMarks));
  const out = chosen.map((r) => {
    const id = Number(r[0]);
    let marks = r[5];
    if (ERASED_MARKS[id]) marks = ERASED_MARKS[id];
    else if (legal.has(id)) marks = rng.pick(MARKS_2016.filter((m) => m !== r[5]));
    const death = r[6] !== null && String(r[6]) > SNAPSHOT_AT.slice(0, 10) ? null : r[6];
    return [id, r[1], r[2], r[3], r[4], marks, death];
  });
  insertAll(db, "sokol_stage_persons", PERSON_COLS, out);
}

function fillRegistry(db: Database): void {
  const vol = rows(
    db,
    `SELECT reg_no, registered_at, doc_type, case_id, registered_by FROM main.doc_registry
     WHERE year = 2015 AND reg_no IS NOT NULL AND registered_at BETWEEN '2015-02-16 00:00:00' AND '2015-03-03 23:59:59'
     ORDER BY reg_no`
  );
  const tail = vol.slice(Math.max(0, vol.length - ARCH16_SIZE.registry));
  const out = tail.map((r, i) => {
    const regNo = Number(r[0]);
    const was = REGISTRY_2016[regNo];
    return [i + 1, 2015, regNo, was?.reg_date ?? legacyDate(String(r[1])), was?.doc_type ?? r[2], was?.case_id ?? r[3], r[4]];
  });
  insertAll(db, "sokol_stage_registry", ["id", "year", "reg_no", "reg_date", "doc_type", "case_id", "registered_by"], out);
}

function fillCarbon(db: Database): void {
  const copy = (regNo: number) => rows(db, "SELECT person_text, text FROM main.statements WHERE case_id = ? AND doc_reg_no = ? ORDER BY id LIMIT 1", [F.CASE_SAZONOV, regNo])[0];
  const mother = copy(3317) ?? ["Сазонова В. С.", "19.02 около 21:50 мужу позвонили с работы, он сказал «вызывают, я быстро» и уехал."];
  const colleague = copy(3318) ?? ["Покровский И. И.", "Сазонов в последние дни часто задерживался, сверял ведомости по переселению"];
  insertAll(db, "nina_carbon", ["id", "doc_reg_no", "person_text", "typed_at_text", "text"], [
    [1, F.DOC_REG.missing, "Ким Д. С., 13 л.", "20.02.2015 01:40", TEXT_3312],
    [2, null, "Ким С. А.", "20.02.2015 01:20", TEXT_KIM_FATHER],
    [3, 3317, mother[0], "20.02.2015 10:30", mother[1]],
    [4, 3318, colleague[0], "20.02.2015 14:10", colleague[1]],
  ]);
}

/** Наполнители поздних таблиц: диск Нины (импорт после 10.2) и копирка */
export const late: LateFillers = {
  sokol_stage_statements: fillStatements,
  sokol_stage_persons: (db, rng) => fillPersons(db, rng),
  sokol_stage_registry: (db) => fillRegistry(db),
  nina_carbon: (db) => fillCarbon(db),
};
