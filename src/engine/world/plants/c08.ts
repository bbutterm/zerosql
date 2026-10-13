import type { Row, WorldContext } from "../context";
import { DAY, fmtDate, fmtTs, parseTs } from "../rng";
import * as F from "../facts";

/**
 * Посадка дела `case-08-prizrak` — «Призрак в системе» (разд. 5.8 и 8.4 библии).
 *
 * core уже посадил всё, на чём стоит призрак: семь сеансов i.valts с WS-07,
 * две чашки чабреца Лыкова за 15 минут до каждого сеанса, его входы на
 * КПП-Б0 (выход около 03:10; после 22.12 02:08 выхода нет), ночь агента
 * 21.12, чужую строку query_log 22.12 02:47:19, голосовое Ирины «из будущего»
 * и платёж «Щита» за займ Лыкова. Здесь — остальные люди в Б0 в ночи
 * сеансов (ложные следы задачи 8.3) и пятничные чаепития Ирины (допрос, .011):
 *
 * | Кто | Ночи сеансов | Проходы КПП-Б0 |
 * |---|---|---|
 * | Лыков, B-4210 | 7 из 7 | core |
 * | Нина, B-1210 | 1, 2, 3, 5, 6, 7 (27.11 на больничном) | вход 22:30 накануне, выход 06:30 |
 * | Ратников, B-1104 | 1–6 (22.12 в больнице) | вход около 19:00, выход 03:30–04:00 |
 * | Мельник, B-1412 | 1, 2, 3, 4, 7 (03.12 командировка, 09.12 больничный) | вход 01:00, выход 03:30 |
 *
 * Плюс выход Ратникова с КПП-Б0 21.12 16:31:12 (бригада СМП после допроса Д7).
 *
 * Больничный Нины 27.11 и отсутствие Мельника 03.12 и 09.12 шум уже
 * уважает (noise/money.ts). Время посадок задано таблицами, а не ГСЧ:
 * посаженные факты не зависят от зерна (разд. 8.3, «Новая смена»).
 * Служебный пропуск КПП-1 фиксирует только с 20:00 до 08:00 (разд. 8.2).
 */

const ts = parseTs;

const KPP_B0 = "КПП-Б0";
const KPP_1 = "КПП-1";
const ARCHIVE = "Архив";
const SERVER = "Серверная";
const KIPYATOK = "Кипяток (ГУ, холл)";
const THYME_TEA = "чай с чабрецом";

/** Даты сеансов призрака (утро после ночи): 19.11 … 22.12 */
const SESSION_DAYS = F.GHOST_SESSIONS.map((s) => s.start.slice(0, 10));

/** Вечер накануне сеанса n */
function eveBefore(n: number): string {
  return fmtDate(ts(SESSION_DAYS[n - 1]) - DAY);
}

// ------------------------------------------------------------------ ночи сеансов

/** Нина: ночная оцифровка архива — сеансы 1, 2, 3, 5, 6, 7 */
export const NINA_NIGHT_SESSIONS = [1, 2, 3, 5, 6, 7] as const;
/** Ратников засиживается в кабинете до утра — сеансы 1–6 (22.12 он в больнице) */
export const RATNIKOV_NIGHT_SESSIONS = [1, 2, 3, 4, 5, 6] as const;
/** Мельник: ночные регламентные работы — сеансы 1, 2, 3, 4, 7 */
export const MELNIK_NIGHT_SESSIONS = [1, 2, 3, 4, 7] as const;

/**
 * Ратников в дни перед сеансами: весь день посажен целиком (шум в эти дни
 * его не ведёт), вечером выходит поужинать и возвращается около 19:00,
 * уходит в 03:30–04:00. [пришёл, вышел, вернулся, ушёл ночью (время на
 * следующий день)].
 */
const RATNIKOV_DAYS: Readonly<Record<number, readonly [string, string, string, string]>> = {
  1: ["08:47:12", "18:14:40", "18:58:31", "03:41:05"],
  2: ["09:05:44", "18:21:09", "19:03:17", "03:34:50"],
  3: ["08:52:30", "18:09:55", "18:56:02", "03:52:18"],
  4: ["08:44:08", "18:17:21", "19:01:44", "03:37:29"],
  5: ["08:58:51", "18:12:36", "19:06:10", "03:46:42"],
  6: ["08:49:27", "18:19:03", "18:59:48", "03:31:57"],
};

