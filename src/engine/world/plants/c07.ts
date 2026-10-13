import type { WorldContext } from "../context";

/**
 * Посадка дела `case-07-sluzhebnaya-kvartira` — «Служебная квартира».
 *
 * Заглушка: факты дела сажает агент этого дела (см. plants/README.md).
 * TODO(c07): properties 401–422, фонд → Ратников/Шубин/Мирошник/переселенцы, B-9000 21.12 23:41.
 *
 * Контракт: `plant(ctx)` вызывается один раз, после core и предыдущих дел,
 * до шума. Вставлять строки через ctx.insert (явные id — где их называет
 * библия), резервировать уникальные ключи через ctx.reserve, запрещать
 * шуму ложные ответы через ctx.exclude. Константы — в ../facts.ts.
 */
export function plant(ctx: WorldContext): void {
  void ctx;
}
