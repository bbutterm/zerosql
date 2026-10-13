"use client";

/**
 * Свободный архив (библия 10.4): после сезона — вся база без задач, часы на
 * 11.01.2027 13:00, патчи и query_log всех дел сезона. Частичный доступ после
 * Д6: только таблицы раскрытых дел. Отдельный маленький стор поверх того же
 * ядра; сезон (что раскрыто, тайники) берётся из стора игры.
 */
import { create } from "zustand";
import {
  createEngineClient,
  WORLD_TABLES,
  type CaseDef,
  type EngineClient,
  type ForeignKey,
  type QueryResult,
  type TableInfo,
} from "@/engine";
import { cases, secrets } from "@/data";
import { gameStore } from "./game";

export const ARCHIVE_CLOCK = "2027-01-11 13:00";
/** Дело, после которого архив открывается частично */
const PARTIAL_AFTER = 6;

export type ArchiveAccess = "none" | "partial" | "full";

export function archiveAccess(): ArchiveAccess {
  const { season } = gameStore.getState();
  if (season.ending) return "full";
  const solved = cases.filter((c) => season.solved[c.id]);
  return solved.some((c) => c.order >= PARTIAL_AFTER) ? "partial" : "none";
}

function archiveCase(access: ArchiveAccess): CaseDef {
  const { season } = gameStore.getState();
  const tables =
    access === "full"
      ? WORLD_TABLES.map((t) => t.name)
      : [...new Set(cases.filter((c) => season.solved[c.id]).flatMap((c) => c.tables))];
  return {
    id: "archive",
    order: 99,
    act: 0,
    code: "Архив",
    title: "Свободный архив",
    subtitle: "Задач нет. База открыта для чтения.",
    date: ARCHIVE_CLOCK,
    clock: { start: ARCHIVE_CLOCK },
    difficulty: "medium",
    concepts: [],
    tables,
    briefing: "",
    introScene: "",
    objectives: [],
    scenes: [],
  };
}

interface ArchiveState {
  status: "idle" | "loading" | "ready" | "failed" | "denied";
  access: ArchiveAccess;
  progress: string[];
  error: string | null;
  tables: string[];
  schema: TableInfo[];
  foreignKeys: ForeignKey[];
  draft: string;
  sql: string | null;
  result: QueryResult | null;
  busy: boolean;
  history: string[];
  open(): Promise<void>;
  setDraft(sql: string): void;
  run(sql?: string): Promise<void>;
}

let client: EngineClient | null = null;

export const useArchive = create<ArchiveState>((set, get) => ({
  status: "idle",
  access: "none",
  progress: [],
  error: null,
  tables: [],
  schema: [],
  foreignKeys: [],
  draft: "SELECT name, type\nFROM sqlite_master\nORDER BY name;",
  sql: null,
  result: null,
  busy: false,
  history: [],

  async open() {
    if (get().status === "loading" || get().status === "ready") return;
    await gameStore.persist.rehydrate();
    const access = archiveAccess();
    if (access === "none") {
      set({ status: "denied", access });
      return;
    }
    set({ status: "loading", access, error: null });
    try {
      client ??= createEngineClient({ secrets });
      await client.init((p) => set((st) => ({ progress: [...st.progress, p.text].slice(-5) })));
      const { season, profile } = gameStore.getState();
      const ordered = [...cases].sort((a, b) => a.order - b.order);
      const def = archiveCase(access);
      const opened = await client.openCase(def, {
        startClock: ARCHIVE_CLOCK,
        ...(profile.playerName ? { playerName: profile.playerName } : {}),
        patches: ordered.flatMap((c) => season.casePatches[c.id] ?? []),
        queryLog: ordered.flatMap((c) => season.caseQueryLog[c.id] ?? []),
      });
      set({ status: "ready", tables: def.tables, schema: opened.schema, foreignKeys: opened.foreignKeys });
    } catch (error) {
      set({ status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  },

  setDraft: (draft) => set({ draft }),

  async run(sqlIn) {
    const sql = (sqlIn ?? get().draft).trim();
    if (!sql || !client || get().busy || get().status !== "ready") return;
    set({ busy: true });
    try {
      const ev = await client.run(sql);
      set((st) => ({ result: ev.result, sql, history: [sql, ...st.history.filter((h) => h !== sql)].slice(0, 50) }));
      if (ev.secrets.length) {
        gameStore.setState((st) => ({
          season: { ...st.season, foundSecrets: [...new Set([...st.season.foundSecrets, ...ev.secrets])] },
          toasts: [...st.toasts, ...ev.secrets.map((refId, i) => ({ id: Date.now() + i, kind: "secret" as const, refId }))],
        }));
      }
    } finally {
      set({ busy: false });
    }
  },
}));
