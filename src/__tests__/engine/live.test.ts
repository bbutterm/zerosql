/**
 * Живое время дела (GAME_DESIGN, разд. 6.10): часы по запросам, потолок,
 * остановки, события по счётчику запросов, по часам и по сюжету.
 */
import { describe, it, expect } from "vitest";
import {
  applyClockTo,
  caseClock,
  dueEvents,
  flagsMatch,
  movesClock,
  nextQueryClock,
  triggerMet,
  DEFAULT_MINUTES_PER_QUERY,
  type CaseProgressSnapshot,
  type LiveEventState,
} from "@/engine/live";
import { advanceClock, compareClock, formatClock, parseClock, toGameTime } from "@/engine/clock";
import type { CaseDef, LiveEventDef } from "@/types/case";
import type { QueryResult } from "@/types/database";

const none: CaseProgressSnapshot = { completed: new Set() };

describe("часы с секундами", () => {
  it("parseClock понимает секунды", () => {
    expect(parseClock("2026-12-15 03:12:30")?.toISOString()).toBe("2026-12-15T03:12:30.000Z");
    expect(parseClock("2026-12-15 03:12:60")).toBeNull();
  });

  it("advanceClock сохраняет точность строки", () => {
    expect(advanceClock("2026-12-15 03:12:30", 1)).toBe("2026-12-15 03:13:30");
    expect(advanceClock("2026-12-15 03:12", 1)).toBe("2026-12-15 03:13");
  });

  it("toGameTime и formatClock(…, true)", () => {
    expect(toGameTime("2026-12-02 18:05")).toBe("2026-12-02 18:05:00");
    expect(formatClock(parseClock("2026-12-02 18:05:07") as Date, true)).toBe("2026-12-02 18:05:07");
  });

  it("compareClock", () => {
    expect(compareClock("2026-12-02 18:05", "2026-12-02 18:05:00")).toBe(0);
    expect(compareClock("2026-12-02 18:05:01", "2026-12-02 18:05")).toBeGreaterThan(0);
  });
});

describe("flagsMatch / triggerMet", () => {
  it("отсутствующий флаг равен false и null", () => {
    expect(flagsMatch({ tokha_turned: false }, {})).toBe(true);
    expect(flagsMatch({ melnik: null }, {})).toBe(true);
    expect(flagsMatch({ melnik: [null, "blackmail"] }, { melnik: "blackmail" })).toBe(true);
    expect(flagsMatch({ melnik: [null, "blackmail"] }, { melnik: "reported" })).toBe(false);
    expect(flagsMatch({ dasha_trust: 2 }, { dasha_trust: 2 })).toBe(true);
    expect(flagsMatch(undefined, {})).toBe(true);
  });

  it("триггеры: задача, конец сцены, пробои допроса, флаг", () => {
    const s: CaseProgressSnapshot = {
      completed: new Set(["o5_1"]),
      endedScenes: new Set(["office"]),
      breaks: { int_burtsev: 2 },
      flags: { watcher_tripped: true, melnik: "blackmail" },
    };
    expect(triggerMet({ objective: "o5_1" }, s)).toBe(true);
    expect(triggerMet({ objective: "o5_2" }, s)).toBe(false);
    expect(triggerMet({ scene: "office" }, s)).toBe(true);
    expect(triggerMet({ interrogation: "int_burtsev", breaks: 2 }, s)).toBe(true);
    expect(triggerMet({ interrogation: "int_burtsev", breaks: 3 }, s)).toBe(false);
    expect(triggerMet({ interrogation: "int_burtsev" }, s)).toBe(true);
    expect(triggerMet({ flag: "watcher_tripped" }, s)).toBe(true);
    expect(triggerMet({ flag: "melnik", value: "reported" }, s)).toBe(false);
    expect(triggerMet({ flag: "tokha_turned", value: false }, s)).toBe(true);
    expect(triggerMet({ objective: "o5_1", scene: "corridor" }, s)).toBe(false);
  });
});

type ClockCase = Pick<CaseDef, "date" | "minutesPerQuery" | "clock">;

