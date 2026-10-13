import type { Database } from "sql.js";
import { getGameClock } from "../world/horizon";

/**
 * Контрольная сумма базы дела: схема main и temp, все строки всех таблиц main
 * по порядку rowid, игровые часы и открытая транзакция. db.export() для этого
 * не годится: sql.js при экспорте переоткрывает базу и теряет TEMP VIEW
 * горизонта и пользовательские функции.
 *
 * Хеш — два 32-битных канала (схема cyrb53), 16 hex-символов. Не
 * криптографический: нужен, чтобы сравнить воспроизведённую базу с исходной.
 */

class Hasher {
  private h1 = 0xdeadbeef;
  private h2 = 0x41c6ce57;

  text(value: string): void {
    let h1 = this.h1;
    let h2 = this.h2;
    for (let i = 0; i < value.length; i++) {
      const ch = value.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    this.h1 = h1;
    this.h2 = h2;
  }

  value(v: unknown): void {
    if (v === null || v === undefined) this.text("\u0001z");
    else if (typeof v === "number") this.text(`\u0001n${v}`);
    else if (typeof v === "string") this.text(`\u0001s${v}`);
    else if (v instanceof Uint8Array) {
      this.text(`\u0001b${v.length}:`);
      for (const byte of v) this.text(String.fromCharCode(byte));
    } else this.text(`\u0001?${String(v)}`);
  }

  digest(): string {
    let h1 = this.h1;
    let h2 = this.h2;
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
  }
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Открыта ли транзакция (у sql.js нет sqlite3_get_autocommit — пробуем BEGIN) */
export function inTransaction(db: Database): boolean {
  try {
    db.run("BEGIN");
  } catch {
    return true;
  }
  db.run("COMMIT");
  return false;
}

function feedRows(db: Database, sql: string, hash: Hasher): void {
  const stmt = db.prepare(sql);
  try {
    while (stmt.step()) {
      hash.text("\u0002");
      for (const v of stmt.get()) hash.value(v);
    }
  } finally {
    stmt.free();
  }
}

export function databaseChecksum(db: Database): string {
  const hash = new Hasher();
  feedRows(db, "SELECT type, name, tbl_name, sql FROM main.sqlite_master ORDER BY type, name", hash);
  hash.text("\u0003temp");
  feedRows(db, "SELECT type, name, tbl_name, sql FROM temp.sqlite_master ORDER BY type, name", hash);

  const tables = db.exec("SELECT name, sql FROM main.sqlite_master WHERE type = 'table' ORDER BY name")[0]?.values ?? [];
  for (const [name, ddl] of tables) {
    const table = String(name);
    hash.text(`\u0003${table}`);
    const withoutRowid = /without\s+rowid/i.test(String(ddl ?? ""));
    const order = withoutRowid ? "1" : "rowid";
    feedRows(db, `SELECT ${withoutRowid ? "" : "rowid, "}* FROM main.${quoteIdent(table)} ORDER BY ${order}`, hash);
  }
  hash.text(`\u0003clock${getGameClock(db)}`);
  hash.text(`\u0003tx${inTransaction(db) ? 1 : 0}`);
  return hash.digest();
}
