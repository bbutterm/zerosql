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

/** 'YYYY-MM-DD HH:MM' — единый формат дат-времени в архиве */
export function formatDateTime(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** 'YYYY-MM-DD' */
export function formatDate(date: Date): string {
  return formatDateTime(date).slice(0, 10);
}

/** Разбор 'YYYY-MM-DD[ HH:MM]' как UTC */
export function parseDateTime(value: string): Date {
  const [d, t = "00:00"] = value.split(" ");
  return new Date(`${d}T${t}:00Z`);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
