import type { Database } from "sql.js";
import type { WorldContext } from "../context";
import type { Rng } from "../rng";

/**
 * Посадка: вставляет заложенные факты, резервирует ключи и регистрирует
 * исключения для шума. Вызывается один раз, до шума, в порядке реестра.
 */
export type PlantFn = (ctx: WorldContext) => void;

/** Что знает наполнитель поздней таблицы: флаги ветвлений (tokha_turned, melnik, watcher_tripped…) */
export interface LateFillerContext {
  flags: Readonly<Record<string, unknown>>;
  /** Игровое время применения патча 'YYYY-MM-DD HH:MM:SS' */
  clock: string;
}

/**
 * Наполнение поздней таблицы (разд. 6.14, п. 4): таблица создаётся сюжетным
 * патчем при открытии дела, после чего вызывается наполнитель. db — уже
 * открытая база дела (мир плюс патчи), rng — детерминированный поток
 * для этой таблицы. Писать в main.<таблица>.
 */
export type LateFiller = (db: Database, rng: Rng, context: LateFillerContext) => void;

/** Таблица → наполнитель. Ключи — имена из WORLD_LATE_TABLES или staging-таблиц «Сокола» */
export type LateFillers = Partial<Record<string, LateFiller>>;

export interface PlantModule {
  /** cNN, 'core' или 'eggs' */
  key: string;
  plant: PlantFn;
  late?: LateFillers;
}
