import type { WorldContext } from "../context";

/**
 * Посадка дела `case-00-nulevoy-etazh` — Пролог «Нулевой этаж».
 *
 * Заглушка: факты дела сажает агент этого дела (см. plants/README.md).
 * TODO(c00): incidents 1701–1714 (вечер 02.12, всплеск; с 18:02:01 до 18:35 вызовов нет), transit_taps Лаптева М. А. 16:41.
 *
 * Контракт: `plant(ctx)` вызывается один раз, после core и предыдущих дел,
 * до шума. Вставлять строки через ctx.insert (явные id — где их называет
 * библия), резервировать уникальные ключи через ctx.reserve, запрещать
 * шуму ложные ответы через ctx.exclude. Константы — в ../facts.ts.
 */
export function plant(ctx: WorldContext): void {
  void ctx;
}
