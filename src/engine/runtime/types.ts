/**
 * Рантайм ядра (разд. 6.14, п. 1–2 библии): публичные типы EngineClient.
 *
 * Всё, что ходит между стором и ядром, сериализуемо (structured clone):
 * в браузере ядро живёт в Web Worker, без Worker/IndexedDB — в том же потоке
 * с тем же интерфейсом. Стор видит только эти типы и createEngineClient().
 */
import type { CaseDef, FlagValue, PinnedCard, SecretDef } from "@/types/case";
import type { ForeignKey, QueryResult, TableInfo } from "@/types/database";
import type { CaseProgress } from "../case-runner";
import type { PlayerQueryEntry } from "../query-log";
import type { LintWarning } from "../sql-lint";
import type { PatchRequest } from "../world/generate";
import type { StoryPatchParams, StoryPatchResult } from "../world/horizon";

// --- Журнал состояния дела ---

/**
 * Запись журнала состояния дела. Журнал — всё, что изменило базу дела после
 * открытия, по порядку. Воспроизведение журнала на свежей базе из байтов мира
 * даёт ту же базу (контрольная сумма совпадает): так ядро восстанавливается
 * после таймаута, а стор — после перезагрузки страницы.
 *
 *  - query — запрос игрока: часы после него; текст запроса, если он мог
 *    изменить базу (DML, BEGIN/COMMIT/ROLLBACK, CREATE/DROP VIEW), с часами
 *    выполнения (at) и зерном random(); строка query_log игрока;
 *  - patch — сюжетный патч (живые строки, чистки, удаления, поздние таблицы);
 *  - clock — перевод часов стором (clockTo события, сцены интерлюдии).
 */
export type JournalEntry =
  | {
      kind: "query";
      /** Часы после запроса */
      clock: string;
      /** Часы, на которых выполнялся текст (если отличаются от clock) */
      at?: string;
      /** Текст запроса, который мог изменить базу */
      sql?: string;
      /** Зерно random() на время запроса */
      seed?: number;
      /** Строка query_log игрока (как её записал движок) */
      log?: PlayerQueryEntry;
    }
  | { kind: "patch"; id: string; params?: StoryPatchParams }
  | { kind: "clock"; clock: string };

// --- Открытие дела ---

/**
 * Сохранённое состояние дела, из которого собирается база:
 * байты мира → часы старта → патчи старта → история query_log → журнал дела.
 */
export interface CaseSaveState {
  /** Часы, на которых открывается база (по умолчанию — старт дела по caseClock) */
  startClock?: string;
  /**
   * Имя игрока для патча p0.player (persons 9000, staff 151, логин nol).
   * Мир в кеше чистый, поэтому патч нужен в каждом деле; ядро ставит его
   * первым, если его нет в patches.
   */
  playerName?: string;
  /**
   * Сюжетные патчи старта по порядку: переходящие патчи прошлых дел
   * (c07.admission, c09.watcher, c10.purge…) и патчи старта этого дела.
   * Патчи по часам (autoAt) и case.logins ядро применяет само.
   */
  patches?: readonly PatchRequest[];
  /** Строки query_log игрока из прошлых дел по порядку (Evaluation.logEntry) */
  queryLog?: readonly PlayerQueryEntry[];
  /** Журнал этого дела (EngineClient.getJournal()), если дело уже начато */
  journal?: readonly JournalEntry[];
}

export interface CaseOpened {
  caseId: string;
  /** Игровые часы базы после воспроизведения журнала */
  clock: string;
  /** Схема мира (все таблицы main, включая закрытые и поздние) и связи */
  schema: TableInfo[];
  foreignKeys: ForeignKey[];
  /** Представления, созданные игроком (CREATE VIEW) */
  playerViews: string[];
  /** Сколько записей журнала воспроизведено */
  replayed: number;
  ms: number;
}

// --- Запрос игрока ---

/**
 * Состояние стола на момент запроса. Ядро не хранит прогресс игрока: стор
 * передаёт его с каждым запросом. Всё необязательно.
 */
export interface RunContext {
  /** Задачи дела, засчитанные до запроса */
  completed?: readonly string[];
  /** Реестр увиденного (до запроса). Значения текущего результата ядро добавляет само */
  seen?: readonly string[];
  /** Карточки на доске (правило pin) */
  pins?: readonly PinnedCard[];
  /** Слоты протокола и доски (правило slot) */
  slots?: Readonly<Record<string, string | undefined>>;
  /** Сюжетные флаги (условные задачи, патчи) */
  flags?: Readonly<Record<string, FlagValue>>;
  /** Найденные тайники (все дела) */
  foundSecrets?: readonly string[];
  /** Для часов (остановки по триггерам): доигранные сцены, пробои допросов, «Без таймера» */
  endedScenes?: readonly string[];
  breaks?: Readonly<Record<string, number>>;
  noTimer?: boolean;
  /** Строка query_log: логин (по умолчанию nol), терминал (WS-03), прохождение */
  login?: string;
  terminal?: string;
  runId?: string;
}

/**
 * Всё, что ядро насчитало по одному запросу. Порядок внутри ядра:
 * политика → часы → выполнение → реестр увиденного → задачи → тайники →
 * линтер → запись в query_log (последней: эталоны и тайники не видят строку
 * текущего запроса).
 */
