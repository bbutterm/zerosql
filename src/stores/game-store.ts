"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Database } from "sql.js";
import type { QueryResult, TableInfo, ForeignKey } from "@/types/database";
import type { QueryHistoryEntry } from "@/types/game";
import { getDatabase, executeQuery, getTableSchema, getForeignKeys } from "@/engine/database";
import { SCHEMA_SQL } from "@/engine/schema";
import { SEED_SQL } from "@/engine/seed";
import { missions } from "@/data/missions";
import { checkObjectives, isMissionComplete } from "@/engine/mission-runner";
import { checkTableAccess } from "@/engine/table-guard";
import type { Mission } from "@/types/mission";

interface FeedbackMessage {
  objectiveId: string;
  message: string;
}

interface GameState {
  dbReady: boolean;
  currentMissionId: string | null;
  completedMissions: string[];
  objectiveStatus: Record<string, Set<string>>;
  hintsRevealed: Record<string, number>;
  queryHistory: QueryHistoryEntry[];
  feedbackMessages: FeedbackMessage[];
  missionCompleteNarrative: string | null;

  // Non-persisted (transient)
  _db: Database | null;
  _schema: TableInfo[];
  _foreignKeys: ForeignKey[];
  _lastResult: QueryResult | null;
  _sqlValue: string;

  // Actions
  initDatabase: () => Promise<void>;
  executeSQL: (sql: string) => void;
  setSqlValue: (sql: string) => void;
  startMission: (missionId: string) => void;
  revealHint: () => void;
  dismissNarrative: () => void;
  getCurrentMission: () => Mission | null;
  resetCurrentMission: () => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      dbReady: false,
      currentMissionId: null,
      completedMissions: [],
      objectiveStatus: {},
      hintsRevealed: {},
      queryHistory: [],
      feedbackMessages: [],
      missionCompleteNarrative: null,

      _db: null,
      _schema: [],
      _foreignKeys: [],
      _lastResult: null,
      _sqlValue: "SELECT * FROM suspects LIMIT 5;",

      initDatabase: async () => {
        try {
          const db = await getDatabase();
          executeQuery(db, SCHEMA_SQL);
          // Check if data already exists
          const check = executeQuery(
            db,
            "SELECT COUNT(*) as c FROM suspects"
          );
          if (
            check.rows.length === 0 ||
            (check.rows[0][0] as number) === 0
          ) {
            executeQuery(db, SEED_SQL);
          }
          const schema = getTableSchema(db);
          const foreignKeys = getForeignKeys(db);
          set({ dbReady: true, _db: db, _schema: schema, _foreignKeys: foreignKeys });
        } catch (e) {
          console.error("Failed to init database:", e);
        }
      },

      executeSQL: (sqlInput: string) => {
        const { _db, currentMissionId, objectiveStatus } = get();
        if (!_db) return;

        // Check table access before execution
        const currentMission = currentMissionId
          ? missions.find((m) => m.id === currentMissionId)
          : null;
        const access = checkTableAccess(
          sqlInput,
          currentMission?.unlockedTables ?? null
        );
        if (!access.allowed) {
          const entry: QueryHistoryEntry = {
            sql: sqlInput,
            timestamp: Date.now(),
            success: false,
            rowCount: 0,
            executionTimeMs: 0,
          };
          set({
            _lastResult: {
              columns: [],
              rows: [],
              rowCount: 0,
              executionTimeMs: 0,
              error: `[ДОСТУП ЗАПРЕЩЁН] Таблица «${access.blockedTable}» ещё не разблокирована. Продолжайте расследование — новые данные откроются в следующих делах.`,
            },
            queryHistory: [...get().queryHistory, entry],
            feedbackMessages: [],
          });
          return;
        }

        const result = executeQuery(_db, sqlInput);
        const entry: QueryHistoryEntry = {
          sql: sqlInput,
          timestamp: Date.now(),
          success: result.error === null,
          rowCount: result.rowCount,
          executionTimeMs: result.executionTimeMs,
        };

        const updates: Partial<GameState> = {
          _lastResult: result,
          queryHistory: [...get().queryHistory, entry],
          feedbackMessages: [],
        };

        // Check mission objectives
        if (currentMissionId && !result.error) {
          const mission = missions.find((m) => m.id === currentMissionId);
          if (mission) {
            const completed =
              objectiveStatus[currentMissionId] ?? new Set<string>();
            const results = checkObjectives(
              mission,
              result,
              _db,
              completed
            );

            if (results.length > 0) {
              const newCompleted = new Set(completed);
              const feedback: FeedbackMessage[] = [];
              for (const r of results) {
                newCompleted.add(r.objectiveId);
                feedback.push({
                  objectiveId: r.objectiveId,
                  message: r.outcome.message,
                });
              }

              updates.objectiveStatus = {
                ...objectiveStatus,
                [currentMissionId]: newCompleted,
              };
              updates.feedbackMessages = feedback;

              if (isMissionComplete(mission, newCompleted)) {
                updates.completedMissions = [
                  ...get().completedMissions,
                  currentMissionId,
                ];
                updates.missionCompleteNarrative =
                  mission.narrativeOnComplete;
              }
            }
          }
        }

        set(updates);
      },

      setSqlValue: (sql: string) => set({ _sqlValue: sql }),

      startMission: (missionId: string) => {
        const { objectiveStatus } = get();
        set({
          currentMissionId: missionId,
          feedbackMessages: [],
          missionCompleteNarrative: null,
          objectiveStatus: {
            ...objectiveStatus,
            [missionId]: objectiveStatus[missionId] ?? new Set<string>(),
          },
        });
      },

      revealHint: () => {
        const { currentMissionId, hintsRevealed } = get();
        if (!currentMissionId) return;
        const current = hintsRevealed[currentMissionId] ?? 0;
        set({
          hintsRevealed: {
            ...hintsRevealed,
            [currentMissionId]: current + 1,
          },
        });
      },

      dismissNarrative: () => set({ missionCompleteNarrative: null }),

      getCurrentMission: () => {
        const { currentMissionId } = get();
        if (!currentMissionId) return null;
        return missions.find((m) => m.id === currentMissionId) ?? null;
      },

      resetCurrentMission: () => {
        const { currentMissionId, objectiveStatus, completedMissions } = get();
        if (!currentMissionId) return;
        const newStatus = { ...objectiveStatus };
        newStatus[currentMissionId] = new Set<string>();
        set({
          objectiveStatus: newStatus,
          completedMissions: completedMissions.filter((id) => id !== currentMissionId),
          feedbackMessages: [],
          missionCompleteNarrative: null,
          _lastResult: null,
        });
      },
    }),
    {
      name: "zerosql-game",
      partialize: (state) => ({
        currentMissionId: state.currentMissionId,
        completedMissions: state.completedMissions,
        objectiveStatus: Object.fromEntries(
          Object.entries(state.objectiveStatus).map(([k, v]) => [
            k,
            Array.from(v),
          ])
        ),
        hintsRevealed: state.hintsRevealed,
        queryHistory: state.queryHistory.slice(-100),
      }),
      merge: (persisted, current) => {
        const p = persisted as Record<string, unknown>;
        const objStatus: Record<string, Set<string>> = {};
        if (p?.objectiveStatus) {
          for (const [k, v] of Object.entries(
            p.objectiveStatus as Record<string, string[]>
          )) {
            objStatus[k] = new Set(v);
          }
        }
        return {
          ...current,
          ...(p ?? {}),
          objectiveStatus: objStatus,
        };
      },
    }
  )
);
