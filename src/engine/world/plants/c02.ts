import type { WorldContext } from "../context";

/**
 * Посадка дела `case-02-minus-41` — «Минус сорок один».
 *
 * Заглушка: факты дела сажает агент этого дела (см. plants/README.md).
 * TODO(c02): addresses 811/640/702, heat_readings ШХ-12-31, incidents 1735, transactions ACC-30518 (СФР, УК, списания после смерти), intercom_events, delivery_orders Олега.
 *
 * Контракт: `plant(ctx)` вызывается один раз, после core и предыдущих дел,
 * до шума. Вставлять строки через ctx.insert (явные id — где их называет
 * библия), резервировать уникальные ключи через ctx.reserve, запрещать
 * шуму ложные ответы через ctx.exclude. Константы — в ../facts.ts.
 */
export function plant(ctx: WorldContext): void {
  void ctx;
}