export interface Evaluation {
  /** Результат; ошибки и отказы — в result.error / errorKind, не исключения */
  result: QueryResult;
  /** Засчитанные задачи и обратная связь по текущей */
  progress: CaseProgress;
  /** Реестр увиденного этого результата (scanSeen) */
  seen: string[];
  /** Варианты протокола, увиденные в этом результате (scanSeenOptions) */
  seenOptions: string[];
  /** Тайники, найденные этим запросом */
  secrets: string[];
  /** Предупреждения семантического линтера (только для запросов, которые пропустил guard) */
  lint: LintWarning[];
  /** Часы после запроса 'YYYY-MM-DD HH:MM:SS' */
  clock: string;
  /** Запрос сдвинул часы (разд. 6.10): стор увеличивает счётчик запросов дела */
  clockMoved: boolean;
  /** Строка query_log игрока — стор хранит её в истории для следующих дел */
  logEntry: PlayerQueryEntry | null;
  logId: number | null;
  /** Запрос мог изменить базу и записан в журнал как запись игрока */
  wrote: boolean;
  /** Представления игрока после запроса */
  playerViews: string[];
  /** Схема изменилась (CREATE/DROP VIEW, DDL): стор перечитывает схему при надобности */
  schemaChanged: boolean;
  /** Время обработки в ядре, мс */
  ms: number;
  /**
   * Запрос остановлен: шёл дольше 3 с (timeout) или уронил ядро (crash).
   * База восстановлена из байтов мира по журналу; result.errorKind = 'timeout'.
   */
  recovery?: { reason: "timeout" | "crash"; ms: number; replayed: number };
}

// --- Патчи и часы ---

export interface PatchApplied extends StoryPatchResult {
  /** Перед патчем откатана открытая транзакция игрока (МИРА должна сказать об этом) */
  rolledBack: boolean;
  clock: string;
  /** Схема после патча (поздние таблицы, удаления staging) */
  schema: TableInfo[];
  foreignKeys: ForeignKey[];
}

// --- Инициализация ---

export type EngineProgressStage = "engine" | "cache" | "generate" | "store" | "ready";

export interface EngineProgress {
  stage: EngineProgressStage;
  /** Строка для экрана загрузки голосом системы */
  text: string;
}

export interface WorldInfo {
  /** Мир взят из кеша IndexedDB (иначе сгенерирован) */
  fromCache: boolean;
  /** Ключ кеша world:<версия генератора>:<зерно> */
  key: string;
  /** Размер базы мира, байт */
  bytes: number;
  ms: number;
}

export type EngineStatus = "idle" | "loading" | "ready" | "recovering" | "failed" | "disposed";

export interface EngineClientOptions {
  /** Зерно мира (по умолчанию WORLD_SEED) */
  seed?: string | number;
  /** Тайники сезона (src/data/secrets.json) */
  secrets?: readonly SecretDef[];
  /** Адрес sql-wasm.wasm для воркера (по умолчанию /sql-wasm.wasm) */
  wasmUrl?: string;
  /** Таймаут запроса, мс (по умолчанию 3000). Только в режиме worker */
  timeoutMs?: number;
  /**
   * worker — Web Worker с таймаутом; in-process — в том же потоке, без
   * таймаута; auto (по умолчанию) — worker, если есть Worker и IndexedDB.
   */
  mode?: "auto" | "worker" | "in-process";
  /** Фабрика воркера (тесты); по умолчанию — модульный воркер runtime/worker.ts */
  workerFactory?: () => WorkerLike;
  /** Смена состояния ядра: экран загрузки, «Восстановление архива…» */
  onStatus?: (status: EngineStatus) => void;
}

/** То, что EngineClient требует от Worker (подмножество DOM Worker) */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

/**
 * Ядро для стора. Операции идут строго по очереди; каждая — Promise.
 * В режиме worker запрос дольше 3 с останавливается: воркер убивается,
 * новый поднимается из байтов мира в IndexedDB, журнал воспроизводится, и
 * run() возвращает результат с errorKind 'timeout'.
 */
export interface EngineClient {
  readonly mode: "worker" | "in-process";
  readonly status: EngineStatus;
  /** Загружает sql.js и мир (кеш IndexedDB или генерация). Повторный вызов — тот же Promise */
  init(onProgress?: (progress: EngineProgress) => void): Promise<WorldInfo>;
  /** Открывает базу дела и воспроизводит сохранённый журнал */
  openCase(caseDef: CaseDef, saveState?: CaseSaveState): Promise<CaseOpened>;
  /** Запрос игрока: политика, выполнение, задачи, реестр, тайники, линтер, query_log */
  run(sql: string, context?: RunContext): Promise<Evaluation>;
  /** Сюжетный патч (событие дела); открытая транзакция игрока откатывается */
  applyPatch(id: string, params?: StoryPatchParams): Promise<PatchApplied>;
  /** Переводит игровые часы базы; возвращает их в формате 'YYYY-MM-DD HH:MM:SS' */
  setClock(clock: string): Promise<string>;
  /**
   * «Откатить дело к началу»: база дела собирается заново без записей игрока
   * (DML, представления). Часы, патчи и query_log остаются: прогресс не теряется.
   */
  resetCase(): Promise<CaseOpened>;
  /** Журнал текущего дела — стор сохраняет его в CaseSaveState.journal */
  getJournal(): readonly JournalEntry[];
  /** Контрольная сумма базы дела (схема, все строки, часы) — для тестов и QA */
  checksum(): Promise<string>;
  /** Останавливает ядро (терминирует воркер) */
  dispose(): void;
}

export type { CaseDef, PatchRequest, PlayerQueryEntry, StoryPatchParams };
