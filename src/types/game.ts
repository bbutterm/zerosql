export interface QueryHistoryEntry {
  sql: string;
  timestamp: number;
  success: boolean;
  rowCount: number;
  executionTimeMs: number;
}

export interface GameProgress {
  currentMissionId: string | null;
  completedMissions: string[];
  objectiveStatus: Record<string, Record<string, boolean>>;
  hintsRevealed: Record<string, number>;
  queryHistory: QueryHistoryEntry[];
}
