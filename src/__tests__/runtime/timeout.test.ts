/**
 * Таймаут запроса в режиме worker (разд. 6.14, п. 1) на поддельном воркере:
 * зависший запрос обрывается, воркер убивается, новый поднимается из кеша
 * байтов, журнал воспроизводится, и run() возвращает ошибку 'timeout'
 * с объяснением по-русски. База после восстановления совпадает с исходной.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createEngineClient, type EngineClient, type EngineStatus, type JournalEntry } from "@/engine";
import { stoppedResult } from "@/engine/runtime/session";
import { RUNTIME_CASE, RUNTIME_SECRETS, FakeWorker } from "./fixture";

const SAVE = { playerName: "Ноль" } as const;
const TIMEOUT_MS = 250;

describe("EngineClient worker: таймаут и восстановление", () => {
  const workers: FakeWorker[] = [];
  const statuses: EngineStatus[] = [];
  let client: EngineClient;
  let reference: EngineClient;
  const completed: string[] = [];

  beforeAll(async () => {
    client = createEngineClient({
      workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      timeoutMs: TIMEOUT_MS,
      secrets: RUNTIME_SECRETS,
      onStatus: (s) => statuses.push(s),
    });
    reference = createEngineClient({ mode: "in-process", secrets: RUNTIME_SECRETS });
    await client.init();
    await reference.init();
    await client.openCase(RUNTIME_CASE, SAVE);
    for (const sql of [
      RUNTIME_CASE.objectives[0].solution,
      RUNTIME_CASE.objectives[1].solution,
      "INSERT INTO statements (case_id, text) VALUES ('rt-rand', abs(random()))",
      "SELECT * FROM bank_statements",
    ]) {
      const ev = await client.run(sql, { completed });
      completed.push(...ev.progress.completed.map((c) => c.objectiveId));
    }
    await client.applyPatch("c07.admission", { at: "2026-12-24 09:00:30" });
  }, 30_000);

  it("режим worker, ответы идут через сообщения", () => {
    expect(client.mode).toBe("worker");
    expect(workers).toHaveLength(1);
    expect(workers[0].received.map((m) => m.op)).toEqual(["init", "open", "run", "run", "run", "run", "patch"]);
    expect(completed).toEqual(["o1", "o2"]);
  });

  it("зависший запрос: воркер убит, новый восстановлен по журналу, ошибка timeout по-русски", async () => {
    const journalBefore: JournalEntry[] = [...client.getJournal()];
    const clockBefore = journalBefore.filter((e) => e.kind === "query").at(-1);
    const sql = "WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM t) SELECT COUNT(*) FROM t /* HANG */";

    const t0 = performance.now();
    const ev = await client.run(sql, { completed });
    const elapsed = performance.now() - t0;

    expect(ev.result.errorKind).toBe("timeout");
    expect(ev.result.error).toBe("Запрос шёл дольше 0,3 секунды и был остановлен.");
    expect(ev.result.errorHelp?.title).toBe("Запрос остановлен");
    expect(ev.result.errorHelp?.explanation).toMatch(/рекурсию без предела/);
    expect(ev.result.errorHelp?.suggestion).toMatch(/Ограничь глубину/);
    expect(ev.result.executionTimeMs).toBeGreaterThanOrEqual(TIMEOUT_MS - 5);
    expect(ev.recovery).toMatchObject({ reason: "timeout", replayed: journalBefore.length });
    expect(ev.recovery!.ms).toBeLessThan(2000);
    expect(elapsed).toBeLessThan(TIMEOUT_MS + 2000);

    // Остановленный запрос — выполненный с ошибкой: часы идут, строка журнала со статусом error
    expect(ev.clockMoved).toBe(true);
    expect(ev.logEntry).toMatchObject({ ok: false, sql });
    expect(ev.progress.completed).toEqual([]);
    expect(clockBefore?.kind === "query" && clockBefore.clock).toBe("2026-12-24 09:03:00");
    expect(ev.clock).toBe("2026-12-24 09:04:00");

    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    expect(statuses).toEqual(["loading", "ready", "recovering", "ready"]);
    const replay = workers[1].received;
    expect(replay.map((m) => m.op)).toEqual(["init", "open", "stopped"]);
    const open = replay[1];
    expect(open.op === "open" && open.state.journal).toEqual(journalBefore);

    // Журнал клиента: прежний + одна строка про остановленный запрос
    expect(client.getJournal()).toEqual([...journalBefore, expect.objectContaining({ kind: "query", log: expect.objectContaining({ ok: false }) })]);
  });

  it("база в новом воркере совпадает с воспроизведением журнала (контрольная сумма)", async () => {
    await reference.openCase(RUNTIME_CASE, { ...SAVE, journal: client.getJournal() });
    expect(await client.checksum()).toBe(await reference.checksum());
  });

  it("после восстановления: записи игрока, патч и строка зависшего запроса на месте", async () => {
    const ev = await client.run(
      "SELECT (SELECT COUNT(*) FROM statements WHERE case_id IN ('rt-01', 'rt-rand')), (SELECT COUNT(*) FROM hospital_admissions WHERE id = 601), (SELECT status FROM query_log WHERE query_text LIKE 'WITH RECURSIVE t(n)%')",
      { completed }
    );
    expect(ev.result.rows).toEqual([[2, 1, "error"]]);
    expect(workers).toHaveLength(2);
  });

  it("падение воркера (onerror) тоже восстанавливается, ошибка про память", async () => {
    const before = client.getJournal().length;
    const ev = await client.run("SELECT * FROM persons a, persons b, persons c /* CRASH */", { completed });
    expect(ev.result.errorKind).toBe("timeout");
    expect(ev.result.error).toBe("Запросу не хватило памяти, и он был остановлен.");
    expect(ev.result.errorHelp?.explanation).toMatch(/JOIN без условия/);
    expect(ev.recovery?.reason).toBe("crash");
    expect(ev.lint.map((w) => w.rule)).toContain("missing_join");
    expect(workers).toHaveLength(3);
    expect(client.getJournal().length).toBe(before + 1);
    await reference.openCase(RUNTIME_CASE, { ...SAVE, journal: client.getJournal() });
    expect(await client.checksum()).toBe(await reference.checksum());
  });

  it("текст по умолчанию: «Запрос шёл дольше 3 секунд…»", () => {
    const r = stoppedResult("SELECT * FROM a, b", "timeout", 3004, 3000);
    expect(r.error).toBe("Запрос шёл дольше 3 секунд и был остановлен.");
    expect(r.errorHelp?.explanation).toMatch(/JOIN без условия/);
    expect(r.errorHelp?.explanation).toMatch(/Архив восстановлен/);
    expect(stoppedResult("x", "timeout", 1000, 1000).error).toBe("Запрос шёл дольше 1 секунды и был остановлен.");
  });
});
