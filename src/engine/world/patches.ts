/**
 * Сюжетные патчи мира (разд. 6.14, п. 3): строки, которые появляются не по
 * горизонту, а в названный момент сюжета. Каждый патч:
 * - пишет только в main.* (поверх таблиц могут висеть TEMP VIEW горизонта);
 * - безопасен при повторе (повторный вызов ничего не дублирует);
 * - там, где он опирается на факты одного дела, которые ещё не посажены,
 *   честно ничего не меняет и помечен stub: true (TODO для агента дела).
 *
 * Применяет их horizon.applyStoryPatch: он же подставляет игровые часы.
 */
import type { Database, SqlValue } from "sql.js";
import { Rng, fmtTs, hashSeed, parseTs } from "./rng";
import * as F from "./facts";
import { ARCH16_VIEWS, WORLD_LATE_TABLES } from "./schema";
import { LATE_FILLERS } from "./plants";
import { WS07_NOTE_AGENT, WS07_NOTE_INITIAL, WS07_NOTE_REMOVED } from "./plants/core";

export interface StoryPatchParams {
  /** Игровое время применения; по умолчанию — часы базы (game_now) */
  clock?: string;
  /** Имя или ник игрока (p0.player) */
  playerName?: string;
  /** Флаги ветвлений: tokha_turned, watcher_tripped, melnik… */
  flags?: Readonly<Record<string, unknown>>;
  /** Запросы игрока (c10.frame: запросы Д9 с их игровым временем) */
  queries?: readonly { loggedAt: string; sql: string }[];
  /** cron.fire: id задания; c12.drop: id строки migration_jobs */
  jobId?: number;
  /** cron.fire, задание 1: ветка текста по увиденным 3311 и 3313 */
  variant?: "a" | "b" | "c";
  /** Явный момент события (по умолчанию — clock) */
  at?: string;
}

export interface StoryPatchContext extends StoryPatchParams {
  clock: string;
  flags: Readonly<Record<string, unknown>>;
}

export interface StoryPatchDef {
  id: string;
  /** Что делает патч — для журнала и тестов */
  title: string;
  /** Дело, в котором патч срабатывает (null — между делами или на каждом старте) */
  caseKey: F.CaseKey | null;
  /** Патч применяется сам, когда часы дошли до этого момента (openCaseDatabase) */
  autoAt?: string;
  /** Применяется автоматически на старте любого дела */
  everyCase?: boolean;
  /** Зависит от фактов дела, которые ещё не посажены: пока ничего не меняет */
  stub?: boolean;
  /** Патчу нужны запросы игрока прошлых дел (ctx.queries): стор передаёт их из query_log */
  needsQueries?: boolean;
  apply: (db: Database, ctx: StoryPatchContext) => number;
}

// ------------------------------------------------------------------ помощники

function scalar(db: Database, sql: string, params: SqlValue[] = []): SqlValue {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    return stmt.step() ? stmt.get()[0] : null;
  } finally {
    stmt.free();
  }
}

function run(db: Database, sql: string, params: SqlValue[] = []): number {
  db.run(sql, params);
  return db.getRowsModified();
}

function tableExists(db: Database, name: string, type: "table" | "view" = "table"): boolean {
  return scalar(db, "SELECT COUNT(*) FROM main.sqlite_master WHERE type = ? AND name = ?", [type, name]) === 1;
}

function shift(ts: string, seconds: number): string {
  return fmtTs(parseTs(ts) + seconds * 1000);
}

/** Последний момент 03:12:00 строго раньше часов */
export function lastCronLogin(clock: string): string {
  const t = parseTs(clock);
  const day = Math.floor(t / 86_400_000) * 86_400_000;
  let candidate = day + (3 * 60 + 12) * 60_000;
  if (candidate >= t) candidate -= 86_400_000;
  return fmtTs(candidate);
}

function insertQueryLog(db: Database, row: { loggedAt: string; login: string; terminal: string; text: string; rows: number }): number {
  return run(
    db,
    `INSERT INTO main.query_log (logged_at, login, terminal, query_text, rows_returned, status, ts_real, case_id, objective_id, run_id)
     VALUES (?, ?, ?, ?, ?, 'ok', NULL, NULL, NULL, NULL)`,
    [row.loggedAt, row.login, row.terminal, row.text, row.rows]
  );
}

