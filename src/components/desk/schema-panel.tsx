"use client";

import { useState } from "react";
import type { ForeignKey, TableInfo } from "@/types/database";
import { cn } from "@/lib/utils";
import { Glyph } from "@/components/kit/glyphs";
import { HintTooltip } from "@/components/kit/hint-tooltip";
import { PanelHeader, Redaction } from "@/components/kit/screen";

export interface SchemaPanelProps {
  tables: TableInfo[];
  foreignKeys?: ForeignKey[];
  /** Открытые таблицы; null/undefined — открыты все */
  unlockedTables?: string[] | null;
  /** Вставка текста в редактор: имя таблицы, столбца или JOIN */
  onInsert?: (text: string) => void;
  /** Описания таблиц по-русски: «Журнал пропусков: кто, где и когда прошёл.» */
  tableNotes?: Record<string, string>;
  /** Только что открытые таблицы — подсветка, которая гаснет */
  newTables?: string[];
  /** Развёрнутые при старте */
  defaultExpanded?: string[];
  /** Показывать имена закрытых таблиц (по умолчанию — плашка-редактура без текста) */
  revealLockedNames?: boolean;
  className?: string;
}

/**
 * Схема (раздел 7.5): тихая колонка --scr-side, строки 22 px, PT Mono.
 * Ключи пишутся текстом (pk, → staff), закрытое — вымарано. Иконок нет.
 */
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
  // Подсветка новой таблицы держится, пока игрок её не заметил (наведение или раскрытие)
  const [noticed, setNoticed] = useState<Set<string>>(() => new Set(defaultExpanded));
  const isOpen = (name: string) => unlockedTables === null || unlockedTables.includes(name);

  const open = tables.filter((t) => isOpen(t.name));
  const locked = tables.filter((t) => !isOpen(t.name));
  const fkByColumn = new Map<string, ForeignKey>();
  for (const fk of foreignKeys) fkByColumn.set(`${fk.from}.${fk.fromColumn}`, fk);
  const relations = foreignKeys.filter((fk) => isOpen(fk.from) && isOpen(fk.to));

  const notice = (name: string) =>
    setNoticed((prev) => (prev.has(name) ? prev : new Set(prev).add(name)));
  const toggle = (name: string) => {
    notice(name);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const expand = (name: string) => {
    notice(name);
    setExpanded((prev) => (prev.has(name) ? prev : new Set(prev).add(name)));
  };

  return (
    <section aria-label="Схема" className={cn("flex min-h-0 min-w-0 flex-col bg-scr-side", className)}>
      <PanelHeader title="Схема">
        <span className="mono-12 text-ink-3">
          {open.length}&nbsp;из&nbsp;{tables.length}
        </span>
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        <ul aria-label="Таблицы">
          {open.map((table) => {
            const isExpanded = expanded.has(table.name);
            const isNew = newTables.includes(table.name);
            const panelId = `schema-${table.name}`;
            return (
              <li key={table.name}>
                <div
                  onMouseEnter={isNew ? () => notice(table.name) : undefined}
                  className={cn(
                    "flex h-[22px] items-center pr-3 hover:bg-scr-raise",
                    isNew && !noticed.has(table.name) && "bg-sodium-wash",
                    isNew && noticed.has(table.name) && "anim-wash [--wash-delay:0ms]"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggle(table.name)}
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    aria-label={`${isExpanded ? "Свернуть" : "Развернуть"} ${table.name}`}
                    className="grid h-full w-7 shrink-0 place-items-center pl-1 text-ink-3 hover:text-ink-1"
                  >
                    <Glyph name={isExpanded ? "disclosure-open" : "disclosure"} size={10} />
                  </button>
                  <button
                    type="button"
                    onClick={() => (onInsert ? onInsert(table.name) : toggle(table.name))}
                    title={onInsert ? "Вставить в запрос" : undefined}
                    className="min-w-0 flex-1 truncate text-left mono-13 leading-[22px] text-ink-1"
                  >
                    {table.name}
                  </button>
                </div>

                {isExpanded && (
                  <div id={panelId}>
                    {tableNotes[table.name] && (
                      <p className="pr-3 pb-1 pl-7 ui-12 text-ink-3">{tableNotes[table.name]}</p>
                    )}
                    <ul aria-label={`Столбцы ${table.name}`} className="pb-1">
                      {table.columns.map((col) => {
                        const fk = fkByColumn.get(`${table.name}.${col.name}`);
                        return (
                          <li key={col.name} className="flex h-[22px] items-center pr-3 pl-9 hover:bg-scr-raise">
                            <button
                              type="button"
                              onClick={() => onInsert?.(col.name)}
                              disabled={!onInsert}
                              title={onInsert ? "Вставить в запрос" : undefined}
                              className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left disabled:cursor-default"
                            >
                              <span className="truncate mono-13 leading-[22px] text-ink-2">{col.name}</span>
                              {col.pk && <span className="mono-11 text-ink-3">pk</span>}
                            </button>
                            {fk ? (
                              <button
                                type="button"
                                onClick={() => expand(fk.to)}
                                title={`${fk.to}.${fk.toColumn}`}
                                className="ml-2 shrink-0 mono-11 text-ink-3 hover:text-ink-1"
                              >
                                → {fk.to}
                              </button>
                            ) : (
                              <span className="ml-2 shrink-0 mono-11 text-ink-3">{col.type.toLowerCase() || "—"}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}

          {locked.map((table) => (
            <li key={table.name}>
              <HintTooltip content="Засекречено" side="right">
                <div
                  tabIndex={0}
                  aria-label={revealLockedNames ? `${table.name}: засекречено` : "Засекреченная таблица"}
                  className="flex h-[22px] cursor-default items-center pr-3 pl-7 hover:bg-scr-raise"
                >
                  {revealLockedNames ? (
                    <span className="truncate mono-13 leading-[22px] text-ink-3">{table.name}</span>
                  ) : (
                    <span className="mono-13">
                      <Redaction chars={table.name.length} />
                    </span>
                  )}
                </div>
              </HintTooltip>
            </li>
          ))}
        </ul>

        {relations.length > 0 && (
          <div className="pt-4">
            <h3 className="px-3 pb-1 ui-13 font-medium text-ink-2">Связи</h3>
            <ul aria-label="Связи">
              {relations.map((fk) => (
                <li key={`${fk.from}.${fk.fromColumn}->${fk.to}.${fk.toColumn}`}>
                  <button
                    type="button"
                    disabled={!onInsert}
                    onClick={() => onInsert?.(`JOIN ${fk.to} ON ${fk.from}.${fk.fromColumn} = ${fk.to}.${fk.toColumn}`)}
                    title={onInsert ? "Вставить JOIN по этой связи" : undefined}
                    className="block min-h-[22px] w-full py-[2px] pr-3 pl-6 -indent-3 text-left mono-12 break-words text-ink-2 enabled:hover:bg-scr-raise disabled:cursor-default"
                  >
                    {fk.from}.{fk.fromColumn} →{"\u00A0"}{fk.to}.{fk.toColumn}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
