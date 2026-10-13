/**
 * WorldContext — общее состояние генерации мира.
 *
 * - rng(label): независимый поток ГСЧ на подсистему. Изменение одной посадки
 *   или одного генератора шума не сдвигает остальные.
 * - insert(table, row): вставка через подготовленные выражения (кеш по набору
 *   столбцов) внутри одной транзакции, которую открывает generate.ts.
 * - Аллокаторы id по таблицам: явные id посадок резервируются, шум их обходит.
 * - reserve(kind, value): уникальные ключи посадок (номер машины, телефон,
 *   логин…), которые шум не должен повторить.
 * - exclude(table, predicate): строки шума, которые нельзя создавать (окна
 *   «ровно N строк», «только он был у камеры»).
 * - Упорядоченные таблицы (incidents, audit_log, query_log…): посадки задают
 *   «якоря» — строки с явным id и ключом порядка — или «плавающие» строки без
 *   id. Шум заполняет промежутки между якорями ровно нужным числом строк
 *   (fillOrdered), так что порядок id совпадает с порядком ключа.
 */
import type { Database, SqlValue, Statement } from "sql.js";
import { Rng } from "./rng";

export type Row = Record<string, SqlValue | boolean | undefined>;

export class WorldGenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorldGenError";
  }
}

/** Посаженная строка: значения и ключ порядка (мс или число) */
export interface PlantedRow {
  row: Row;
  key?: number;
}

export interface InsertOptions {
  /**
   * Ключ порядка (время 'YYYY-MM-DD HH:MM:SS' в мс или число). Для
   * упорядоченных таблиц: строка с явным id становится якорем, без id —
   * плавающей и получит id при заполнении таблицы шумом.
   */
  orderAt?: number;
}

export type Phase = "schema" | "plants" | "noise" | "post";

const MAX_ATTEMPTS = 20;

