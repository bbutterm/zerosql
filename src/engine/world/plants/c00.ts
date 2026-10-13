import type { Row, WorldContext } from "../context";
import { parseTs } from "../rng";
import { STAFF } from "../facts";

/**
 * Посадка дела `case-00-nulevoy-etazh` — Пролог «Нулевой этаж» (разд. 5.0
 * и 8.4 библии, блок «П»).
 *
 * - incidents 1701–1714: вечер 02.12.2026, всплеск вызовов (−34 °C и
 *   пропавший ребёнок). Якоря с явными id и КУСП: шум встаёт до и после них
 *   по порядку времени. С 16:00:00 до 18:35:00 шум вызовов не создаёт, поэтому
 *   ответ P.3 (14 строк) не зависит от игровых часов (18:05 … потолок 18:35).
 * - transit_taps: школьная карта Лаптева М. А., 16:41:00, маршрут 3,
 *   остановка «Музыкальная школа» (★ «Карта школьника»).
 *
 * Чего здесь нет (уже посажено): incidents 1–40 и строка 7 (core), staff 118
 * Ирины (core), staff 151 игрока (патч p0.player), Лаптевы 3611 / 3612 в
 * persons (core). incidents 1683 / 1690 / 1697 — посадка c01.
 */

/** Окно вечера 02.12, в котором вызовы есть только у посадки (P.3, P.4, потолок часов 18:35) */
export const C00_QUIET_WINDOW = { from: "2026-12-02 16:00:00", to: "2026-12-02 18:35:00" } as const;

export interface EveningIncident {
  id: number;
  kusp: number;
  at: string;
  district: string;
  kind: string;
  address: string;
  description: string;
  applicant: string;
  /** staff.id, кто принял вызов: 150 — Ким Д. С. (патруль Даши) */
  officer: number;
  status: string;
}

/** Ким Д. С. — в прологе она в патрульной машине с бодикамерой */
const DASHA = STAFF.dasha;
/** Действующие офицеры шума, которых резервирует core (OFFICERS_2026) */
const DUTY_A = 131;
const DUTY_B = 139;

/**
 * Все 14 вызовов вечера 02.12 (P.3). КУСП — годовой номер ГУ: в incidents
 * попадает примерно каждое второе сообщение, в вечер всплеска — гуще.
 * Номера идут после 4717 (1697, c01) с запасом на три строки шума утра.
 */
export const EVENING_INCIDENTS: readonly EveningIncident[] = [
  {
    id: 1701, kusp: 4722, at: "2026-12-02 16:12:00", district: "Старый город", kind: "ДТП",
    address: "Портовая, 9", description: "Наезд на столб у Портовой, 9, без пострадавших",
    applicant: "Гусев П. Р.", officer: DUTY_A, status: "зарегистрировано",
  },
  {
    id: 1702, kusp: 4725, at: "2026-12-02 17:05:00", district: "Старый город", kind: "заявление",
    address: "Северная, 8",
    description: "Не вернулся из музыкальной школы сын, Миша, 8 лет: синий пуховик, рюкзак-кот. Из школы вышел в 16:00",
    applicant: "Лаптева Е. В.", officer: DASHA, status: "проверка",
  },
  {
    id: 1703, kusp: 4727, at: "2026-12-02 17:09:00", district: "Гавань", kind: "кража",
    address: "Причальная, 6", description: "Из контейнера на площадке пропали шины",
    applicant: "Мартынов О. И.", officer: DUTY_B, status: "зарегистрировано",
  },
  {
    id: 1704, kusp: 4729, at: "2026-12-02 17:14:00", district: "Шахтный", kind: "рапорт",
    address: "Горняцкая, 15", description: "Аварийный выезд на перемёрзшую теплотрассу",
    applicant: "дежурный", officer: DUTY_A, status: "зарегистрировано",
  },
  {
    id: 1705, kusp: 4731, at: "2026-12-02 17:20:00", district: "Шахтный", kind: "сообщение гражданина",
    address: "Угольная, 4 (гаражи)", description: "Подросток на крыше гаражей, лет пятнадцать, не слезает",
    applicant: "Карпова Н. С.", officer: DUTY_B, status: "проверка",
  },
  {
    id: 1706, kusp: 4733, at: "2026-12-02 17:24:00", district: "Промзона", kind: "рапорт",
    address: "Складская, 7", description: "Ложное срабатывание сигнализации склада",
    applicant: "дежурный", officer: DUTY_A, status: "зарегистрировано",
  },
  {
    id: 1707, kusp: 4734, at: "2026-12-02 17:26:00", district: "Старый город", kind: "сообщение гражданина",
    address: "Мира, 21", description: "Громкая музыка во дворе",
    applicant: "Блинов А. А.", officer: DUTY_B, status: "зарегистрировано",
  },
  {
    id: 1708, kusp: 4736, at: "2026-12-02 17:29:00", district: "Гавань", kind: "ДТП",
    address: "Порт, проходная", description: "Столкновение двух автомобилей у проходной порта",
    applicant: "Хабибуллин Р. Р.", officer: DUTY_A, status: "зарегистрировано",
  },
  {
    id: 1709, kusp: 4737, at: "2026-12-02 17:31:00", district: "Старый город", kind: "сообщение гражданина",
    address: "Рынок, конечная маршрута № 3",
    description: "Водитель автобуса № 3: мальчик ехал один, вышел у остановки «ДК «Полярник»»",
    applicant: "Ершов Г. В. (водитель)", officer: DASHA, status: "проверка",
  },
  {
    id: 1710, kusp: 4740, at: "2026-12-02 17:38:00", district: "Промзона", kind: "угон",
    address: "Энергетиков, 31", description: "Угон снегохода со стоянки",
    applicant: "Мухин Д. С.", officer: DUTY_B, status: "зарегистрировано",
  },
  {
    id: 1711, kusp: 4742, at: "2026-12-02 17:44:00", district: "Створ", kind: "сообщение гражданина",
    address: "Мостки у полыньи (Береговая)", description: "Мальчик у полыньи с удочкой, на вид лет четырнадцать",
    applicant: "Лебедев С. К.", officer: DUTY_A, status: "проверка",
  },
  {
    id: 1712, kusp: 4744, at: "2026-12-02 17:50:00", district: "Шахтный", kind: "сообщение гражданина",
    address: "Забойная, 9", description: "В подъезде пахнет газом",
    applicant: "Зуева Т. М.", officer: DUTY_B, status: "зарегистрировано",
  },
  {
    id: 1713, kusp: 4746, at: "2026-12-02 17:57:00", district: "Старый город", kind: "кража",
    address: "Рыбацкая, 2", description: "Кража в магазине у рынка",
    applicant: "Федотова Л. Г.", officer: DUTY_A, status: "зарегистрировано",
  },
  {
    id: 1714, kusp: 4748, at: "2026-12-02 18:02:00", district: "Старый город", kind: "сообщение гражданина",
    address: "ДК «Полярник»", description: "Ребёнок в синем пуховике плачет на крыльце",
    applicant: "Аксёнова В. П. (вахтёр)", officer: DASHA, status: "зарегистрировано",
  },
];

