import type { QueryResult } from "@/types/database";
import type { CaseDef, ClockHold, EventTrigger, FlagCondition, FlagValue, LiveEventDef } from "@/types/case";
import { compareClock, parseClock, toGameTime, formatClock } from "./clock";
import { analyzeSql } from "./table-guard";

/**
 * Живое время дела (GAME_DESIGN, разд. 6.10): часы идут по запросам, а не по
 * таймеру, поэтому события детерминированы и тестируемы.
 *
 * Часы двигает каждый выполненный запрос игрока (в том числе с пустым
 * результатом или ошибкой выполнения) на minutesPerQuery. Не двигают:
 * BEGIN / COMMIT / ROLLBACK, PRAGMA, синтаксические ошибки и ошибки
 * компиляции (нет такой таблицы/столбца), отказы guard. Дойдя до потолка,
 * часы встают. Остановки (holds) держат часы, пока не выполнен триггер.
 */

/** Минут за запрос по умолчанию (разд. 6.10: 1 во всех делах, кроме И и Д11) */
export const DEFAULT_MINUTES_PER_QUERY = 1;

// --- Флаги ---

const flagEquals = (actual: FlagValue | undefined, expected: FlagValue | null): boolean => {
  if (expected === null || expected === false) return actual === undefined || actual === false;
  return actual === expected;
};

/**
 * Выполняется ли условие на флаги: все пары; отсутствующий флаг равен false
 * и null; массив — любое из значений. Пустое или отсутствующее условие — true.
 */
export function flagsMatch(condition: FlagCondition | undefined, flags: Readonly<Record<string, FlagValue>> = {}): boolean {
  if (!condition) return true;
  return Object.entries(condition).every(([name, expected]) => {
    const actual = flags[name];
    return Array.isArray(expected) ? expected.some((e) => flagEquals(actual, e)) : flagEquals(actual, expected);
  });
}

// --- Триггеры ---

/** Что уже произошло в деле — для триггеров событий и остановок часов */
export interface CaseProgressSnapshot {
  /** Засчитанные задачи */
  completed: ReadonlySet<string>;
  /** Доигранные до конца сцены (scene_end) */
  endedScenes?: ReadonlySet<string>;
  /** Пробои по сценам допросов: id сцены → число пробоев */
  breaks?: Readonly<Record<string, number>>;
  flags?: Readonly<Record<string, FlagValue>>;
  /** Режим доступности «Без таймера» */
  noTimer?: boolean;
}

/** Выполнен ли сюжетный триггер (все заданные поля) */
export function triggerMet(trigger: EventTrigger, s: CaseProgressSnapshot): boolean {
  if (trigger.objective !== undefined && !s.completed.has(trigger.objective)) return false;
  if (trigger.scene !== undefined && !s.endedScenes?.has(trigger.scene)) return false;
  if (trigger.interrogation !== undefined && (s.breaks?.[trigger.interrogation] ?? 0) < (trigger.breaks ?? 1)) return false;
  if (trigger.flag !== undefined) {
    const actual = s.flags?.[trigger.flag];
    if (trigger.value === undefined ? !actual : !flagEquals(actual, trigger.value)) return false;
  }
  return true;
}

// --- Часы дела ---

export interface ResolvedClock {
  /** 'YYYY-MM-DD HH:MM:SS' */
  start: string;
  minutesPerQuery: number;
  cap?: string;
  holds: ClockHold[];
}

/** Часы дела с подставленными значениями по умолчанию; моменты — с секундами */
export function caseClock(caseDef: Pick<CaseDef, "date" | "minutesPerQuery" | "clock">): ResolvedClock {
  const mpq = caseDef.minutesPerQuery;
  return {
    start: toGameTime(caseDef.clock?.start ?? caseDef.date),
    minutesPerQuery: mpq !== undefined && Number.isFinite(mpq) && mpq >= 0 ? mpq : DEFAULT_MINUTES_PER_QUERY,
    ...(caseDef.clock?.cap ? { cap: toGameTime(caseDef.clock.cap) } : {}),
    holds: caseDef.clock?.holds ?? [],
  };
}

const ms = (value: string) => (parseClock(value) as Date).getTime();

