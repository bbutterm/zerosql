import type { WorldContext } from "../context";
import { parseTs } from "../rng";
import * as F from "../facts";

/**
 * Посадка дела `case-06-polynya` — «Полынья» (разд. 5.6 и 8.4 библии, блок «Д6»).
 *
 * - construction_docs 101–108: ПД-117 и семь ревизий; перенос оголовка (104)
 *   подписал Гранин (1001), координаты — `F.GEO` (2 140 м и 18 м от строки 7).
 * - vehicles «Т117АУ» Сазонова (с учёта не снята, считываний камер нет).
 * - morgue_records 398 (КУСП 4921, 17.12 13:20 — после потолка часов Д6).
 * - addresses 512 «Береговая, 4» и прописки на ночь 19→20.02.2015: Ким С. А.
 *   и Ким Д. С., ещё три семьи (две — с открытым периодом), ловушка Лосева
 *   (уехала 2014-12-31), поздний жилец 3476 (с 2017-го); однофамилица
 *   Ким — Портовая, 3, кв. 7.
 * - diver_reports 2018-07-14: «кузов легковой машины… металлолом», майор Ратников.
 *
 * gs_comms_2015 (звонок и SMS с 2-14), gs_phonebook 2-14, камера 22 и шум
 * outfall_temp уже посажены core / noise.
 */

/** Береговая, 4 */
export const BEREGOVAYA_4 = { id: 512, district: "Створ", street: "Береговая", house: "4", apt: null } as const;

/**
 * Соседи по Береговой, 4 — шумовые жители под посадку (имена даёт шум): три
 * семьи на ночь 19→20.02.2015 и поздний жилец 3476. Годы рождения — под даты прописки.
 */
export const BEREGOVAYA_NEIGHBORS: readonly { id: number; bornFrom: string; bornTo: string }[] = [
  { id: 3471, bornFrom: "1955-01-01", bornTo: "1968-12-31" },
  { id: 3472, bornFrom: "1955-01-01", bornTo: "1968-12-31" },
  { id: 3473, bornFrom: "1970-01-01", bornTo: "1982-12-31" },
  { id: 3474, bornFrom: "1970-01-01", bornTo: "1982-12-31" },
  { id: 3475, bornFrom: "1950-01-01", bornTo: "1962-12-31" },
  { id: 3476, bornFrom: "1985-01-01", bornTo: "1996-12-31" },
];

/** Поздний жилец Береговой, 4 (с 2017-10-02): в ту ночь его там не было */
export const LATE_TENANT = 3476;

export const KIM_PORTOVAYA = { personId: 3477, fullName: "Ким Светлана Робертовна", street: "Портовая", house: "3", apt: "7" } as const;

/** Прописки по Береговой, 4 (from_date / to_date) */
export const BEREGOVAYA_REGISTRATIONS: readonly { person: number; from: string; to: string | null }[] = [
  { person: F.PERSON.kimSergey, from: "2009-03-01", to: "2016-08-31" },
  { person: F.PERSON.dasha, from: "2009-03-01", to: "2016-08-31" },
  { person: F.PERSON.loseva, from: "2010-01-10", to: "2014-12-31" },
  { person: 3471, from: "1994-05-20", to: null },
  { person: 3472, from: "1994-05-20", to: null },
  { person: 3473, from: "2006-09-15", to: "2019-06-30" },
  { person: 3474, from: "2006-09-15", to: "2019-06-30" },
  { person: 3475, from: "1987-04-01", to: null },
  { person: 3476, from: "2017-10-02", to: null },
];

/** Кто был прописан на Береговой, 4 в ночь на 20.02.2015 */
export const NIGHT_RESIDENTS = [F.PERSON.kimSergey, F.PERSON.dasha, 3471, 3472, 3473, 3474, 3475] as const;

/** ПД-117 и ревизии (id, doc_no, signed_at, subject, кто подписал, на что ссылается, x, y, обоснование) */
export const PD117_DOCS = [
  { id: 101, doc_no: "ПД-117", signed_at: "2014-06-10", subject: "Оголовок сброса охлаждающей воды", by: 1620, sup: null, x: F.GEO.outfallOld.x, y: F.GEO.outfallOld.y, rationale: "проект" },
  { id: 102, doc_no: "ПД-117/изм.1", signed_at: "2014-09-02", subject: "Трасса напорного коллектора", by: 1641, sup: 101, x: 2604.5, y: 902.0, rationale: "изменение трассы по согласованию с городом" },
  { id: 103, doc_no: "ПД-117/изм.2", signed_at: "2014-12-15", subject: "Материал труб коллектора", by: 1702, sup: 102, x: 2604.5, y: 902.0, rationale: "замена материала по условиям поставки" },
  { id: 104, doc_no: "ПД-117/изм.3", signed_at: "2015-03-12", subject: "Перенос оголовка сброса на временный сброс", by: F.PERSON.granin, sup: 101, x: F.GEO.outfallNew.x, y: F.GEO.outfallNew.y, rationale: "использовать существующий временный сброс, экономия 41 млн" },
  { id: 105, doc_no: "ПД-117/изм.4", signed_at: "2015-06-30", subject: "Электрообогрев выпускного узла", by: 1755, sup: 104, x: 1262.4, y: 846.1, rationale: "требование эксплуатации при −40 °C" },
  { id: 106, doc_no: "ПД-117/изм.5", signed_at: "2015-11-18", subject: "Рыбозащитное устройство", by: 1810, sup: 101, x: 1291.0, y: 871.5, rationale: "требование рыбоохраны" },
  { id: 107, doc_no: "ПД-117/изм.6", signed_at: "2016-04-07", subject: "Ограждение береговой зоны", by: 1843, sup: 101, x: 1402.0, y: 760.0, rationale: "требование безопасности" },
  { id: 108, doc_no: "ПД-117/изм.7", signed_at: "2017-02-20", subject: "Перенос гидропоста «Створ»", by: 1641, sup: 101, x: 1180.0, y: 702.0, rationale: "передача береговой зоны под охрану ЧОП «Щит»" },
] as const;

