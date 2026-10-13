/**
 * База дела в рантайме: открытие из байтов мира, воспроизведение журнала и
 * вся работа по одному запросу игрока. Один код у Web Worker и у
 * внутрипроцессной реализации EngineClient.
 *
 * Порядок работы по запросу (контракт фасада):
 *   политика (table-guard) → часы → выполнение → реестр увиденного (scanSeen,
 *   scanSeenOptions) → задачи (checkCaseProgress) → тайники (checkSecrets) →
 *   линтер (только для пропущенных guard'ом) → запись в query_log (последней:
 *   эталоны и тайники не видят строку текущего запроса).
 *
 * Детерминизм журнала: всё, что меняет базу, проходит через одни и те же
 * функции и при живом запросе, и при воспроизведении (часы, текст записи
 * игрока, строка журнала, патчи). random() подменён генератором с зерном,
 * записанным в журнал. Недетерминированными остаются только 'now' и
 * CURRENT_TIMESTAMP в DML игрока — в архиве время берут из game_now().
 */
import type { Database } from "sql.js";
import type { CaseDef, SecretDef, ValidationContext } from "@/types/case";
import type { ForeignKey, QueryResult, TableInfo } from "@/types/database";
import { executeQuery, getForeignKeys, getTableSchema } from "../database";
import { deniedResult, explainResultError, playerPolicy } from "../execute";
import { analyzeSql, checkSqlPolicy, viewChanges, type SqlPolicy, type StatementAction } from "../table-guard";
import { checkCaseProgress, type CaseProgress } from "../case-runner";
import { scanSeen, scanSeenOptions } from "../protocol";
import { checkSecrets } from "../secrets";
import { lintSql, type LintWarning } from "../sql-lint";
import { logPlayerQuery, queryLogStatus, QUERY_TEXT_MAX, type PlayerQueryEntry } from "../query-log";
import { caseClock, movesClock, nextQueryClock, type CaseProgressSnapshot } from "../live";
import { openCaseDatabase, type PatchRequest } from "../world/generate";
import {
  applyStoryPatch,
  createHorizonViews,
  dropHorizonView,
  getGameClock,
  horizonViews,
  normalizeClock,
  setGameClock,
  STORY_PATCHES,
  type StoryPatchParams,
  type StoryPatchResult,
} from "../world/horizon";
import { LOGIN, WORKSTATION } from "../world/facts";
import { Rng } from "../world/rng";
import { databaseChecksum, inTransaction } from "./checksum";
import { appendJournal } from "./journal";
import type { CaseSaveState, Evaluation, JournalEntry, PatchApplied, RunContext } from "./types";

/** Ошибка, после которой экземпляр sql.js непригоден: воркер нужно пересоздать */
export class FatalEngineError extends Error {
  readonly fatal = true;
}

/** Сообщения ловушек wasm: после них база в памяти может быть испорчена */
const WASM_TRAP_RE = /^Aborted|RuntimeError|memory access out of bounds|unreachable executed|table index is out of bounds/i;

export function isFatalError(error: unknown): boolean {
  if (error instanceof FatalEngineError) return true;
  const wasm = (globalThis as { WebAssembly?: { RuntimeError?: new () => Error } }).WebAssembly;
  if (wasm?.RuntimeError && error instanceof wasm.RuntimeError) return true;
  return WASM_TRAP_RE.test(error instanceof Error ? error.message : String(error));
}

/** Выражения, которые могут изменить базу: такие запросы пишутся в журнал целиком */
const WRITE_ACTIONS: ReadonlySet<StatementAction> = new Set([
  "insert", "update", "delete", "create_view", "drop_view", "ddl", "transaction",
]);

/**
 * write — в запросе есть запись (DML, транзакция, DDL); unknown — выражение,
 * которого guard не знает: если SQLite его всё же выполнил без ошибки,
 * запрос тоже пишется в журнал (на всякий случай).
 */
function writeKind(sql: string): { write: boolean; unknown: boolean } {
  const statements = analyzeSql(sql).statements;
  return {
    write: statements.some((st) => WRITE_ACTIONS.has(st.action)),
    unknown: statements.some((st) => st.action === "other"),
  };
}

