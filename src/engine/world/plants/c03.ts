import type { Row, WorldContext } from "../context";
import { parseTs } from "../rng";
import * as F from "../facts";

/**
 * Посадка дела `case-03-polyarnaya` — «Наезд на Полярной» (разд. 5.3, 8.4 «Д3»).
 *
 * core уже посадил: incidents 1612 (КУСП 4515, наезд) и 1615 (КУСП 4518, «угон»,
 * reported_at правлен на 22:40), incident_persons 1205 и 1209, маршрут К404ТО,
 * morgue_records 311, companies 17 и vehicles 404. Здесь — остальные КУСП ночи
 * (якоря 1611, 1613, 1614, 1616 и сгоревшая «Тайга» 1631), три ложных следа на
 * камере 7 и исключения шума: окно 18.11 22:00 – 19.11 01:00 в incidents
 * (задача 3.4 — ровно 6 строк), камера 7 в 23:00–23:15 (ровно 4 проезда) и
 * посторонние участники у наезда и угона в incident_persons.
 */

/** Окно задачи 3.4: «Других строк incidents с 18.11 22:00:00 по 19.11 01:00:00 нет» */
export const C03_NIGHT = { from: "2026-11-18 22:00:00", to: "2026-11-19 01:00:00" } as const;

/** Окно ложных следов на камере 7 «Полярная / Мира» */
export const C03_CAM7_WINDOW = { from: "2026-11-18 23:00:00", to: "2026-11-18 23:15:59" } as const;

const DUTY_A = 131;
const DUTY_B = 139;

export interface C03Incident {
  id: number;
  kusp: number;
  at: string;
  kind: string;
  district: string;
  address: string;
  description: string;
  applicant: string;
  vehicleId?: number;
  officer: number | null;
}

/** Остальные КУСП ночи наезда — подряд, якорями (id и номер по моменту регистрации) */
export const C03_INCIDENTS: readonly C03Incident[] = [
  {
    id: 1611, kusp: 4514, at: "2026-11-18 22:55:00", kind: "сообщение гражданина", district: "Старый город",
    address: "Мира, 9", description: "Во дворе полчаса воет автосигнализация, владелец не выходит",
    applicant: "Гречко Л. П.", officer: DUTY_A,
  },
  {
    id: 1613, kusp: 4516, at: "2026-11-18 23:25:00", kind: "сообщение гражданина", district: "Гавань",
    address: "Портовая, 2 (бар «Якорь»)", description: "Драка у бара «Якорь», двое, у одного рассечена бровь",
    applicant: "бармен Ковтун Р. А.", officer: DUTY_A,
  },
  {
    id: 1614, kusp: 4517, at: "2026-11-18 23:40:00", kind: "заявление", district: "Шахтный",
    address: "Шахтная, 6", description: "Соседи сверху залили кухню, дверь не открывают",
    applicant: "Мусина Г. Ф.", officer: DUTY_B,
  },
  {
    id: 1616, kusp: 4519, at: "2026-11-19 00:05:00", kind: "сообщение гражданина", district: "Старый город",
    address: "Мира, 30 (остановка «Музыкальная школа»)", description: "На остановке спит мужчина без шапки, мороз −29",
    applicant: "водитель автобуса маршрута 3", officer: DUTY_B,
  },
  {
    id: 1631, kusp: 4549, at: "2026-11-20 10:40:00", kind: "рапорт", district: "Промзона",
    address: "Объездная, 7-й км", description: "Обнаружена сгоревшая «Тайга» К404ТО (в угоне по КУСП 4518). Кузов выгорел полностью",
    applicant: "инспектор ДПС Ковалёв Т. В.", vehicleId: F.VEHICLE_ID.taiga, officer: 30,
  },
];

/** Ложные следы на камере 7 с 23:00 до 23:15: такси, «Сайгак» доставки, «Вега» скорой */
export const C03_DECOYS = {
  taxi: { plate: "М412КС", at: "2026-11-18 23:02:00", direction: "из центра" },
  /** «Сайгак Next» ПАО «Сияние» — машина c01 (id 615); если c01 её не посадил, сажаем здесь */
  delivery: { plate: "В615КР", at: "2026-11-18 23:11:00", direction: "в центр" },
  ambulance: { plate: "Х286ВС", at: "2026-11-18 23:14:00", direction: "из центра" },
} as const;

