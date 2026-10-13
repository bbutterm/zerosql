import type { WorldContext } from "../context";
import { parseTs } from "../rng";
import { LOGIN, PERSON, STAFF, STAFF_TYPOS } from "../facts";

/**
 * Посадка дела `case-04-mertvaya-dusha` — «Мёртвая душа» (разд. 5.4 и 8.4
 * библии, блок «Д4»).
 *
 * - staff 64 — Громов П. А. (persons 1550, логин `p.gromov`): умер 02.06.2019
 *   (ЗАГС А-2019-0402 сажает core), уволен только 15.01.2020 — бумажная
 *   волокита. Ложный след задачи 4.3: под его логином в аудите — 0 действий.
 * - staff 23 / 57 / 91 / 133 — опечатки импорта Тохи в person_id
 *   (14020, 27710, 30950, 33080 вместо 1402, 2771, 3095, 3308). Задача 4.1.
 * - logins: `p.gromov` (64, отключён), `test1` (сирота, 'test', 2025-02-10),
 *   логины четырёх «опечаток» (привязаны к своим staff — сиротами не считаются).
 *
 * Уже посажено (не дублируем): staff 118 Ирины и логины каста, `zero`
 * (core: created_at 2015-03-01, enabled 1, last_login_at — патч case.logins),
 * ЗАГС Ирины и Громова, все 7 сеансов призрака и включение `zero` 16.11
 * (core, хроника), ~600 легальных UPDATE Мельника с WS-IT-01 (noise/logs.ts).
 */

/** Ключевые ответы дела (тест и протокол сверяются с ними) */
export const C04_ANSWERS = {
  /** 4.1: сотрудники без карточки в persons */
  orphanStaff: [23, 57, 91, 133],
  /** 4.2: логины без сотрудника */
  orphanLogins: ["test1", "zero"],
  /** 4.4: действий после смерти к 11.12 10:00 */
  afterDeath: { "i.valts": 214, "p.gromov": 0 },
  /** 4.5: всё, кроме DELETE */
  nonDelete: 34,
  lastAction: "2026-12-09 02:30:00",
  /** Протокол */
  position: "аналитик ОЦР",
  login: "i.valts",
  oldReportedAt: "2026-11-18 23:52:00",
  newReportedAt: "2026-11-18 22:40:00",
} as const;

/** Громов: отставник на гражданской должности, умер раньше, чем его уволили */
export const GROMOV_STAFF = {
  id: STAFF.gromov,
  person_id: PERSON.gromov,
  full_name: "Громов П. А.",
  login: LOGIN.gromov,
  rank: null,
  position: "инспектор группы учёта",
  dept: "ОЦР",
  workstation: null,
  badge_id: `B-${PERSON.gromov}`,
  hired_at: "2011-09-01",
  fired_at: "2020-01-15",
  contract_no: null,
} as const;

/** Сотрудники с опечаткой в person_id: ФИО и логины настоящих людей */
export const TYPO_STAFF: readonly {
  id: number; typo: number; personId: number; name: string; login: string;
  rank: string | null; position: string; dept: string; ws: string | null; hired: string;
}[] = [
  { id: 23, typo: 14020, personId: 1402, name: "Корнилов Д. О.", login: "d.kornilov", rank: "капитан", position: "старший оперуполномоченный", dept: "ОУР", ws: "WS-09", hired: "2008-09-15" },
  { id: 57, typo: 27710, personId: 2771, name: "Савельева О. И.", login: "o.saveleva", rank: null, position: "специалист группы учёта", dept: "ОЦР", ws: "WS-12", hired: "2013-02-04" },
  { id: 91, typo: 30950, personId: 3095, name: "Фролов А. Д.", login: "a.frolov", rank: "лейтенант", position: "инспектор ДПС", dept: "ГИБДД", ws: null, hired: "2018-07-02" },
  { id: 133, typo: 33080, personId: 3308, name: "Белова М. С.", login: "m.belova", rank: "старший лейтенант", position: "оперативный дежурный", dept: "дежурная часть", ws: "ДЧ-02", hired: "2022-08-01" },
];

