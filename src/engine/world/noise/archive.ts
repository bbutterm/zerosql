/**
 * Архивы стройки и наблюдения: construction_docs, outfall_temp,
 * diver_reports, gs_comms_2015, gs_phonebook.
 *
 * - construction_docs: проектные документы ЦОД 2013–2017 с ревизиями; ни в
 *   одной теме шума нет слов «оголовок сброса» (их держит только ПД-117).
 * - outfall_temp: гидропост «Створ» — еженедельно с 2015-03-12 по
 *   2026-11-30 (от +6,2 до +19), ежечасно с 2026-12-01; 14.12 минимум +0,6,
 *   с 15.12 — около нуля (зал Б «Глубины» на замкнутом контуре).
 * - gs_comms_2015: АТС и SMS-шлюз службы безопасности «Глубина-Строя»,
 *   ts_unix — unix-время UTC (местное минус 3 часа). Шум «… ЕДЕТ …» —
 *   десятки строк для LIKE '%ЕДЕТ%'.
 */
import type { Row, WorldContext } from "../context";
import { flushByTime, sampleTimes } from "../context";
import { DAY, HOUR, dayOfYear, fmtDate, fmtTs, hourOfDay, localToUnix, parseTs } from "../rng";
import { fictionalPhone } from "../pools";
import { CASE_START } from "../facts";
import { noiseState, noiseTarget } from "./state";

const YEAR = 365.25 * DAY;

// ==================================================================== construction_docs

const DOC_SUBJECTS = [
  "Фундамент машинного зала А", "Фундамент машинного зала Б", "Градирня № 1", "Градирня № 2",
  "Подстанция «Промзона-2», кабельные трассы", "Водозабор охлаждающей воды", "Ограждение строительной площадки",
  "Подъездная дорога к КПП", "Резервуар пожарного водоснабжения", "Опоры ЛЭП 110 кВ", "Насосная станция № 3",
  "Теплотрасса до района Шахтный", "Административно-бытовой корпус", "Склад ГСМ", "Дизель-генераторная",
  "Кабельный тоннель между залами", "Котельная резервная", "Очистные сооружения ливневых стоков", "Причал № 3, укрепление",
  "Временный сброс строительных вод",
];
const RATIONALES = [
  "уточнение нагрузок по результатам изысканий", "замена материала по условиям поставки", "требование экспертизы",
  "оптимизация сметы", "изменение трассы по согласованию с городом", "исправление ошибок рабочей документации",
];

export function generateConstructionDocs(ctx: WorldContext): void {
  const rng = ctx.rng("noise.construction_docs");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "construction_docs");
  const engineers = rng.sample(st.adults.filter((p) => p.birth < parseTs("1988-01-01") && p.birth > parseTs("1950-01-01")), 16);
  const bases: { id: number; no: string; subject: string; at: number; x: number; y: number; revisions: number }[] = [];
  const rows: { key: number; row: Row }[] = [];
  const reservedNo = (no: string) => no.startsWith("ПД-117") || ctx.isReserved("construction_doc", no);
  let made = 0;
  let baseNo = 101;
  while (made < target) {
    const reviseExisting = bases.length > 8 && rng.chance(0.35);
    if (reviseExisting) {
      const b = rng.pick(bases);
      const at = Math.min(b.at + rng.float(30, 700) * DAY, parseTs("2017-06-20"));
      b.revisions++;
      const no = `${b.no}/изм.${b.revisions}`;
      const row = {
        id: ctx.nextId("construction_docs"), doc_no: no, subject: `${b.subject}: ${rng.pick(["армирование", "отметки", "узлы примыкания", "спецификация", "трасса"])}`,
        signed_at: fmtDate(at), signed_by_person_id: rng.pick(engineers).id, supersedes_doc_id: b.id,
        x_m: Math.round((b.x + rng.float(-20, 20)) * 10) / 10, y_m: Math.round((b.y + rng.float(-20, 20)) * 10) / 10, rationale: rng.pick(RATIONALES),
      };
      if (!ctx.isExcluded("construction_docs", row)) {
        rows.push({ key: at, row });
        made++;
      }
      continue;
    }
    let no: string;
    do {
      const series = rng.weighted([["ПД", 50], ["РД", 35], ["ИД", 15]] as const);
      no = series === "ПД" ? `ПД-${baseNo++}` : `${series}-${rng.int(200, 480)}`;
    } while (reservedNo(no) || bases.some((b) => b.no === no));
    const at = Math.floor(rng.float(parseTs("2013-03-01"), parseTs("2016-12-01")) / DAY) * DAY;
    const subject = rng.pick(DOC_SUBJECTS);
    const x = Math.round(rng.float(1600, 4800) * 10) / 10;
    const y = Math.round(rng.float(250, 1600) * 10) / 10;
    const id = ctx.nextId("construction_docs");
    const row = {
      id, doc_no: no, subject, signed_at: fmtDate(at), signed_by_person_id: rng.pick(engineers).id, supersedes_doc_id: null,
      x_m: x, y_m: y, rationale: rng.chance(0.4) ? "проект" : null,
    };
    if (ctx.isExcluded("construction_docs", row)) continue;
    rows.push({ key: at, row });
    bases.push({ id, no, subject, at, x, y, revisions: 0 });
    made++;
  }
  for (const r of rows) ctx.write("construction_docs", r.row);
}

