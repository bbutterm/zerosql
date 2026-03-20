import type { Mission, Objective } from "@/types/mission";

import meta00 from "./mission-00-tutorial/meta.json";
import objectives00 from "./mission-00-tutorial/objectives.json";
import hints00 from "./mission-00-tutorial/hints.json";

import meta01 from "./mission-01-port/meta.json";
import objectives01 from "./mission-01-port/objectives.json";
import hints01 from "./mission-01-port/hints.json";

import meta02 from "./mission-02-intercept/meta.json";
import objectives02 from "./mission-02-intercept/objectives.json";
import hints02 from "./mission-02-intercept/hints.json";

import meta03 from "./mission-03-money/meta.json";
import objectives03 from "./mission-03-money/objectives.json";
import hints03 from "./mission-03-money/hints.json";

import meta04 from "./mission-04-evidence/meta.json";
import objectives04 from "./mission-04-evidence/objectives.json";
import hints04 from "./mission-04-evidence/hints.json";

interface MissionMeta {
  id: string;
  title: string;
  subtitle: string;
  briefing: string;
  narrativeOnComplete: string;
  difficulty: Mission["difficulty"];
  sqlConcepts: string[];
  unlockedTables?: string[];
  order: number;
}

function buildMission(
  meta: MissionMeta,
  objectives: Objective[],
  hints: string[],
): Mission {
  return {
    id: meta.id,
    title: meta.title,
    subtitle: meta.subtitle,
    briefing: meta.briefing,
    objectives,
    hints,
    narrativeOnComplete: meta.narrativeOnComplete,
    difficulty: meta.difficulty,
    sqlConcepts: meta.sqlConcepts,
    unlockedTables: meta.unlockedTables,
  };
}

// JSON missions cannot use "custom" validation type (functions are not serializable).
// Named exports rely on stable order values (0, 1, 2, 3).
export const missions: Mission[] = [
  buildMission(meta00 as MissionMeta, objectives00 as Objective[], hints00),
  buildMission(meta01 as MissionMeta, objectives01 as Objective[], hints01),
  buildMission(meta02 as MissionMeta, objectives02 as Objective[], hints02),
  buildMission(meta03 as MissionMeta, objectives03 as Objective[], hints03),
  buildMission(meta04 as MissionMeta, objectives04 as Objective[], hints04),
].sort((a, b) => {
  const orderMap = new Map([
    [meta00.id, meta00.order],
    [meta01.id, meta01.order],
    [meta02.id, meta02.order],
    [meta03.id, meta03.order],
    [meta04.id, meta04.order],
  ]);
  return (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0);
});

// Named re-exports for backward compatibility (used by tests)
export const tutorialMission = missions[0];
export const firstCaseMission = missions[1];
export const interceptMission = missions[2];
export const moneyTrailMission = missions[3];
export const evidenceMission = missions[4];
