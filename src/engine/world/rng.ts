/**
 * Детерминированный генератор случайных чисел (mulberry32).
 * Мир игры генерируется из фиксированного зерна: у всех игроков и во всех
 * тестах одни и те же строки, а ответы на задания стабильны.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Число в [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Целое в [min, max] включительно */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Вещественное в [min, max) */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Нормальное распределение (Бокс — Мюллер) */
  gauss(mean = 0, sd = 1): number {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick: пустой массив");
    return items[Math.floor(this.next() * items.length)];
  }

  /** Выбор с весами: weighted([["a", 3], ["b", 1]]) */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = this.next() * total;
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll < 0) return value;
    }
    return entries[entries.length - 1][0];
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /** k различных элементов */
  sample<T>(items: readonly T[], k: number): T[] {
    return this.shuffle(items).slice(0, k);
  }

  /** Независимый поток для подсистемы — изменения в одной не сдвигают другие */
  fork(label: string): Rng {
    let h = this.state ^ 0x9e3779b9;
    for (let i = 0; i < label.length; i++) {
      h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0;
    }
    return new Rng(h);
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/*
 * Время в мире — местное (UTC+3) и хранится строкой без пояса. Внутри
 * генератора оно живёт как «наивные» миллисекунды: Date в UTC, где часы UTC
 * равны местным. Так ни пояс машины, ни летнее время ничего не сдвигают.
 * Единственное место, где нужен настоящий UTC, — gs_comms_2015.ts_unix
 * (см. LOCAL_UTC_OFFSET_H).
 */

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
/** Местное время мира — UTC+3 */
export const LOCAL_UTC_OFFSET_H = 3;

/** 'YYYY-MM-DD HH:MM:SS' — единый формат дат-времени в мире (секунды пишутся всегда) */
export function formatDateTime(date: Date): string {
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}

/** 'YYYY-MM-DD' */
export function formatDate(date: Date): string {
  return formatDateTime(date).slice(0, 10);
}

const TS_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/** Разбор 'YYYY-MM-DD[ HH:MM[:SS]]' как наивного UTC; бросает RangeError на неверной строке */
export function parseDateTime(value: string): Date {
  return new Date(parseTs(value));
}

/** То же, что parseDateTime, но сразу в миллисекундах */
export function parseTs(value: string): number {
  const m = TS_RE.exec(value.trim());
  if (!m) throw new RangeError(`Неверная дата «${value}», ожидается 'YYYY-MM-DD HH:MM:SS'`);
  const [y, mo, d, h = "0", mi = "0", s = "0"] = m.slice(1);
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

/** ms → 'YYYY-MM-DD HH:MM:SS' */
export function fmtTs(ms: number): string {
  return formatDateTime(new Date(ms));
}

/** ms → 'YYYY-MM-DD' */
export function fmtDate(ms: number): string {
  return formatDateTime(new Date(ms)).slice(0, 10);
}

/** Приводит 'YYYY-MM-DD HH:MM' к 'YYYY-MM-DD HH:MM:SS' (секунды = 00) */
export function normalizeTs(value: string): string {
  return fmtTs(parseTs(value));
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE);
}

/** Полночь того же дня */
export function startOfDay(ms: number): number {
  return Math.floor(ms / DAY) * DAY;
}

/** День недели: 0 — воскресенье … 6 — суббота */
export function weekday(ms: number): number {
  return new Date(ms).getUTCDay();
}

export function isWeekend(ms: number): boolean {
  const d = weekday(ms);
  return d === 0 || d === 6;
}

/** Номер дня в году, 1…366 */
export function dayOfYear(ms: number): number {
  const d = new Date(ms);
  return Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY) + 1;
}

/** Час суток с дробью: 13:30 → 13.5 */
export function hourOfDay(ms: number): number {
  return (ms - startOfDay(ms)) / HOUR;
}

/** Местное время мира → unix-время UTC в секундах */
export function localToUnix(ms: number): number {
  return Math.round((ms - LOCAL_UTC_OFFSET_H * HOUR) / 1000);
}

/** Строка зерна → uint32 (FNV-1a). 'POLYNYA-S1' → одно и то же число везде */
export function hashSeed(seed: string | number): number {
  if (typeof seed === "number") return seed >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
