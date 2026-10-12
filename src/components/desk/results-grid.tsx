"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { QueryResult } from "@/types/database";
import { cn } from "@/lib/utils";
import { countOf, formatInt, formatMs, lowerFirst } from "@/components/kit/typo";

export interface ResultsGridProps {
  result: QueryResult | null;
  /** Приобщить строку к делу; без колбэка кнопка «приобщить» не показывается */
  onPinRow?: (rowIndex: number) => void;
  /** Уже приобщённые строки (индексы в result.rows) */
  pinnedRows?: number[];
  /** Сколько строк рисовать максимум */
  maxRows?: number;
  running?: boolean;
  /** Своё содержимое вместо приветствия до первого запроса */
  idleHint?: ReactNode;
  /** Строки приветствия до первого запроса, каждая с «> » */
  idleLines?: string[];
  /** Alt+клик по значению: вставить его литералом в редактор ('B-0233', 42, NULL) */
  onInsertValue?: (literal: string) => void;
  /** Клик по предложенному имени в ошибке: заменить ошибочное имя в редакторе */
  onSuggest?: (identifier: string, wrong?: string) => void;
  className?: string;
}

/**
 * Таблица результатов (раздел 7.7) и вывод ошибок (раздел 7.8).
 * Плотно: строка 24 px, PT Mono, линейки, без зебры и цвета. Ничего не анимируется,
 * кроме фирменного жеста — полёта приобщённой строки к «Материалам».
 */
export function ResultsGrid({
  result,
  onPinRow,
  pinnedRows = [],
  maxRows = 500,
  running = false,
  idleHint,
  idleLines,
  onInsertValue,
  onSuggest,
  className,
}: ResultsGridProps) {
  const slow = useSlowFlag(running, 150);

  return (
    <section
      aria-label="Результат запроса"
      aria-busy={running}
      className={cn("flex min-h-0 min-w-0 flex-col bg-scr-base", className)}
    >
      {result === null ? (
        <>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {idleHint ?? <TerminalLines lines={idleLines ?? ["Зеркало подключено."]} />}
          </div>
          <Footer slow={slow} />
        </>
      ) : result.error ? (
        <>
          <ErrorOutput result={result} onSuggest={onSuggest} />
          <Footer slow={slow} />
        </>
      ) : (
        <DataTable
          result={result}
          maxRows={maxRows}
          onPinRow={onPinRow}
          pinnedRows={pinnedRows}
          onInsertValue={onInsertValue}
          slow={slow}
        />
      )}
    </section>
  );
}

/* ---------- «Выполняется…» — только если запрос идёт дольше 150 мс ---------- */

function useSlowFlag(running: boolean, delay: number): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => setSlow(true), delay);
    return () => {
      window.clearTimeout(t);
      setSlow(false);
    };
  }, [running, delay]);
  return running && slow;
}

function TerminalLines({ lines }: { lines: string[] }) {
  return (
    <div className="mono-12 text-ink-3">
      {lines.map((line, i) => (
        <p key={i}>&gt; {line}</p>
      ))}
    </div>
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

/** Значение литералом SQL: строки в одинарных кавычках */
function toLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Uint8Array) return `BLOB, ${value.byteLength} байт`;
  return String(value);
}

type Cell = { r: number; c: number };