/** Ратникова выносят из кабинета после допроса Д7 (core молчит о нём после 21.12 16:00) */
export const RATNIKOV_AMBULANCE = "2026-12-21 16:31:12";

/** Секунды КПП-1 и архива у Нины и Мельника (чтобы строки не выглядели штампованными) */
const NINA_SIDE: Readonly<Record<number, readonly [string, string, string, string]>> = {
  // [КПП-1 вход, Архив вход, Архив выход, КПП-1 выход]
  1: ["22:27:41", "22:31:52", "06:27:14", "06:32:38"],
  2: ["22:28:06", "22:31:20", "06:28:02", "06:32:11"],
  3: ["22:27:19", "22:32:07", "06:26:45", "06:33:02"],
  5: ["22:26:58", "22:31:44", "06:27:51", "06:32:27"],
  6: ["22:27:33", "22:31:09", "06:28:20", "06:32:49"],
  7: ["22:28:12", "22:32:31", "06:27:03", "06:31:58"],
};

const MELNIK_SIDE: Readonly<Record<number, readonly [string, string]>> = {
  // [КПП-1 вход, КПП-1 выход]
  1: ["00:57:22", "03:32:41"],
  2: ["00:57:48", "03:32:09"],
  3: ["00:56:51", "03:33:15"],
  4: ["00:57:30", "03:32:36"],
  7: ["00:57:04", "03:32:52"],
};

// ------------------------------------------------------------------ пятницы Ирины

/**
 * Ирина по пятницам с 04.09 по 13.11: две чашки чабреца в «Кипятке» около
 * 21:30, через минуту — вход в серверную (к Тохе). [пришла утром, покупка,
 * вход в серверную, выход из серверной, выход с КПП-Б0].
 */
export const IRINA_FRIDAYS: readonly (readonly [string, string, string, string, string, string])[] = [
  ["2026-09-04", "09:12:37", "21:28:14", "21:29:31", "21:52:07", "22:41:36"],
  ["2026-09-11", "09:20:05", "21:31:40", "21:32:58", "21:49:12", "22:58:03"],
  ["2026-09-18", "09:08:51", "21:29:02", "21:30:15", "21:57:40", "22:47:29"],
  ["2026-09-25", "09:15:26", "21:30:47", "21:31:59", "21:51:33", "23:04:12"],
  ["2026-10-02", "09:11:48", "21:27:39", "21:28:52", "21:46:18", "22:39:50"],
  ["2026-10-09", "09:24:10", "21:32:11", "21:33:26", "21:55:04", "22:52:45"],
  ["2026-10-16", "09:06:33", "21:29:55", "21:31:08", "21:48:27", "22:44:17"],
  ["2026-10-23", "09:18:42", "21:31:03", "21:32:20", "21:53:49", "23:01:38"],
  ["2026-10-30", "09:13:19", "21:28:36", "21:29:50", "21:50:11", "22:49:06"],
  ["2026-11-06", "09:09:57", "21:30:18", "21:31:34", "21:47:55", "22:55:21"],
  ["2026-11-13", "09:16:24", "21:30:22", "21:31:37", "21:44:51", "22:36:18"],
];

// ------------------------------------------------------------------ посадка

export function plant(ctx: WorldContext): void {
  plantNina(ctx);
  plantRatnikov(ctx);
  plantMelnik(ctx);
  plantIrinaFridays(ctx);
}

function door(ctx: WorldContext, at: string, badge: string, doorName: string, direction: "вход" | "выход"): void {
  ctx.insert("door_access", { ts: at, badge_id: badge, door: doorName, direction, note: null }, { orderAt: ts(at) });
}

const onDates = (badge: string, dates: ReadonlySet<string>) => (r: Row) =>
  r.badge_id === badge && dates.has(String(r.ts).slice(0, 10));