export const SAZONOV_CAR = {
  plate: F.PLATE.sazonovCar, make: "Нордика", model: "Седан", color: "серебристый", year: 2009,
  owner: "Сазонов Пётр Ильич", registered: "2009-05-22",
} as const;

export const MORGUE_SAZONOV = {
  id: 398, kusp_no: 4921, received_at: "2026-12-17 13:20:00", full_name_text: "Сазонов Пётр Ильич",
  person_id: F.PERSON.sazonov, identified_at: "2026-12-17 18:40:00", identified_by: "по документам и часам; Вальц В. С.",
} as const;

export const DIVER_REPORT = {
  id: 17, report_date: "2018-07-14", location: "Створ, оголовок сброса «Глубины»",
  note: "кузов легковой машины у оголовка; проверено: строительный металлолом", checked_by: "майор Ратников",
} as const;

export function plant(ctx: WorldContext): void {
  // --- ПД-117 и ревизии: «оголовок сброса» — только здесь
  for (const d of PD117_DOCS) {
    ctx.insert("construction_docs", {
      id: d.id, doc_no: d.doc_no, subject: d.subject, signed_at: d.signed_at, signed_by_person_id: d.by,
      supersedes_doc_id: d.sup, x_m: d.x, y_m: d.y, rationale: d.rationale,
    });
  }
  ctx.exclude("construction_docs", (r) => /оголов/i.test(String(r.subject ?? "")), "оголовок сброса — только ПД-117");

  // --- Машина Сазонова: на учёте, ни одного считывания (с 2015-го подо льдом)
  ctx.reserve("plate", SAZONOV_CAR.plate);
  ctx.insert("vehicles", {
    plate: SAZONOV_CAR.plate, make: SAZONOV_CAR.make, model: SAZONOV_CAR.model, color: SAZONOV_CAR.color,
    year: SAZONOV_CAR.year, owner_person_id: F.PERSON.sazonov, owner_company_id: null, owner_name: SAZONOV_CAR.owner,
    registered_at: SAZONOV_CAR.registered, sold_at: null, deregistered_at: null,
  });
  ctx.exclude("plate_reads", (r) => r.plate === SAZONOV_CAR.plate, "Т117АУ подо льдом с 2015 года");

  // --- Морг: подъём машины 17.12 (после потолка часов Д6)
  ctx.reserve("kusp:2026", String(MORGUE_SAZONOV.kusp_no));
  ctx.insert("morgue_records", { ...MORGUE_SAZONOV });

  // --- Жители: соседи по Береговой, 4 — взрослые шума; их прописки — только здесь
  for (const n of BEREGOVAYA_NEIGHBORS) ctx.reserve("person:adult", String(n.id), { bornFrom: n.bornFrom, bornTo: n.bornTo });
  const neighbors = new Set(BEREGOVAYA_NEIGHBORS.map((n) => n.id));
  ctx.exclude("registrations", (r) => neighbors.has(Number(r.person_id)), "соседи Береговой, 4 прописаны только там");
  // Однофамилица Ким — своя карточка (фамилию шум не выбирает)
  ctx.insert("persons", {
    id: KIM_PORTOVAYA.personId, last_name: "Ким", first_name: "Светлана", patronymic: "Робертовна", birth_date: "1983-05-26",
    sex: "Ж", father_id: null, mother_id: null, prev_last_name: null, special_marks: null, death_date: null,
    created_at: "2020-10-05 14:22:51",
  });

  // --- Береговая, 4 (без хвостового пробела) и прописки: шум туда не пишет
  ctx.insert("addresses", { ...BEREGOVAYA_4 });
  ctx.exclude(
    "addresses",
    (r) => String(r.street ?? "").trim() === BEREGOVAYA_4.street && String(r.house) === BEREGOVAYA_4.house,
    "Береговая, 4 — одна строка (512)",
  );
  ctx.exclude("registrations", (r) => Number(r.address_id) === BEREGOVAYA_4.id, "прописки Береговой, 4 — только посадки");
  for (const r of BEREGOVAYA_REGISTRATIONS) {
    ctx.insert("registrations", { person_id: r.person, address_id: BEREGOVAYA_4.id, from_date: r.from, to_date: r.to }, { orderAt: parseTs(r.from) });
  }

  // --- Однофамилица Ким: Портовая, 3, кв. 7 (кв. 12 и 14 — Сазоновы и Лапина, core)
  ctx.insert("addresses", { district: "Старый город", street: KIM_PORTOVAYA.street, house: KIM_PORTOVAYA.house, apt: KIM_PORTOVAYA.apt });
  const portovaya = Number(ctx.planted("addresses").at(-1)?.row.id);
  ctx.insert("registrations", { person_id: KIM_PORTOVAYA.personId, address_id: portovaya, from_date: "2008-02-11", to_date: null }, { orderAt: parseTs("2008-02-11") });

  // --- Рапорт водолазов 2018 года
  ctx.insert("diver_reports", { ...DIVER_REPORT });
  ctx.exclude("diver_reports", (r) => /машин|кузов/i.test(String(r.note ?? "")), "кузов у оголовка — только рапорт 2018 года");
}