// ==================================================================== outfall_temp

export function generateOutfallTemp(ctx: WorldContext): void {
  const rng = ctx.rng("noise.outfall");
  const out: { key: number; row: Row }[] = [];
  const station = "Створ";
  const add = (t: number, temp: number) => {
    const row = { ts: fmtTs(t), temp_c: Math.round(temp * 10) / 10, station };
    if (!ctx.isExcluded("outfall_temp", row)) out.push({ key: t, row });
  };
  // Еженедельно: сброс ЦОД теплее летом, холоднее зимой; минимум ровно +6,2, максимум +19
  const weekly: { t: number; v: number }[] = [];
  for (let t = parseTs("2015-03-12 10:00:00"); t <= parseTs("2026-11-30 23:59:59"); t += 7 * DAY) {
    const season = Math.sin((2 * Math.PI * (dayOfYear(t) - 120)) / 365);
    const v = 12.6 + 5.6 * season + rng.float(-0.8, 0.8);
    weekly.push({ t: t + rng.int(0, 50) * 60_000, v: Math.min(19, Math.max(6.3, v)) });
  }
  const minIdx = weekly.reduce((m, w, i) => (w.v < weekly[m].v ? i : m), 0);
  const maxIdx = weekly.reduce((m, w, i) => (w.v > weekly[m].v ? i : m), 0);
  weekly[minIdx].v = 6.2;
  weekly[maxIdx].v = 19;
  for (const w of weekly) add(w.t, w.v);
  // Ежечасно с 01.12: нагрузка уходит в зал Б, к 14.12 сброс прекращается
  const hourlyFrom = parseTs("2026-12-01 00:00:00");
  const day14 = parseTs("2026-12-14 00:00:00");
  const day15 = parseTs("2026-12-15 00:00:00");
  const to = parseTs("2027-01-11 11:00:00");
  for (let t = hourlyFrom; t <= to; t += HOUR) {
    let v: number;
    if (t < day14) {
      const f = (t - hourlyFrom) / (day14 - hourlyFrom);
      v = Math.max(1.25, 9.1 - 7.6 * f + 0.25 * Math.sin((hourOfDay(t) / 24) * 2 * Math.PI) + rng.float(-0.1, 0.1));
    } else if (t < day15) {
      const h = hourOfDay(t);
      v = h === 21 ? 0.6 : Math.max(0.7, 1.3 - (0.6 * Math.min(h, 21)) / 21 + rng.float(0, 0.08));
    } else v = rng.float(-0.3, 0.35);
    add(t, v);
  }
  flushByTime(ctx, "outfall_temp", out, "ts");
}

// ==================================================================== diver_reports

const DIVE_PLACES = [
  "Гавань, причал № 2", "Гавань, причал № 5", "водозабор «Глубины»", "Створ, маяк", "Береговое шоссе, дамба",
  "Порт, акватория у таможни", "Рыбный двор, слип", "Промзона, ливневый выпуск",
];
const DIVE_NOTES = [
  "без замечаний", "трос и мусор на дне, убраны", "затонувшая лодка «Казанка», владелец установлен",
  "сетка водозабора чистая", "покрышки у причала, акт составлен", "течь в оголовке водозабора не обнаружена",
  "якорная цепь, металлолом", "видимость менее метра, обследование перенесено",
];

export function generateDiverReports(ctx: WorldContext): void {
  const rng = ctx.rng("noise.divers");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "diver_reports");
  const divers = rng.sample(st.adults.filter((p) => parseTs("2026-12-01") - p.birth > 28 * YEAR), 5);
  const rows: { key: number; row: Row }[] = [];
  for (let n = 0; n < target; n++) {
    const at = Math.floor(rng.float(parseTs("2016-05-01"), parseTs(CASE_START.c06) - 30 * DAY) / DAY) * DAY;
    const row = ctx.maybeRow("diver_reports", () => ({
      report_date: fmtDate(at), location: rng.pick(DIVE_PLACES), note: rng.pick(DIVE_NOTES),
      checked_by: `${rng.pick(["ст. л-т", "капитан", "мичман"])} ${rng.pick(divers).short}`,
    }));
    if (row) rows.push({ key: at, row });
  }
  rows.sort((a, b) => a.key - b.key);
  for (const r of rows) ctx.write("diver_reports", { id: ctx.nextId("diver_reports"), ...r.row });
}

// ==================================================================== gs_phonebook и gs_comms_2015

const GS_ROOMS = [
  "бухгалтерия", "касса", "отдел кадров", "диспетчерская", "служба безопасности", "прорабская участка 1",
  "прорабская участка 2", "прорабская участка 3", "склад", "гараж", "приёмная главного инженера", "сметный отдел",
  "лаборатория бетона", "медпункт", "столовая", "КПП стройплощадки", "геодезисты", "снабжение",
];