/** Текст строки журнала так же, как его обрежет logPlayerQuery: журнал не раздувается */
function capLogText(sql: string): string {
  const text = sql.trim();
  return text.length <= QUERY_TEXT_MAX ? text : Array.from(text).slice(0, QUERY_TEXT_MAX).join("");
}

/** Патчи старта: p0.player первым (мир в кеше чистый), затем переданные */
function startPatches(state: CaseSaveState): PatchRequest[] {
  const patches = [...(state.patches ?? [])];
  const has = patches.some((p) => (typeof p === "string" ? p : p.id) === "p0.player");
  if (!has) patches.unshift({ id: "p0.player", params: state.playerName ? { playerName: state.playerName } : {} });
  return patches;
}

function snapshot(ctx: RunContext): CaseProgressSnapshot {
  return {
    completed: new Set(ctx.completed ?? []),
    endedScenes: new Set(ctx.endedScenes ?? []),
    breaks: ctx.breaks ?? {},
    flags: ctx.flags ?? {},
    noTimer: ctx.noTimer === true,
  };
}

const EMPTY_PROGRESS: CaseProgress = { completed: [], activeFeedback: null };

/** «3 секунд», «1 секунды», «0,5 секунды» — после «дольше» */
function secondsGenitive(ms: number): string {
  const s = Math.round(ms / 100) / 10;
  if (!Number.isInteger(s)) return `${String(s).replace(".", ",")} секунды`;
  return s % 10 === 1 && s % 100 !== 11 ? `${s} секунды` : `${s} секунд`;
}

/** Результат остановленного запроса (разд. 7.2: «Таймаут воркера») */
export function stoppedResult(sql: string, reason: "timeout" | "crash", elapsedMs: number, limitMs: number): QueryResult {
  const recursive = /\bRECURSIVE\b/i.test(sql);
  const cause = recursive
    ? "Похоже на рекурсию без предела: цикл в данных крутит её бесконечно."
    : "Похоже на JOIN без условия: каждая строка склеивается с каждой, получаются миллионы строк.";
  const suggestion = recursive
    ? "Ограничь глубину (WHERE depth < 10) или собери рекурсию через UNION без столбца глубины — повтор строки её остановит."
    : "Проверь ON у каждого JOIN и запятые во FROM. Если перебор нужен, сначала сузь таблицы условием WHERE.";
  const error =
    reason === "timeout"
      ? `Запрос шёл дольше ${secondsGenitive(limitMs)} и был остановлен.`
      : "Запросу не хватило памяти, и он был остановлен.";
  return {
    columns: [],
    rows: [],
    rowCount: 0,
    executionTimeMs: Math.round(elapsedMs),
    error,
    errorKind: "timeout",
    errorHelp: {
      title: "Запрос остановлен",
      explanation: `${error} ${cause} Архив восстановлен, данные не пострадали.`,
      suggestion,
    },
  };
}

export interface RunOutput {
  evaluation: Evaluation;
  /** Записи, добавленные в журнал этой операцией (appendJournal по порядку) */
  journal: JournalEntry[];
}

export interface PatchOutput {
  applied: PatchApplied;
  journal: JournalEntry[];
}

export interface ClockOutput {
  clock: string;
  journal: JournalEntry[];
}

export class CaseSession {
  readonly caseDef: CaseDef;
  readonly db: Database;
  private readonly secrets: readonly SecretDef[];
  private readonly journal: JournalEntry[] = [];
  private pending: JournalEntry[] = [];
  private views: string[] = [];
  private schemaCache: TableInfo[] | null = null;
  private rng = new Rng(0);
  /** Сколько записей воспроизведено при открытии */
  replayed = 0;

  private constructor(db: Database, caseDef: CaseDef, secrets: readonly SecretDef[]) {
    this.db = db;
    this.caseDef = caseDef;
    this.secrets = secrets;
    // random() с зерном из журнала: воспроизведение даёт те же значения.
    // sql.js отдаёт числа как REAL — для ORDER BY random() и % этого достаточно
    db.create_function("random", () => Math.floor(this.rng.next() * 4294967296) - 2147483648);
  }

