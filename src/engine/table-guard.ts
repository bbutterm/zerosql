/**
 * Extracts table names from SQL and checks against unlocked tables.
 * Blocks queries that reference tables the player hasn't unlocked yet.
 */

const TABLE_RE = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+(\w+)/gi;
const ALWAYS_ALLOWED = new Set(["sqlite_master", "sqlite_temp_master"]);

export function extractReferencedTables(sql: string): string[] {
  const tables = new Set<string>();
  const re = new RegExp(TABLE_RE.source, TABLE_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql)) !== null) {
    tables.add(match[1].toLowerCase());
  }
  return Array.from(tables);
}

export function checkTableAccess(
  sql: string,
  unlockedTables: string[] | null
): { allowed: boolean; blockedTable?: string } {
  if (unlockedTables === null) return { allowed: true };

  const allowed = new Set(unlockedTables.map((t) => t.toLowerCase()));
  for (const name of ALWAYS_ALLOWED) {
    allowed.add(name);
  }

  for (const table of extractReferencedTables(sql)) {
    if (!allowed.has(table)) {
      return { allowed: false, blockedTable: table };
    }
  }
  return { allowed: true };
}
