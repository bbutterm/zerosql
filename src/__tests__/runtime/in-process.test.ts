/**
 * EngineClient без воркера (тесты, старые браузеры): весь путь запроса на
 * настоящем мире — политика, часы, задачи, реестр, тайники, линтер,
 * query_log, запись игрока, представления, патчи, часы, откат дела.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createEngineClient, type EngineClient, type EngineProgress } from "@/engine";
import { getCase } from "@/data";
import { RUNTIME_CASE, RUNTIME_SECRETS } from "./fixture";

const VALTS = "SELECT id, full_name FROM persons WHERE last_name = 'Вальц' ORDER BY id";

describe("EngineClient in-process: фикстура на настоящем мире", () => {
  let client: EngineClient;
  const progress: EngineProgress[] = [];
  const statuses: string[] = [];
  const completed: string[] = [];
  const found: string[] = [];

  beforeAll(async () => {
    client = createEngineClient({ mode: "in-process", secrets: RUNTIME_SECRETS, onStatus: (s) => statuses.push(s) });
    const info = await client.init((p) => progress.push(p));
    expect(info.key).toMatch(/^world:\d+:POLYNYA-S1$/);
    expect(info.bytes).toBeGreaterThan(1_000_000);
  }, 30_000);

  const run = async (sql: string) => {
    const ev = await client.run(sql, { completed, foundSecrets: found, runId: "run-1" });
    for (const c of ev.progress.completed) completed.push(c.objectiveId);
    found.push(...ev.secrets);
    return ev;
  };

  it("режим in-process, загрузка с этапами и строками голосом системы", () => {
    expect(client.mode).toBe("in-process");
    expect(statuses).toEqual(["loading", "ready"]);
    const stages = progress.map((p) => p.stage);
    expect(stages[0]).toBe("engine");
    expect(stages).toContain("cache");
    expect(stages[stages.length - 1]).toBe("ready");
    expect(progress.every((p) => p.text.endsWith("."))).toBe(true);
  });

  it("openCase: база дела на часах старта, схема мира, игрок в ПБД", async () => {
    const opened = await client.openCase(RUNTIME_CASE, { playerName: "Ноль" });
    expect(opened.caseId).toBe("case-90-runtime");
    expect(opened.clock).toBe("2026-12-24 09:00:00");
    expect(opened.replayed).toBe(0);
    expect(opened.schema.map((t) => t.name)).toEqual(expect.arrayContaining(["persons", "statements", "query_log"]));
    expect(opened.foreignKeys.length).toBeGreaterThan(0);
    expect(client.getJournal()).toEqual([]);
  });

  it("задача, реестр увиденного, варианты протокола, часы, строка журнала", async () => {
    const ev = await run(VALTS);
    expect(ev.result.error).toBeNull();
    expect(ev.result.rows).toEqual([
      [1389, "Вальц Валентина Сергеевна"],
      [4127, "Вальц Ирина Петровна"],
    ]);
    expect(ev.progress.completed.map((c) => c.objectiveId)).toEqual(["o1"]);
    expect(ev.progress.completed[0].evidence?.id).toBe("ev.c90.valts");
    expect(ev.seen).toEqual(expect.arrayContaining(["4127", "Вальц Ирина Петровна", "2"]));
    expect(ev.seenOptions).toEqual(["Вальц Ирина Петровна", "Вальц Валентина Сергеевна"]);
    expect(ev.clock).toBe("2026-12-24 09:01:00");
    expect(ev.clockMoved).toBe(true);
    expect(ev.wrote).toBe(false);
    expect(ev.lint).toEqual([]);
    expect(ev.logEntry).toMatchObject({
      loggedAt: "2026-12-24 09:01:00",
      login: "nol",
      terminal: "WS-03",
      ok: true,
      rowsReturned: 2,
      caseId: "case-90-runtime",
      objectiveId: "o1",
      runId: "run-1",
    });
    expect(typeof ev.logId).toBe("number");
  });

  it("обратная связь по текущей задаче на неверный ответ", async () => {
    const ev = await run("SELECT COUNT(*) FROM statements WHERE case_id = 'rt-01'");
    expect(ev.progress.completed).toEqual([]);
    expect(ev.progress.activeFeedback).toBe("Данные в базе пока не в нужном состоянии.");
  });

  it("закрытая таблица: отказ, часы стоят, журнал пишет denied, линтер молчит", async () => {
    const ev = await run("SELECT * FROM bank_statements WHERE amount = NULL");
    expect(ev.result.errorKind).toBe("locked_table");
    expect(ev.clockMoved).toBe(false);
    expect(ev.clock).toBe("2026-12-24 09:02:00");
    expect(ev.logEntry).toMatchObject({ ok: false, denied: true });
    expect(ev.lint).toEqual([]);
  });

  it("синтаксическая ошибка часы не двигает; объяснение по-русски", async () => {
    const ev = await run("SELEC full_name FROM persons");
    expect(ev.result.errorKind).toBe("sql");
    expect(ev.result.errorHelp?.explanation).toBeTruthy();
    expect(ev.clockMoved).toBe(false);
    expect(ev.logEntry).toMatchObject({ ok: false });
  });

  it("линтер: = NULL", async () => {
    const ev = await run("SELECT full_name FROM persons WHERE death_date = NULL");
    expect(ev.result.error).toBeNull();
    expect(ev.lint.map((w) => w.rule)).toContain("null_compare");
    expect(ev.clock).toBe("2026-12-24 09:03:00");
  });

  it("тайник срабатывает один раз", async () => {
    const first = await run("SELECT full_name FROM persons WHERE id = 1388");
    expect(first.secrets).toEqual(["secret.runtime"]);
    const again = await run("SELECT full_name FROM persons WHERE id = 1388");
    expect(again.secrets).toEqual([]);
  });

  it("запись игрока по белому списку: журнал хранит текст, game_now() — часы запроса", async () => {
    const ev = await run(RUNTIME_CASE.objectives[1].solution);
    expect(ev.result.error).toBeNull();
    expect(ev.wrote).toBe(true);
    expect(ev.progress.completed.map((c) => c.objectiveId)).toEqual(["o2"]);
    const last = client.getJournal().at(-1);
    expect(last).toMatchObject({ kind: "query", sql: RUNTIME_CASE.objectives[1].solution, clock: ev.clock });
    const check = await run("SELECT taken_at FROM statements WHERE case_id = 'rt-01'");
    expect(check.result.rows).toEqual([[ev.clock]]);
  });

  it("запись вне белого списка — ТОЛЬКО ЧТЕНИЕ, в журнал как запись не попадает", async () => {
    const ev = await run("DELETE FROM persons WHERE id = 4127");
    expect(ev.result.errorKind).toBe("read_only");
    expect(ev.wrote).toBe(false);
    expect(client.getJournal().at(-1)).not.toHaveProperty("sql");
  });

  it("своё представление: задача view_match, список представлений игрока", async () => {
    const ev = await run(RUNTIME_CASE.objectives[2].solution);
    expect(ev.result.error).toBeNull();
    expect(ev.playerViews).toEqual(["rt_valts"]);
    expect(ev.schemaChanged).toBe(true);
    expect(ev.progress.completed.map((c) => c.objectiveId)).toEqual(["o3"]);
    const read = await run("SELECT COUNT(*) FROM rt_valts");
    expect(read.result.rows).toEqual([[2]]);
  });

  it("дополнительная задача и патч p0.player (persons 9000 с именем игрока)", async () => {
    const ev = await run(RUNTIME_CASE.objectives[3].solution);
    expect(ev.result.rows).toEqual([[9000, "Ноль"]]);
    expect(ev.progress.completed).toEqual([expect.objectContaining({ objectiveId: "opt", optional: true })]);
  });

  it("query_log: строки игрока видны следующим запросам, текущей ещё нет", async () => {
    const ev = await run(
      "SELECT status, objective_id FROM query_log WHERE login = 'nol' AND case_id = 'case-90-runtime' ORDER BY id"
    );
    const rows = ev.result.rows;
    const logged = client.getJournal().filter((e) => e.kind === "query" && e.log).length - 1;
    expect(rows.length).toBe(logged);
    expect(rows[0]).toEqual(["ok", "o1"]);
    expect(rows.map((r) => r[0])).toEqual(expect.arrayContaining(["ok", "denied", "error"]));
    expect(rows.filter((r) => r[1] !== null).map((r) => r[1])).toEqual(["o1", "o2", "o3", "opt"]);
  });

  it("транзакция игрока откатывается перед сюжетным патчем", async () => {
    expect((await run("BEGIN")).result.error).toBeNull();
    await run("INSERT INTO statements (case_id, text) VALUES ('rt-tx', 'в транзакции')");
    const applied = await client.applyPatch("c07.admission", { at: "2026-12-24 09:00:30" });
    expect(applied.rolledBack).toBe(true);
    expect(applied.changes).toBe(1);
    const after = await run(
      "SELECT (SELECT COUNT(*) FROM statements WHERE case_id = 'rt-tx'), (SELECT admitted_at FROM hospital_admissions WHERE id = 601)"
    );
    expect(after.result.rows).toEqual([[0, "2026-12-24 09:00:30"]]);
    expect(client.getJournal().at(-2)).toMatchObject({ kind: "patch", id: "c07.admission" });
  });

  it("неизвестный патч — ошибка, журнал не меняется", async () => {
    const before = client.getJournal().length;
    await expect(client.applyPatch("no.such.patch")).rejects.toThrow(/Неизвестный сюжетный патч/);
    expect(client.getJournal().length).toBe(before);
  });

  it("setClock переводит часы; следующий запрос идёт от них", async () => {
    expect(await client.setClock("2026-12-24 11:00")).toBe("2026-12-24 11:00:00");
    const ev = await run("SELECT 1");
    expect(ev.clock).toBe("2026-12-24 11:01:00");
  });

  it("resetCase: записи игрока сняты, часы, патчи и query_log остались", async () => {
    const opened = await client.resetCase();
    expect(opened.clock).toBe("2026-12-24 11:01:00");
    expect(opened.playerViews).toEqual([]);
    expect(client.getJournal().some((e) => e.kind === "query" && e.sql !== undefined)).toBe(false);
    const ev = await run(
      "SELECT (SELECT COUNT(*) FROM statements WHERE case_id = 'rt-01'), (SELECT COUNT(*) FROM hospital_admissions WHERE id = 601), (SELECT COUNT(*) FROM query_log WHERE login = 'nol')"
    );
    expect(ev.result.rows[0][0]).toBe(0);
    expect(ev.result.rows[0][1]).toBe(1);
    expect(Number(ev.result.rows[0][2])).toBeGreaterThan(10);
    const view = await run("SELECT * FROM rt_valts");
    expect(view.result.errorKind).toBe("locked_table");
  });

  it("dispose: дальше ядро не работает", async () => {
    client.dispose();
    expect(client.status).toBe("disposed");
    await expect(client.run("SELECT 1")).rejects.toThrow();
  });
});

const c00 = getCase("case-00-nulevoy-etazh");

describe.skipIf(!c00 || c00.objectives.length === 0)("EngineClient in-process: эталоны case-00 по порядку", () => {
  it("каждый эталон засчитывает свою задачу; ответы протокола увидены", async () => {
    const def = c00!;
    const client = createEngineClient({ mode: "in-process" });
    await client.init();
    await client.openCase(def, { playerName: "Ноль" });
    const completed: string[] = [];
    const seenOptions = new Set<string>();
    const main = def.objectives.filter((o) => !o.optional).sort((a, b) => a.order - b.order);
    for (const objective of main) {
      const ev = await client.run(objective.solution, { completed });
      expect(ev.result.error, objective.id).toBeNull();
      const ids = ev.progress.completed.map((c) => c.objectiveId);
      expect(ids, objective.id).toContain(objective.id);
      completed.push(...ids);
      ev.seenOptions.forEach((o) => seenOptions.add(o));
    }
    for (const blank of def.protocol?.blanks ?? []) {
      if (blank.requireSeen === false) continue;
      expect(seenOptions.has(blank.answer), blank.id).toBe(true);
    }
    client.dispose();
  }, 60_000);
});