  /**
   * Собирает базу дела: байты мира → часы старта → патчи по часам и патчи
   * старта (p0.player первым) → TEMP VIEW горизонта → история query_log →
   * журнал дела.
   */
  static async open(
    worldBytes: Uint8Array,
    caseDef: CaseDef,
    state: CaseSaveState = {},
    secrets: readonly SecretDef[] = []
  ): Promise<CaseSession> {
    const db = await openCaseDatabase(worldBytes, {
      clock: state.startClock ?? caseClock(caseDef).start,
      tables: caseDef.tables,
      writable: caseDef.writableTables ?? [],
      patches: startPatches(state),
    });
    const session = new CaseSession(db, caseDef, secrets);
    try {
      for (const entry of state.queryLog ?? []) logPlayerQuery(db, entry);
      for (const entry of state.journal ?? []) {
        session.replay(entry);
        session.replayed++;
      }
    } catch (e) {
      db.close();
      throw e;
    }
    session.pending = [];
    return session;
  }

  get clock(): string {
    return getGameClock(this.db);
  }

  get playerViews(): string[] {
    return [...this.views];
  }

  getJournal(): readonly JournalEntry[] {
    return this.journal;
  }

  schema(): TableInfo[] {
    if (!this.schemaCache) this.schemaCache = getTableSchema(this.db);
    return this.schemaCache;
  }

  foreignKeys(): ForeignKey[] {
    return getForeignKeys(this.db);
  }

  checksum(): string {
    return databaseChecksum(this.db);
  }

  close(): void {
    this.db.close();
  }

  // --- Запрос игрока ---

  private policy(): SqlPolicy {
    return playerPolicy([...this.caseDef.tables], {
      writableTables: this.caseDef.writableTables ?? [],
      allowViews: this.caseDef.allowViews === true,
      playerViews: this.views,
    });
  }

  /** Схема открытых таблиц: для линтера и объяснений ошибок (закрытые не раскрываются) */
  private openSchema(): TableInfo[] {
    const open = new Set(this.caseDef.tables.map((t) => t.toLowerCase()));
    return this.schema().filter((t) => open.has(t.name.toLowerCase()));
  }

  private record(entry: JournalEntry): void {
    appendJournal(this.journal, entry);
    this.pending.push(entry);
  }