/** test1 — тестовая учётка Мельника, так и не удалённая */
export const TEST_LOGIN = {
  login: LOGIN.test,
  staff_id: null,
  role: "test",
  created_at: "2025-02-10 14:00:00",
  created_by: LOGIN.melnik,
  enabled: 0,
  last_login_at: "2025-02-10 14:05:00",
} as const;

export function plant(ctx: WorldContext): void {
  // --- staff
  ctx.insert("staff", { ...GROMOV_STAFF });
  ctx.reserve("badge", GROMOV_STAFF.badge_id);
  const typoByStaff = new Map(STAFF_TYPOS.map((t) => [t.staffId, t]));
  for (const s of TYPO_STAFF) {
    const t = typoByStaff.get(s.id);
    if (!t || t.typo !== s.typo || t.personId !== s.personId) {
      throw new Error(`c04: опечатка staff ${s.id} расходится с facts.STAFF_TYPOS`);
    }
    ctx.insert("staff", {
      id: s.id, person_id: s.typo, full_name: s.name, login: s.login, rank: s.rank, position: s.position,
      dept: s.dept, workstation: s.ws, badge_id: `B-${s.personId}`, hired_at: s.hired, fired_at: null, contract_no: null,
    });
    ctx.reserve("badge", `B-${s.personId}`);
  }
  // Карточки «опечаток» — живые люди, но в штат шума они второй раз не попадают
  const typoPersons = new Set(TYPO_STAFF.map((s) => s.personId));
  ctx.exclude("staff", (r) => typoPersons.has(Number(r.person_id)), "c04: опечатки импорта — уже в штате");

  // --- logins
  ctx.insert("logins", {
    login: LOGIN.gromov, staff_id: STAFF.gromov, role: "user", created_at: "2017-03-15 10:11:00",
    created_by: "system", enabled: 0, last_login_at: "2019-05-31 17:48:00",
  });
  ctx.insert("logins", { ...TEST_LOGIN });
  for (const s of TYPO_STAFF) {
    ctx.reserve("login", s.login);
    const created = parseTs(s.hired) < parseTs("2017-03-15") ? "2017-03-15 11:30:00" : `${s.hired} 12:00:00`;
    ctx.insert("logins", {
      login: s.login, staff_id: s.id, role: s.dept === "дежурная часть" ? "duty" : "user", created_at: created,
      created_by: parseTs(created) < parseTs("2017-03-16") ? "system" : LOGIN.melnik, enabled: 1,
      last_login_at: `2026-12-10 17:4${s.id % 10}:00`,
    });
  }

  guardServerRoomExits(ctx);
}

/**
 * Страховка СКУД. Посадка штата (id 23, 57, 64, 91, 133) сдвигает выборку
 * шума сотрудников, а с ней — поток ГСЧ `noise.door_access`. В шуме есть
 * редкий случай: визит ИТ-каста в серверную (старт до 16:30, до 70 минут)
 * заканчивается позже его выхода через КПП-Б0 в тот же день. Такой выход
 * через КПП внутри визита в серверную шум не пишет («забыл приложить
 * пропуск» — так в шуме уже бывает). Предикат идёт по строкам в порядке
 * генерации: для одного человека за день визиты в серверную приходят раньше
 * его выхода через КПП. Правильное место для правки — noise/money.ts
 * (занятое окно [tout, tout] в visits); после неё страховку можно снять.
 */
function guardServerRoomExits(ctx: WorldContext): void {
  const visits = new Map<string, { from: string; to?: string }[]>();
  ctx.exclude("door_access", (r) => {
    const badge = String(r.badge_id);
    const ts = String(r.ts);
    if (r.door === "Серверная") {
      const list = visits.get(badge) ?? [];
      if (r.direction === "вход") list.push({ from: ts });
      else if (list.length > 0 && list[list.length - 1].to === undefined) list[list.length - 1].to = ts;
      visits.set(badge, list);
      return false;
    }
    if (r.door !== "КПП-Б0" || r.direction !== "выход") return false;
    return (visits.get(badge) ?? []).some((v) => v.to !== undefined && v.from < ts && ts < v.to);
  }, "c04: выход через КПП-Б0 не попадает внутрь визита в серверную");
}
