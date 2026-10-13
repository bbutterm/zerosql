import type { WorldContext } from "../context";
import type { LateFillers } from "./types";

/**
 * Посадка дела `case-09-matryoshka` — «Матрёшка».
 *
 * Заглушка: факты дела сажает агент этого дела (см. plants/README.md).
 * TODO(c09): company_owners (цепочка «Щита», цикл 15↔16), share_deals Kordon, 180 000 «Ладога → Щит», contracts/grant_requests, bank_statements (поздняя).
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
 * или импортом диска). TODO: bank_statements.
 */
export const late: LateFillers = {};
