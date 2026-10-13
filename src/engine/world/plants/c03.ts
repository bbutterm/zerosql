import type { WorldContext } from "../context";

/**
 * Посадка дела `case-03-polyarnaya` — «Наезд на Полярной».
 *
 * Заглушка: факты дела сажает агент этого дела (см. plants/README.md).
 * TODO(c03): incidents 1611/1613/1614/1616/1631, ложные следы на камере 7, исключение окна 18.11 22:00–19.11 01:00.
 *
 * Контракт: `plant(ctx)` вызывается один раз, после core и предыдущих дел,
 * до шума. Вставлять строки через ctx.insert (явные id — где их называет
 * библия), резервировать уникальные ключи через ctx.reserve, запрещать
 * шуму ложные ответы через ctx.exclude. Константы — в ../facts.ts.
 */
export function plant(ctx: WorldContext): void {
  void ctx;
}
