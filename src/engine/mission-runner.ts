import type { Database } from "sql.js";
import type { QueryResult } from "@/types/database";
import type { Mission, ValidationOutcome } from "@/types/mission";
import { validate } from "./validator";

export interface ObjectiveResult {
  objectiveId: string;
  outcome: ValidationOutcome;
}

export function checkObjectives(
  mission: Mission,
  result: QueryResult,
  db: Database,
  completedObjectives: Set<string>
): ObjectiveResult[] {
  const results: ObjectiveResult[] = [];

  // Sort by order so objectives unlock sequentially
  const sorted = [...mission.objectives].sort((a, b) => a.order - b.order);

  for (const obj of sorted) {
    if (completedObjectives.has(obj.id)) continue;

    const outcome = validate(obj.validation, result, db);
    if (outcome.passed) {
      results.push({
        objectiveId: obj.id,
        outcome: {
          passed: true,
          message: obj.storyReward ?? outcome.message,
        },
      });
      // Only allow completing the next objective after this one
      // So one query can close at most one new objective
      break;
    }
    // If the current (lowest-order incomplete) objective didn't pass, stop checking further
    break;
  }

  return results;
}

export function isMissionComplete(
  mission: Mission,
  completedObjectives: Set<string>
): boolean {
  return mission.objectives.every((obj) => completedObjectives.has(obj.id));
}
