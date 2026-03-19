"use client";

import { useEffect, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useGameStore } from "@/stores/game-store";
import { ResultsTable } from "@/components/game/results-table";
import { SchemaPanel } from "@/components/game/schema-panel";
import { CasePanel } from "@/components/game/case-panel";
import { TopBar } from "@/components/game/top-bar";
import { missions } from "@/data/missions";
import { Skeleton } from "@/components/ui/skeleton";

const SqlEditor = dynamic(
  () =>
    import("@/components/game/sql-editor").then((mod) => ({
      default: mod.SqlEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-background">
        <Skeleton className="w-full h-full" />
      </div>
    ),
  }
);

export default function GamePage() {
  const {
    dbReady,
    currentMissionId,
    completedMissions,
    objectiveStatus,
    hintsRevealed,
    queryHistory,
    feedbackMessages,
    missionCompleteNarrative,
    _schema,
    _foreignKeys,
    _lastResult,
    _sqlValue,
    initDatabase,
    executeSQL,
    setSqlValue,
    startMission,
    revealHint,
    dismissNarrative,
    getCurrentMission,
  } = useGameStore();

  const [resultsFullscreen, setResultsFullscreen] = useState(false);

  useEffect(() => {
    initDatabase();
  }, [initDatabase]);

  // Esc to close fullscreen
  useEffect(() => {
    if (!resultsFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setResultsFullscreen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [resultsFullscreen]);

  useEffect(() => {
    if (dbReady && !currentMissionId) {
      const firstUncompleted = missions.find(
        (m) => !completedMissions.includes(m.id)
      );
      if (firstUncompleted) {
        startMission(firstUncompleted.id);
      }
    }
  }, [dbReady, currentMissionId, completedMissions, startMission]);

  const handleExecute = useCallback(() => {
    const trimmed = _sqlValue.trim();
    if (trimmed) {
      executeSQL(trimmed);
    }
  }, [_sqlValue, executeSQL]);

  const mission = getCurrentMission();
  const missionIndex = mission ? missions.findIndex((m) => m.id === mission.id) : 0;
  const completed = currentMissionId
    ? objectiveStatus[currentMissionId] ?? new Set<string>()
    : new Set<string>();
  const hints = currentMissionId
    ? hintsRevealed[currentMissionId] ?? 0
    : 0;

  if (!dbReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="space-y-1">
            <p className="text-foreground font-mono text-sm">
              ЗАГРУЗКА БАЗЫ ДАННЫХ...
            </p>
            <p className="text-muted-foreground text-xs font-mono">
              Инициализация полицейской системы DataCity
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Mission complete overlay */}
      {missionCompleteNarrative && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8">
          <div className="max-w-lg bg-card border border-primary/30 rounded-lg p-8 space-y-6">
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-noir-green" />
              <h2 className="text-primary font-bold text-lg uppercase tracking-wider">
                Дело закрыто
              </h2>
            </div>
            <p className="text-foreground/80 leading-relaxed whitespace-pre-line text-sm">
              {missionCompleteNarrative}
            </p>
            <button
              onClick={() => {
                dismissNarrative();
                const next = missions.find(
                  (m) => !completedMissions.includes(m.id) && m.id !== currentMissionId
                );
                if (next) startMission(next.id);
              }}
              className="w-full py-2 bg-primary text-primary-foreground font-mono text-sm rounded hover:opacity-90 transition-opacity"
            >
              {missions.some(
                (m) => !completedMissions.includes(m.id) && m.id !== currentMissionId
              )
                ? "Следующее дело"
                : "Вернуться в систему"}
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen results overlay */}
      {resultsFullscreen && (
        <div className="fixed inset-0 z-40 bg-background flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
            <span className="text-sm font-mono text-muted-foreground">
              РЕЗУЛЬТАТ — полный экран
            </span>
            <button
              onClick={() => setResultsFullscreen(false)}
              className="text-xs font-mono text-primary hover:underline"
            >
              Закрыть (Esc)
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ResultsTable result={_lastResult} />
          </div>
        </div>
      )}

      {/* Top bar */}
      <TopBar
        missionIndex={missionIndex}
        missionTitle={mission?.title ?? "Инициализация..."}
        queryCount={queryHistory.length}
        dbReady={dbReady}
        completedMissions={completedMissions}
        currentMissionId={currentMissionId}
        onSelectMission={startMission}
      />

      {/* Main 3-column layout */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: Schema + debug */}
        <div className="w-[220px] flex-shrink-0 flex flex-col">
          <SchemaPanel
            schema={_schema}
            foreignKeys={_foreignKeys}
            unlockedTables={mission?.unlockedTables ?? null}
          />
          <button
            onClick={() => useGameStore.getState().resetCurrentMission()}
            className="mx-2 mb-2 px-2 py-1 text-[10px] font-mono text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 rounded border border-transparent hover:border-destructive/20 transition-colors"
          >
            ↺ Сбросить главу
          </button>
        </div>

        {/* Center: Briefing + Editor + Results */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 border-x border-border">
          {/* SQL Editor */}
          <div className="flex-1 min-h-[120px] max-h-[40%]">
            <SqlEditor
              value={_sqlValue}
              onChange={setSqlValue}
              onExecute={handleExecute}
              schema={_schema}
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 px-4 py-2 border-y border-border bg-card flex-shrink-0">
            <button
              onClick={handleExecute}
              className="px-4 py-1.5 bg-primary text-primary-foreground font-mono text-sm rounded hover:opacity-90 transition-opacity"
            >
              Выполнить (Ctrl+Enter)
            </button>
            <button
              onClick={handleExecute}
              className="px-4 py-1.5 bg-muted text-foreground font-mono text-sm rounded hover:bg-muted/80 transition-colors border border-border"
            >
              Проверить ответ
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 min-h-[100px] overflow-hidden relative">
            {_lastResult && _lastResult.columns.length > 0 && (
              <button
                onClick={() => setResultsFullscreen(true)}
                className="absolute top-2 right-3 z-10 text-muted-foreground hover:text-primary transition-colors text-sm"
                title="Полный экран"
              >
                ⤢
              </button>
            )}
            <ResultsTable result={_lastResult} />
          </div>
        </div>

        {/* Right: Case panel */}
        {mission && (
          <div className="w-[260px] flex-shrink-0">
            <CasePanel
              mission={mission}
              completedObjectives={completed}
              hintsRevealed={hints}
              onRevealHint={revealHint}
              feedbackMessages={feedbackMessages}
            />
          </div>
        )}
      </div>
    </div>
  );
}
