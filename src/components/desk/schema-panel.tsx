"use client";

import { useState } from "react";
import {
  ChevronRight,
  CornerDownLeft,
  Database,
  KeyRound,
  Link2,
  Lock,
  Table2,
} from "lucide-react";
import type { ForeignKey, TableInfo } from "@/types/database";
import { cn } from "@/lib/utils";
import { SectionLabel } from "@/components/kit/atmosphere";
import { HintTooltip } from "@/components/kit/hint-tooltip";

export interface SchemaPanelProps {
  tables: TableInfo[];
  foreignKeys?: ForeignKey[];
  /** Открытые таблицы; null/undefined — открыты все */
  unlockedTables?: string[] | null;
  /** Вставка текста в редактор: имя таблицы, столбца или JOIN */
  onInsert?: (text: string) => void;
  /** Описания таблиц по-русски: «жители города» */
  tableNotes?: Record<string, string>;
  /** Только что открытые таблицы — отметка «новая» */
  newTables?: string[];
  /** Развёрнутые при старте */
  defaultExpanded?: string[];
  /** Показывать имена закрытых таблиц (по умолчанию скрыты инеем — без спойлеров) */
  revealLockedNames?: boolean;
  className?: string;
}

export function SchemaPanel({
  tables,
  foreignKeys = [],
  unlockedTables = null,
  onInsert,
  tableNotes = {},
  newTables = [],
  defaultExpanded = [],
  revealLockedNames = false,
  className,
}: SchemaPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(defaultExpanded));
  const isOpen = (name: string) => unlockedTables === null || unlockedTables.includes(name);

  const open = tables.filter((t) => isOpen(t.name));
  const locked = tables.filter((t) => !isOpen(t.name));
  const fkByColumn = new Map<string, ForeignKey>();
  for (const fk of foreignKeys) fkByColumn.set(`${fk.from}.${fk.fromColumn}`, fk);
  const relations = foreignKeys.filter((fk) => isOpen(fk.from) && isOpen(fk.to));

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <section aria-label="Схема базы данных" className={cn("flex min-h-0 min-w-0 flex-col", className)}>
      <header className="flex min-h-11 items-center justify-between gap-2 border-b border-frost-line px-3">
        <SectionLabel icon={<Database className="size-3.5 text-aurora" />} className="text-frost">
          Схема
        </SectionLabel>
        <span className="text-[11px] text-frost-dim tabular-nums">
          открыто {open.length} из {tables.length}
        </span>
      </header>

      <div className="scrollbar-ice min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <ul className="flex flex-col gap-0.5">
          {open.map((table) => {
            const isExpanded = expanded.has(table.name);
            const isNew = newTables.includes(table.name);
            const panelId = `schema-${table.name}`;
            return (
              <li key={table.name}>
                <div
                  className={cn(
                    "group/table flex items-center gap-0.5 rounded-md pr-1 transition-colors",
                    isExpanded ? "bg-ink-high/70" : "hover:bg-steam/[0.04]"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggle(table.name)}
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    aria-label={`${isExpanded ? "Свернуть" : "Развернуть"} таблицу ${table.name}`}
                    className="grid size-7 shrink-0 place-items-center rounded text-frost-dim hover:text-steam"
                  >
                    <ChevronRight
                      className={cn("size-3.5 transition-transform duration-200", isExpanded && "rotate-90 text-aurora")}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => (onInsert ? onInsert(table.name) : toggle(table.name))}
                    title={onInsert ? `Вставить «${table.name}» в запрос` : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded py-1.5 text-left"
                  >
                    <Table2 className="size-3.5 shrink-0 text-aurora/80" aria-hidden />
                    <span className="min-w-0 truncate font-mono text-[13px] font-medium text-steam">
                      {table.name}
                    </span>
                    {isNew && (
                      <span className="shrink-0 rounded-sm bg-aurora/15 px-1 font-display text-[8.5px] font-semibold uppercase tracking-[0.14em] text-aurora">
                        новая
                      </span>
                    )}
                    {onInsert && (
                      <CornerDownLeft
                        aria-hidden
                        className="ml-auto size-3 shrink-0 text-frost-dim opacity-0 transition-opacity group-hover/table:opacity-100"
                      />
                    )}
                  </button>
                  <span className="shrink-0 pl-1 font-mono text-[10px] text-frost-faint tabular-nums">
                    {table.columns.length}
                  </span>
                </div>

                <div
                  id={panelId}
                  className={cn(
                    "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                    isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  )}
                  inert={!isExpanded}
                >
                  <div className="overflow-hidden">
                    {tableNotes[table.name] && (
                      <p className="mt-1 ml-9 pr-2 text-[11.5px] leading-snug text-frost-dim">
                        {tableNotes[table.name]}
                      </p>
                    )}
                    <ul className="mt-1 mb-2 ml-[18px] border-l border-frost-line pl-2">
                      {table.columns.map((col) => {
                        const fk = fkByColumn.get(`${table.name}.${col.name}`);
                        return (
                          <li key={col.name}>
                            <button
                              type="button"
                              onClick={() => onInsert?.(col.name)}
                              disabled={!onInsert}
                              title={
                                fk
                                  ? `${col.name} → ${fk.to}.${fk.toColumn}`
                                  : `${col.name}: ${col.type || "любой тип"}${col.notnull ? ", NOT NULL" : ""}`
                              }
                              className="group/col flex w-full items-center gap-2 rounded px-1.5 py-[3px] text-left font-mono text-[12px] transition-colors enabled:hover:bg-aurora/[0.07] disabled:cursor-default"
                            >
                              <span className="grid w-4 shrink-0 place-items-center">
                                {col.pk ? (
                                  <KeyRound className="size-3 text-sodium" aria-label="первичный ключ" />
                                ) : fk ? (
                                  <Link2 className="size-3 text-aurora-violet-soft" aria-label="внешний ключ" />
                                ) : (
                                  <span aria-hidden className="size-1 rounded-full bg-frost-faint" />
                                )}
                              </span>
                              <span className={cn("min-w-0 truncate", col.pk ? "text-sodium" : "text-steam/90")}>
                                {col.name}
                              </span>
                              {fk && (
                                <span className="hidden min-w-0 truncate text-[10.5px] text-aurora-violet-soft/80 xl:inline">
                                  → {fk.to}
                                </span>
                              )}
                              <span className="ml-auto shrink-0 text-[10.5px] lowercase text-frost-dim">
                                {col.type || "—"}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {locked.length > 0 && (
          <>
            <div className="mt-3 mb-1.5 flex items-center gap-2 px-2">
              <span className="font-display text-[9.5px] uppercase tracking-[0.2em] text-frost-dim">Засекречено</span>
              <span aria-hidden className="ice-crack flex-1 opacity-60" />
            </div>
            <ul className="flex flex-col gap-1">
              {locked.map((table) => (
                <li key={table.name}>
                  <HintTooltip content="Откроется по ходу дела" side="right">
                    <button
                      type="button"
                      aria-disabled
                      aria-label={revealLockedNames ? `Таблица ${table.name} закрыта` : "Закрытая таблица"}
                      className="relative flex w-full cursor-not-allowed items-center gap-2 overflow-hidden rounded-md border border-frost-line bg-[linear-gradient(115deg,rgb(188_203_224/0.07),rgb(139_92_246/0.06)_50%,rgb(188_203_224/0.04))] px-2.5 py-2 text-left"
                    >
                      <span aria-hidden className="pointer-events-none absolute inset-0 bg-grain opacity-[0.12] mix-blend-overlay" />
                      <Lock className="relative size-3.5 shrink-0 text-aurora-violet-soft/80" aria-hidden />
                      {revealLockedNames ? (
                        <span className="relative truncate font-mono text-[13px] text-frost-dim blur-[0.6px]">
                          {table.name}
                        </span>
                      ) : (
                        <span
                          aria-hidden
                          className="relative h-2.5 rounded-full bg-frost/20"
                          style={{ width: `${Math.min(10, Math.max(4, table.name.length)) * 0.5}rem` }}
                        />
                      )}
                    </button>
                  </HintTooltip>
                </li>
              ))}
            </ul>
          </>
        )}

        {relations.length > 0 && (
          <>
            <div className="mt-4 mb-1.5 flex items-center gap-2 px-2">
              <span className="font-display text-[9.5px] uppercase tracking-[0.2em] text-frost-dim">Связи</span>
              <span aria-hidden className="h-px flex-1 bg-frost-line" />
            </div>
            <ul className="flex flex-col gap-0.5 pb-2">
              {relations.map((fk) => (
                <li key={`${fk.from}.${fk.fromColumn}->${fk.to}.${fk.toColumn}`}>
                  <button
                    type="button"
                    disabled={!onInsert}
                    onClick={() =>
                      onInsert?.(`JOIN ${fk.to} ON ${fk.from}.${fk.fromColumn} = ${fk.to}.${fk.toColumn}`)
                    }
                    title={onInsert ? "Вставить JOIN по этой связи" : undefined}
                    className="flex w-full flex-wrap items-center gap-x-1.5 rounded px-2 py-1 text-left font-mono text-[11px] text-frost transition-colors enabled:hover:bg-aurora-violet/10 disabled:cursor-default"
                  >
                    <span className="text-steam/90">
                      {fk.from}.<span className="text-frost-dim">{fk.fromColumn}</span>
                    </span>
                    <span aria-hidden className="text-aurora-violet-soft">→</span>
                    <span className="text-steam/90">
                      {fk.to}.<span className="text-frost-dim">{fk.toColumn}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
