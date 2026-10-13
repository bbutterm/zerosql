/**
 * Генератор мира: схема → посадки (core → c00 … c12 → eggs) → шум →
 * индексы → ANALYZE. Всё в одной транзакции через подготовленные выражения.
 *
 *   const db = await generateWorld();            // зерно WORLD_SEED
 *   const bytes = exportWorld(db);               // кеш в IndexedDB
 *   const caseDb = await openCaseDatabase(bytes, { clock, tables, patches });
 */
import type { Database } from "sql.js";
import { createDatabase, getForeignKeys, getTableSchema } from "../database";
import type { ForeignKey, TableInfo } from "@/types/database";
import { WorldContext, WorldGenError } from "./context";
import { hashSeed } from "./rng";
import { WORLD_SEED } from "./facts";
import { WORLD_INDEXES, WORLD_SCHEMA_SQL } from "./schema";
import { PLANT_REGISTRY } from "./plants";
import { generateNoise } from "./noise";
import {
  applyClockPatches, applyStoryPatch, createHorizonViews, registerGameClock, type StoryPatchParams,
} from "./horizon";

export interface GenerateStats {
  seed: number;
  totalMs: number;
  /** Время по этапам и по таблицам шума, мс */
  timings: Record<string, number>;
  rows: Record<string, number>;
}

const lastStats = new WeakMap<Database, GenerateStats>();

/** Числовое зерно: строка 'POLYNYA-S1' хешируется в uint32 */
export function worldSeedNumber(seed: string | number = WORLD_SEED): number {
  return hashSeed(seed);
}

/**
 * Собирает мир в переданной пустой базе (синхронно). Нужна, когда база
 * уже создана — в Web Worker или в тестах.
 */
export function generateWorldInto(db: Database, seed: string | number = WORLD_SEED): GenerateStats {
  const t0 = performance.now();
  const timings: Record<string, number> = {};
  const lap = (name: string, from: number) => (timings[name] = Math.round((performance.now() - from) * 10) / 10);
  const ctx = new WorldContext(db, worldSeedNumber(seed));
  db.run("PRAGMA foreign_keys = OFF");
  let t = performance.now();
  db.run(WORLD_SCHEMA_SQL);
  lap("schema", t);
  db.run("BEGIN");
  try {
    t = performance.now();
    ctx.phase = "plants";
    for (const m of PLANT_REGISTRY) m.plant(ctx);
    lap("plants", t);
    t = performance.now();
    ctx.phase = "noise";
    generateNoise(ctx, timings);
    lap("noise", t);
    const left = ctx.pendingDeferred();
    if (left.length > 0) throw new WorldGenError(`Посадки без id не попали в таблицы: ${left.join(", ")}`);
    ctx.phase = "post";
    ctx.dispose();
    db.run("COMMIT");
  } catch (e) {
    ctx.dispose();
    db.run("ROLLBACK");
    throw e;
  }
  t = performance.now();
  for (const sql of WORLD_INDEXES) db.run(sql);
  lap("indexes", t);
  t = performance.now();
  db.run("ANALYZE");
  lap("analyze", t);
  const rows: Record<string, number> = {};
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")[0];
  for (const [name] of tables?.values ?? []) {
    rows[String(name)] = Number(db.exec(`SELECT COUNT(*) FROM main.${String(name)}`)[0].values[0][0]);
  }
  const stats = { seed: ctx.seed, totalMs: Math.round(performance.now() - t0), timings, rows };
  lastStats.set(db, stats);
  return stats;
}

/** Новый мир из зерна (по умолчанию WORLD_SEED = 'POLYNYA-S1') */
export async function generateWorld(seed: string | number = WORLD_SEED): Promise<Database> {
  const db = await createDatabase();
  generateWorldInto(db, seed);
  return db;
}

/** Мир для тестов (TECH_SPEC, разд. 3): то же, что generateWorld() */
export const createWorldDatabase = generateWorld;

/** Мир v2 для стора (TECH_SPEC, разд. 3): база, схема и FK для панели схемы */
export async function initWorld(seed: string | number = WORLD_SEED): Promise<{ db: Database; schema: TableInfo[]; foreignKeys: ForeignKey[] }> {
  const db = await generateWorld(seed);
  return { db, schema: getTableSchema(db), foreignKeys: getForeignKeys(db) };
}

/** Статистика последней генерации этой базы (объёмы, время по этапам) */
export function worldStats(db: Database): GenerateStats | undefined {
  return lastStats.get(db);
}

/** Байты мира для кеша (IndexedDB) и быстрого открытия дел */
export function exportWorld(db: Database): Uint8Array {
  return db.export();
}

export type PatchRequest = string | { id: string; params?: StoryPatchParams };

export interface OpenCaseOptions {
  /** Игровые часы 'YYYY-MM-DD HH:MM[:SS]' */
  clock: string;
  /** Открытые таблицы дела (для них создаются представления горизонта); по умолчанию — все */
  tables?: readonly string[];
  /** Записываемые таблицы дела: горизонта у них нет */
  writable?: readonly string[];
  /** Сюжетные патчи по порядку (после патчей по часам) */
  patches?: readonly PatchRequest[];
  /** Применить патчи по часам и патчи старта дела (по умолчанию да) */
  autoPatches?: boolean;
}

/**
 * База дела: мир из байтов + Unicode-функции + game_now() на часах дела +
 * сюжетные патчи + TEMP VIEW горизонта.
 */
export async function openCaseDatabase(worldBytes: Uint8Array, opts: OpenCaseOptions): Promise<Database> {
  const db = await createDatabase(worldBytes);
  registerGameClock(db, opts.clock);
  db.run("PRAGMA foreign_keys = OFF");
  if (opts.autoPatches !== false) applyClockPatches(db);
  for (const p of opts.patches ?? []) {
    if (typeof p === "string") applyStoryPatch(db, p);
    else applyStoryPatch(db, p.id, p.params);
  }
  createHorizonViews(db, opts.tables, opts.writable);
  return db;
}
