/**
 * Стор v2 «Полыньи»: форма состояния. Всё, что здесь лежит в `profile`,
 * `settings`, `season` и `session`, сохраняется (localStorage, persist с
 * версией схемы). База дела не сохраняется — сохраняется журнал ядра
 * (`session.journal`), из которого она собирается заново.
 *
 * UI не импортирует ядро: всё, что нужно экрану, есть здесь или в селекторах
 * (src/stores/game/selectors.ts).
 */
import type {
  CaseScore,
  CaseStats,
  EngineProgress,
  EngineStatus,
  FlagValue,
  ForeignKey,
  InterrogationState,
  JournalEntry,
  LintWarning,
  PatchRequest,
  PinnedCard,
  PlayerQueryEntry,
  QueryResult,
  RankInfo,
  Stars,
  TableInfo,
} from "@/engine";

export type Flags = Record<string, FlagValue>;

// --- Настройки и профиль ---

/** Режим игры (разд. 7.6): «Без таймера» — отдельная настройка доступности */
export type PlayMode = "novice" | "standard" | "pro" | "zero";

export type TextSpeed = "slow" | "normal" | "fast" | "instant";

export interface Settings {
  textSpeed: TextSpeed;
  /** Реплики листаются сами после озвучки */
  autoAdvance: boolean;
  /** Громкости 0…1 */
  voiceVolume: number;
  musicVolume: number;
  sfxVolume: number;
  reducedMotion: boolean;
  /** «Без таймера» (доступность): живые события ждут игрока */
  noTimer: boolean;
  /** Печатная машинка в репликах (иначе строка появляется целиком) */
  typewriter: boolean;
  /** Подсветка лжи на допросе (в «Новичке» включена) */
  lieHighlight: boolean;
  /** «Ночь между делами»: только новые / всегда / не показывать */
  nightScreens: NightScreens;
}

/** Показ ночи перед делом (docs/design/NIGHTS.md, «Показ») */
export type NightScreens = "new" | "always" | "off";

export interface Profile {
  /** Имя или ник (патч p0.player) */
  playerName: string;
  mode: PlayMode;
  /** Предупреждение 18+ принято */
  ageConfirmed: boolean;
  /** Холодное открытие показано */
  coldOpenSeen: boolean;
  /** Первый запуск пройден (имя, режим) */
  onboarded: boolean;
}

// --- Сезон ---

export type Weather = "blizzard" | "overcast" | "clear" | "aurora";

export interface SolvedCase {
  caseId: string;
  stats: CaseStats;
  score: CaseScore;
  stars: Stars;
  weather: Weather;
  /** Лучший итог за все прохождения — идёт в звание */
  bestPoints: number;
  bestStars: Stars;
  /** Сколько раз дело раскрыто */
  runs: number;
  /** Реальное время раскрытия (ISO) */
  solvedAt: string;
  /** После переигровки раннего дела поменялись флаги — «последствия изменились» */
  consequencesChanged?: boolean;
}

export type EndingId = "empty" | "still" | "ripples" | "murky" | "first_sun";

/** Адресат пакета (R): прокуратура / СК / Алла / СК и Алла / сделка Гранина */
export type Recipient = "prosecutor" | "sk" | "alla" | "sk_alla" | "deal";

export interface EndingInputs {
  A: boolean;
  R: Recipient | null;
  K: boolean;
  /** Число свидетелей-инсайдеров: ratnikov_full + tokha_turned */
  W: number;
  V: boolean;
  /** Пакет отправлен до 13:00 */
  sent: boolean;
}

export interface EndingResult {
  id: EndingId;
  title: string;
  inputs: EndingInputs;
  /**
   * Вариант текста: «Тихая вода» — prosecutor / alla_weak / sk_weak;
   * «Мутная вода» — первый недостающий вход no_k / no_w / no_v;
   * «Круги по воде» — redacted / unredacted.
   */
  variant?: string;
  /** Абзацы матрицы финала */
  burtsev: "лестница" | "дверь" | null;
  graninBroken: boolean;
  /** Слайды эпилога по флагам (ключи для экрана эпилога) */
  epilogue: string[];
  /** Пост-титры GLB-CORE (во всех, кроме «Пустой выборки») */
  postCredits: boolean;
}

export interface Season {
  /** Раскрытые дела */
  solved: Record<string, SolvedCase>;
  /** Флаги, выставленные в каждом деле (последнее прохождение) */
  caseFlags: Record<string, Flags>;
  /** Сюжетные патчи, применённые в деле, — переходят в следующие дела */
  casePatches: Record<string, PatchRequest[]>;
  /** Строки query_log игрока по делам (последнее прохождение) */
  caseQueryLog: Record<string, PlayerQueryEntry[]>;
  /** Полученные улики (EvidenceDef.id) за сезон */
  evidence: string[];
  /** Найденные тайники */
  foundSecrets: string[];
  /** Полученные достижения по порядку */
  achievements: string[];
  /** Случившиеся события для достижений вида "event" */
  events: string[];
  /** Счётчики для достижений вида "counter" */
  counters: Record<string, number>;
  /** Мастерство по понятиям 0…100 (разд. 6.3) */
  mastery: Record<string, number>;
  /** Сколько раз начиналось каждое дело — для runId */
  runs: Record<string, number>;
  /** Последняя концовка и все увиденные */
  ending: EndingResult | null;
  endingsSeen: EndingId[];
  /**
   * Ключи условий заданий zero (cronSeenKeys), увиденные в каждом деле
   * (последнее прохождение): not_seen проверяется по всему сезону.
   */
  cronSeen: Record<string, string[]>;
}