export function generateGsPhonebook(ctx: WorldContext): string[] {
  const rng = ctx.rng("noise.gs_phonebook");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "gs_phonebook");
  const exts: string[] = [];
  for (let f = 1; f <= 4; f++) for (let n = 1; n <= 40; n++) exts.push(`${f}-${String(n).padStart(2, "0")}`);
  const free = rng.shuffle(exts.filter((e) => !ctx.isReserved("gs_ext", e)));
  const rows: Row[] = [];
  const used: string[] = [];
  const holders = st.adults.filter((p) => p.birth < parseTs("1993-01-01"));
  for (const ext of free) {
    if (rows.length >= target) break;
    const room = rng.pick(GS_ROOMS);
    const start = Math.floor(rng.float(parseTs("2013-03-01"), parseTs("2014-06-01")) / DAY) * DAY;
    const end = parseTs("2017-06-30");
    const history = rng.chance(0.3) && rows.length + 1 < target;
    if (history) {
      const cut = Math.floor(rng.float(start + 180 * DAY, end - 180 * DAY) / DAY) * DAY;
      rows.push({ ext, room, holder_person_id: rng.pick(holders).id, from_date: fmtDate(start), to_date: fmtDate(cut - DAY) });
      rows.push({ ext, room, holder_person_id: rng.chance(0.85) ? rng.pick(holders).id : null, from_date: fmtDate(cut), to_date: fmtDate(end) });
    } else {
      rows.push({ ext, room, holder_person_id: rng.chance(0.85) ? rng.pick(holders).id : null, from_date: fmtDate(start), to_date: fmtDate(end) });
    }
    used.push(ext);
  }
  rows.sort((a, b) => String(a.ext).localeCompare(String(b.ext)) || String(a.from_date).localeCompare(String(b.from_date)));
  for (const r of rows) if (!ctx.isExcluded("gs_phonebook", r)) ctx.write("gs_phonebook", r);
  return used;
}

const GS_SMS = [
  "БЕТОН ЕДЕТ К ПРИЧАЛУ 3", "БЕТОН ЕДЕТ К ПРИЧАЛУ 3", "БЕТОН ЕДЕТ К ПРИЧАЛУ 3", "МИКСЕР ЕДЕТ НА УЧАСТОК 2",
  "ЕДЕТ ПРОВЕРКА ИЗ ОБЛАСТИ", "СМЕНА ПРИНЯТА", "КРАН 2 ОСТАНОВЛЕН, ВЕТЕР", "ПРОВЕРКА ПЕРИМЕТРА 23:00",
  "МАШИНА С ЩЕБНЕМ НА КПП", "АВТОБУС СО СМЕНОЙ ЕДЕТ", "ОТКЛЮЧЕНИЕ СВЕТА НА УЧАСТКЕ 1 В 14:00", "ПЛАНЁРКА ПЕРЕНЕСЕНА НА 9:30",
];
const GS_RECIPIENTS = ["диспетчер бетонного узла", "ст. смены", "прораб участка 3", "дежурный КПП", "ст. наряда", "механик гаража"];

export function generateGsComms(ctx: WorldContext, exts: readonly string[]): void {
  const rng = ctx.rng("noise.gs_comms");
  const st = noiseState(ctx);
  const target = noiseTarget(ctx, "gs_comms_2015");
  const numbers = Array.from({ length: 160 }, () => {
    for (;;) {
      const n = fictionalPhone(rng);
      if (!ctx.isReserved("phone", n)) return n;
    }
  });
  const times = sampleTimes(rng, target, parseTs("2014-01-10 00:00:00"), parseTs("2016-12-28 00:00:00"), (t) => {
    const h = hourOfDay(t);
    return h >= 7 && h < 21 ? 1 : 0.2;
  });
  const out: { key: number; row: Row }[] = [];
  for (const t of times) {
    const row = ctx.maybeRow("gs_comms_2015", () => {
      const sms = rng.chance(0.4);
      const ext = rng.pick(exts);
      return sms
        ? {
            ts_unix: localToUnix(t), kind: "sms", from_ext: ext, to_number: rng.pick(numbers),
            recipient_name: `${rng.pick(GS_RECIPIENTS)}${rng.chance(0.4) ? " " + rng.pick(st.adults).last : ""}`, duration_sec: null, text: rng.pick(GS_SMS),
          }
        : { ts_unix: localToUnix(t), kind: "call", from_ext: ext, to_number: rng.pick(numbers), recipient_name: null, duration_sec: rng.int(5, 900), text: null };
    });
    if (row) out.push({ key: t, row });
  }
  const floating = ctx.takeDeferred("gs_comms_2015").map((p) => ({ key: p.key as number, row: p.row }));
  const all = [...floating, ...out].sort((a, b) => a.key - b.key);
  for (const r of all) ctx.write("gs_comms_2015", { ...r.row, id: ctx.nextId("gs_comms_2015") });
}
