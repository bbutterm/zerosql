/**
 * Engine Facade — единая точка входа в ядро ZeroSQL.
 * Оборачивает внутренние модули, логику не меняет.
 */

import type { Database } from "sql.js";
import { createDatabase, executeQuery, getTableSchema, getForeignKeys as _getForeignKeys } from "./database";
import { SCHEMA_SQL } from "./schema";
import { SEED_SQL } from "./seed";
import { checkSqlPolicy, describePolicyViolation } from "./table-guard";
import { explainSqlError } from "./sql-errors";
import { checkObjectives, isMissionComplete as _isMissionComplete } from "./mission-runner";

import type { QueryResult, TableInfo, ForeignKey } from "@/types/database";
import type { Mission } from "@/types/mission";
import type { ObjectiveResult } from "./mission-runner";

// --- Re-export types for external consumers ---
export type { QueryResult, TableInfo, ForeignKey, SqlErrorHelp, QueryErrorKind } from "@/types/database";
export type { Mission, ValidationOutcome, ValidationRule, CellValue } from "@/types/mission";
export type { ObjectiveResult } from "./mission-runner";

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
} from "./story";
export type { LineIdParts } from "./story";

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

// --- Facade functions ---

/** Создаёт БД, накатывает schema + seed, возвращает всё что нужно стору */
export async function initEngine(): Promise<{
  db: Database;
  schema: TableInfo[];
  foreignKeys: ForeignKey[];
}> {
  const db = await createDatabase();
  db.run(SCHEMA_SQL);
  db.run(SEED_SQL);

  const schema = getTableSchema(db);
  const foreignKeys = _getForeignKeys(db);
  return { db, schema, foreignKeys };
}

export interface ExecuteOptions {
  /**
   * Белый список записи (CaseDef.writableTables): INSERT/UPDATE/DELETE/REPLACE
   * только в эти таблицы, плюс BEGIN/COMMIT/ROLLBACK. Пуст — только чтение.
   */
  writableTables?: readonly string[];
  /** CREATE VIEW / DROP VIEW своих представлений (CaseDef.allowViews) */
  allowViews?: boolean;
  /** Представления, созданные игроком (viewChanges): их можно читать и удалять */
  playerViews?: readonly string[];
  /**
   * v1: разрешить любую запись и DDL. Запреты ATTACH, PRAGMA и main./temp. действуют всегда.
   * @deprecated v2 передаёт writableTables / allowViews.
   */
  allowWrites?: boolean;
  /** Схема для подсказок в ошибках (только доступные игроку таблицы) */
  schema?: TableInfo[];
}

/** Проверка доступа + выполнение SQL в одном вызове. Ошибки — в QueryResult, не исключения */
export function executeSQL(
  db: Database,
  sql: string,
  unlockedTables: string[] | null,
  options: ExecuteOptions = {}
): QueryResult {
  const policy = {
    unlockedTables,
    allowWrites: options.allowWrites,
    writableTables: options.writableTables,
    allowViews: options.allowViews,
    playerViews: options.playerViews,
  };
  const access = checkSqlPolicy(sql, policy);
  if (!access.allowed) {
    return { columns: [], rows: [], rowCount: 0, executionTimeMs: 0, ...describePolicyViolation(access, policy) };
  }

  const result = executeQuery(db, sql);
  if (result.error) {
    const visible = (options.schema ?? []).filter(
      (t) => unlockedTables === null || unlockedTables.includes(t.name)
    );
    result.errorHelp = explainSqlError(result.error, {
      tables: visible.map((t) => t.name),
      columns: visible.flatMap((t) => t.columns.map((c) => c.name)),
    });
  }
  return result;
}

/** Проверка целей миссии — прокси к mission-runner */
export function checkMissionProgress(
  mission: Mission,
  result: QueryResult,
  db: Database,
  completedObjectives: Set<string>
): ObjectiveResult[] {
  return checkObjectives(mission, result, db, completedObjectives);
}

/** Завершена ли миссия — прокси к mission-runner */
export function isMissionComplete(
  mission: Mission,
  completedObjectives: Set<string>
): boolean {
  return _isMissionComplete(mission, completedObjectives);
}

/** Схема таблиц для UI */
export function getSchema(db: Database): TableInfo[] {
  return getTableSchema(db);
}

/** FK-связи для UI */
export function getForeignKeys(db: Database): ForeignKey[] {
  return _getForeignKeys(db);
}
