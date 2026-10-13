import type { WorldContext } from "../context";
import type { LateFillers } from "./types";

/**
 * Посадка дела `case-12-pervoe-solntse` — «Первое солнце».
 *
 * Заглушка: факты дела сажает агент этого дела (см. plants/README.md).
 * TODO(c12): ночь 10.01 (plate_reads, door_access, audit_log, query_log), лента Бурцева 11.01, publication_source (поздняя).
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
 * или импортом диска). TODO: publication_source.
 */
export const late: LateFillers = {};
