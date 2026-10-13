import type { JournalEntry } from "./types";

/**
 * Дописывает запись в журнал дела. Один и тот же код у ядра и у клиента:
 * клиент держит копию журнала (воркер может умереть вместе со своей), и
 * обе копии обязаны совпадать запись в запись.
 *
 * Подряд идущие переводы часов схлопываются: важен только последний.
 */
export function appendJournal(journal: JournalEntry[], entry: JournalEntry): void {
  const last = journal[journal.length - 1];
  if (entry.kind === "clock" && last?.kind === "clock") {
    journal[journal.length - 1] = entry;
    return;
  }
  journal.push(entry);
}

/** Журнал без записей игрока (DML, представления): «Откатить дело к началу» */
export function withoutPlayerWrites(journal: readonly JournalEntry[]): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const entry of journal) {
    if (entry.kind === "query" && entry.sql !== undefined) {
      // Часы и строка query_log остаются: прогресс и след игрока не теряются
      appendJournal(out, { kind: "query", clock: entry.clock, ...(entry.log ? { log: entry.log } : {}) });
    } else {
      appendJournal(out, entry);
    }
  }
  return out;
}
