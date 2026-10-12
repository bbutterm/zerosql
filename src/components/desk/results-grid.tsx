"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle,
  CornerDownLeft,
  Lightbulb,
  Lock,
  Pin,
  ShieldAlert,
  Table2,
  Timer,
} from "lucide-react";
import type { QueryErrorKind, QueryResult } from "@/types/database";
import { cn } from "@/lib/utils";
import { pluralize } from "@/lib/plural";
import { GrainLayer, SectionLabel, SteamLayer } from "@/components/kit/atmosphere";

export interface ResultsGridProps {
  result: QueryResult | null;
  /** Закрепить строку в улики; без колбэка кнопки булавки не показываются */
  onPinRow?: (rowIndex: number) => void;
  /** Уже закреплённые строки (индексы в result.rows) */
  pinnedRows?: number[];
  /** Сколько строк рисовать максимум */
  maxRows?: number;
  running?: boolean;
  /** Подсказка в пустом состоянии до первого запроса */
  idleHint?: ReactNode;
  className?: string;
}

const LONG_TEXT = 36;

export function ResultsGrid({
  result,
  onPinRow,
  pinnedRows = [],
  maxRows = 500,
  running = false,
  idleHint,
  className,
}: ResultsGridProps) {
  return (
    <section
      aria-label="Результат запроса"
      aria-busy={running}
      className={cn(
        "relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-frost-line bg-ink-deep",
        className
      )}
    >
      {running && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden bg-frost-line"
        >
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-aurora to-transparent motion-safe:animate-scan" />
        </div>
      )}
      {result === null ? (
        <IdleState hint={idleHint} />
      ) : result.error ? (
        <ErrorState result={result} />
      ) : result.columns.length === 0 ? (
        <>
          <div className="flex flex-1 items-center justify-center p-6 text-center">
            <p className="text-sm text-frost">Запрос выполнен. Команда не возвращает данных.</p>
          </div>
          <Footer result={result} shown={0} />
        </>
      ) : (
        <DataTable
          result={result}
          maxRows={maxRows}
          onPinRow={onPinRow}
          pinnedRows={pinnedRows}
        />
      )}
    </section>
  );
}

/* ---------- Таблица ---------- */

function isNumericColumn(rows: unknown[][], col: number): boolean {
  let seen = false;
  for (const row of rows) {
    const v = row[col];
    if (v === null || v === undefined) continue;
    if (typeof v !== "number" && typeof v !== "bigint") return false;
    seen = true;
  }
  return seen;
}

const crackStyle: CSSProperties = {
  backgroundImage: "var(--crack)",
  backgroundRepeat: "repeat-x",
  backgroundPosition: "left bottom -3px",
  backgroundSize: "260px 10px",
};

