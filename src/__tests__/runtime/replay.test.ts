/**
 * Журнал состояния дела (разд. 6.14, п. 1): воспроизведение на свежей базе
 * из байтов мира даёт ту же базу — контрольная сумма совпадает. Журнал
 * переживает JSON (стор хранит его в localStorage).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createEngineClient, type EngineClient, type JournalEntry } from "@/engine";
import { appendJournal, withoutPlayerWrites } from "@/engine/runtime/journal";
import { RUNTIME_CASE, RUNTIME_SECRETS } from "./fixture";

const SAVE = { playerName: "Ноль", patches: ["ws07.agent"] } as const;

/** Сценарий, который трогает всё, что журналирует ядро */
async function playScenario(client: EngineClient): Promise<void> {
  const completed: string[] = [];
  const run = async (sql: string) => {
    const ev = await client.run(sql, { completed, runId: "replay" });
    completed.push(...ev.progress.completed.map((c) => c.objectiveId));
    return ev;
  };
  await run("SELECT id, full_name FROM persons WHERE last_name = 'Вальц'");
  await run("SELECT * FROM bank_statements");
  await run("SELEC oops");
  // random() и game_now() в записи игрока
  await run(
    "INSERT INTO statements (case_id, person_id, taken_at, text, status) SELECT 'rt-rand', 4127, game_now(), 'r' || abs(random() % 1000), 'черновик' FROM persons WHERE id IN (1388, 1389, 4127)"
  );
  await run(RUNTIME_CASE.objectives[1].solution);
  // запись с ошибкой посередине: первая вставка остаётся
  await run("INSERT INTO statements (id, case_id) VALUES (900001, 'rt-half'); INSERT INTO statements (id, case_id) VALUES (900001, 'rt-dup')");
  await run("CREATE VIEW rt_valts AS SELECT id, full_name FROM persons WHERE last_name = 'Вальц'");
  await run("CREATE VIEW rt_tmp AS SELECT 1 AS x");
  await run("DROP VIEW rt_tmp");
  await client.applyPatch("c07.admission", { at: "2026-12-24 09:05:00" });
  await client.setClock("2026-12-24 10:00");
  await client.setClock("2026-12-24 10:30");
  await run("BEGIN");
  await run("UPDATE statements SET status = 'подписано' WHERE case_id = 'rt-01'");
  await run("COMMIT");
  await run("SELECT COUNT(*) FROM query_log WHERE login = 'nol'");
  // открытая транзакция в конце: воспроизведение оставляет её открытой
  await run("BEGIN");
  await run("DELETE FROM statements WHERE case_id = 'rt-half'");
}