// --- Активное дело ---

/** night — экран «Ночь 03:12» перед вступлением (пока собирается база дела) */
export type CasePhase = "night" | "intro" | "desk" | "debrief";

/** Сцена на сцене: реплика line, ожидание выбора или предъявления после последней реплики */
export interface StageSlot {
  sceneId: string;
  line: number;
  awaiting?: "choice" | "present";
}

export interface ActiveInterrogation {
  sceneId: string;
  state: InterrogationState;
}

export interface HintReveal {
  objectiveId: string;
  /** 1…4 */
  tier: number;
  free: boolean;
}

export interface PredictionAnswer {
  answer: number;
  correct: boolean;
}

export interface HistoryItem {
  sql: string;
  ok: boolean;
  rows: number;
  /** Часы после запроса */
  clock: string;
  error?: string;
  objectiveId?: string;
  ms: number;
}

export interface AccusationState {
  attempts: number;
  accepted: boolean;
}

export interface CaseSession {
  caseId: string;
  runId: string;
  replay: boolean;
  phase: CasePhase;
  /** Реальное время начала (мс) — для статистики */
  startedAt: number;
  /** Флаги до дела (склейка caseFlags ранних дел) и выставленные в деле */
  baseFlags: Flags;
  flags: Flags;
  /** Патчи старта (ранние дела) — для восстановления базы */
  startPatches: PatchRequest[];
  /** Патчи, применённые событиями этого дела */
  patches: PatchRequest[];
  /** query_log ранних дел (по порядку) и этого дела */
  priorLog: PlayerQueryEntry[];
  log: PlayerQueryEntry[];
  journal: JournalEntry[];

  clock: string;
  /** Запросы, сдвинувшие часы (счётчик для atQuery и бюджета) */
  queryCount: number;
  /** Все запросы и запросы с ошибкой — для оценки */
  queries: number;
  errors: number;
  consecutiveErrors: number;

  completed: string[];
  /** Запросы без ошибки, пока задача была активной */
  attempts: Record<string, number>;
  hints: HintReveal[];
  /** Бесплатные уровни подсказок (после второй неудачной сверки) */
  freeHintTokens: number;
  /** Задачи, где открыт 4-й уровень («с подсказкой») */
  withHint: string[];
  predictions: Record<string, PredictionAnswer>;
  /** Предложить подсказку по задаче (3 ошибки подряд или простой) */
  hintOffer: string | null;

  seen: string[];
  seenOptions: string[];
  evidence: string[];
  pins: PinnedCard[];
  slots: Record<string, string>;

  protocolConfirmed: string[];
  protocolAttempts: number;
  protocolFailures: number;
  protocolMessage: string | null;

  accusations: Record<string, AccusationState>;
  interrogations: Record<string, InterrogationState>;
  /** Число карточек и улик в момент «закрылся»: вернуться можно, когда появилась новая */
  closedAt: Record<string, number>;
  breaks: Record<string, number>;
  endedScenes: string[];
  firedEvents: string[];

  stage: StageSlot | null;
  queue: StageSlot[];
  interrogation: ActiveInterrogation | null;
  /** После этой сцены дело закрывается (successScene протокола / outroScene) */
  closingScene: string | null;

  history: HistoryItem[];
  draftSql: string;
  debrief: Debrief | null;
}

// --- Разбор ---

export interface DebriefObjective {
  id: string;
  task: string;
  optional: boolean;
  done: boolean;
  /** Эталон */
  solution: string;
  /** Запрос игрока, которым задача засчитана */
  playerSql?: string;
  firstTry: boolean;
  withHint: boolean;
  hintsUsed: number;
}

export interface Debrief {
  caseId: string;
  stats: CaseStats;
  score: CaseScore;
  stars: Stars;
  weather: Weather;
  weatherLabel: string;
  rankBefore: RankInfo;
  rankAfter: RankInfo;
  seasonPoints: number;
  newAchievements: string[];
  objectives: DebriefObjective[];
  /** Следующее дело сезона (если открыто и есть контент) */
  nextCaseId: string | null;
  ending: EndingResult | null;
}

// --- Сообщения на столе ---

export type BarkKind = "lint" | "event" | "objective" | "secret" | "protocol" | "system" | "achievement" | "accusation";

export interface Bark {
  id: number;
  kind: BarkKind;
  /** id персонажа (mira, nina, tokha, dasha…) или "system" */
  speaker: string;
  text: string;
  lineId?: string;
  detail?: string;
}

// --- Транзиентное ---

export interface BootState {
  status: EngineStatus;
  progress: EngineProgress | null;
  fromCache: boolean | null;
  error: string | null;
}

export interface LastRun {
  sql: string;
  result: QueryResult;
  /** Новые варианты банка слов */
  newOptions: string[];
  lint: LintWarning[];
  /** Задачи, засчитанные этим запросом */
  completed: string[];
  feedback: string | null;
  recovered: boolean;
}

export interface Transient {
  /** Загрузка ядра и мира (экран загрузки) */
  loading: BootState;
  /** База активного дела собрана в ядре (ночь показывает «К делу» только после этого) */
  caseReady: boolean;
  busy: boolean;
  schema: TableInfo[];
  foreignKeys: ForeignKey[];
  playerViews: string[];
  last: LastRun | null;
  barks: Bark[];
  /** Новые тайники и достижения для тостов */
  toasts: Array<{ id: number; kind: "secret" | "achievement"; refId: string }>;
}

export interface PersistedGame {
  profile: Profile;
  settings: Settings;
  season: Season;
  session: CaseSession | null;
}
