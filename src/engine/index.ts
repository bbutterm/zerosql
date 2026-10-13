/**
 * Engine Facade — единая точка входа в ядро ZeroSQL.
 * Оборачивает внутренние модули, логику не меняет.
 */

import type { Database } from "sql.js";
import { createDatabase, getTableSchema, getForeignKeys as _getForeignKeys } from "./database";

import type { TableInfo, ForeignKey } from "@/types/database";

// --- Re-export types for external consumers ---
export type { QueryResult, TableInfo, ForeignKey, SqlErrorHelp, QueryErrorKind } from "@/types/database";
export type { ValidationOutcome, ValidationRule, CellValue } from "@/types/mission";

// --- v2: контент дела и сюжета ---
export type {
  CaseDef,
  CaseObjective,
  Difficulty,
  EvidenceDef,
  EvidenceKind,
  HintDef,
  ProtocolDef,
  ProtocolBlank,
  HandbookEntry,
  SecretDef,
  AchievementDef,
  AchievementKind,
  BlankKind,
  DatetimePrecision,
  FlagValue,
  FlagCondition,
  PredictionDef,
  SourceClass,
  CardStamp,
  PinnedCard,
  CardCondition,
  CardPredicate,
  AccusationDef,
  EventTrigger,
  LiveEventDef,
  ClockHold,
  CaseClockDef,
  ValidationContext,
  NightDef,
  NightBeat,
  NightSceneBeat,
  NightRowBeat,
  NightStatusBeat,
  NightSessionsBeat,
  NightClickBeat,
  NightMontageBeat,
  NightFeedRow,
  NightCheck,
} from "@/types/case";
export { SOURCE_CLASS_LABELS } from "@/types/case";
export type {
  CharacterDef,
  Scene,
  DialogueLine,
  DialogueChoice,
  EvidencePresent,
  Emotion,
  PortraitVariant,
  InterrogationDef,
  InterrogationMode,
  TestimonyPoint,
} from "@/types/story";
export { EMOTIONS, NARRATOR, PLAYER, PORTRAIT_VARIANTS } from "@/types/story";

// --- v2: игровая логика ---

/** Прогресс по задачам дела: основные по порядку, дополнительные — на каждом запросе */
export {
  checkCaseProgress,
  isCaseObjectivesDone,
  activeObjective,
  mainObjectives,
  optionalObjectives,
  objectiveApplies,
} from "./case-runner";
export type { CaseProgress, CompletedObjective } from "./case-runner";

/** Протокол-дедукция: реестр увиденного, типы пропусков и пакетная сверка */
export {
  scanSeen,
  scanSeenOptions,
  availableOptions,
  optionSeen,
  isBlankCorrect,
  isEntityColumn,
  checkProtocol,
  statementParts,
  protocolFailureLine,
  DEFAULT_BATCH_SIZE,
  SEEN_FULL_SCAN_ROWS,
} from "./protocol";
export type { ProtocolCheck, StatementPart } from "./protocol";

/** Сравнение значений по типам пропусков (person / number / datetime / text) */
export { normalizeCell, valuesMatch, toIsoDateTime } from "./values";
export type { MatchOptions } from "./values";

/** Доска улик и обвинение */
export { cardMatches, cardHasKey, isSourceCard, checkAccusation } from "./board";
export type { AccusationCheck, AccusationOutcome } from "./board";

/** Допрос «Наушник» */
export {
  startInterrogation,
  interrogationEmotion,
  visiblePoints,
  pressPoint,
  presentEvidence,
  presentMatches,
  reopenInterrogation,
  DEFAULT_PATIENCE,
} from "./interrogation";
export type { InterrogationState, OfferedEvidence, PresentOutcome, PresentResult } from "./interrogation";

/** Живое время дела: часы по запросам, остановки, события, условия на флаги */
export {
  caseClock,
  nextQueryClock,
  movesClock,
  dueEvents,
  eventDue,
  triggerMet,
  flagsMatch,
  applyClockTo,
  DEFAULT_MINUTES_PER_QUERY,
} from "./live";
export type { ResolvedClock, CaseProgressSnapshot, LiveEventState } from "./live";

/** Семантический линтер (разд. 7.3): предупреждения bark.* на то, что SQLite молча пропускает */
export { lintSql, JOIN_ROWS_LIMIT, SELECT_STAR_ROWS } from "./sql-lint";
export type { LintWarning, LintRule, LintSpeaker, LintOptions } from "./sql-lint";

/** Политика запросов игрока: какие представления создал/удалил запрос */
export { viewChanges, ALLOWED_PRAGMAS } from "./table-guard";
export type { AccessCheck, AccessDenial, SqlAccessPolicy } from "./table-guard";