function DataTable({
  result,
  maxRows,
  onPinRow,
  pinnedRows,
  onInsertValue,
  slow,
}: {
  result: QueryResult;
  maxRows: number;
  onPinRow?: (rowIndex: number) => void;
  pinnedRows: number[];
  onInsertValue?: (literal: string) => void;
  slow: boolean;
}) {
  const rows = result.rows.slice(0, maxRows);
  const numeric = result.columns.map((_, i) => isNumericColumn(rows, i));
  const pinned = new Set(pinnedRows);
  const [sel, setSel] = useState<Cell | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cols = result.columns.length;

  // Новый результат — выделение сбрасывается (паттерн «состояние от пропса»)
  const [seenResult, setSeenResult] = useState(result);
  if (seenResult !== result) {
    setSeenResult(result);
    setSel(null);
  }

  const pin = (r: number, rowEl?: HTMLElement | null) => {
    if (!onPinRow || pinned.has(r)) return;
    if (rowEl && scrollRef.current) flyToRegistry(rowEl, scrollRef.current);
    onPinRow(r);
  };

  const onCellClick = (e: MouseEvent, r: number, c: number) => {
    if (e.altKey && onInsertValue) {
      e.preventDefault();
      onInsertValue(toLiteral(rows[r][c]));
      return;
    }
    setSel({ r, c });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return;
    if (e.key === "Enter" && e.ctrlKey && e.shiftKey && sel) {
      e.preventDefault();
      const rowEl = scrollRef.current?.querySelector<HTMLElement>(`tr[data-row="${sel.r}"]`);
      pin(sel.r, rowEl);
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    const cur = sel ?? { r: 0, c: 0 };
    const next = sel
      ? { r: Math.min(rows.length - 1, Math.max(0, cur.r + m[0])), c: Math.min(cols - 1, Math.max(0, cur.c + m[1])) }
      : cur;
    setSel(next);
    scrollRef.current
      ?.querySelector(`tr[data-row="${next.r}"] td[data-col="${next.c}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  return (
    <>
      <div
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label="Строки результата"
        onKeyDown={onKeyDown}
        className="relative min-h-0 flex-1 overflow-auto focus-visible:outline-offset-[-1px]"
      >
        <table className="w-max min-w-full border-separate border-spacing-0 mono-13 text-ink-1">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 left-0 z-20 h-7 w-10 min-w-10 border-r border-b border-r-line border-b-line-strong bg-scr-chrome"
              >
                <span className="sr-only">Номер строки</span>
              </th>
              {result.columns.map((col, i) => (
                <th
                  key={`${col}-${i}`}
                  scope="col"
                  className={cn(
                    "sticky top-0 z-10 h-7 border-b border-line-strong bg-scr-chrome px-3 mono-12 font-normal whitespace-nowrap text-ink-2",
                    numeric[i] ? "text-right" : "text-left"
                  )}
                >
                  {col}
                </th>
              ))}
              {onPinRow && (
                <th scope="col" className="sticky top-0 z-10 h-7 w-24 border-b border-line-strong bg-scr-chrome">
                  <span className="sr-only">Приобщить</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const isPinned = pinned.has(r);
              return (
                <tr
                  key={r}
                  data-row={r}
                  className={cn("group/row", isPinned ? "bg-sodium-wash" : "hover:bg-scr-raise")}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-[1] h-6 w-10 border-r border-b border-line pr-2 text-right align-middle mono-12 tnum max-lg:h-[22px]",
                      isPinned ? "bg-sodium-wash text-sodium" : "bg-scr-base text-ink-4 group-hover/row:bg-scr-raise"
                    )}
                  >
                    {r + 1}
                  </td>
                  {row.map((cell, c) => {
                    const text = cellText(cell);
                    const isNull = cell === null || cell === undefined;
                    const selected = sel?.r === r && sel.c === c;
                    return (
                      <td
                        key={c}
                        data-col={c}
                        onClick={(e) => onCellClick(e, r, c)}
                        title={text.length > 40 ? text : undefined}
                        className={cn(
                          "h-6 border-b border-line px-3 align-middle whitespace-nowrap max-lg:h-[22px] max-lg:text-[12px] max-lg:leading-[22px]",
                          numeric[c] && !isNull ? "text-right" : "text-left",
                          (isNull || cell instanceof Uint8Array) && "text-ink-3",
                          selected && "outline outline-1 -outline-offset-1 outline-ink-2"
                        )}
                      >
                        {text.length > 40 ? (
                          <span className="inline-block max-w-[40ch] truncate align-top">{text}</span>
                        ) : (
                          text
                        )}
                      </td>
                    );
                  })}
                  {onPinRow && (
                    <td
                      className={cn(
                        "sticky right-0 h-6 w-24 border-b border-line px-3 text-right align-middle",
                        isPinned
                          ? "group-hover/row:bg-sodium-wash"
                          : "group-hover/row:bg-scr-raise group-focus-within/row:bg-scr-raise"
                      )}
                    >
                      {isPinned ? (
                        <span className="invisible ui-12 text-ink-3 group-hover/row:visible">приобщено</span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => pin(r, e.currentTarget.closest("tr"))}
                          className="ui-12 text-ink-2 opacity-0 group-hover/row:opacity-100 hover:text-ink-1 hover:underline focus-visible:opacity-100 underline-offset-[3px]"
                        >
                          приобщить
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-3">
            <TerminalLines lines={["Запрос выполнен. Строк: 0."]} />
          </div>
        )}
      </div>
      <Footer
        slow={slow}
        fields={
          cols === 0
            ? ["Запрос выполнен.", formatMs(result.executionTimeMs)]
            : [
                countOf(result.rowCount, ["строка", "строки", "строк"]),
                countOf(cols, ["столбец", "столбца", "столбцов"]),
                formatMs(result.executionTimeMs),
              ]
        }
        note={
          rows.length < result.rowCount || result.truncated
            ? `показаны первые ${formatInt(rows.length)}`
            : undefined
        }
      />
    </>
  );
}

/* ---------- Фирменный жест: снимок строки летит по дуге к «Материалам» ---------- */

function flyToRegistry(row: HTMLElement, scroller: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const scope = row.closest("[data-desk]") ?? document;
  const targets = Array.from(scope.querySelectorAll<HTMLElement>("[data-pin-target]"));
  const target = targets.find((el) => el.offsetParent !== null);
  if (!target) return;

  const box = scroller.getBoundingClientRect();
  const rr = row.getBoundingClientRect();
  const left = Math.max(rr.left, box.left);
  const width = Math.max(120, Math.min(rr.right, box.right) - left);
  const to = target.getBoundingClientRect();

  const ghost = document.createElement("div");
  ghost.setAttribute("aria-hidden", "true");
  ghost.textContent = Array.from(row.querySelectorAll("td[data-col]"))
    .map((td) => td.textContent ?? "")
    .join("   ");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${left}px`,
    top: `${rr.top}px`,
    width: `${width}px`,
    height: "24px",
    padding: "0 12px",
    background: "var(--sodium-wash)",
    color: "var(--ink-1)",
    font: "13px/24px var(--font-mono)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "90",
    transformOrigin: "50% 50%",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.append(ghost);

  const dx = to.left + to.width / 2 - (left + width / 2);
  const dy = to.top + to.height / 2 - (rr.top + 12);
  const anim = ghost.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 56}px) scale(0.62)`, opacity: 1, offset: 0.5 },
      { opacity: 1, offset: 0.7 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0 },
    ],
    { duration: 420, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "forwards" }
  );
  anim.onfinish = () => ghost.remove();
  anim.oncancel = () => ghost.remove();
}

/* ---------- Подвал ---------- */

function Footer({ fields = [], note, slow }: { fields?: string[]; note?: string; slow: boolean }) {
  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 overflow-hidden border-t border-line bg-scr-base px-3 mono-12 whitespace-nowrap text-ink-3">
      {slow ? (
        <span>Выполняется…</span>
      ) : (
        fields.map((f, i) => (
          <span key={i} className="tnum">
            {f}
          </span>
        ))
      )}
      {note && !slow && <span className="ml-auto text-ink-1">{note}</span>}
    </footer>
  );
}

/* ---------- Ошибки: вывод терминала, без карточек и иконок ---------- */

/** «…«full_name»…» → имя моноширинным; в предложении — кликабельно, с пунктиром */
function Annotated({
  text,
  onPick,
  wrong,
}: {
  text: string;
  onPick?: (identifier: string, wrong?: string) => void;
  wrong?: string;
}) {
  const parts = text.split(/«([^»]+)»/g);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <span key={i}>{part}</span>;
        const ident = /^[\w.]+$/.test(part);
        if (!ident) return <span key={i}>«{part}»</span>;
        if (onPick) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(part, wrong)}
              className="mono-13 text-ink-1 underline decoration-ink-3 decoration-dashed decoration-1 underline-offset-[3px] hover:decoration-ink-1"
            >
              {part}
            </button>
          );
        }
        return (
          <span key={i} className="mono-13">
            {part}
          </span>
        );
      })}
    </>
  );
}

function ErrorOutput({
  result,
  onSuggest,
}: {
  result: QueryResult;
  onSuggest?: (identifier: string, wrong?: string) => void;
}) {
  const kind = result.errorKind ?? "sql";
  const help = result.errorHelp;

  if (kind === "locked_table") {
    const table = result.error?.match(/«([^»]+)»/)?.[1] ?? help?.explanation.match(/«([^»]+)»/)?.[1];
    return (
      <div role="alert" className="min-h-0 flex-1 overflow-auto p-3">
        <p className="max-w-[72ch] ui-14 text-ink-1">
          <span className="font-semibold text-alarm">ОТКАЗАНО.</span>{" "}
          {table ? (
            <>
              Таблица <span className="mono-13">{table}</span> засекречена.
            </>
          ) : (
            "Таблица засекречена."
          )}{" "}
          Допуск не выдан.
        </p>
      </div>
    );
  }

  if (kind === "read_only") {
    return (
      <div role="alert" className="min-h-0 flex-1 overflow-auto p-3">
        <p className="max-w-[72ch] ui-14 text-ink-1">
          <span className="font-semibold text-alarm">ОТКАЗАНО.</span> Зеркало только для чтения. Изменять
          данные нельзя.
        </p>
      </div>
    );
  }

  const wrong = help?.explanation.match(/«([\w.]+)»/)?.[1];
  const suggestion = help?.suggestion?.replace(/^Возможно, вы имели в виду /, "Возможно, ");
  const isGuess = Boolean(suggestion?.startsWith("Возможно"));

  return (
    <div role="alert" className="min-h-0 flex-1 overflow-auto p-3">
      <div className="flex max-w-[72ch] flex-col gap-1">
        <p className="ui-14 text-ink-1">
          <span className="text-alarm">Ошибка:</span>{" "}
          {help ? <Annotated text={lowerFirst(help.explanation)} /> : "запрос не выполнен."}
          {isGuess && suggestion && (
            <>
              {" "}
              <Annotated text={suggestion} onPick={onSuggest} wrong={wrong} />
            </>
          )}
        </p>
        {result.error && <p className="mono-12 break-words text-ink-3">sqlite: {result.error}</p>}
        {!isGuess && suggestion && (
          <p className="ui-14 text-ink-2">
            <Annotated text={suggestion} />
          </p>
        )}
      </div>
    </div>
  );
}
