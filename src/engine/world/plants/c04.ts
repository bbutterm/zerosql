import type { WorldContext } from "../context";

/**
 * Посадка дела `case-04-mertvaya-dusha` — «Мёртвая душа».
 *
 * Заглушка: факты дела сажает агент этого дела (см. plants/README.md).
 * TODO(c04): staff 64 (Громов) и опечатки 23/57/91/133, logins test1 / p.gromov, ~600 UPDATE Мельника.
 *
 * Контракт: `plant(ctx)` вызывается один раз, после core и предыдущих дел,
 * до шума. Вставлять строки через ctx.insert (явные id — где их называет
 * библия), резервировать уникальные ключи через ctx.reserve, запрещать
 * шуму ложные ответы через ctx.exclude. Константы — в ../facts.ts.
 */
export function plant(ctx: WorldContext): void {
  void ctx;
}