function DataTable({
  result,
  maxRows,
  onPinRow,
  pinnedRows,
}: {
  result: QueryResult;
  maxRows: number;
  onPinRow?: (rowIndex: number) => void;
  pinnedRows: number[];
}) {
  const rows = result.rows.slice(0, maxRows);
  const numeric = result.columns.map((_, i) => isNumericColumn(rows, i));
  const pinned = new Set(pinnedRows);
  const empty = rows.length === 0;

  return (
    <>
      <div className="scrollbar-ice relative min-h-0 flex-1 overflow-auto">
        <table className="w-max min-w-full border-separate border-spacing-0 font-mono text-[12.5px]">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 left-0 z-20 w-12 border-b border-frost-line-strong bg-ink-raised px-2 py-2 text-right text-[10px] font-normal text-frost-faint"
                style={crackStyle}
              >
                <span className="sr-only">Номер строки</span>#
              </th>
              {result.columns.map((col, i) => (
                <th
                  key={`${col}-${i}`}
                  scope="col"
                  className={cn(
                    "sticky top-0 z-10 border-b border-frost-line-strong bg-ink-raised px-3 py-2 font-medium whitespace-nowrap text-aurora/90",
                    numeric[i] ? "text-right" : "text-left"
                  )}
                  style={crackStyle}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const isPinned = pinned.has(r);
              return (
                <tr
                  key={r}
                  className={cn(
                    "group/row transition-colors",
                    r % 2 === 1 && "bg-steam/[0.018]",
                    "hover:bg-aurora/[0.06]",
                    isPinned && "bg-signal/[0.07] hover:bg-signal/[0.1]"
                  )}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-[1] h-8 w-12 border-b border-frost-line bg-ink-deep px-1.5 text-right align-middle text-[11px] text-frost-faint tabular-nums",
                      "group-hover/row:bg-[#0c1426]",
                      isPinned && "shadow-[inset_2px_0_0_var(--signal)]"
                    )}
                  >
                    {onPinRow ? (
                      <span className="relative flex h-full items-center justify-end">
                        <span
                          className={cn(
                            "transition-opacity",
                            isPinned ? "opacity-0" : "group-focus-within/row:opacity-0 group-hover/row:opacity-0"
                          )}
                        >
                          {r + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => onPinRow(r)}
                          aria-pressed={isPinned}
                          aria-label={isPinned ? `Строка ${r + 1} уже в уликах` : `В улики: строка ${r + 1}`}
                          title={isPinned ? "Уже в уликах" : "В улики"}
                          className={cn(
                            "absolute inset-y-0 right-0 my-auto grid size-6 place-items-center rounded transition-[opacity,color,background-color]",
                            isPinned
                              ? "text-signal opacity-100"
                              : "text-frost opacity-0 group-hover/row:opacity-100 hover:bg-signal/15 hover:text-signal focus-visible:opacity-100"
                          )}
                        >
                          <Pin className={cn("size-3.5", isPinned && "fill-signal")} />
                        </button>
                      </span>
                    ) : (
                      r + 1
                    )}
                  </td>
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className={cn(
                        "h-8 border-b border-frost-line px-3 align-middle whitespace-nowrap",
                        numeric[c] ? "text-right tabular-nums" : "text-left"
                      )}
                    >
                      <Cell value={cell} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {empty && (
          <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
            <span className="font-display text-sm text-frost">0 строк</span>
            <span className="max-w-sm text-xs leading-relaxed text-frost-dim">
              Запрос верный, но под условие ничего не попало. Ослабьте WHERE или проверьте написание
              значений.
            </span>
          </div>
        )}
      </div>
      <Footer result={result} shown={rows.length} pinnedCount={pinned.size} />
    </>
  );
}

function Cell({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <span className="inline-flex h-[18px] items-center rounded-sm border border-dashed border-frost-line-strong px-1 text-[9.5px] tracking-[0.12em] text-frost-dim/80">
        NULL
      </span>
    );
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return <span className="text-aurora-violet-soft">{String(value)}</span>;
  }
  if (value instanceof Uint8Array) {
    return <span className="text-frost-dim italic">BLOB · {pluralize(value.byteLength, ["байт", "байта", "байт"])}</span>;
  }
  const text = String(value);
  if (text.length > LONG_TEXT) {
    return (
      <span className="inline-block max-w-[34ch] truncate align-middle text-steam/90" title={text}>
        {text}
      </span>
    );
  }
  return <span className="text-steam/90">{text}</span>;
}

/* ---------- Подвал ---------- */

function formatMs(ms: number): string {
  if (ms < 1) return "< 1 мс";
  if (ms < 1000) return `${ms.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} мс`;
  return `${(ms / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} с`;
}

function Footer({
  result,
  shown,
  pinnedCount = 0,
}: {
  result: QueryResult;
  shown: number;
  pinnedCount?: number;
}) {
  const total = result.rowCount;
  const capped = shown < total;
  return (
    <footer className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1 border-t border-frost-line bg-ink-raised/60 px-3 py-1.5 text-[11.5px] text-frost-dim">
      <span className="inline-flex items-center gap-1.5 text-frost">
        <span
          aria-hidden
          className={cn("size-1.5 rounded-full", total > 0 ? "bg-aurora shadow-[0_0_8px_var(--aurora-teal)]" : "bg-frost-dim")}
        />
        {pluralize(total, ["строка", "строки", "строк"])}
        {result.columns.length > 0 && (
          <span className="text-frost-dim">· {pluralize(result.columns.length, ["столбец", "столбца", "столбцов"])}</span>
        )}
      </span>
      {capped && (
        <span className="text-sodium">
          показано {shown.toLocaleString("ru-RU")} из {total.toLocaleString("ru-RU")}
        </span>
      )}
      {result.truncated && (
        <span className="inline-flex items-center gap-1 text-sodium">
          <AlertTriangle className="size-3" />
          результат обрезан — уточните запрос (WHERE, LIMIT)
        </span>
      )}
      {pinnedCount > 0 && (
        <span className="inline-flex items-center gap-1 text-signal">
          <Pin className="size-3 fill-signal" />
          {pinnedCount} в уликах
        </span>
      )}
      <span className="ml-auto inline-flex items-center gap-1 font-mono tabular-nums">
        <Timer className="size-3" />
        {formatMs(result.executionTimeMs)}
      </span>
    </footer>
  );
}

/* ---------- Пусто до первого запроса ---------- */

function IdleState({ hint }: { hint?: ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-3 overflow-hidden px-6 py-10 text-center">
      <SteamLayer intensity={0.5} />
      <div className="relative grid size-11 place-items-center rounded-full border border-frost-line-strong bg-ink-raised">
        <Table2 className="size-5 text-frost-dim" />
      </div>
      <p className="relative max-w-sm text-sm leading-relaxed text-frost">
        {hint ?? "Здесь появятся строки из зеркала городских данных."}
      </p>
      <p className="relative inline-flex items-center gap-1.5 text-xs text-frost-dim">
        Напишите запрос и нажмите
        <span className="inline-flex h-5 items-center gap-0.5 rounded border border-frost-line-strong px-1 font-mono text-[10px] text-frost">
          Ctrl <CornerDownLeft className="size-3" />
        </span>
      </p>
    </div>
  );
}

/* ---------- Ошибки ---------- */

const ERROR_TONES: Record<
  QueryErrorKind,
  { color: string; label: string; icon: typeof AlertTriangle; textClass: string }
> = {
  sql: { color: "#ff6a2b", label: "Ошибка в запросе", icon: AlertTriangle, textClass: "text-signal" },
  locked_table: { color: "#8b5cf6", label: "Засекречено", icon: Lock, textClass: "text-aurora-violet-soft" },
  read_only: { color: "#ffb547", label: "Запрет записи", icon: ShieldAlert, textClass: "text-sodium" },
};

function ErrorState({ result }: { result: QueryResult }) {
  const kind: QueryErrorKind = result.errorKind ?? "sql";
  const tone = ERROR_TONES[kind];
  const Icon = tone.icon;
  const help = result.errorHelp;
  const frosted = kind === "locked_table";

  return (
    <div className="scrollbar-ice flex min-h-0 flex-1 flex-col overflow-auto p-3 sm:p-4" role="alert">
      <div
        className="relative overflow-hidden rounded-lg border p-4 sm:p-5"
        style={{
          borderColor: `${tone.color}55`,
          background: frosted
            ? `linear-gradient(135deg, ${tone.color}1f, rgb(188 203 224 / 0.05) 45%, ${tone.color}12)`
            : `linear-gradient(180deg, ${tone.color}14, transparent 70%)`,
        }}
      >
        {frosted && <GrainLayer opacity={0.12} />}
        {frosted && (
          <div
            aria-hidden
            className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full opacity-30 blur-3xl"
            style={{ background: tone.color }}
          />
        )}
        <div className="relative flex items-start gap-3.5">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full ring-1"
            style={{ background: `${tone.color}1f`, color: tone.color, boxShadow: `0 0 24px -6px ${tone.color}` }}
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <SectionLabel className={tone.textClass}>{tone.label}</SectionLabel>
            <h3 className="mt-1 font-display text-base leading-snug font-semibold text-steam sm:text-lg">
              {help?.title ?? "Запрос не выполнен"}
            </h3>
            {help?.explanation && (
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-frost">{help.explanation}</p>
            )}
            {help?.suggestion && (
              <div className="mt-3 flex max-w-prose gap-2.5 rounded-md border border-frost-line bg-ink-deep/70 px-3 py-2.5 text-sm leading-relaxed text-steam/90">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-sodium" aria-hidden />
                <span className="whitespace-pre-wrap">{help.suggestion}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      {result.error && (
        <p className="mt-2.5 px-1 font-mono text-[11px] leading-relaxed break-words text-frost-dim">
          <span className="text-frost-faint">{kind === "sql" ? "SQLite" : "Система"}:</span> {result.error}
        </p>
      )}
    </div>
  );
}
