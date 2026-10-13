import type { WorldContext } from "../context";

/**
 * Посадка дела `case-06-polynya` — «Полынья».
 *
 * Заглушка: факты дела сажает агент этого дела (см. plants/README.md).
 * TODO(c06): construction_docs 101–108, vehicles Т117АУ, morgue 398, addresses 512 + registrations Береговой, 4, diver_reports 2018-07-14.
 *
 * Контракт: `plant(ctx)` вызывается один раз, после core и предыдущих дел,
 * до шума. Вставлять строки через ctx.insert (явные id — где их называет
 * библия), резервировать уникальные ключи через ctx.reserve, запрещать
 * шуму ложные ответы через ctx.exclude. Константы — в ../facts.ts.
 */
export function plant(ctx: WorldContext): void {
  void ctx;
}
