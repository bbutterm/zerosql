import type { WorldContext } from "../context";
import type { LateFillers } from "./types";

/**
 * Посадка дела `case-10-kopirka` — «Копирка».
 *
 * Заглушка: факты дела сажает агент этого дела (см. plants/README.md).
 * TODO(c10): attachments 201–209, sokol_stage_* (диск Нины, поздний импорт), nina_carbon (поздняя).
 *
 * Контракт: `plant(ctx)` вызывается один раз, после core и предыдущих дел,
 * до шума. Вставлять строки через ctx.insert (явные id — где их называет
 * библия), резервировать уникальные ключи через ctx.reserve, запрещать
 * шуму ложные ответы через ctx.exclude. Константы — в ../facts.ts.
 */
export function plant(ctx: WorldContext): void {
  void ctx;
}

/**
 * Наполнители поздних таблиц этого дела (создаются патчем `late.<таблица>`
 * или импортом диска). TODO: sokol_stage_registry, sokol_stage_statements, sokol_stage_persons, nina_carbon.
 */
export const late: LateFillers = {};