/** «Сообщений гражданина» — 6, свежие сверху (P.4) */
export const CITIZEN_REPORTS_DESC = [1714, 1712, 1711, 1709, 1707, 1705] as const;

/** Школьная карта мальчика (★ «Карта школьника») */
export const SCHOOL_CARD = {
  ts: "2026-12-02 16:41:00",
  cardNo: "Ш-00417",
  kind: "школьная",
  holder: "Лаптев М. А.",
  route: "3",
  stop: "Музыкальная школа",
} as const;

/** Ответы протокола пролога */
export const C00_ANSWERS = {
  place: "ДК «Полярник»",
  time: "2026-12-02 18:02:00",
} as const;

function inQuietWindow(row: Row): boolean {
  const t = row.reported_at;
  return typeof t === "string" && t >= C00_QUIET_WINDOW.from && t <= C00_QUIET_WINDOW.to;
}

export function plant(ctx: WorldContext): void {
  // --- incidents 1701–1714: якоря id и КУСП по моменту регистрации
  for (const i of EVENING_INCIDENTS) {
    ctx.insert("incidents", {
      id: i.id, kusp_no: i.kusp, reported_at: i.at, kind: i.kind, district: i.district, address_text: i.address,
      description: i.description, vehicle_id: null, applicant_text: i.applicant, officer_staff_id: i.officer,
      status: i.status, x_m: null, y_m: null,
    }, { orderAt: parseTs(i.at) });
    ctx.reserve("kusp:2026", String(i.kusp));
  }
  // Вечер 02.12 после 16:00 — только посаженные вызовы: P.3 ровно 14 строк, после 18:02 тишина до потолка часов
  ctx.exclude("incidents", inQuietWindow, "c00: вечер 02.12 16:00–18:35 — только вызовы 1701–1714");

  // --- transit_taps: карта Миши — единственная строка с его именем и номером карты
  ctx.insert("transit_taps", {
    ts: SCHOOL_CARD.ts, card_no: SCHOOL_CARD.cardNo, card_kind: SCHOOL_CARD.kind, holder_text: SCHOOL_CARD.holder,
    route: SCHOOL_CARD.route, stop: SCHOOL_CARD.stop,
  }, { orderAt: parseTs(SCHOOL_CARD.ts) });
  ctx.reserve("card_no", SCHOOL_CARD.cardNo);
  ctx.exclude("transit_taps", (r) => r.holder_text === SCHOOL_CARD.holder, "c00: Лаптев М. А. — только посаженная карта");
}
