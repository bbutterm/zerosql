/**
 * Игровые часы. Время в мире хранится строкой 'YYYY-MM-DD HH:MM' — как в
 * таблицах SQLite, — без часовых поясов. Все вычисления в UTC, чтобы часовой
 * пояс и переход на летнее время у игрока ничего не сдвигали.
 */

const CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

const WEEKDAYS_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"] as const;
const MONTHS_GENITIVE_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** 'YYYY-MM-DD HH:MM' → Date (UTC) или null, если строка не в формате или даты не существует */
export function parseClock(value: string): Date | null {
  const m = CLOCK_RE.exec(value.trim());
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  if (hour > 23 || minute > 59) return null;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  // Date.UTC молча переносит 31 февраля в март — такую дату считаем неверной
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function requireClock(value: string): Date {
  const date = parseClock(value);
  if (!date) throw new RangeError(`Неверное игровое время «${value}», ожидается 'YYYY-MM-DD HH:MM'`);
  return date;
}

/** Date (UTC) → 'YYYY-MM-DD HH:MM' */
export function formatClock(date: Date): string {
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}

/** Сдвигает игровое время на minutes минут (можно назад); бросает RangeError на неверной строке */
export function advanceClock(value: string, minutes: number): string {
  const date = requireClock(value);
  const shift = Number.isFinite(minutes) ? Math.round(minutes) : 0;
  return formatClock(new Date(date.getTime() + shift * 60_000));
}

/** '2026-12-14 02:44' → «пн, 14 декабря · 02:44» */
export function formatClockRu(value: string): string {
  const date = requireClock(value);
  return (
    `${WEEKDAYS_RU[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS_GENITIVE_RU[date.getUTCMonth()]}` +
    ` · ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}