describe("caseClock / nextQueryClock", () => {
  const prologue: ClockCase = { date: "2026-12-02 18:05", clock: { cap: "2026-12-02 18:35" } };

  it("значения по умолчанию: 1 минута за запрос, старт — date", () => {
    expect(caseClock({ date: "2026-12-02 18:05" })).toEqual({
      start: "2026-12-02 18:05:00",
      minutesPerQuery: DEFAULT_MINUTES_PER_QUERY,
      holds: [],
    });
    expect(caseClock({ date: "2026-12-02 18:05", clock: { start: "2026-12-02 18:10" }, minutesPerQuery: 3 }).start).toBe("2026-12-02 18:10:00");
  });

  it("шаг и потолок: дойдя до потолка, часы встают", () => {
    expect(nextQueryClock(prologue, "2026-12-02 18:05", none)).toBe("2026-12-02 18:06:00");
    expect(nextQueryClock(prologue, "2026-12-02 18:34:00", none)).toBe("2026-12-02 18:35:00");
    expect(nextQueryClock(prologue, "2026-12-02 18:35:00", none)).toBe("2026-12-02 18:35:00");
  });

  it("И: 0 минут за запрос — время двигают только сцены", () => {
    expect(nextQueryClock({ date: "2026-12-31 23:00", minutesPerQuery: 0 }, "2026-12-31 23:40:00", none)).toBe("2026-12-31 23:40:00");
  });

  it("Д11: 3 минуты за запрос", () => {
    expect(nextQueryClock({ date: "2027-01-11 11:30", minutesPerQuery: 3 }, "2027-01-11 12:11:00", none)).toBe("2027-01-11 12:14:00");
  });

  describe("Д5: стоит на 03:11, пока не засчитана 5.1; первый запрос после — 03:12:30", () => {
    const c05: ClockCase = {
      date: "2026-12-15 02:40",
      clock: {
        cap: "2026-12-15 06:00",
        holds: [{ at: "2026-12-15 03:11", until: { objective: "o5_1" }, resumeAt: "2026-12-15 03:12:30" }],
      },
    };

    it("часы доходят до 03:11 и стоят", () => {
      expect(nextQueryClock(c05, "2026-12-15 03:10:00", none)).toBe("2026-12-15 03:11:00");
      expect(nextQueryClock(c05, "2026-12-15 03:11:00", none)).toBe("2026-12-15 03:11:00");
    });

    it("после 5.1 — сразу 03:12:30, дальше по минуте", () => {
      const done = { completed: new Set(["o5_1"]) };
      expect(nextQueryClock(c05, "2026-12-15 03:11:00", done)).toBe("2026-12-15 03:12:30");
      expect(nextQueryClock(c05, "2026-12-15 03:12:30", done)).toBe("2026-12-15 03:13:30");
    });

    it("5.1 засчитана раньше 03:11 — остановки нет, прыжка нет", () => {
      const done = { completed: new Set(["o5_1"]) };
      expect(nextQueryClock(c05, "2026-12-15 02:50:00", done)).toBe("2026-12-15 02:51:00");
      expect(nextQueryClock(c05, "2026-12-15 03:10:00", done)).toBe("2026-12-15 03:11:00");
    });
  });

  it("остановки «Без таймера» действуют только в этом режиме", () => {
    const c12: ClockCase = {
      date: "2027-01-11 11:30",
      minutesPerQuery: 3,
      clock: { cap: "2027-01-11 13:00", holds: [{ at: "2027-01-11 12:19:59", until: { flag: "ready_1" }, noTimerOnly: true }] },
    };
    expect(nextQueryClock(c12, "2027-01-11 12:17:00", none)).toBe("2027-01-11 12:20:00");
    expect(nextQueryClock(c12, "2027-01-11 12:17:00", { ...none, noTimer: true })).toBe("2027-01-11 12:19:59");
    expect(nextQueryClock(c12, "2027-01-11 12:19:59", { completed: new Set(), noTimer: true, flags: { ready_1: true } })).toBe("2027-01-11 12:22:59");
  });
});