describe("журнал: детерминированное воспроизведение", () => {
  let original: EngineClient;
  let replica: EngineClient;
  let journal: JournalEntry[];
  let checksum: string;

  beforeAll(async () => {
    original = createEngineClient({ mode: "in-process", secrets: RUNTIME_SECRETS });
    replica = createEngineClient({ mode: "in-process", secrets: RUNTIME_SECRETS });
    await original.init();
    await replica.init();
    await original.openCase(RUNTIME_CASE, SAVE);
    await playScenario(original);
    journal = [...original.getJournal()];
    checksum = await original.checksum();
  }, 30_000);

  it("журнал содержит все виды записей", () => {
    const kinds = new Set(journal.map((e) => e.kind));
    expect(kinds).toEqual(new Set(["query", "patch", "clock"]));
    const writes = journal.filter((e) => e.kind === "query" && e.sql !== undefined);
    expect(writes.length).toBe(11);
    expect(writes.every((e) => e.kind === "query" && typeof e.seed === "number")).toBe(true);
    // два перевода часов подряд схлопнуты в один
    const clocks = journal.filter((e) => e.kind === "clock");
    expect(clocks).toEqual([{ kind: "clock", clock: "2026-12-24 10:30:00" }]);
  });

  it("воспроизведение даёт ту же базу (контрольная сумма)", async () => {
    const opened = await replica.openCase(RUNTIME_CASE, { ...SAVE, journal });
    expect(opened.replayed).toBe(journal.length);
    expect(opened.clock).toBe("2026-12-24 10:33:00");
    expect(opened.playerViews).toEqual(["rt_valts"]);
    expect(await replica.checksum()).toBe(checksum);
    expect(replica.getJournal()).toEqual(journal);
  });

  it("журнал после JSON — та же база", async () => {
    const parsed = JSON.parse(JSON.stringify(journal)) as JournalEntry[];
    await replica.openCase(RUNTIME_CASE, { ...SAVE, journal: parsed });
    expect(await replica.checksum()).toBe(checksum);
  });

  it("random() в записи игрока воспроизводится теми же значениями", async () => {
    await replica.openCase(RUNTIME_CASE, { ...SAVE, journal });
    const a = await replica.run("SELECT text FROM statements WHERE case_id = 'rt-rand' ORDER BY id");
    expect(a.result.rows.length).toBe(3);
    await replica.openCase(RUNTIME_CASE, { ...SAVE, journal });
    const b = await replica.run("SELECT text FROM statements WHERE case_id = 'rt-rand' ORDER BY id");
    expect(b.result.rows).toEqual(a.result.rows);
  });

  it("открытая транзакция игрока восстанавливается открытой", async () => {
    await replica.openCase(RUNTIME_CASE, { ...SAVE, journal });
    const rollback = await replica.run("ROLLBACK");
    expect(rollback.result.error).toBeNull();
    const half = await replica.run("SELECT COUNT(*) FROM statements WHERE case_id = 'rt-half'");
    expect(half.result.rows).toEqual([[1]]);
  });

  it("без одной записи контрольная сумма другая", async () => {
    const index = journal.findIndex((e) => e.kind === "patch");
    const broken = journal.filter((_, i) => i !== index);
    await replica.openCase(RUNTIME_CASE, { ...SAVE, journal: broken });
    expect(await replica.checksum()).not.toBe(checksum);
  });

  it("история query_log прошлых дел ложится в базу до журнала", async () => {
    const history = journal.flatMap((e) => (e.kind === "query" && e.log ? [e.log] : []));
    // Горизонт query_log.logged_at: строки истории видны, когда до них дошли часы
    const early = await replica.openCase(RUNTIME_CASE, { ...SAVE, queryLog: history });
    expect(early.clock).toBe("2026-12-24 09:00:00");
    const hidden = await replica.run("SELECT COUNT(*) FROM query_log WHERE login = 'nol' AND case_id = 'case-90-runtime'");
    expect(Number(hidden.result.rows[0][0])).toBeLessThan(history.length);
    await replica.openCase(RUNTIME_CASE, { ...SAVE, queryLog: history, startClock: "2026-12-24 12:00" });
    const ev = await replica.run("SELECT COUNT(*) FROM query_log WHERE login = 'nol' AND case_id = 'case-90-runtime'");
    expect(ev.result.rows).toEqual([[history.length]]);
  });

  it("откат дела: без записей игрока, часы и патчи на месте", () => {
    const reset = withoutPlayerWrites(journal);
    expect(reset.some((e) => e.kind === "query" && "sql" in e)).toBe(false);
    expect(reset.filter((e) => e.kind === "patch")).toHaveLength(1);
    expect(reset.filter((e) => e.kind === "query").length).toBe(journal.filter((e) => e.kind === "query").length);
  });

  it("appendJournal схлопывает только соседние переводы часов", () => {
    const j: JournalEntry[] = [];
    appendJournal(j, { kind: "clock", clock: "2026-12-24 10:00:00" });
    appendJournal(j, { kind: "clock", clock: "2026-12-24 10:05:00" });
    appendJournal(j, { kind: "patch", id: "c07.admission" });
    appendJournal(j, { kind: "clock", clock: "2026-12-24 10:10:00" });
    expect(j).toEqual([
      { kind: "clock", clock: "2026-12-24 10:05:00" },
      { kind: "patch", id: "c07.admission" },
      { kind: "clock", clock: "2026-12-24 10:10:00" },
    ]);
  });
});
