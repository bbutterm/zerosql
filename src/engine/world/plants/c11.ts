import type { WorldContext } from "../context";
import type { LateFillers } from "./types";

/**
 * Посадка дела `case-11-chernovik` — Интерлюдия «Черновик».
 *
 * Заглушка: факты дела сажает агент этого дела (см. plants/README.md).
 * TODO(c11): draft_statements / draft_persons / draft_publication (поздние).
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
 * или импортом диска). TODO: draft_statements, draft_persons, draft_publication.
 */
export const late: LateFillers = {};
