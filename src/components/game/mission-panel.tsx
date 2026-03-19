"use client";

import { useState } from "react";
import type { Mission } from "@/types/mission";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface MissionPanelProps {
  mission: Mission;
  completedObjectives: Set<string>;
  hintsRevealed: number;
  onRevealHint: () => void;
  feedbackMessages: { objectiveId: string; message: string }[];
}

const DIFFICULTY_LABELS: Record<Mission["difficulty"], string> = {
  tutorial: "Обучение",
  easy: "Лёгкое",
  medium: "Среднее",
  hard: "Сложное",
};

const DIFFICULTY_COLORS: Record<Mission["difficulty"], string> = {
  tutorial: "bg-blue-900/50 text-blue-300",
  easy: "bg-noir-green/20 text-green-300",
  medium: "bg-noir-amber/20 text-amber-300",
  hard: "bg-noir-red/20 text-red-300",
};

export function MissionPanel({
  mission,
  completedObjectives,
  hintsRevealed,
  onRevealHint,
  feedbackMessages,
}: MissionPanelProps) {
  const [briefingExpanded, setBriefingExpanded] = useState(true);
  const totalObjectives = mission.objectives.length;
  const completedCount = completedObjectives.size;
  const allComplete = completedCount === totalObjectives;

  return (
    <div className="flex flex-col h-full bg-card border-r border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-primary tracking-wide uppercase">
            Дело
          </h2>
          <Badge className={DIFFICULTY_COLORS[mission.difficulty]} variant="secondary">
            {DIFFICULTY_LABELS[mission.difficulty]}
          </Badge>
        </div>
        <h3 className="text-foreground font-bold">{mission.title}</h3>
        <p className="text-xs text-muted-foreground">{mission.subtitle}</p>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {/* Briefing */}
          <div>
            <button
              onClick={() => setBriefingExpanded(!briefingExpanded)}
              className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors w-full text-left"
            >
              <span>{briefingExpanded ? "▾" : "▸"}</span>
              Брифинг
            </button>
            {briefingExpanded && (
              <div className="mt-2 text-sm text-foreground/80 leading-relaxed whitespace-pre-line font-sans">
                {mission.briefing}
              </div>
            )}
          </div>

          <Separator />

          {/* Objectives */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Задания ({completedCount}/{totalObjectives})
              </span>
              {allComplete && (
                <Badge className="bg-noir-green/20 text-green-300" variant="secondary">
                  Выполнено
                </Badge>
              )}
            </div>
            <div className="space-y-2">
              {mission.objectives
                .sort((a, b) => a.order - b.order)
                .map((obj) => {
                  const done = completedObjectives.has(obj.id);
                  const feedback = feedbackMessages.find(
                    (f) => f.objectiveId === obj.id
                  );
                  return (
                    <div
                      key={obj.id}
                      className={`p-2 rounded border text-sm transition-colors ${
                        done
                          ? "border-noir-green/30 bg-noir-green/5"
                          : "border-border bg-background/50"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 inline-block w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center text-xs ${
                            done
                              ? "border-noir-green bg-noir-green text-background"
                              : "border-muted-foreground"
                          }`}
                        >
                          {done && "✓"}
                        </span>
                        <span
                          className={
                            done ? "text-muted-foreground line-through" : ""
                          }
                        >
                          {obj.description}
                        </span>
                      </div>
                      {feedback && (
                        <p className="mt-1 ml-6 text-xs text-noir-green italic">
                          {feedback.message}
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          <Separator />

          {/* Hints */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Подсказки
              </span>
              {hintsRevealed < mission.hints.length && (
                <button
                  onClick={onRevealHint}
                  className="text-xs text-primary hover:underline"
                >
                  Раскрыть ({hintsRevealed}/{mission.hints.length})
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {mission.hints.slice(0, hintsRevealed).map((hint, i) => (
                <p
                  key={i}
                  className="text-xs text-muted-foreground pl-3 border-l-2 border-primary/30"
                >
                  {hint}
                </p>
              ))}
              {hintsRevealed === 0 && (
                <p className="text-xs text-noir-dim italic">
                  Подсказки скрыты. Попробуйте сами.
                </p>
              )}
            </div>
          </div>

          {/* SQL Concepts */}
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground block mb-2">
              Концепции SQL
            </span>
            <div className="flex flex-wrap gap-1">
              {mission.sqlConcepts.map((concept) => (
                <Badge
                  key={concept}
                  variant="outline"
                  className="text-xs font-mono"
                >
                  {concept}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Progress bar */}
      <div className="px-4 py-2 border-t border-border flex-shrink-0">
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{
              width: `${(completedCount / totalObjectives) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