  private takePending(): JournalEntry[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  private mainViews(): Set<string> {
    const rows = this.db.exec("SELECT lower(name) FROM main.sqlite_master WHERE type = 'view'")[0]?.values ?? [];
    return new Set(rows.map((r) => String(r[0])));
  }

  /**
   * Текст, который может изменить базу: зерно random() → выполнение →
   * учёт представлений игрока. Один путь для живого запроса и для журнала.
   */
  private execWrite(sql: string, seed: number): QueryResult {
    const changes = viewChanges(sql);
    const before = changes.created.length > 0 ? this.mainViews() : null;
    this.rng = new Rng(seed);
    const result = executeQuery(this.db, sql);
    this.schemaCache = null;
    if (changes.created.length > 0 || changes.dropped.length > 0 || this.views.length > 0) {
      const after = this.mainViews();
      const next = new Set(this.views.filter((v) => after.has(v)));
      for (const v of changes.created) if (!before?.has(v) && after.has(v)) next.add(v);
      this.views = [...next].sort();
    }
    return result;
  }

  /** Строка журнала запросов игрока */
  private logEntry(sql: string, result: QueryResult, clock: string, ctx: RunContext, progress: CaseProgress): PlayerQueryEntry | null {
    const text = capLogText(sql);
    if (text === "") return null;
    const status = queryLogStatus(result);
    const done = progress.completed.find((c) => !c.optional) ?? progress.completed[0];
    return {
      loggedAt: clock,
      login: ctx.login ?? LOGIN.player,
      terminal: ctx.terminal ?? WORKSTATION.irinaDesk,
      sql: text,
      rowsReturned: result.rowCount,
      ok: status === "ok",
      ...(status === "denied" ? { denied: true } : {}),
      tsReal: new Date().toISOString(),
      caseId: this.caseDef.id,
      ...(done ? { objectiveId: done.objectiveId } : {}),
      ...(ctx.runId ? { runId: ctx.runId } : {}),
    };
  }

  private lint(sql: string): LintWarning[] {
    try {
      return lintSql(sql, this.openSchema(), { db: this.db });
    } catch {
      // Линтер — подсказка, а не проверка: его сбой не должен ронять запрос
      return [];
    }
  }

  run(sql: string, ctx: RunContext = {}): RunOutput {
    const t0 = performance.now();
    const prev = this.clock;
    const policy = this.policy();
    const access = checkSqlPolicy(sql, policy);
    const viewsBefore = this.views.join("\u0000");

    let result: QueryResult;
    let clock = prev;
    let at: string | undefined;
    let wrote = false;
    let seed: number | undefined;

    if (!access.allowed) {
      result = deniedResult(access, policy);
    } else {
      // Запрос выполняется уже на новых часах (Д5: первый запрос после 5.1 — в 03:12:30)
      const next = nextQueryClock(this.caseDef, prev, snapshot(ctx));
      setGameClock(this.db, next);
      const kind = writeKind(sql);
      const writeSeed = this.journal.length;
      if (kind.write) {
        result = this.execWrite(sql, writeSeed);
      } else {
        this.rng = new Rng(writeSeed);
        result = executeQuery(this.db, sql);
      }
      if (result.error && WASM_TRAP_RE.test(result.error)) throw new FatalEngineError(result.error);
      if (kind.write || (kind.unknown && !result.error)) {
        wrote = true;
        seed = writeSeed;
        at = next;
        this.schemaCache = null;
      }
      explainResultError(result, this.caseDef.tables, this.schema());
      clock = movesClock(sql, result) ? next : prev;
      if (clock !== next) setGameClock(this.db, clock);
    }

    // Реестр увиденного — до задач: правило seen видит и значения этого результата
    const seen = scanSeen(result);
    const seenOptions = this.caseDef.protocol ? scanSeenOptions(this.caseDef.protocol, result) : [];
    const vctx: ValidationContext = {
      ...(ctx.pins ? { pins: ctx.pins } : {}),
      ...(ctx.slots ? { slots: ctx.slots } : {}),
      ...(ctx.flags ? { flags: ctx.flags } : {}),
      seen: new Set([...(ctx.seen ?? []), ...seen]),
    };
    const progress = result.error
      ? EMPTY_PROGRESS
      : checkCaseProgress(this.caseDef, result, this.db, new Set(ctx.completed ?? []), vctx);
    const secrets = checkSecrets(this.secrets, result, this.db, new Set(ctx.foundSecrets ?? []), this.caseDef.tables, vctx);
    const lint = access.allowed && sql.trim() !== "" ? this.lint(sql) : [];

    const logEntry = this.logEntry(sql, result, clock, ctx, progress);
    const logId = logEntry ? logPlayerQuery(this.db, logEntry) : null;

    if (wrote || logEntry || clock !== prev) {
      this.record({
        kind: "query",
        clock,
        ...(wrote ? { sql, seed, ...(at !== clock ? { at } : {}) } : {}),
        ...(logEntry ? { log: logEntry } : {}),
      });
    }

    const evaluation: Evaluation = {
      result,
      progress,
      seen,
      seenOptions,
      secrets,
      lint,
      clock,
      clockMoved: clock !== prev,
      logEntry,
      logId,
      wrote,
      playerViews: this.playerViews,
      schemaChanged: wrote && (this.views.join("\u0000") !== viewsBefore || analyzeSql(sql).statements.some((s) => s.action === "ddl")),
      ms: Math.round((performance.now() - t0) * 100) / 100,
    };
    return { evaluation, journal: this.takePending() };
  }

  /**
   * Запрос, который остановлен (таймаут) или уронил прежний воркер. База уже
   * восстановлена по журналу; здесь запрос учитывается так, как если бы он
   * выполнился с ошибкой: часы, строка query_log со статусом 'error', линтер.
   */
  recordStopped(sql: string, ctx: RunContext, reason: "timeout" | "crash", elapsedMs: number, limitMs: number): RunOutput {
    const t0 = performance.now();
    const prev = this.clock;
    const result = stoppedResult(sql, reason, elapsedMs, limitMs);
    const clock = movesClock(sql, result) ? nextQueryClock(this.caseDef, prev, snapshot(ctx)) : prev;
    if (clock !== prev) setGameClock(this.db, clock);
    const lint = sql.trim() !== "" ? this.lint(sql) : [];
    const logEntry = this.logEntry(sql, result, clock, ctx, EMPTY_PROGRESS);
    const logId = logEntry ? logPlayerQuery(this.db, logEntry) : null;
    if (logEntry || clock !== prev) this.record({ kind: "query", clock, ...(logEntry ? { log: logEntry } : {}) });
    const evaluation: Evaluation = {
      result,
      progress: EMPTY_PROGRESS,
      seen: [],
      seenOptions: [],
      secrets: [],
      lint,
      clock,
      clockMoved: clock !== prev,
      logEntry,
      logId,
      wrote: false,
      playerViews: this.playerViews,
      schemaChanged: false,
      ms: Math.round((performance.now() - t0) * 100) / 100,
    };
    return { evaluation, journal: this.takePending() };
  }

  // --- Патчи и часы ---

  /** После патча: горизонт для новых поздних таблиц, без висячих представлений удалённых */
  private refreshHorizon(): void {
    const main = new Set(
      (this.db.exec("SELECT name FROM main.sqlite_master WHERE type = 'table'")[0]?.values ?? []).map((r) => String(r[0]))
    );
    for (const view of horizonViews(this.db)) if (!main.has(view)) dropHorizonView(this.db, view);
    createHorizonViews(this.db, this.caseDef.tables, this.caseDef.writableTables ?? []);
    this.schemaCache = null;
  }

  private applyPatchInternal(id: string, params?: StoryPatchParams): { result: StoryPatchResult; rolledBack: boolean } {
    if (!STORY_PATCHES[id]) throw new Error(`Неизвестный сюжетный патч «${id}»`);
    // Перед сюжетным изменением открытая транзакция игрока откатывается (разд. 6.14, п. 5):
    // иначе ROLLBACK игрока вернул бы удалённую таблицу или стёр строки патча
    const rolledBack = inTransaction(this.db);
    if (rolledBack) this.db.run("ROLLBACK");
    this.db.run("SAVEPOINT zerosql_patch");
    let result: StoryPatchResult;
    try {
      result = applyStoryPatch(this.db, id, params ?? {});
      this.db.run("RELEASE zerosql_patch");
    } catch (e) {
      try {
        this.db.run("ROLLBACK TO zerosql_patch");
        this.db.run("RELEASE zerosql_patch");
      } catch {
        // savepoint уже снят
      }
      throw e;
    } finally {
      this.refreshHorizon();
    }
    if (rolledBack) this.views = [...this.mainViews()].filter((v) => this.views.includes(v)).sort();
    this.record({ kind: "patch", id, ...(params ? { params } : {}) });
    return { result, rolledBack };
  }

  applyPatch(id: string, params?: StoryPatchParams): PatchOutput {
    const { result, rolledBack } = this.applyPatchInternal(id, params);
    return {
      applied: { ...result, rolledBack, clock: this.clock, schema: this.schema(), foreignKeys: this.foreignKeys() },
      journal: this.takePending(),
    };
  }

  setClock(clock: string): ClockOutput {
    const normalized = normalizeClock(clock);
    setGameClock(this.db, normalized);
    this.record({ kind: "clock", clock: normalized });
    return { clock: normalized, journal: this.takePending() };
  }

  // --- Воспроизведение журнала ---

  private replay(entry: JournalEntry): void {
    switch (entry.kind) {
      case "query": {
        if (entry.sql !== undefined) {
          setGameClock(this.db, entry.at ?? entry.clock);
          const result = this.execWrite(entry.sql, entry.seed ?? 0);
          if (result.error && WASM_TRAP_RE.test(result.error)) throw new FatalEngineError(result.error);
        }
        setGameClock(this.db, entry.clock);
        if (entry.log) logPlayerQuery(this.db, entry.log);
        this.record(entry);
        return;
      }
      case "patch":
        this.applyPatchInternal(entry.id, entry.params);
        return;
      case "clock":
        this.setClock(entry.clock);
        return;
    }
  }
}
