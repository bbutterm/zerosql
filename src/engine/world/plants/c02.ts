import type { Row, WorldContext } from "../context";
import { WorldGenError } from "../context";
import { fmtTs, parseTs } from "../rng";
import * as F from "../facts";

/**
 * Посадка дела `case-02-minus-41` — «Минус сорок один» (разд. 5.2 и 8.4
 * библии, блок «Д2»).
 *
 * - addresses 811 (Шахтная, 12-31), 640 и 702 — дома, где ещё срабатывал
 *   гостевой код 7741 (★); прописка Пахомовой на 811.
 * - heat_readings: ряд ШХ-12-31 целиком (144 строки, каждые 20 минут
 *   06.12 00:00 – 07.12 23:40): −999 в 14:00 и 14:20, ниже +12 впервые в
 *   19:40, минимум +4,1 в 07.12 09:40, с 10:00 нагрев. Остальные пять
 *   квартир подъезда — шум (noise/city.ts).
 * - incidents 1735: первый вызов 07.12 11:04 — соцработница Самойлова.
 * - transactions ACC-30518: СФР 48 ×, УК «Шахтный» +25 000 (ложный лидер по
 *   AVG), аптека утром 06.12, после смерти — СБП −38 000 Олегу (06:41) и
 *   «Лапа» −340 (12:20). Фонд «Тёплый берег» 139 × 7 000 и возврат — core.
 * - intercom_events: код 7741 ×3 (811 «Вальц И.», 640, 702), ключ Олега
 *   07.12 06:30, соцработница 11:02 и её прежние визиты, ключ хозяйки.
 * - delivery_orders: смены курьера Пахомова О. В. 01–07.12; 07.12 — 05:52 →
 *   06:24 «Шахтная, 10», следующий заказ 07:05 (дыра в алиби).
 *
 * Исключения: шум не пишет по ACC-30518, по ряду ШХ-12-31, по домофону 811,
 * коду 7741 и именам дела, по курьеру 2589 и утру 07.12 до 07:30 в доставке.
 */

export const C02_FLAT = "ШХ-12-31";
export const C02_ADDRESS = { pakhomova: 811, code7741a: 640, code7741b: 702 } as const;
export const C02_ACCOUNT = F.ACCOUNT.pakhomova;
export const C02_GUEST_CODE = "7741";
export const OLEG_SHORT = "Пахомов О. В.";
export const SAMOYLOVA_SHORT = "Самойлова Т. Н.";

/** Ключевые моменты дела */
export const C02_FACTS = {
  sentinel: ["2026-12-06 14:00:00", "2026-12-06 14:20:00"],
  below12: "2026-12-06 19:40:00",
  minTemp: 4.1,
  minAt: "2026-12-07 09:40:00",
  death: "2026-12-06 23:00:00",
  sbp: { ts: "2026-12-07 06:41:00", amount: -38000 },
  lapa: { ts: "2026-12-07 12:20:00", amount: -340, merchant: "Зоомагазин «Лапа»" },
  ukRecalc: { ts: "2026-10-15 14:22:07", amount: 25000, counterparty: "УК «Шахтный»" },
  olegKey: "2026-12-07 06:30:00",
  samoylova: "2026-12-07 11:02:00",
  firstCall: "2026-12-07 11:04:00",
  valtsGuest: "2026-08-29 18:40:00",
  delivery: { accepted: "2026-12-07 05:52:00", delivered: "2026-12-07 06:24:00", drop: "Шахтная, 10", next: "2026-12-07 07:05:00" },
} as const;

/** Пенсия СФР по годам (индексация в январе) */
const PENSION: Record<number, number> = { 2023: 18200, 2024: 18950, 2025: 19380, 2026: 19800 };