function plantNina(ctx: WorldContext): void {
  const badge = F.BADGE.nina;
  const morningsOff = new Set<string>();
  for (const n of NINA_NIGHT_SESSIONS) {
    const eve = eveBefore(n);
    const morning = SESSION_DAYS[n - 1];
    const [kppIn, archIn, archOut, kppOut] = NINA_SIDE[n];
    door(ctx, `${eve} ${kppIn}`, badge, KPP_1, "вход");
    door(ctx, `${eve} 22:30:00`, badge, KPP_B0, "вход");
    door(ctx, `${eve} ${archIn}`, badge, ARCHIVE, "вход");
    door(ctx, `${morning} ${archOut}`, badge, ARCHIVE, "выход");
    door(ctx, `${morning} 06:30:00`, badge, KPP_B0, "выход");
    door(ctx, `${morning} ${kppOut}`, badge, KPP_1, "выход");
    morningsOff.add(morning);
  }
  // После ночной смены Нина отсыпается: дневных проходов в эти дни нет
  ctx.exclude("door_access", onDates(badge, morningsOff), "Нина после ночной оцифровки — дома (Д8)");
}

function plantRatnikov(ctx: WorldContext): void {
  const badge = F.BADGE.ratnikov;
  const planted = new Set<string>();
  for (const n of RATNIKOV_NIGHT_SESSIONS) {
    const eve = eveBefore(n);
    const morning = SESSION_DAYS[n - 1];
    const [came, out, back, left] = RATNIKOV_DAYS[n];
    door(ctx, `${eve} ${came}`, badge, KPP_B0, "вход");
    door(ctx, `${eve} ${out}`, badge, KPP_B0, "выход");
    door(ctx, `${eve} ${back}`, badge, KPP_B0, "вход");
    door(ctx, `${morning} ${left}`, badge, KPP_B0, "выход");
    // Ночное окно КПП-1 (20:00–08:00) ловит служебный пропуск на выходе
    door(ctx, `${morning} ${shiftSeconds(left, 137)}`, badge, KPP_1, "выход");
    planted.add(eve);
  }
  // День накануне сеанса посажен целиком: шум не должен дать ему «вечерний выход» в 19:20
  ctx.exclude("door_access", onDates(badge, planted), "Ратников в дни перед сеансами — посадка Д8");
  // 21.12 его выносит бригада СМП (Д7): вход утром закрыт выходом, иначе
  // «открытый» интервал до часов игры даёт ему седьмой сеанс (22.12 02:20)
  ctx.insert("door_access", { ts: RATNIKOV_AMBULANCE, badge_id: badge, door: KPP_B0, direction: "выход", note: "СМП" }, { orderAt: ts(RATNIKOV_AMBULANCE) });
}

function plantMelnik(ctx: WorldContext): void {
  const badge = F.BADGE.melnik;
  for (const n of MELNIK_NIGHT_SESSIONS) {
    const night = SESSION_DAYS[n - 1];
    const [kppIn, kppOut] = MELNIK_SIDE[n];
    door(ctx, `${night} ${kppIn}`, badge, KPP_1, "вход");
    door(ctx, `${night} 01:00:00`, badge, KPP_B0, "вход");
    door(ctx, `${night} 03:30:00`, badge, KPP_B0, "выход");
    door(ctx, `${night} ${kppOut}`, badge, KPP_1, "выход");
  }
}

function plantIrinaFridays(ctx: WorldContext): void {
  const badge = F.BADGE.irina;
  const fridays = new Set<string>();
  for (const [day, came, bought, serverIn, serverOut, left] of IRINA_FRIDAYS) {
    door(ctx, `${day} ${came}`, badge, KPP_B0, "вход");
    ctx.insert("purchases", {
      ts: `${day} ${bought}`, merchant: KIPYATOK, payer_person_id: F.PERSON.irina, payer_name: "Вальц И. П.",
      item: THYME_TEA, qty: 2, amount: 70,
    }, { orderAt: ts(`${day} ${bought}`) });
    door(ctx, `${day} ${serverIn}`, badge, SERVER, "вход");
    door(ctx, `${day} ${serverOut}`, badge, SERVER, "выход");
    door(ctx, `${day} ${left}`, badge, KPP_B0, "выход");
    door(ctx, `${day} ${shiftSeconds(left, 124)}`, badge, KPP_1, "выход");
    fridays.add(day);
  }
  // Пятница Ирины посажена целиком: шум не уводит её домой в шесть вечера
  ctx.exclude("door_access", onDates(badge, fridays), "пятницы Ирины — посадка Д8");
}

/** 'HH:MM:SS' + n секунд (в пределах суток) */
function shiftSeconds(hms: string, seconds: number): string {
  return fmtTs(ts(`2000-01-01 ${hms}`) + seconds * 1000).slice(11);
}
