"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { missions } from "@/data/missions";

interface TopBarProps {
  missionIndex: number;
  missionTitle: string;
  queryCount: number;
  dbReady: boolean;
  completedMissions: string[];
  currentMissionId: string | null;
  onSelectMission: (missionId: string) => void;
}

export function TopBar({
  missionIndex,
  missionTitle,
  queryCount,
  dbReady,
  completedMissions,
  currentMissionId,
  onSelectMission,
}: TopBarProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border col-span-3">
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-sm font-mono hover:text-primary transition-colors"
        >
          <span className="text-muted-foreground">ДЕЛО #{missionIndex + 1}</span>
          <span className="text-muted-foreground/40">›</span>
          <span className="text-primary font-bold">{missionTitle}</span>
          <span className="text-muted-foreground/60 text-xs ml-1">{open ? "▴" : "▾"}</span>
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-1 z-50 min-w-[280px] bg-card border border-border rounded-sm shadow-lg py-1">
            <div className="px-3 py-1.5 text-xs font-mono text-muted-foreground uppercase border-b border-border">
              Навигация по делам
            </div>
            {missions.map((m, idx) => {
              const isCompleted = completedMissions.includes(m.id);
              const isCurrent = m.id === currentMissionId;
              const isAccessible = isCompleted || isCurrent || completedMissions.length >= idx;

              return (
                <button
                  key={m.id}
                  onClick={() => {
                    if (isAccessible) {
                      onSelectMission(m.id);
                      setOpen(false);
                    }
                  }}
                  disabled={!isAccessible}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm transition-colors ${
                    isCurrent
                      ? "bg-primary/10 text-primary"
                      : isAccessible
                      ? "hover:bg-muted/50 text-foreground"
                      : "text-muted-foreground/30 cursor-not-allowed"
                  }`}
                >
                  <span className="flex-shrink-0 w-5 text-center font-mono text-xs">
                    {isCompleted ? (
                      <span className="text-cold">✓</span>
                    ) : isCurrent ? (
                      <span className="text-primary">●</span>
                    ) : isAccessible ? (
                      <span className="text-muted-foreground">{idx + 1}</span>
                    ) : (
                      <span className="text-muted-foreground/30">🔒</span>
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className={`font-mono text-xs ${isCurrent ? "text-primary" : "text-muted-foreground"}`}>
                      Дело #{idx + 1}
                    </div>
                    <div className={`truncate ${!isAccessible ? "text-muted-foreground/30" : ""}`}>
                      {m.title}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-2 h-2 ${
              dbReady ? "bg-cold" : "bg-alarm"
            }`}
          />
          <span className="text-xs font-mono text-muted-foreground">
            {dbReady ? "БД" : "..."}
          </span>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          Детектив &middot; {queryCount} запросов
        </Badge>
      </div>
    </div>
  );
}
