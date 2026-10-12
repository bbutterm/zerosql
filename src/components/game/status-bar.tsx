"use client";

interface StatusBarProps {
  missionTitle: string | null;
  dbReady: boolean;
  queryCount: number;
}

export function StatusBar({
  missionTitle,
  dbReady,
  queryCount,
}: StatusBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-card border-t border-border text-xs font-mono">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-2 h-2 ${
              dbReady ? "bg-cold" : "bg-alarm"
            }`}
          />
          <span className="text-muted-foreground">
            {dbReady ? "БД активна" : "Загрузка БД..."}
          </span>
        </div>
        {missionTitle && (
          <span className="text-foreground/70">
            Дело: <span className="text-primary">{missionTitle}</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 text-muted-foreground">
        <span>Запросов: {queryCount}</span>
        <span>ZeroSQL v0.1</span>
      </div>
    </div>
  );
}
