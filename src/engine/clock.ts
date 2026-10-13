/**
 * Игровые часы. Время в мире хранится строкой 'YYYY-MM-DD HH:MM:SS' — как в
 * таблицах SQLite (TECH_SPEC, разд. 3), — без часовых поясов. Строки без
 * секунд ('YYYY-MM-DD HH:MM', так можно писать CaseDef.date) тоже понимаются:
 * секунды равны 00. Все вычисления в UTC, чтобы часовой пояс и переход на
 * летнее время у игрока ничего не сдвигали.
 */

const CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/;

const WEEKDAYS_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"] as const;
const MONTHS_GENITIVE_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** 'YYYY-MM-DD HH:MM[:SS]' → Date (UTC) или null, если строка не в формате или даты не существует */
export function parseClock(value: string): Date | null {
  const m = CLOCK_RE.exec(value.trim());
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1, 6).map(Number);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  // Date.UTC молча переносит 31 февраля в март — такую дату считаем неверной
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function requireClock(value: string): Date {
  const date = parseClock(value);
  if (!date) throw new RangeError(`Неверное игровое время «${value}», ожидается 'YYYY-MM-DD HH:MM:SS'`);
  return date;
}

/** Date (UTC) → 'YYYY-MM-DD HH:MM' или, с withSeconds, 'YYYY-MM-DD HH:MM:SS' */
export function formatClock(date: Date, withSeconds = false): string {
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}` +
    (withSeconds ? `:${pad(date.getUTCSeconds())}` : "")
  );
}

/** Строка часов записана с секундами */
function hasSeconds(value: string): boolean {
  return CLOCK_RE.exec(value.trim())?.[6] !== undefined;
}

/**
 * Сдвигает игровое время на minutes минут (можно назад); бросает RangeError на
 * неверной строке. Точность сохраняется: строка с секундами — ответ с секундами.
 */
export function advanceClock(value: string, minutes: number): string {
  const date = requireClock(value);
  const shift = Number.isFinite(minutes) ? Math.round(minutes) : 0;
  return formatClock(new Date(date.getTime() + shift * 60_000), hasSeconds(value));
}

/** Игровое время в формате game_now(): 'YYYY-MM-DD HH:MM:SS' (секунды по умолчанию 00) */
export function toGameTime(value: string): string {
  return formatClock(requireClock(value), true);
}

/** Сравнение моментов: < 0, 0, > 0; бросает RangeError на неверной строке */
export function compareClock(a: string, b: string): number {
  return requireClock(a).getTime() - requireClock(b).getTime();
}

/** '2026-12-14 02:44' → «пн, 14 декабря · 02:44» */
export function formatClockRu(value: string): string {
  const date = requireClock(value);
  return (
    `${WEEKDAYS_RU[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS_GENITIVE_RU[date.getUTCMonth()]}` +
    ` · ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}
