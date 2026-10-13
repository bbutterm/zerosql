/**
 * Горизонт времени (разд. 6.14, п. 3) и сюжетные патчи.
 *
 * game_now() — UDF, которая отдаёт игровые часы базы в формате
 * 'YYYY-MM-DD HH:MM:SS'. Для каждой открытой таблицы со столбцом горизонта
 * создаётся TEMP VIEW с тем же именем:
 *   CREATE TEMP VIEW t AS SELECT * FROM main.t WHERE <col> <= (SELECT game_now())
 * Temp-схема перекрывает main, простое представление уплощается, индексы
 * работают; скалярный подзапрос вычисляется один раз на запрос. Строки «из
 * будущего» физически лежат в базе и проявляются, когда до них доходят часы.
 *
 * Записываемые таблицы (writable) горизонта не имеют: генератор не кладёт в
 * них строк позже старта дела, которое их открывает на запись.
 */
import type { Database } from "sql.js";
import { fmtTs, parseTs } from "./rng";
import { CASE_START } from "./facts";
import { HORIZON_COLUMNS, TABLE_BY_NAME } from "./schema";
import { STORY_PATCHES, clockPatchesDue, type StoryPatchParams } from "./patches";

export type { StoryPatchParams, StoryPatchDef } from "./patches";
export { STORY_PATCHES, clockPatchesDue } from "./patches";

/** Часы по умолчанию — старт пролога */
export const DEFAULT_GAME_CLOCK = CASE_START.c00;

const clocks = new WeakMap<Database, string>();

/** 'YYYY-MM-DD HH:MM[:SS]' → 'YYYY-MM-DD HH:MM:SS'; бросает RangeError на неверной строке */
export function normalizeClock(value: string): string {
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(v)) {
    throw new RangeError(`Неверное игровое время «${value}», ожидается 'YYYY-MM-DD HH:MM:SS'`);
  }
  const normalized = fmtTs(parseTs(v));
  if (normalized.slice(0, 16) !== v.slice(0, 16)) throw new RangeError(`Несуществующая дата «${value}»`);
  return normalized;
}

/** Регистрирует game_now() в базе (идемпотентно) и ставит часы */
export function registerGameClock(db: Database, clock: string = DEFAULT_GAME_CLOCK): void {
  const had = clocks.has(db);
  clocks.set(db, normalizeClock(clock));
  if (!had) db.create_function("game_now", () => clocks.get(db) ?? DEFAULT_GAME_CLOCK);
}

/** Переводит игровые часы базы. Представления горизонта видят новое время сразу */
export function setGameClock(db: Database, clock: string): void {
  if (!clocks.has(db)) registerGameClock(db, clock);
  else clocks.set(db, normalizeClock(clock));
}

export function getGameClock(db: Database): string {
  return clocks.get(db) ?? DEFAULT_GAME_CLOCK;
}

function existsIn(db: Database, schema: "main" | "temp", type: "table" | "view", name: string): boolean {
  const master = schema === "main" ? "main.sqlite_master" : "temp.sqlite_master";
  const res = db.exec(`SELECT COUNT(*) FROM ${master} WHERE type = '${type}' AND name = '${name.replace(/'/g, "''")}'`);
  return Number(res[0]?.values[0]?.[0] ?? 0) > 0;
}

/** SQL представления горизонта для таблицы */
export function horizonViewSql(table: string): string {
  const col = HORIZON_COLUMNS[table];
  if (!col) throw new Error(`У таблицы ${table} нет столбца горизонта`);
  return `CREATE TEMP VIEW IF NOT EXISTS ${table} AS SELECT * FROM main.${table} WHERE ${col} <= (SELECT game_now())`;
}

/**
 * Создаёт TEMP VIEW горизонта для открытых таблиц (по умолчанию — для всех
 * таблиц со столбцом горизонта), кроме записываемых. Возвращает имена
 * созданных представлений.
 */
export function createHorizonViews(db: Database, tables?: readonly string[], writable: readonly string[] = []): string[] {
  if (!clocks.has(db)) registerGameClock(db);
  const names = (tables ?? Object.keys(HORIZON_COLUMNS)).filter((t) => HORIZON_COLUMNS[t] && !writable.includes(t));
  const created: string[] = [];
  for (const t of names) {
    if (!existsIn(db, "main", "table", t)) continue;
    if (existsIn(db, "temp", "view", t)) continue;
    db.run(horizonViewSql(t));
    created.push(t);
  }
  return created;
}

/** Снимает представление горизонта (таблица открыта на запись или удалена) */
export function dropHorizonView(db: Database, table: string): void {
  db.run(`DROP VIEW IF EXISTS temp.${table}`);
}

/** Имена текущих представлений горизонта */
export function horizonViews(db: Database): string[] {
  const res = db.exec("SELECT name FROM temp.sqlite_master WHERE type = 'view' ORDER BY name");
  return (res[0]?.values ?? []).map((r) => String(r[0])).filter((n) => TABLE_BY_NAME.has(n));
}

export interface StoryPatchResult {
  id: string;
  /** Патч известен и выполнен (у заглушки — без изменений) */
  applied: boolean;
  /** Сколько строк изменено */
  changes: number;
  /** Патч пока заглушка: факты дела ещё не посажены */
  stub: boolean;
}

/**
 * Применяет сюжетный патч по id (STORY_PATCHES). Часы по умолчанию — часы
 * базы. Патчи безопасны при повторе; неизвестный id — ошибка.
 */
export function applyStoryPatch(db: Database, patchId: string, params: StoryPatchParams = {}): StoryPatchResult {
  const def = STORY_PATCHES[patchId];
  if (!def) throw new Error(`Неизвестный сюжетный патч «${patchId}»`);
  const clock = params.clock ? normalizeClock(params.clock) : getGameClock(db);
  const changes = def.apply(db, { ...params, clock, flags: params.flags ?? {} });
  return { id: patchId, applied: true, changes, stub: def.stub === true };
}

/** Все патчи, которые должны быть применены к этим часам сами (autoAt ≤ clock и старт дела) */
export function applyClockPatches(db: Database, clock: string = getGameClock(db)): StoryPatchResult[] {
  return clockPatchesDue(normalizeClock(clock)).map((id) => applyStoryPatch(db, id, { clock }));
}
