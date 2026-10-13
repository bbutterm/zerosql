import type { Database } from "sql.js";
import type { QueryResult } from "@/types/database";
import type { SecretDef, ValidationContext } from "@/types/case";
import { validate } from "./validator";

/**
 * Тайники (пасхалки), описанные данными: тайник срабатывает, когда результат
 * любого запроса проходит его правило `trigger`. Тайник, привязанный к
 * таблицам (`tables`), не может сработать, пока хотя бы одна из них закрыта.
 */

function tablesUnlocked(secret: SecretDef, unlockedTables: readonly string[] | null): boolean {
  if (!secret.tables?.length || unlockedTables === null) return true;
  const open = new Set(unlockedTables.map((t) => t.toLowerCase()));
  return secret.tables.every((t) => open.has(t.toLowerCase()));
}

/**
 * Возвращает id тайников, найденных этим запросом (в порядке объявления).
 * Уже найденные пропускаются; запрос с ошибкой ничего не находит.
 * unlockedTables = null — доступны все таблицы. ctx — состояние стола для
 * правил pin / seen / slot (необязательно).
 */
export function checkSecrets(
  secrets: readonly SecretDef[],
  result: QueryResult,
  db: Database,
  found: ReadonlySet<string>,
  unlockedTables: readonly string[] | null,
  ctx?: ValidationContext
): string[] {
  if (result.error) return [];
  const discovered: string[] = [];
  for (const secret of secrets) {
    if (found.has(secret.id) || discovered.includes(secret.id)) continue;
    if (!tablesUnlocked(secret, unlockedTables)) continue;
    try {
      if (validate(secret.trigger, result, db, ctx).passed) discovered.push(secret.id);
    } catch {
      // Сломанное правило тайника не должно ронять игру
    }
  }
  return discovered;
}
