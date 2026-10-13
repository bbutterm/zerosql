import type { Database } from "sql.js";
import { generateWorld, exportWorld } from "@/engine/world/generate";

/** Один мир на файл тестов: генерация ~1 с */
let cached: Promise<{ db: Database; bytes: Uint8Array; ms: number }> | null = null;

export function sharedWorld(): Promise<{ db: Database; bytes: Uint8Array; ms: number }> {
  if (!cached) {
    cached = (async () => {
      const t0 = performance.now();
      const db = await generateWorld();
      const ms = performance.now() - t0;
      return { db, bytes: exportWorld(db), ms };
    })();
  }
  return cached;
}

export function rows(db: Database, sql: string, params: (string | number | null)[] = []): unknown[][] {
  return db.exec(sql, params)[0]?.values ?? [];
}

export function one(db: Database, sql: string, params: (string | number | null)[] = []): unknown {
  return rows(db, sql, params)[0]?.[0];
}