const MIN20 = 20 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Ряд датчика ШХ-12-31: 144 точки, ограничения разд. 8.4 держатся явно */
export function heatSeries(jitter: () => number): { ts: string; temp: number }[] {
  const from = parseTs("2026-12-06 00:00:00");
  const outage = parseTs("2026-12-06 10:00:00");
  const below = parseTs(C02_FACTS.below12);
  const minAt = parseTs(C02_FACTS.minAt);
  const restored = parseTs("2026-12-07 10:00:00");
  const sentinels = new Set<number>(C02_FACTS.sentinel.map(parseTs));
  // Остывание к −2,5 °C: при τ = 18,52 ч ровно +11,8 через 9 ч 40 мин после отключения
  const T0 = 21.6;
  const TF = -2.5;
  const TAU = 18.52;
  const out: { ts: string; temp: number }[] = [];
  for (let k = 0; k < 144; k++) {
    const t = from + k * MIN20;
    let temp: number;
    if (sentinels.has(t)) temp = -999;
    else if (t < outage) temp = round1(T0 + jitter());
    else if (t < below) temp = Math.max(12.1, round1(TF + (T0 - TF) * Math.exp(-(t - outage) / HOUR / TAU) + jitter()));
    else if (t === below) temp = 11.8;
    else if (t < minAt) temp = Math.min(11.9, Math.max(4.2, round1(TF + (T0 - TF) * Math.exp(-(t - outage) / HOUR / TAU) + jitter())));
    else if (t === minAt) temp = C02_FACTS.minTemp;
    else if (t < restored) temp = 4.2;
    else temp = Math.min(21.4, Math.max(4.3, round1(4.4 + ((t - restored) / HOUR) * 1.7 + jitter())));
    out.push({ ts: fmtTs(t), temp });
  }
  return out;
}

function plantAddresses(ctx: WorldContext): void {
  const list = [
    { id: C02_ADDRESS.pakhomova, district: "Шахтный", street: "Шахтная", house: "12", apt: "31" },
    { id: C02_ADDRESS.code7741a, district: "Старый город", street: "Северная", house: "17", apt: "9" },
    { id: C02_ADDRESS.code7741b, district: "Гавань", street: "Корабельная", house: "6", apt: "23" },
  ];
  for (const a of list) {
    ctx.insert("addresses", a);
    ctx.reserve("address", `${a.street}|${a.house}|${a.apt}`, a.id);
  }
  // Прописка хозяйки; других жильцов в 12-31 нет — домофон 811 только посаженный
  ctx.insert("registrations", {
    person_id: F.PERSON.pakhomova, address_id: C02_ADDRESS.pakhomova, from_date: "1988-06-14", to_date: null,
  }, { orderAt: parseTs("1988-06-14 00:00:00") });
  ctx.exclude("registrations", (r) => Number(r.address_id) === C02_ADDRESS.pakhomova, "c02: в 12-31 прописана только Пахомова");
}

function plantHeat(ctx: WorldContext): void {
  const rng = ctx.rng("c02.heat");
  const series = heatSeries(() => rng.float(-0.12, 0.12));
  const below = series.filter((p) => p.temp > -999 && p.temp < 12);
  const min = Math.min(...series.filter((p) => p.temp > -999).map((p) => p.temp));
  if (below[0]?.ts !== C02_FACTS.below12) throw new WorldGenError(`c02: ниже +12 впервые ${below[0]?.ts}`);
  if (series.filter((p) => p.temp === min).length !== 1 || min !== C02_FACTS.minTemp) throw new WorldGenError(`c02: минимум ${min}`);
  for (const p of series) {
    ctx.insert("heat_readings", { flat_id: C02_FLAT, address_id: C02_ADDRESS.pakhomova, ts: p.ts, temp_c: p.temp }, { orderAt: parseTs(p.ts) });
  }
  ctx.exclude("heat_readings", (r) => r.flat_id === C02_FLAT, "c02: ряд ШХ-12-31 посажен целиком");
}

function plantIncident(ctx: WorldContext): void {
  ctx.insert("incidents", {
    id: 1735, kusp_no: 4801, reported_at: C02_FACTS.firstCall, kind: "сообщение гражданина", district: "Шахтный",
    address_text: "Шахтная, 12-31", description: "Обнаружена без признаков жизни Пахомова З. П., Шахтная, 12-31",
    vehicle_id: null, applicant_text: `${SAMOYLOVA_SHORT} (соцработник)`, officer_staff_id: 139, status: "проверка",
    x_m: null, y_m: null,
  }, { orderAt: parseTs(C02_FACTS.firstCall) });
  ctx.reserve("kusp:2026", "4801");
}

