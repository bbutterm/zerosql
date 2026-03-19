"use client";

import { useState } from "react";
import type { Mission } from "@/types/mission";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface CasePanelProps {
  mission: Mission;
  completedObjectives: Set<string>;
  hintsRevealed: number;
  onRevealHint: () => void;
  feedbackMessages: { objectiveId: string; message: string }[];
}

export function CasePanel({
  mission,
  completedObjectives,
  hintsRevealed,
  onRevealHint,
  feedbackMessages,
}: CasePanelProps) {
  const totalObjectives = mission.objectives.length;
  const completedCount = completedObjectives.size;
  const [briefingOpen, setBriefingOpen] = useState(true);

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-4">
          {/* БРИФИНГ */}
          <div>
            <button
              onClick={() => setBriefingOpen(!briefingOpen)}
              className="flex items-center gap-2 w-full text-left mb-1"
            >
              <span className="text-muted-foreground text-xs">{briefingOpen ? "▾" : "▸"}</span>
              <span className="text-xs font-mono text-muted-foreground tracking-wider uppercase">
                Брифинг
              </span>
            </button>
            {briefingOpen && (
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                {mission.briefing}
              </p>
            )}
          </div>

          <Separator />

          {/* ЦЕЛИ */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-muted-foreground tracking-wider uppercase">
                Цели
              </span>
              <span className="text-xs font-mono text-muted-foreground">
                {completedCount}/{totalObjectives}
              </span>
            </div>
            <div className="space-y-1.5">
              {mission.objectives
                .sort((a, b) => a.order - b.order)
                .map((obj, idx) => {
                  const done = completedObjectives.has(obj.id);
                  // Active = first non-completed objective
                  const active =
                    !done &&
                    mission.objectives
                      .sort((a, b) => a.order - b.order)
                      .findIndex((o) => !completedObjectives.has(o.id)) === idx;
                  const locked = !done && !active;
                  const feedback = feedbackMessages.find(
                    (f) => f.objectiveId === obj.id
                  );

                  return (
                    <div
                      key={obj.id}
                      className={`px-2.5 py-2 rounded text-sm transition-colors ${
                        done
                          ? "bg-noir-green/10 border border-noir-green/20"
                          : active
                          ? "bg-primary/5 border border-primary/20"
                          : "bg-muted/20 border border-border/50"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex-shrink-0 text-sm">
                          {done ? (
                            <span className="text-noir-green">✓</span>
                          ) : locked ? (
                            <span className="text-muted-foreground/40">🔒</span>
                          ) : (
                            <span className="text-primary">●</span>
                          )}
                        </span>
                        <span
                          className={`text-sm ${
                            done
                              ? "text-muted-foreground line-through"
                              : locked
                              ? "text-muted-foreground/50"
                              : "text-foreground"
                          }`}
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

          {/* УЛИКИ */}
          <div>
            <span className="text-xs font-mono text-muted-foreground tracking-wider uppercase block mb-2">
              Улики
            </span>
            <div className="space-y-1.5">
              {mission.objectives
                .sort((a, b) => a.order - b.order)
                .map((obj) => {
                  const done = completedObjectives.has(obj.id);
                  const reward = obj.storyReward;
                  if (!reward) return null;

                  return (
                    <div
                      key={obj.id}
                      className={`px-2.5 py-2 rounded text-xs ${
                        done
                          ? "bg-primary/10 border border-primary/20"
                          : "bg-muted/20 border border-border/50"
                      }`}
                    >
                      {done ? (
                        <>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-noir-green">✓</span>
                            <span className="text-primary font-bold font-mono">
                              {obj.description}
                            </span>
                          </div>
                          <p className="text-foreground/70 text-xs leading-relaxed">
                            {reward}
                          </p>
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground/40">🔒</span>
                          <span className="text-muted-foreground/50 italic">
                            Улика заблокирована
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          <Separator />

          {/* ПОДСКАЗКИ */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-muted-foreground tracking-wider uppercase">
                Подсказки
              </span>
              {hintsRevealed < mission.hints.length && (
                <button
                  onClick={onRevealHint}
                  className="text-xs text-primary hover:underline font-mono"
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
        </div>
      </ScrollArea>
    </div>
  );
}