function audit(db: Database, row: { ts: string; login: string; workstation: string; action: string; table: string; rowId: string | null; field: string | null; oldValue: string | null; newValue: string | null }): void {
  run(
    db,
    `INSERT INTO main.audit_log (ts, login, workstation, action, table_name, row_id, field, old_value, new_value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.ts, row.login, row.workstation, row.action, row.table, row.rowId, row.field, row.oldValue, row.newValue]
  );
}

/** Сколько строк вернул бы запрос по полным таблицам (для rows_returned живых строк) */
function countRows(db: Database, sql: string): number {
  try {
    const res = db.exec(sql.replace(/;\s*--[^]*$/, ""));
    return res.length > 0 ? res[res.length - 1].values.length : 0;
  } catch {
    return 0;
  }
}

function lateTable(db: Database, ctx: StoryPatchContext, tables: readonly string[]): number {
  let changes = 0;
  for (const t of tables) {
    const ddl = WORLD_LATE_TABLES[t];
    if (!ddl) throw new Error(`late: неизвестная поздняя таблица ${t}`);
    const existed = tableExists(db, t);
    db.run(ddl);
    if (existed) continue;
    const filler = LATE_FILLERS[t];
    if (filler) {
      filler(db, new Rng(hashSeed(`${F.WORLD_SEED}:late:${t}`)), { flags: ctx.flags, clock: ctx.clock });
      changes += Number(scalar(db, `SELECT COUNT(*) FROM main.${t}`) ?? 0);
    }
  }
  return changes;
}

// ------------------------------------------------------------------ подставные правки 28.12 (Д10)

interface FrameEdit {
  table: string;
  rowId: () => SqlValue;
  field: string | null;
  newValue: (old: SqlValue) => SqlValue;
  action: "UPDATE" | "DELETE";
}

const FRAME_MARK = "подставная правка";

function frameEdits(db: Database): FrameEdit[] {
  return [
    {
      // Удаление карточки из официальной описи: последней приколотой
      table: "evidence_registry", action: "DELETE", field: null,
      rowId: () => scalar(db, "SELECT id FROM main.evidence_registry ORDER BY pinned_at DESC, id DESC LIMIT 1"),
      newValue: () => null,
    },
    {
      table: "doc_registry", action: "UPDATE", field: "registered_at",
      rowId: () => scalar(db, "SELECT id FROM main.doc_registry WHERE year = 2015 AND reg_no = ?", [F.DOC_REG.scheme]),
      newValue: (old) => shift(String(old), 86_400),
    },
    {
      table: "statements", action: "UPDATE", field: "status",
      rowId: () => scalar(db, "SELECT MIN(id) FROM main.statements WHERE case_id = ? AND id < 5000", [F.CASE_SAZONOV]),
      newValue: () => "отозвано",
    },
    {
      table: "cases", action: "UPDATE", field: "status",
      rowId: () => F.CASE_SAZONOV, newValue: () => "прекращено",
    },
    {
      table: "statements", action: "UPDATE", field: "doc_reg_no",
      rowId: () => scalar(db, "SELECT MAX(id) FROM main.statements WHERE case_id = ? AND id < 5000 AND doc_reg_no IS NOT NULL", [F.CASE_SAZONOV]),
      newValue: () => null,
    },
    {
      table: "evidence_registry", action: "UPDATE", field: "status",
      rowId: () => scalar(db, "SELECT id FROM main.evidence_registry WHERE status = 'активна' ORDER BY pinned_at DESC, id DESC LIMIT 1"),
      newValue: () => "удалена",
    },
  ];
}

// ------------------------------------------------------------------ реестр

const TOKHA_OR_MELNIK = (flags: Readonly<Record<string, unknown>>) =>
  flags.tokha_turned ? { login: F.LOGIN.lykov, ws: "WS-IT-02" } : { login: F.LOGIN.melnik, ws: "WS-IT-01" };

export const STORY_PATCHES: Readonly<Record<string, StoryPatchDef>> = Object.fromEntries(
  ([
    {
      id: "p0.player", title: "Игрок в ПБД: persons 9000, staff 151, логин nol, договор ТБ-2026/117", caseKey: "c00",
      apply: (db, ctx) => {
        const name = (ctx.playerName ?? "Ноль").trim() || "Ноль";
        let n = 0;
        n += run(db, `INSERT OR REPLACE INTO main.persons (id, last_name, first_name, patronymic, birth_date, sex, father_id, mother_id, prev_last_name, special_marks, death_date, created_at)
          VALUES (?, ?, '', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-12-02 17:58:00')`, [F.PERSON.player, name]);
        n += run(db, `INSERT OR REPLACE INTO main.staff (id, person_id, full_name, login, rank, position, dept, workstation, badge_id, hired_at, fired_at, contract_no)
          VALUES (?, ?, ?, ?, NULL, 'аналитик ОЦР (подрядчик)', 'ОЦР', ?, ?, '2026-12-02', NULL, ?)`,
          [F.STAFF.player, F.PERSON.player, name, F.LOGIN.player, F.WORKSTATION.irinaDesk, F.BADGE.player, F.PLAYER_CONTRACT.docNo]);
        n += run(db, `INSERT OR REPLACE INTO main.logins (login, staff_id, role, created_at, created_by, enabled, last_login_at)
          VALUES (?, ?, 'analyst', '2026-12-02 17:55:00', ?, 1, '2026-12-02 18:04:00')`, [F.LOGIN.player, F.STAFF.player, F.LOGIN.melnik]);
        n += run(db, `INSERT OR REPLACE INTO main.contracts (doc_no, company_id, person_id, counterparty_text, subject, signed_at, clause, amount)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1140000)`,
          [F.PLAYER_CONTRACT.docNo, F.COMPANY.fund, F.PERSON.player, name, F.PLAYER_CONTRACT.subject, F.PLAYER_CONTRACT.signedAt, F.PLAYER_CONTRACT.clause]);
        return n;
      },
    },
    {
      id: "case.logins", title: "Старт дела: last_login_at zero — прошлая ночь 03:12:00; i.valts — последний сеанс", caseKey: null, everyCase: true,
      apply: (db, ctx) => {
        let n = run(db, "UPDATE main.logins SET last_login_at = ? WHERE login = ?", [lastCronLogin(ctx.clock), F.LOGIN.zero]);
        const last = [...F.GHOST_SESSIONS].reverse().find((s) => s.start <= ctx.clock);
        if (last) n += run(db, "UPDATE main.logins SET last_login_at = ? WHERE login = ?", [last.start, F.LOGIN.irina]);
        return n;
      },
    },
    {
      id: "cron.fire", title: "Срабатывание задания zero (М6): строка CRON-01 в query_log, cron_jobs.fired_at", caseKey: null,
      apply: (db, ctx) => {
        const job = F.CRON_JOBS.find((j) => j.id === ctx.jobId);
        if (!job) throw new Error(`cron.fire: нет задания ${ctx.jobId}`);
        if (scalar(db, "SELECT fired_at FROM main.cron_jobs WHERE id = ?", [job.id]) !== null) return 0;
        const at = ctx.at ?? lastCronLogin(shift(ctx.clock, 60));
        const sql = job.id === 1 ? F.CRON_JOB1_VARIANTS[ctx.variant ?? "c"] : job.sql;
        let n = insertQueryLog(db, { loggedAt: at, login: F.LOGIN.zero, terminal: F.WORKSTATION.cron, text: sql, rows: countRows(db, sql) });
        n += run(db, "UPDATE main.cron_jobs SET fired_at = ? WHERE id = ?", [at, job.id]);
        n += run(db, "UPDATE main.logins SET last_login_at = ? WHERE login = ?", [at, F.LOGIN.zero]);
        return n;
      },
    },
    {
      id: "ws07.agent", title: "21.12 03:04: на WS-07 агент синхронизации (note)", caseKey: "c08", autoAt: F.KEY_TIMES.agentInstalled,
      apply: (db) => run(db, "UPDATE main.workstations SET note = ? WHERE id = ? AND note = ?", [WS07_NOTE_AGENT, F.WORKSTATION.serverRoom, WS07_NOTE_INITIAL]),
    },
    {
      id: "c07.admission", title: "Д7, scene_end: Ратников в кардиологии (hospital_admissions 601)", caseKey: "c07",
      apply: (db, ctx) => run(db, `INSERT OR IGNORE INTO main.hospital_admissions (id, person_id, full_name, admitted_at, discharged_at, department, diagnosis)
        VALUES (601, ?, 'Ратников Лев Борисович', ?, NULL, 'кардиология ГБ № 1', 'ОКС')`, [F.PERSON.ratnikov, ctx.at ?? ctx.clock]),
    },
    {
      id: "c09.watcher", title: "Д9, М18 при watcher_tripped: «-- Не надо.» под nol, удаление платежа 20.11, «Бастион» у общежития", caseKey: "c09",
      apply: (db, ctx) => {
        let n = run(db, "DELETE FROM main.transactions WHERE account_id = ? AND ts = ? AND amount = 300000", [F.ACCOUNT.shchit, F.KEY_TIMES.shchitBonus]);
        const text = "SELECT a.street, a.house, a.apt FROM registrations r JOIN addresses a ON a.id = r.address_id WHERE r.person_id = 9000; -- Не надо.";
        if (scalar(db, "SELECT COUNT(*) FROM main.query_log WHERE login = ? AND query_text = ?", [F.LOGIN.player, text]) === 0) {
          n += insertQueryLog(db, { loggedAt: ctx.at ?? shift(ctx.clock, 60), login: F.LOGIN.player, terminal: F.WORKSTATION.serverRoom, text, rows: countRows(db, text) });
        }
        if (scalar(db, "SELECT COUNT(*) FROM main.plate_reads WHERE plate = ? AND read_at = '2026-12-29 02:10:00'", [F.PLATE.bastion]) === 0) {
          n += run(db, "INSERT INTO main.plate_reads (camera_id, plate, read_at, confidence, direction) VALUES (?, ?, '2026-12-29 02:10:00', 0.96, 'в центр')", [F.CAMERA.dormitory, F.PLATE.bastion]);
        }
        return n;
      },
    },
    {
      id: "c10.frame", title: "Д10, старт: подставные правки 28.12 под nol с WS-07 через 20–40 с после запросов Д9", caseKey: "c10", needsQueries: true,
      apply: (db, ctx) => {
        if (scalar(db, "SELECT COUNT(*) FROM main.audit_log WHERE login = ? AND workstation = ? AND ts LIKE '2026-12-28%'", [F.LOGIN.player, F.WORKSTATION.serverRoom]) !== 0) return 0;
        const queries = (ctx.queries ?? []).filter((q) => q.loggedAt.startsWith("2026-12-28"));
        const rng = new Rng(hashSeed(`${F.WORLD_SEED}:c10.frame`));
        const edits = frameEdits(db);
        let n = 0;
        queries.slice(0, Math.min(6, queries.length)).forEach((q, i) => {
          const e = edits[i];
          const id = e.rowId();
          if (id === null || id === undefined) return;
          const at = shift(q.loggedAt.length === 16 ? `${q.loggedAt}:00` : q.loggedAt, rng.int(20, 40));
          if (e.action === "DELETE") {
            const title = scalar(db, `SELECT card_title FROM main.${e.table} WHERE id = ?`, [id]);
            const snapshot = db.exec(`SELECT * FROM main.${e.table} WHERE id = ?`, [id])[0];
            n += run(db, `DELETE FROM main.${e.table} WHERE id = ?`, [id]);
            audit(db, { ts: at, login: F.LOGIN.player, workstation: F.WORKSTATION.serverRoom, action: "DELETE", table: e.table, rowId: String(id), field: null, oldValue: JSON.stringify({ columns: snapshot?.columns, values: snapshot?.values[0], title }), newValue: FRAME_MARK });
          } else {
            const old = scalar(db, `SELECT ${e.field} FROM main.${e.table} WHERE id = ?`, [id]);
            const next = e.newValue(old);
            n += run(db, `UPDATE main.${e.table} SET ${e.field} = ? WHERE id = ?`, [next, id]);
            audit(db, { ts: at, login: F.LOGIN.player, workstation: F.WORKSTATION.serverRoom, action: "UPDATE", table: e.table, rowId: String(id), field: e.field, oldValue: old === null ? null : String(old), newValue: next === null ? null : String(next) });
          }
        });
        return n;
      },
    },
    {
      id: "c10.rollback", title: "Д10, после 10.1: подставные правки откатаны по журналу аудита", caseKey: "c10",
      apply: (db, ctx) => {
        const rows = db.exec(
          "SELECT id, ts, action, table_name, row_id, field, old_value FROM main.audit_log WHERE login = ? AND workstation = ? AND ts LIKE '2026-12-28%' ORDER BY ts DESC, id DESC",
          [F.LOGIN.player, F.WORKSTATION.serverRoom]
        )[0];
        if (!rows) return 0;
        if (scalar(db, "SELECT COUNT(*) FROM main.audit_log WHERE new_value LIKE 'откат:%' AND ts >= '2026-12-31'") !== 0) return 0;
        const who = TOKHA_OR_MELNIK(ctx.flags);
        let n = 0;
        for (const [id, , action, table, rowId, field, oldValue] of rows.values as [number, string, string, string, string, string | null, string | null][]) {
          if (action === "DELETE") {
            try {
              const snap = JSON.parse(String(oldValue)) as { columns: string[]; values: SqlValue[] };
              if (snap.columns && snap.values) {
                n += run(db, `INSERT OR IGNORE INTO main.${table} (${snap.columns.join(", ")}) VALUES (${snap.columns.map(() => "?").join(", ")})`, snap.values);
              }
            } catch {
              continue;
            }
          } else if (field) {
            n += run(db, `UPDATE main.${table} SET ${field} = ? WHERE id = ?`, [oldValue, table === "cases" ? rowId : Number(rowId)]);
          }
          audit(db, { ts: ctx.clock, login: who.login, workstation: who.ws, action: action === "DELETE" ? "INSERT" : "UPDATE", table, rowId, field, oldValue: null, newValue: `откат: audit_log ${id}` });
        }
        return n;
      },
    },
    {
      id: "c10.purge", title: "31.12, после 10.1: «Сияние» чистит ЗЕРКАЛО (чабрец Лыкова, его ночи на КПП-Б0, 300 000 и 380 000)", caseKey: "c10",
      apply: (db) => {
        let n = run(db, "DELETE FROM main.purchases WHERE payer_person_id = ? AND merchant = 'Кипяток (ГУ, холл)' AND item = 'чай с чабрецом'", [F.PERSON.lykov]);
        for (const s of F.GHOST_SESSIONS) {
          const day = s.start.slice(0, 10);
          n += run(db, "DELETE FROM main.door_access WHERE badge_id = ? AND door = 'КПП-Б0' AND ts BETWEEN ? AND ?", [F.BADGE.lykov, `${day} 00:30:00`, `${day} 04:30:00`]);
        }
        n += run(db, "DELETE FROM main.transactions WHERE account_id = ? AND ((ts = ? AND amount = 300000) OR (ts = ? AND amount = -380000))", [F.ACCOUNT.shchit, F.KEY_TIMES.shchitBonus, F.KEY_TIMES.lykovLoanPaid]);
        return n;
      },
    },
    {
      id: "ws07.removed", title: "31.12, после алиби: агент на WS-07 снят", caseKey: "c10",
      apply: (db, ctx) => {
        const old = scalar(db, "SELECT note FROM main.workstations WHERE id = ?", [F.WORKSTATION.serverRoom]);
        if (old === WS07_NOTE_REMOVED) return 0;
        const who = TOKHA_OR_MELNIK(ctx.flags);
        const n = run(db, "UPDATE main.workstations SET note = ? WHERE id = ?", [WS07_NOTE_REMOVED, F.WORKSTATION.serverRoom]);
        audit(db, { ts: ctx.clock, login: who.login, workstation: who.ws, action: "UPDATE", table: "workstations", rowId: F.WORKSTATION.serverRoom, field: "note", oldValue: old === null ? null : String(old), newValue: WS07_NOTE_REMOVED });
        return n;
      },
    },
    {
      id: "c10.import", title: "Д10, после 10.2: диск Нины в sokol_stage_*, представления arch16_*", caseKey: "c10",
      apply: (db, ctx) => {
        let n = 0;
        for (const [view, { stage }] of Object.entries(ARCH16_VIEWS)) {
          if (!tableExists(db, stage)) continue;
          const empty = scalar(db, `SELECT COUNT(*) FROM main.${stage}`) === 0;
          const filler = LATE_FILLERS[stage];
          // TODO(c10): наполнитель диска Нины (снимок «Сокола» на 30.09.2016; 37 дублей без Тохи)
          if (empty && filler) filler(db, new Rng(hashSeed(`${F.WORLD_SEED}:import:${stage}`)), { flags: ctx.flags, clock: ctx.clock });
          n += Number(scalar(db, `SELECT COUNT(*) FROM main.${stage}`) ?? 0);
          db.run(ARCH16_VIEWS[view].sql);
        }
        return n;
      },
    },
    ...(["registry", "statements", "persons"] as const).map((part, i): StoryPatchDef => ({
      id: `c12.drop.${part}`, title: `Д11: удаление sokol_stage_${part} по migration_jobs ${17 + i}`, caseKey: "c12",
      apply: (db) => {
        const stage = `sokol_stage_${part}`;
        db.run(`DROP VIEW IF EXISTS arch16_${part}`);
        const existed = tableExists(db, stage);
        db.run(`DROP TABLE IF EXISTS ${stage}`);
        return (existed ? 1 : 0) + run(db, "UPDATE main.migration_jobs SET status = 'выполнено' WHERE id = ? AND status <> 'выполнено'", [17 + i]);
      },
    })),
    {
      id: "c12.finalize", title: "Д11, 13:00: финализация «Сокол → ПБД» (migration_jobs 20)", caseKey: "c12",
      apply: (db) => run(db, "UPDATE main.migration_jobs SET status = 'выполнено' WHERE id = 20 AND status <> 'выполнено'"),
    },
    {
      id: "c12.voice", title: "11.01 12:58: голосовое Ирины доставлено", caseKey: "c12",
      apply: (db) => run(db, "UPDATE main.messenger_events SET status = 'доставлено' WHERE from_msisdn = ? AND ts = ? AND status = 'запланировано'", [F.PHONE.irina, F.KEY_TIMES.voiceDelivery]),
    },
    {
      id: "c12.plate_purge_attempt", title: "11.01 11:30: «Сияние» пытается удалить plate_reads К404ТО — строки «Дорсети» остаются", caseKey: "c12",
      apply: () => 0,
    },
    {
      id: "late.bank_statements", title: "Д9: ответ банка «Северный кредит» (bank_statements)", caseKey: "c09", stub: !LATE_FILLERS.bank_statements,
      apply: (db, ctx) => lateTable(db, ctx, ["bank_statements"]),
    },
    {
      id: "late.nina_carbon", title: "Д10: копирка Нины (nina_carbon)", caseKey: "c10", stub: !LATE_FILLERS.nina_carbon,
      apply: (db, ctx) => lateTable(db, ctx, ["nina_carbon"]),
    },
    {
      id: "late.drafts", title: "И: черновики draft_statements / draft_persons / draft_publication", caseKey: "c11", stub: !LATE_FILLERS.draft_statements,
      apply: (db, ctx) => lateTable(db, ctx, ["draft_statements", "draft_persons", "draft_publication"]),
    },
    {
      id: "late.publication", title: "Д11: publication_source и пустая publication", caseKey: "c12", stub: !LATE_FILLERS.publication_source,
      apply: (db, ctx) => lateTable(db, ctx, ["publication_source", "publication"]),
    },
    {
      id: "postcredits.glb", title: "Пост-титры: станция GLB-CORE", caseKey: null,
      apply: (db) => run(db, "INSERT OR IGNORE INTO main.workstations (id, room, floor, kind, note) VALUES (?, NULL, NULL, 'сервер', 'ЦОД «Глубина», зал Б')", [F.WORKSTATION.glbCore]),
    },
  ] satisfies StoryPatchDef[]).map((p) => [p.id, p])
);

/** Патчи, которые применяются сами по часам: autoAt ≤ clock, плюс everyCase */
export function clockPatchesDue(clock: string): string[] {
  return Object.values(STORY_PATCHES)
    .filter((p) => p.everyCase || (p.autoAt !== undefined && p.autoAt <= clock))
    .map((p) => p.id);
}