function plantMoney(ctx: WorldContext): void {
  const rng = ctx.rng("c02.money");
  const acc = C02_ACCOUNT;
  const add = (ts: string, amount: number, counterparty: string, channel: string, purpose: string) =>
    ctx.insert("transactions", {
      ts, account_id: acc, amount, counterparty, counterparty_account: null, channel, purpose,
    }, { orderAt: parseTs(ts) });
  // СФР: 48 пенсий 4-го числа, 2023-01 … 2026-12; контрагент назван одинаково
  let n = 0;
  for (let y = 2023; y <= 2026; y++) {
    for (let m = 0; m < 12; m++) {
      add(fmtTs(Date.UTC(y, m, 4, 9, rng.int(0, 59), rng.int(0, 59))), PENSION[y], "СФР", "перевод", "пенсия");
      n++;
    }
  }
  if (n !== 48) throw new WorldGenError(`c02: пенсий ${n}`);
  add(C02_FACTS.ukRecalc.ts, C02_FACTS.ukRecalc.amount, C02_FACTS.ukRecalc.counterparty, "перевод", "перерасчёт за отопление");
  // Утром 06.12 она ещё жива: доставка из аптеки
  add("2026-12-06 09:47:31", -1284, "Аптека «Северная»", "карта", "доставка: корвалол, валидол");
  // После смерти (около 23:00 06.12)
  add(C02_FACTS.sbp.ts, C02_FACTS.sbp.amount, OLEG_SHORT, "СБП", "перевод по номеру телефона");
  add(C02_FACTS.lapa.ts, C02_FACTS.lapa.amount, C02_FACTS.lapa.merchant, "карта", "корм для кошек");
  ctx.exclude("transactions", (r) => r.account_id === acc, "c02: по ACC-30518 только посадки (фонд — core)");
}

function plantIntercom(ctx: WorldContext): void {
  const rows: Row[] = [
    { ts: C02_FACTS.valtsGuest, address_id: C02_ADDRESS.pakhomova, method: "гостевой код", code: C02_GUEST_CODE, key_owner: null, guest_name: "Вальц И." },
    { ts: "2026-09-14 19:12:00", address_id: C02_ADDRESS.code7741a, method: "гостевой код", code: C02_GUEST_CODE, key_owner: null, guest_name: null },
    { ts: "2026-10-02 17:55:00", address_id: C02_ADDRESS.code7741b, method: "гостевой код", code: C02_GUEST_CODE, key_owner: null, guest_name: null },
    { ts: "2026-11-23 15:10:00", address_id: C02_ADDRESS.pakhomova, method: "ключ жильца", code: null, key_owner: OLEG_SHORT, guest_name: null },
    { ts: "2026-11-26 12:05:00", address_id: C02_ADDRESS.pakhomova, method: "ключ жильца", code: null, key_owner: "Пахомова З. П.", guest_name: null },
    { ts: "2026-11-30 10:40:00", address_id: C02_ADDRESS.pakhomova, method: "гостевой код", code: "2208", key_owner: null, guest_name: SAMOYLOVA_SHORT },
    { ts: "2026-12-02 11:20:00", address_id: C02_ADDRESS.pakhomova, method: "ключ жильца", code: null, key_owner: "Пахомова З. П.", guest_name: null },
    { ts: "2026-12-03 11:05:00", address_id: C02_ADDRESS.pakhomova, method: "гостевой код", code: "2208", key_owner: null, guest_name: SAMOYLOVA_SHORT },
    { ts: "2026-12-05 10:47:00", address_id: C02_ADDRESS.pakhomova, method: "ключ жильца", code: null, key_owner: "Пахомова З. П.", guest_name: null },
    { ts: C02_FACTS.olegKey, address_id: C02_ADDRESS.pakhomova, method: "ключ жильца", code: null, key_owner: OLEG_SHORT, guest_name: null },
    { ts: C02_FACTS.samoylova, address_id: C02_ADDRESS.pakhomova, method: "гостевой код", code: "2208", key_owner: null, guest_name: SAMOYLOVA_SHORT },
  ];
  for (const r of rows) ctx.insert("intercom_events", r, { orderAt: parseTs(String(r.ts)) });
  const names = new Set<unknown>([OLEG_SHORT, SAMOYLOVA_SHORT, "Пахомова З. П.", "Вальц И."]);
  ctx.exclude("intercom_events", (r) =>
    Number(r.address_id) === C02_ADDRESS.pakhomova || r.code === C02_GUEST_CODE || r.code === "2208" ||
    names.has(r.key_owner) || names.has(r.guest_name), "c02: домофон 811, код 7741 и люди дела — только посадки");
}

