"use client";

import { useState } from "react";
import type { TableInfo, ForeignKey } from "@/types/database";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SchemaPanelProps {
  schema: TableInfo[];
  foreignKeys: ForeignKey[];
  unlockedTables: string[] | null;
}

export function SchemaPanel({ schema, foreignKeys, unlockedTables }: SchemaPanelProps) {
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  const isUnlocked = (name: string) =>
    unlockedTables === null || unlockedTables.includes(name);

  // Group FK by "from" table for ER display
  const relevantFks = foreignKeys.filter(
    (fk) => isUnlocked(fk.from) && isUnlocked(fk.to)
  );

  // Unique tables involved in FKs
  const erTables = new Set<string>();
  for (const fk of relevantFks) {
    erTables.add(fk.from);
    erTables.add(fk.to);
  }

  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      <div className="px-3 py-2 border-b border-border flex-shrink-0">
        <span className="text-xs font-mono text-muted-foreground uppercase">
          Схема БД
        </span>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-0.5">
          {schema.map((table) => {
            const unlocked = isUnlocked(table.name);
            const expanded = expandedTable === table.name && unlocked;

            return (
              <div key={table.name}>
                <button
                  onClick={() => {
                    if (unlocked) {
                      setExpandedTable(expanded ? null : table.name);
                    }
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs font-mono flex items-center gap-2 transition-colors ${
                    unlocked
                      ? "hover:bg-muted/50 text-foreground cursor-pointer"
                      : "text-muted-foreground/40 cursor-not-allowed"
                  } ${expanded ? "bg-primary/10 border border-primary/20" : ""}`}
                >
                  <span className="flex-shrink-0 w-4 text-center">
                    {unlocked ? (
                      <span className={expanded ? "text-primary" : "text-muted-foreground"}>
                        {expanded ? "▾" : "▸"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/30">🔒</span>
                    )}
                  </span>
                  <span className={`font-bold ${unlocked ? "text-foreground" : "opacity-40"}`}>
                    {table.name}
                  </span>
                </button>

                {expanded && (
                  <div className="ml-4 pl-3 border-l border-primary/20 py-1 space-y-0.5 mb-1">
                    {table.columns.map((col) => (
                      <div
                        key={col.name}
                        className="flex items-center gap-2 text-xs font-mono px-1 py-0.5"
                      >
                        {col.pk && (
                          <span className="text-primary text-[10px] font-bold flex-shrink-0">PK</span>
                        )}
                        {!col.pk && <span className="w-[18px] flex-shrink-0" />}
                        <span className="text-foreground">{col.name}</span>
                        <span className="text-muted-foreground/50 text-[10px] uppercase">
                          {col.type}
                        </span>
                        {!col.notnull && !col.pk && (
                          <span className="text-sodium/50 text-[10px] italic">NULL?</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ER Relations */}
        {relevantFks.length > 0 && (
          <div className="px-3 pt-3 pb-2 border-t border-border mt-2">
            <span className="text-xs font-mono text-muted-foreground uppercase block mb-2">
              ER-связи
            </span>
            <div className="space-y-1.5">
              {relevantFks.map((fk, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[11px] font-mono">
                  <span className="px-1.5 py-0.5 rounded bg-muted/50 text-foreground border border-border">
                    {fk.from}
                  </span>
                  <span className="text-muted-foreground flex-shrink-0">
                    ─ ─ ─
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-muted/50 text-foreground border border-border">
                    {fk.to}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