/**
 * Время, которое покажут часы после следующего запроса, двигающего часы.
 * now — текущее время ('YYYY-MM-DD HH:MM[:SS]'). Учитывает остановки и
 * потолок; назад часы не идут. Ответ — 'YYYY-MM-DD HH:MM:SS'.
 */
export function nextQueryClock(
  caseDef: Pick<CaseDef, "date" | "minutesPerQuery" | "clock">,
  now: string,
  s: CaseProgressSnapshot
): string {
  const clock = caseClock(caseDef);
  const nowMs = ms(toGameTime(now));
  let t = nowMs + Math.round(clock.minutesPerQuery * 60) * 1000;

  for (const hold of clock.holds) {
    if (hold.noTimerOnly && !s.noTimer) continue;
    const at = ms(toGameTime(hold.at));
    if (!triggerMet(hold.until, s)) {
      if (nowMs <= at && t > at) t = at;
    } else if (hold.resumeAt) {
      const resume = ms(toGameTime(hold.resumeAt));
      // Часы стояли на остановке — первый запрос после триггера сразу на resumeAt
      if (nowMs >= at && nowMs < resume) t = Math.max(t, resume);
    }
  }

  if (clock.cap !== undefined) t = Math.min(t, Math.max(nowMs, ms(clock.cap)));
  return formatClock(new Date(Math.max(t, nowMs)), true);
}

/** Ошибки компиляции SQLite: запрос не выполнялся, часы не двигаются */
const COMPILE_ERROR_RE =
  /syntax error|incomplete input|unrecognized token|no such (table|column|function|collation|module)|ambiguous column|misuse of (aggregate|window)|wrong number of arguments|term out of range|same number of result columns|circular reference|recursive reference|no tables specified|is not a function|not authorized/i;

/**
 * Двигает ли запрос часы (разд. 6.10). Выполненный запрос — да, даже с пустым
 * результатом или ошибкой выполнения (нарушение UNIQUE, запись в представление).
 * Нет — пустой ввод, только BEGIN/COMMIT/ROLLBACK/PRAGMA, синтаксические ошибки
 * и ошибки компиляции, отказы guard.
 */
export function movesClock(sql: string, result: QueryResult): boolean {
  if (result.errorKind === "locked_table" || result.errorKind === "read_only" || result.errorKind === "forbidden") {
    return false;
  }
  const statements = analyzeSql(sql).statements;
  if (statements.length === 0) return false;
  if (statements.every((st) => st.action === "transaction" || st.action === "pragma")) return false;
  if (result.error && COMPILE_ERROR_RE.test(result.error)) return false;
  return true;
}

// --- События ---

export interface LiveEventState extends CaseProgressSnapshot {
  /** Сколько запросов, двигающих часы, сделано в деле */
  queryCount: number;
  /** Текущее время часов */
  now: string;
  /** Уже сработавшие события */
  fired: ReadonlySet<string>;
}

/** Событие готово сработать: ещё не срабатывало, условие на флаги выполнено, триггер наступил */
export function eventDue(event: LiveEventDef, state: LiveEventState): boolean {
  if (state.fired.has(event.id)) return false;
  if (!flagsMatch(event.when, state.flags)) return false;
  if (event.atQuery !== undefined) return state.queryCount >= event.atQuery;
  if (event.atTime !== undefined) return compareClock(state.now, event.atTime) >= 0;
  if (event.after !== undefined) return triggerMet(event.after, state);
  return false;
}

/**
 * События дела, которые должны сработать сейчас, в порядке объявления.
 * Стор применяет эффекты (сцена, патч мира, реплика, clockTo) и помечает
 * событие сработавшим.
 */
export function dueEvents(caseDef: Pick<CaseDef, "events">, state: LiveEventState): LiveEventDef[] {
  return (caseDef.events ?? []).filter((e) => eventDue(e, state));
}

/** Часы после события с clockTo: переводятся вперёд, если показывали меньше */
export function applyClockTo(now: string, event: Pick<LiveEventDef, "clockTo">): string {
  const current = toGameTime(now);
  if (!event.clockTo) return current;
  const target = toGameTime(event.clockTo);
  return compareClock(target, current) > 0 ? target : current;
}