/** Владелец такси М412КС — строка реестра машин (owner_name), не житель */
export const C03_TAXI_OWNER = "Арсланов Тимур Рустамович";

const VEHICLES: Row[] = [
  {
    id: 412, plate: C03_DECOYS.taxi.plate, make: "Нордика", model: "Седан", color: "чёрный", year: 2019,
    owner_person_id: null, owner_company_id: null, owner_name: C03_TAXI_OWNER,
    registered_at: "2019-08-21", sold_at: null, deregistered_at: null,
  },
  {
    id: 286, plate: C03_DECOYS.ambulance.plate, make: "Вега", model: "Универсал", color: "тёмно-синий", year: 2018,
    owner_person_id: null, owner_company_id: F.COMPANY.medsanchast, owner_name: F.COMPANY_NAME[F.COMPANY.medsanchast],
    registered_at: "2018-12-04", sold_at: null, deregistered_at: null,
  },
];

/** Та же строка, что сажает c01 (C01.plates.deliveryVan) — только если её ещё нет */
const DELIVERY_VAN: Row = {
  id: 615, plate: C03_DECOYS.delivery.plate, make: "Сайгак Next", model: "фургон", color: "белый", year: 2022,
  owner_person_id: null, owner_company_id: F.COMPANY.siyanie, owner_name: F.COMPANY_NAME[F.COMPANY.siyanie],
  registered_at: "2022-08-09", sold_at: null, deregistered_at: null,
};

const within = (v: unknown, from: string, to: string) => typeof v === "string" && v >= from && v <= to;

export function plant(ctx: WorldContext): void {
  // КУСП ночи: якоря с явным id и моментом — шум встанет до и после по порядку
  for (const i of C03_INCIDENTS) {
    ctx.insert("incidents", {
      id: i.id, kusp_no: i.kusp, reported_at: i.at, kind: i.kind, district: i.district, address_text: i.address,
      description: i.description, vehicle_id: i.vehicleId ?? null, applicant_text: i.applicant,
      officer_staff_id: i.officer, status: i.id === 1631 ? "приобщено к КУСП 4518" : "проверка", x_m: null, y_m: null,
    }, { orderAt: parseTs(i.at) });
    ctx.reserve("kusp:2026", String(i.kusp));
  }
  ctx.exclude("incidents", (r) => within(r.reported_at, C03_NIGHT.from, C03_NIGHT.to), "c03: ночь наезда — только посаженные КУСП");

  // У наезда и «угона» — только посаженные участники (1205 и 1209)
  ctx.exclude(
    "incident_persons",
    (r) => r.incident_id === F.INCIDENT.hitAndRun || r.incident_id === F.INCIDENT.theftClaim,
    "c03: участники наезда и угона — только посадки"
  );

  // Ложные следы на камере 7
  for (const v of VEHICLES) {
    ctx.insert("vehicles", v);
    ctx.reserve("plate", String(v.plate));
  }
  if (!ctx.isReserved("plate", DELIVERY_VAN.plate as string)) {
    ctx.insert("vehicles", DELIVERY_VAN);
    ctx.reserve("plate", DELIVERY_VAN.plate as string);
  }
  const confidence: Record<string, number> = { taxi: 0.93, delivery: 0.91, ambulance: 0.88 };
  for (const [key, d] of Object.entries(C03_DECOYS)) {
    ctx.insert(
      "plate_reads",
      { camera_id: F.CAMERA.polyarnayaMira, plate: d.plate, read_at: d.at, confidence: confidence[key], direction: d.direction },
      { orderAt: parseTs(d.at) }
    );
  }
  ctx.exclude(
    "plate_reads",
    (r) => r.camera_id === F.CAMERA.polyarnayaMira && within(r.read_at, C03_CAM7_WINDOW.from, C03_CAM7_WINDOW.to),
    "c03: камера 7 в 23:00–23:15 — только «Тайга» и три ложных следа"
  );
}