function toSql(v: SqlValue | boolean | undefined): SqlValue {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

export class WorldContext {
  readonly db: Database;
  readonly seed: number;
  phase: Phase = "schema";

  private readonly root: Rng;
  private readonly statements = new Map<string, Statement>();
  private readonly used = new Map<string, Set<number>>();
  private readonly cursors = new Map<string, number>();
  private readonly keys = new Map<string, Map<string, unknown>>();
  private readonly exclusions = new Map<string, { pred: (row: Row) => boolean; note?: string }[]>();
  private readonly plantedRows = new Map<string, PlantedRow[]>();
  private readonly deferredRows = new Map<string, PlantedRow[]>();
  private readonly anchorsByTable = new Map<string, { id: number; key: number }[]>();
  private readonly counts = new Map<string, number>();
  /** Общее состояние генераторов шума (население, адреса, счета…) */
  readonly state: Record<string, unknown> = {};

  constructor(db: Database, seed: number) {
    this.db = db;
    this.seed = seed >>> 0;
    this.root = new Rng(this.seed);
  }

  /** Независимый детерминированный поток для подсистемы */
  rng(label: string): Rng {
    return this.root.fork(label);
  }

  // ---------------------------------------------------------------- вставка

  private statement(table: string, columns: string[]): Statement {
    const cacheKey = `${table}\u0000${columns.join(",")}`;
    let stmt = this.statements.get(cacheKey);
    if (!stmt) {
      stmt = this.db.prepare(
        `INSERT INTO main.${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`
      );
      this.statements.set(cacheKey, stmt);
    }
    return stmt;
  }

  private usedIds(table: string): Set<number> {
    let s = this.used.get(table);
    if (!s) {
      s = new Set();
      this.used.set(table, s);
    }
    return s;
  }

  /** Сразу пишет строку в базу (id должен быть задан, если он нужен) */
  write(table: string, row: Row): void {
    const columns = Object.keys(row).filter((k) => row[k] !== undefined);
    this.statement(table, columns).run(columns.map((c) => toSql(row[c])));
    this.counts.set(table, (this.counts.get(table) ?? 0) + 1);
    if (typeof row.id === "number") this.usedIds(table).add(row.id);
  }

  /**
   * Вставка посадки. Числовой id без значения выделяется аллокатором, если
   * таблица не упорядоченная; в упорядоченной (opts.orderAt задан, id нет)
   * строка откладывается до заполнения таблицы шумом.
   */
  insert(table: string, row: Row, opts: InsertOptions = {}): void {
    const planted: PlantedRow = { row, key: opts.orderAt };
    if (this.phase === "plants") this.pushMap(this.plantedRows, table, planted);
    if (opts.orderAt !== undefined && row.id === undefined) {
      this.pushMap(this.deferredRows, table, planted);
      return;
    }
    if (typeof row.id === "number") {
      if (this.usedIds(table).has(row.id)) throw new WorldGenError(`${table}: id ${row.id} уже занят`);
      if (opts.orderAt !== undefined) this.pushMap(this.anchorsByTable, table, { id: row.id, key: opts.orderAt });
    }
    this.write(table, row);
  }

  private pushMap<T>(map: Map<string, T[]>, table: string, value: T): void {
    const list = map.get(table);
    if (list) list.push(value);
    else map.set(table, [value]);
  }

  /** Следующий свободный id (не занятый посадкой и не зарезервированный) */
  nextId(table: string): number {
    const used = this.usedIds(table);
    let id = this.cursors.get(table) ?? 1;
    while (used.has(id)) id++;
    used.add(id);
    this.cursors.set(table, id + 1);
    return id;
  }

  /** Резервирует id: шум его не займёт (дыра в id или будущая строка патча) */
  reserveId(table: string, id: number): void {
    this.usedIds(table).add(id);
  }

  isIdUsed(table: string, id: number): boolean {
    return this.usedIds(table).has(id);
  }

  /**
   * Дыра в упорядоченной таблице: id занят «удалённой» строкой с ключом
   * порядка key. Шум её не заполнит, а соседние строки встанут по порядку.
   */
  hole(table: string, id: number, key: number): void {
    if (this.usedIds(table).has(id)) throw new WorldGenError(`${table}: id ${id} уже занят`);
    this.reserveId(table, id);
    this.pushMap(this.anchorsByTable, table, { id, key });
  }

  /** Якоря упорядоченной таблицы (явные id посадок с ключом и дыры) */
  anchors(table: string): readonly { id: number; key: number }[] {
    return this.anchorsByTable.get(table) ?? [];
  }

  /** Плавающие посадки упорядоченной таблицы (без id) — забираются один раз */
  takeDeferred(table: string): PlantedRow[] {
    const rows = this.deferredRows.get(table) ?? [];
    this.deferredRows.delete(table);
    return rows;
  }

  deferredCount(table: string): number {
    return this.deferredRows.get(table)?.length ?? 0;
  }

  /** Все строки, посаженные в таблицу (с явными id и плавающие) */
  planted(table: string): readonly PlantedRow[] {
    return this.plantedRows.get(table) ?? [];
  }

  plantedCount(table: string): number {
    return this.plantedRows.get(table)?.length ?? 0;
  }

  /** Сколько строк уже записано в таблицу */
  count(table: string): number {
    return this.counts.get(table) ?? 0;
  }

  // ---------------------------------------------------------------- резервы

  /** Уникальный ключ посадки: шум не повторит value в пространстве kind */
  reserve(kind: string, value: string, ref: unknown = true): void {
    let m = this.keys.get(kind);
    if (!m) {
      m = new Map();
      this.keys.set(kind, m);
    }
    m.set(value, ref);
  }

  isReserved(kind: string, value: string): boolean {
    return this.keys.get(kind)?.has(value) ?? false;
  }

  /** Значение, сохранённое при резервировании (например, id посаженного адреса) */
  reservedRef<T = unknown>(kind: string, value: string): T | undefined {
    return this.keys.get(kind)?.get(value) as T | undefined;
  }

  reservedValues(kind: string): string[] {
    return [...(this.keys.get(kind)?.keys() ?? [])];
  }

  /**
   * Новое уникальное значение для шума: make() повторяется, пока значение
   * занято. Полученное значение тоже резервируется.
   */
  unique(kind: string, make: () => string, attempts = 10_000): string {
    for (let i = 0; i < attempts; i++) {
      const v = make();
      if (!this.isReserved(kind, v)) {
        this.reserve(kind, v);
        return v;
      }
    }
    throw new WorldGenError(`unique(${kind}): пул исчерпан`);
  }

  // ---------------------------------------------------------------- исключения

  /** Шум не создаёт строк table, на которых predicate вернёт true */
  exclude(table: string, predicate: (row: Row) => boolean, note?: string): void {
    this.pushMap(this.exclusions, table, { pred: predicate, note });
  }

  isExcluded(table: string, row: Row): boolean {
    const list = this.exclusions.get(table);
    if (!list) return false;
    for (const e of list) if (e.pred(row)) return true;
    return false;
  }

  /**
   * Строит строку шума с учётом исключений: до 20 попыток (разд. 8.3), иначе
   * генератор падает — значит, исключения противоречат правилам шума.
   */
  tryRow(table: string, make: (attempt: number) => Row | null): Row {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const row = make(attempt);
      if (row && !this.isExcluded(table, row)) return row;
    }
    throw new WorldGenError(`${table}: ${MAX_ATTEMPTS} попыток подряд строка шума попадает под исключение`);
  }

  /** Как tryRow, но null вместо ошибки: строку можно просто пропустить */
  maybeRow(table: string, make: (attempt: number) => Row | null): Row | null {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const row = make(attempt);
      if (row && !this.isExcluded(table, row)) return row;
    }
    return null;
  }

  // ---------------------------------------------------------------- служебное

  /** Освобождает подготовленные выражения (в конце генерации) */
  dispose(): void {
    for (const stmt of this.statements.values()) stmt.free();
    this.statements.clear();
  }
}

