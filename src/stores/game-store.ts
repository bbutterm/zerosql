"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Database } from "sql.js";
import type { QueryHistoryEntry } from "@/types/game";
import {
  initEngine,
  executeSQL as engineExecuteSQL,
  checkMissionProgress,
  isMissionComplete,
} from "@/engine";
import type { QueryResult, TableInfo, ForeignKey, Mission } from "@/engine";
import { missions } from "@/data/missions";

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
          const { db, schema, foreignKeys } = await initEngine();
          set({ dbReady: true, _db: db, _schema: schema, _foreignKeys: foreignKeys });
        } catch (e) {
          console.error("Failed to init database:", e);
        }
      },

      executeSQL: (sqlInput: string) => {
        const { _db, currentMissionId, objectiveStatus } = get();
        if (!_db) return;

        const currentMission = currentMissionId
          ? missions.find((m) => m.id === currentMissionId)
          : null;
        const result = engineExecuteSQL(
          _db,
          sqlInput,
          currentMission?.unlockedTables ?? null
        );
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
            const results = checkMissionProgress(
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
