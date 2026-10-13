import type { WorldContext } from "../context";

/**
 * Посадка дела `case-01-med` — «Медь».
 *
 * Заглушка: факты дела сажает агент этого дела (см. plants/README.md).
 * TODO(c01): incidents 1683/1690/1697, vehicles К372ОК / М537ТН / Е372ВХ / Р037АА и 14 «Сайгаков», plate_reads камеры 12.
 *
 * Контракт: `plant(ctx)` вызывается один раз, после core и предыдущих дел,
 * до шума. Вставлять строки через ctx.insert (явные id — где их называет
 * библия), резервировать уникальные ключи через ctx.reserve, запрещать
 * шуму ложные ответы через ctx.exclude. Константы — в ../facts.ts.
 */
export function plant(ctx: WorldContext): void {
  void ctx;
}