// ==================================================================== упорядоченные таблицы

/**
 * Строгая возрастающая подгонка: desired — желаемые значения по порядку,
 * результат лежит строго между lo и hi, растёт строго и обходит skip.
 * Нужна для номеров КУСП, журнала «Сокола», id упорядоченных таблиц.
 */
export function fitSequence(desired: readonly number[], lo: number, hi: number, skip?: (v: number) => boolean): number[] {
  const n = desired.length;
  const out: number[] = [];
  let prev = lo;
  for (let i = 0; i < n; i++) {
    const minV = Math.max(prev + 1, lo + 1 + i);
    let v = Math.max(Math.round(desired[i]), minV);
    v = Math.min(v, hi - (n - i));
    if (v < minV) v = minV;
    while (skip && skip(v)) v++;
    if (v >= hi) throw new WorldGenError(`fitSequence: ${n} значений не помещаются между ${lo} и ${hi}`);
    out.push(v);
    prev = v;
  }
  return out;
}

export interface OrderedSegment {
  /** id слотов сегмента по возрастанию (уже без якорей и дыр) */
  ids: number[];
  /** Ключи порядка строго между границами сегмента */
  keyLo: number;
  keyHi: number;
}

/**
 * Делит диапазон id [idFrom, idTo] на сегменты между якорями. Якоря вне
 * диапазона игнорируются. Ключи якорей должны расти вместе с id — иначе
 * порядок «id = порядок ключа» невозможен и генератор падает.
 */
export function planOrdered(
  anchors: readonly { id: number; key: number }[],
  idFrom: number,
  idTo: number,
  keyFrom: number,
  keyTo: number,
  reserved?: (id: number) => boolean
): OrderedSegment[] {
  const inRange = anchors.filter((a) => a.id >= idFrom && a.id <= idTo).sort((a, b) => a.id - b.id);
  for (let i = 1; i < inRange.length; i++) {
    if (inRange[i].key < inRange[i - 1].key) {
      throw new WorldGenError(
        `planOrdered: якорь id ${inRange[i].id} раньше якоря id ${inRange[i - 1].id} по ключу порядка`
      );
    }
  }
  const segments: OrderedSegment[] = [];
  let prevId = idFrom - 1;
  let prevKey = keyFrom;
  const anchorIds = new Set(inRange.map((a) => a.id));
  const bounds = [...inRange, { id: idTo + 1, key: keyTo }];
  for (const b of bounds) {
    const ids: number[] = [];
    for (let id = prevId + 1; id < b.id; id++) {
      if (!anchorIds.has(id) && !(reserved && reserved(id))) ids.push(id);
    }
    segments.push({ ids, keyLo: prevKey, keyHi: b.key });
    prevId = b.id;
    prevKey = b.key;
  }
  return segments;
}

export interface FillOrderedSpec {
  table: string;
  idFrom: number;
  idTo: number;
  keyFrom: number;
  keyTo: number;
  /** Ключ порядка плавающей посадки */
  keyOf: (row: Row) => number;
  /** n отсортированных ключей строго внутри (lo, hi) — с ритмом таблицы */
  sampleKeys: (rng: Rng, n: number, lo: number, hi: number) => number[];
  /** Строка шума с заданным ключом и id; null — попробовать иначе */
  build: (key: number, id: number, rng: Rng, attempt: number) => Row | null;
  rng: Rng;
}

/**
 * Заполняет упорядоченную таблицу: между якорями ровно столько строк шума,
 * сколько свободных id, плавающие посадки встают по своему ключу.
 * Возвращает число записанных строк шума.
 */
