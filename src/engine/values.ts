/**
 * Сравнение значений ячеек — общее для валидатора, протокола, доски улик и
 * реестра увиденного (GAME_DESIGN, разд. 6.4).
 *
 * Базовая нормализация (normalizeCell): регистр не важен, ё = е, пробелы по
 * краям отбрасываются, '47' = 47, числа — с точностью до сотых.
 * Типы пропусков протокола расширяют её (valuesMatch):
 *  - person / text — точное совпадение после нормализации;
 *  - number — сравнение по модулю с допуском: '−38000' и '38000' равны;
 *  - datetime — обе стороны приводятся к ISO ('ДД.ММ.ГГГГ' тоже) и
 *    сравниваются по префиксу заданной точности.
 */
import type { BlankKind, DatetimePrecision } from "@/types/case";

const NUMERIC_TEXT = /^[-+]?\d+(?:\.\d+)?$/;
const NULL_MARK = "∅";
/** Типографский минус U+2212 → обычный дефис-минус */
const UNICODE_MINUS = /−/g;

function canonicalNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * Приводит ячейку к строке для сравнения: числа — с точностью до сотых
 * (и '47' == 47), строки — без регистра, пробелов по краям и различия е/ё.
 */
export function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return NULL_MARK;
  if (typeof value === "number") return canonicalNumber(value);
  if (value instanceof Uint8Array) return `blob:${value.length}`;
  const text = String(value).trim().replace(UNICODE_MINUS, "-");
  if (NUMERIC_TEXT.test(text)) return canonicalNumber(Number(text));
  return text.toLowerCase().replace(/ё/g, "е");
}

/** Число из ячейки: number или числовая строка ('−38000' тоже); иначе null */
export function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const text = value.trim().replace(UNICODE_MINUS, "-");
    if (NUMERIC_TEXT.test(text)) return Number(text);
  }
  return null;
}

/** Равенство ячеек: числа — с допуском (по умолчанию 0.01), остальное — через normalizeCell */
export function cellsEqual(a: unknown, b: unknown, tolerance = 0.01): boolean {
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== null && nb !== null) return Math.abs(na - nb) <= tolerance + 1e-9;
  return normalizeCell(a) === normalizeCell(b);
}

// --- Даты ---

/** Длина ISO-префикса для каждой точности: '2026-11-20' · '… 14' · '… 14:05' · '… 14:05:00' */
export const PRECISION_LENGTH: Record<DatetimePrecision, number> = {
  day: 10,
  hour: 13,
  minute: 16,
  second: 19,
};

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2})(?::(\d{2})(?::(\d{2})(?:\.\d+)?)?)?)?$/;
const DOTTED_RE = /^(\d{2})\.(\d{2})\.(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Дата или момент → ISO-строка той же точности: 'YYYY-MM-DD[ HH[:MM[:SS]]]'.
 * Понимает 'YYYY-MM-DD HH:MM:SS', 'YYYY-MM-DDTHH:MM' и 'ДД.ММ.ГГГГ[ ЧЧ:ММ[:СС]]'
 * (так хранится arch16_registry.reg_date). Не дата — null.
 */
export function toIsoDateTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  let parts: (string | undefined)[] | null = null;
  const iso = ISO_RE.exec(text);
  if (iso) parts = [iso[1], iso[2], iso[3], iso[4], iso[5], iso[6]];
  else {
    const dotted = DOTTED_RE.exec(text);
    if (dotted) parts = [dotted[3], dotted[2], dotted[1], dotted[4], dotted[5], dotted[6]];
  }
  if (!parts) return null;
  const [y, mo, d, h, mi, s] = parts;
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  let out = `${y}-${mo}-${d}`;
  if (h !== undefined) out += ` ${h}`;
  if (mi !== undefined) out += `:${mi}`;
  if (s !== undefined) out += `:${s}`;
  return out;
}

/** Точность, с которой записан ISO-момент; null — не дата */
export function precisionOf(value: unknown): DatetimePrecision | null {
  const iso = toIsoDateTime(value);
  if (!iso) return null;
  if (iso.length >= PRECISION_LENGTH.second) return "second";
  if (iso.length >= PRECISION_LENGTH.minute) return "minute";
  if (iso.length >= PRECISION_LENGTH.hour) return "hour";
  return "day";
}

// --- Типы пропусков ---

export interface MatchOptions {
  /** number: допуск по модулю (по умолчанию 0.01) */
  tolerance?: number;
  /** datetime: точность сравнения (по умолчанию — точность ожидаемого значения) */
  precision?: DatetimePrecision;
}

export const DEFAULT_NUMBER_TOLERANCE = 0.01;

/** number: |a| и |b| отличаются не больше чем на допуск; нечисловые значения не совпадают */
export function numbersMatch(expected: unknown, actual: unknown, tolerance = DEFAULT_NUMBER_TOLERANCE): boolean {
  const e = asNumber(expected);
  const a = asNumber(actual);
  if (e === null || a === null) return false;
  return Math.abs(Math.abs(e) - Math.abs(a)) <= Math.max(0, tolerance) + 1e-9;
}

/**
 * datetime: обе стороны приводятся к ISO и сравниваются по префиксу точности.
 * Сторона, записанная грубее точности, не совпадает: при точности minute
 * значение '2026-11-20' не равно '2026-11-20 14:05:00'.
 */
export function datetimesMatch(expected: unknown, actual: unknown, precision?: DatetimePrecision): boolean {
  const e = toIsoDateTime(expected);
  const a = toIsoDateTime(actual);
  if (e === null || a === null) return e === null && a === null && normalizeCell(expected) === normalizeCell(actual);
  const p = precision ?? precisionOf(e) ?? "second";
  const len = PRECISION_LENGTH[p];
  if (e.length < len || a.length < len) return false;
  return e.slice(0, len) === a.slice(0, len);
}

/**
 * Совпадает ли увиденное (или выбранное) значение с ожидаемым по правилам
 * типа пропуска. expected — значение из контента (вариант или ответ).
 */
export function valuesMatch(kind: BlankKind, expected: unknown, actual: unknown, options: MatchOptions = {}): boolean {
  switch (kind) {
    case "number":
      return numbersMatch(expected, actual, options.tolerance ?? DEFAULT_NUMBER_TOLERANCE);
    case "datetime":
      return datetimesMatch(expected, actual, options.precision);
    case "person":
    case "text":
    default:
      // Неизвестный тип (контент без kind) сравнивается как text
      return normalizeCell(expected) === normalizeCell(actual);
  }
}