/** Смены Олега: [принят, доставлен, откуда, куда, сумма] */
const OLEG_ORDERS: readonly [string, string, string, string, number][] = [
  ["2026-12-01 09:12:40", "2026-12-01 09:48:05", "Продукты 24 (Мира, 5)", "Горняцкая, 7-12", 1240],
  ["2026-12-01 10:30:11", "2026-12-01 11:02:37", "Аптека «Северная»", "Забойная, 3-41", 860],
  ["2026-12-02 14:05:52", "2026-12-02 14:44:10", "Кафе «Маяк»", "Шахтная, 4-18", 1730],
  ["2026-12-03 08:40:03", "2026-12-03 09:15:48", "Продукты 24 (Мира, 5)", "Мира, 30-7", 2210],
  ["2026-12-04 16:22:30", "2026-12-04 17:03:14", "Хозмаркет «Наст»", "Горняцкая, 15", 3100],
  ["2026-12-05 11:51:09", "2026-12-05 12:30:44", "Ларёк «Шаурма у рынка»", "Угольная, 4", 690],
  ["2026-12-06 08:05:16", "2026-12-06 08:41:02", "Продукты 24 (Мира, 5)", "Забойная, 11-5", 1560],
  ["2026-12-06 12:44:27", "2026-12-06 13:31:50", "Аптека «Северная»", "Терриконная, 2", 940],
  ["2026-12-07 05:03:00", "2026-12-07 05:39:00", "Продукты 24 (Мира, 5)", "Горняцкая, 9-30", 1120],
  [C02_FACTS.delivery.accepted, C02_FACTS.delivery.delivered, "Продукты 24 (Мира, 5)", C02_FACTS.delivery.drop, 780],
  [C02_FACTS.delivery.next, "2026-12-07 07:38:00", "Продукты 24 (Мира, 5)", "Мира, 12-44", 2050],
  ["2026-12-07 07:51:00", "2026-12-07 08:26:00", "Аптека «Северная»", "Портовая, 6-3", 610],
  ["2026-12-07 09:14:00", "2026-12-07 09:52:00", "Кафе «Маяк»", "Полярная, 21", 1480],
  ["2026-12-07 10:40:00", "2026-12-07 11:15:00", "Продукты 24 (Мира, 5)", "Северная, 3-8", 990],
];

function plantDeliveries(ctx: WorldContext): void {
  for (const [accepted, delivered, pickup, drop, amount] of OLEG_ORDERS) {
    ctx.insert("delivery_orders", {
      courier_person_id: F.PERSON.oleg, courier_name: OLEG_SHORT, accepted_at: accepted, delivered_at: delivered,
      pickup_text: pickup, drop_text: drop, amount,
    }, { orderAt: parseTs(accepted) });
  }
  // Карточки допроса узнаются по минуте: 06:24 (доставлен) и 07:05 (принят) — только у Олега
  const minute = (v: unknown, m: string) => typeof v === "string" && v.startsWith(m);
  ctx.exclude("delivery_orders", (r) =>
    Number(r.courier_person_id) === F.PERSON.oleg || r.courier_name === OLEG_SHORT ||
    (typeof r.accepted_at === "string" && r.accepted_at < "2026-12-07 07:00:00" && r.accepted_at >= "2026-12-07 05:00:00") ||
    minute(r.accepted_at, "2026-12-07 07:05") || minute(r.delivered_at, "2026-12-07 06:24"),
    "c02: курьер Пахомов, утро 07.12 до 07:00 и минуты 06:24 / 07:05 — только посадки");
}

export function plant(ctx: WorldContext): void {
  plantAddresses(ctx);
  plantHeat(ctx);
  plantIncident(ctx);
  plantMoney(ctx);
  plantIntercom(ctx);
  plantDeliveries(ctx);
}