describe("movesClock", () => {
  const ok: QueryResult = { columns: ["x"], rows: [], rowCount: 0, executionTimeMs: 0, error: null };
  const err = (error: string, errorKind: QueryResult["errorKind"] = "sql"): QueryResult => ({ ...ok, columns: [], error, errorKind });

  it("выполненный запрос — двигает, даже с пустым результатом", () => {
    expect(movesClock("SELECT * FROM persons WHERE 0", ok)).toBe(true);
  });

  it("ошибка выполнения — двигает", () => {
    expect(movesClock("INSERT INTO statements VALUES (1)", err("UNIQUE constraint failed: statements.id"))).toBe(true);
  });

  it("синтаксис и компиляция — не двигают", () => {
    expect(movesClock("SELEC 1", err('near "SELEC": syntax error'))).toBe(false);
    expect(movesClock("SELECT nmae FROM persons", err("no such column: nmae"))).toBe(false);
    expect(movesClock("SELECT * FROM stafff", err("no such table: stafff"))).toBe(false);
  });

  it("транзакции, PRAGMA, отказы guard и пустой ввод — не двигают", () => {
    expect(movesClock("BEGIN", ok)).toBe(false);
    expect(movesClock("COMMIT; ", ok)).toBe(false);
    expect(movesClock("PRAGMA table_info(persons)", ok)).toBe(false);
    expect(movesClock("SELECT * FROM bank_statements", err("[ДОСТУП ЗАПРЕЩЁН]", "locked_table"))).toBe(false);
    expect(movesClock("DELETE FROM persons", err("[ТОЛЬКО ЧТЕНИЕ]", "read_only"))).toBe(false);
    expect(movesClock("SELECT * FROM main.persons", err("[ЗАПРЕЩЕНО]", "forbidden"))).toBe(false);
    expect(movesClock("  -- просто комментарий", ok)).toBe(false);
  });

  it("BEGIN вместе с DML — двигает", () => {
    expect(movesClock("BEGIN; UPDATE persons SET x = 1; COMMIT", ok)).toBe(true);
  });
});

describe("dueEvents", () => {
  const events: LiveEventDef[] = [
    { id: "zero_row", atTime: "2026-12-15 03:12:00", patch: "zero_cron_row" },
    { id: "rat_call", after: { interrogation: "int_burtsev", breaks: 2 }, scene: "rat_call" },
    { id: "feed_3", atQuery: 3, line: "sys.feed.001" },
    { id: "delete_blackmail", atTime: "2027-01-11 12:32", when: { melnik: "blackmail" }, patch: "drop_stage_1" },
    { id: "cleanup", after: { objective: "o10_1" }, clockTo: "2026-12-31 10:30", patch: "siyanie_cleanup" },
  ];
  const caseDef = { events };
  const state = (patch: Partial<LiveEventState> = {}): LiveEventState => ({
    completed: new Set(),
    queryCount: 0,
    now: "2026-12-15 02:40:00",
    fired: new Set(),
    ...patch,
  });

  it("ничего не наступило", () => {
    expect(dueEvents(caseDef, state())).toEqual([]);
  });

  it("по часам, по счётчику запросов, по пробоям, по задаче", () => {
    expect(dueEvents(caseDef, state({ now: "2026-12-15 03:12:30" })).map((e) => e.id)).toEqual(["zero_row"]);
    expect(dueEvents(caseDef, state({ queryCount: 3 })).map((e) => e.id)).toEqual(["feed_3"]);
    expect(dueEvents(caseDef, state({ breaks: { int_burtsev: 2 } })).map((e) => e.id)).toEqual(["rat_call"]);
    expect(dueEvents(caseDef, state({ completed: new Set(["o10_1"]) })).map((e) => e.id)).toEqual(["cleanup"]);
  });

  it("условие на флаги и однократность", () => {
    const late = state({ now: "2027-01-11 12:40:00" });
    expect(dueEvents(caseDef, late).map((e) => e.id)).toEqual(["zero_row"]);
    expect(dueEvents(caseDef, { ...late, flags: { melnik: "blackmail" } }).map((e) => e.id)).toEqual(["zero_row", "delete_blackmail"]);
    expect(dueEvents(caseDef, { ...late, fired: new Set(["zero_row"]) })).toEqual([]);
  });

  it("событие без триггера не срабатывает; дело без событий — пусто", () => {
    expect(dueEvents({ events: [{ id: "x", scene: "s" }] }, state({ queryCount: 99 }))).toEqual([]);
    expect(dueEvents({}, state())).toEqual([]);
  });

  it("applyClockTo: только вперёд", () => {
    expect(applyClockTo("2026-12-31 09:40", events[4])).toBe("2026-12-31 10:30:00");
    expect(applyClockTo("2026-12-31 10:45:10", events[4])).toBe("2026-12-31 10:45:10");
    expect(applyClockTo("2026-12-31 09:40", { })).toBe("2026-12-31 09:40:00");
  });
});
