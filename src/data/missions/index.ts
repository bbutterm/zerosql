import type { Mission } from "@/types/mission";
import { tutorialMission } from "./mission-00-tutorial";
import { firstCaseMission } from "./mission-01-first-case";
import { interceptMission } from "./mission-02-intercept";
import { moneyTrailMission } from "./mission-03-money";

export const missions: Mission[] = [
  tutorialMission,
  firstCaseMission,
  interceptMission,
  moneyTrailMission,
];