/** Тайники (пасхалки) */
export { checkSecrets } from "./secrets";

/** Очки, звёзды, звания, достижения */
export { scoreCase, starsFor, rankFor, RANKS, SCORING, checkAchievements } from "./scoring";
export type {
  CaseStats,
  CaseScore,
  ScoreLine,
  Stars,
  RankDef,
  RankInfo,
  AchievementState,
  SolvedCaseRecord,
} from "./scoring";

/** Сюжет: сцены и проверка контента */
export {
  getScene,
  sceneChain,
  sceneLinks,
  caseShort,
  collectEvidenceIds,
  validateCaseContent,
  validateSeasonContent,
  parseLineId,
  lineIdProblem,
  portraitKey,
  LINE_ID_RE,
  SERVICE_LINE_PREFIXES,
  nightBeatKind,
  NIGHT_BEAT_KINDS,
} from "./story";
export type { LineIdParts, NightBeatKind } from "./story";

/** Расписание zero (М6): какие задания cron срабатывают и с какими параметрами патча */
export {
  CRON_PATCH,
  cronConditionHolds,
  cronFiresAfterCase,
  cronJob1Variant,
  cronLiveParams,
  cronSeenKeys,
  firedCronJobs,
  nightCronJobs,
  nextCronNight,
} from "./cron";
export type { NightCronJob } from "./cron";

/**
 * Журнал запросов query_log. Писать ПОСЛЕ checkCaseProgress/checkSecrets:
 * иначе эталонные запросы к query_log увидят текущий запрос, а результат
 * игрока — нет. Заблокированные запросы пишутся со статусом 'denied'.
 */
export { ensureQueryLog, logPlayerQuery, logQueryResult, queryLogStatus, QUERY_LOG_TABLE } from "./query-log";
export type { PlayerQueryEntry, QueryLogMeta, QueryLogStatus } from "./query-log";

/** Игровые часы */
export { advanceClock, formatClockRu, parseClock, toGameTime, compareClock } from "./clock";

// --- World v2 ---
/**
 * Мир «Полыньи» (разд. 8 библии, TECH_SPEC разд. 3): детерминированная
 * генерация из WORLD_SEED, байты для кеша, база дела с часами game_now(),
 * TEMP VIEW горизонта и сюжетными патчами. Константы фактов — worldFacts.
 */
export { WORLD_SEED, WORLD_GENERATOR_VERSION, worldFacts } from "./world/facts";
export {
  generateWorld,
  generateWorldInto,
  exportWorld,
  openCaseDatabase,
  worldStats,
  initWorld,
  createWorldDatabase,
} from "./world/generate";
export type { OpenCaseOptions, PatchRequest, GenerateStats } from "./world/generate";
export {
  setGameClock,
  getGameClock,
  applyStoryPatch,
  createHorizonViews,
  dropHorizonView,
  STORY_PATCHES,
} from "./world/horizon";
export type { StoryPatchParams, StoryPatchResult, StoryPatchDef } from "./world/horizon";
export { WORLD_LATE_TABLES, WORLD_TABLES } from "./world/schema";
export type { TableDef as WorldTableDef } from "./world/schema";
// --- /World v2 ---

// --- Runtime (разд. 6.14, п. 1–2) ---
/**
 * Ядро для стора: Web Worker с таймаутом 3 с и восстановлением по журналу
 * (или тот же поток без Worker/IndexedDB). Наружу — только фабрика и типы.
 */
export { createEngineClient } from "./runtime/client";
export type {
  EngineClient,
  EngineClientOptions,
  EngineStatus,
  EngineProgress,
  EngineProgressStage,
  WorldInfo,
  CaseSaveState,
  CaseOpened,
  RunContext,
  Evaluation,
  JournalEntry,
  PatchApplied,
  WorkerLike,
} from "./runtime/types";
// --- /Runtime ---

// --- Facade functions ---

/** Пустая база SQLite (sql.js) — для лаборатории и инструментов; мир дела открывает ядро */
export async function createEmptyDatabase(): Promise<Database> {
  return createDatabase();
}

/** Проверка доступа + выполнение SQL в одном вызове. Ошибки — в QueryResult, не исключения */
export { executeSQL } from "./execute";
export type { ExecuteOptions } from "./execute";

/** Схема таблиц для UI */
export function getSchema(db: Database): TableInfo[] {
  return getTableSchema(db);
}

/** FK-связи для UI */
export function getForeignKeys(db: Database): ForeignKey[] {
  return _getForeignKeys(db);
}