export function fillOrdered(ctx: WorldContext, spec: FillOrderedSpec): number {
  const { table, rng } = spec;
  const floating = ctx.takeDeferred(table).map((p) => ({ row: p.row, key: p.key ?? spec.keyOf(p.row) }));
  const anchorIds = new Set(ctx.anchors(table).map((a) => a.id));
  // Явные id посадок без ключа порядка тоже обходятся (это не якоря, просто занятые id)
  const segments = planOrdered(ctx.anchors(table), spec.idFrom, spec.idTo, spec.keyFrom, spec.keyTo, (id) =>
    ctx.isIdUsed(table, id) && !anchorIds.has(id)
  );
  let written = 0;
  let floatIdx = 0;
  floating.sort((a, b) => a.key - b.key);
  for (const seg of segments) {
    const mine: { row: Row; key: number }[] = [];
    while (floatIdx < floating.length && floating[floatIdx].key <= seg.keyHi) {
      const f = floating[floatIdx++];
      if (f.key < seg.keyLo) throw new WorldGenError(`${table}: плавающая посадка раньше якоря`);
      mine.push(f);
    }
    const n = seg.ids.length - mine.length;
    if (n < 0) {
      throw new WorldGenError(`${table}: между якорями ${seg.ids.length} id, а посадок ${mine.length}`);
    }
    const keys = n > 0 ? spec.sampleKeys(rng, n, seg.keyLo, seg.keyHi) : [];
    const items: { key: number; planted?: Row }[] = [
      ...keys.map((key) => ({ key })),
      ...mine.map((m) => ({ key: m.key, planted: m.row })),
    ].sort((a, b) => a.key - b.key || (a.planted ? -1 : 1));
    for (let i = 0; i < items.length; i++) {
      const id = seg.ids[i];
      const item = items[i];
      if (item.planted) {
        ctx.write(table, { ...item.planted, id });
        continue;
      }
      let key = item.key;
      let row: Row | null = null;
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !row; attempt++) {
        if (attempt >= MAX_ATTEMPTS / 2) {
          // Ключ попал в запретное окно: сдвигаем его между соседями
          const lo = i > 0 ? items[i - 1].key : seg.keyLo;
          const hi = i + 1 < items.length ? items[i + 1].key : seg.keyHi;
          key = lo + (hi - lo) * rng.next();
          if (key <= lo || key >= hi) key = (lo + hi) / 2;
        }
        const candidate = spec.build(key, id, rng, attempt);
        if (candidate && !ctx.isExcluded(table, candidate)) row = candidate;
      }
      if (!row) throw new WorldGenError(`${table}: не удалось построить строку шума id ${id}`);
      item.key = key;
      ctx.write(table, row);
      written++;
    }
  }
  if (floatIdx < floating.length) throw new WorldGenError(`${table}: плавающие посадки позже конца диапазона`);
  return written;
}

/**
 * Свободный режим: строки шума и плавающие посадки сортируются по ключу и
 * получают свободные id по возрастанию (явные id посадок обходятся).
 */
export function flushFree(ctx: WorldContext, table: string, noise: readonly { row: Row; key: number }[], keyOf: (row: Row) => number): void {
  const floating = ctx.takeDeferred(table).map((p) => ({ row: p.row, key: p.key ?? keyOf(p.row) }));
  const all = [...floating.map((f) => ({ ...f, planted: true })), ...noise.map((r) => ({ ...r, planted: false }))];
  all.sort((a, b) => a.key - b.key || (a.planted === b.planted ? 0 : a.planted ? -1 : 1));
  for (const item of all) ctx.write(table, { ...item.row, id: ctx.nextId(table) });
}

/**
 * n отсортированных моментов в (lo, hi) с весом weight(ms) ∈ [0, 1] —
 * выборка с отклонением. Секунды случайные: в мире они всегда записаны.
 */
export function sampleTimes(rng: Rng, n: number, lo: number, hi: number, weight: (ms: number) => number): number[] {
  const out: number[] = [];
  const span = hi - lo;
  if (span <= 2000) {
    for (let i = 0; i < n; i++) out.push(lo + ((i + 1) * span) / (n + 1));
    return out.map(Math.round);
  }
  let guard = 0;
  while (out.length < n) {
    const t = lo + 1000 + Math.floor(rng.next() * (span - 2000));
    if (guard++ > n * 400 || rng.next() < weight(t)) out.push(Math.floor(t / 1000) * 1000);
  }
  return out.sort((a, b) => a - b);
}
