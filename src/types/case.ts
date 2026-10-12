/**
 * Контракт контента v2: дело (кейс), его задачи, протокол-дедукция,
 * улики, справочник, тайники (пасхалки) и достижения.
 *
 * Контент хранится в JSON:
 *   src/data/characters.json          — CharacterDef[]
 *   src/data/handbook.json            — HandbookEntry[]
 *   src/data/secrets.json             — SecretDef[]
 *   src/data/cases/<id>/case.json     — CaseDef без scenes
 *   src/data/cases/<id>/script.json   — { scenes: Scene[] }
 */
import type { ValidationRule } from "./mission";
import type { Scene } from "./story";

export type Difficulty = "tutorial" | "easy" | "medium" | "hard" | "expert";

export type EvidenceKind = "document" | "record" | "photo" | "audio" | "testimony" | "lead";

export interface EvidenceDef {
  /** Уникален в пределах сезона: ev.<case>.<slug> */
  id: string;
  title: string;
  text: string;
  kind: EvidenceKind;
}

export interface HintDef {
  text: string;
  /** id персонажа, который даёт подсказку (подсказки звучат голосами героев) */
  by?: string;
}

export interface CaseObjective {
  /** Уникален в пределах дела */
  id: string;
  /** Порядок выполнения основных задач */
  order: number;
  /** Формулировка задачи внутри мира */
  task: string;
  /** id статьи справочника, которую отрабатывает задача */
  concept?: string;
  /** Проверка результата запроса — любой корректный запрос засчитывается */
  validation: ValidationRule;
  /** Уровни подсказок: намёк → концепция → шаблон → почти решение */
  hints: HintDef[];
  /** Вывод/реплика после выполнения */
  success: string;
  /** Карточка улики, которую получает игрок */
  evidence?: EvidenceDef;
  /** Сцена, которая проигрывается после выполнения */
  sceneAfter?: string;
  /** Дополнительная задача: не блокирует дело, проверяется на каждом запросе */
  optional?: boolean;
  /**
   * Эталонное решение. Игроку не показывается; используется тестами,
   * автоматическим прохождением (QA) и как последний уровень подсказки.
   */
  solution: string;
}

export interface ProtocolBlank {
  id: string;
  /** Варианты в выпадающем списке (включая ложные) */
  options: string[];
  /** Верный вариант — один из options */
  answer: string;
  /**
   * Вариант можно выбрать, только если игрок видел это значение в
   * результатах своих запросов в этом деле (по умолчанию true).
   * Обвинять можно только тех, кого нашёл сам.
   */
  requireSeen?: boolean;
}

export interface ProtocolDef {
  /** Строки протокола с пропусками вида {blankId} */
  statements: string[];
  blanks: ProtocolBlank[];
  /**
   * Пакетное подтверждение как в Return of the Obra Dinn: верные пропуски
   * подтверждаются, только когда верных среди ещё не подтверждённых не меньше
   * batchSize (или все оставшиеся верны). По умолчанию 3.
   */
  batchSize?: number;
  /** Сцена после полного подтверждения протокола */
  successScene: string;
  /** Реплики-реакции на неудачную сверку (выбираются по кругу) */
  failureLines?: string[];
}

export interface CaseDef {
  /** case-00-..., case-01-... */
  id: string;
  order: number;
  act: number;
  /** «Дело № 03» */
  code: string;
  title: string;
  subtitle: string;
  /** Внутриигровое время начала: 'YYYY-MM-DD HH:MM' */
  date: string;
  /** Сколько минут игрового времени проходит за один запрос (по умолчанию 2) */
  minutesPerQuery?: number;
  location?: string;
  difficulty: Difficulty;
  /** Новые статьи справочника, которые открывает дело */
  concepts: string[];
  /** Все доступные таблицы (кумулятивно) */
  tables: string[];
  /** Таблицы, открытые именно в этом деле (подсвечиваются) */
  newTables?: string[];
  /** Разрешить INSERT/UPDATE/DELETE (по умолчанию архив только для чтения) */
  allowWrites?: boolean;
  /** Лимит запросов (давление в финале); не задан — без лимита */
  queryBudget?: number;
  /** Текст папки дела */
  briefing: string;
  starterSql?: string;
  /** Сцена при открытии дела */
  introScene: string;
  objectives: CaseObjective[];
  /** Протокол-дедукция; если нет — дело закрывается по выполнению задач */
  protocol?: ProtocolDef;
  /** Финальная сцена, если нет протокола */
  outroScene?: string;
  /** Сцены из script.json */
  scenes: Scene[];
}

export interface HandbookEntry {
  id: string;
  title: string;
  /** Суть в одном-двух предложениях */
  summary: string;
  /** Шаблон синтаксиса */
  syntax: string;
  /** Пример на данных мира */
  example: string;
  /** Частые ошибки и нюансы SQLite */
  pitfalls?: string[];
}

export interface SecretDef {
  /** secret.<slug> */
  id: string;
  title: string;
  /** Записка, которая открывается при находке */
  text: string;
  /** Срабатывает, когда результат любого запроса проходит это правило */
  trigger: ValidationRule;
  /** Таблицы, без доступа к которым тайник не найти (для подсказки в коллекции) */
  tables?: string[];
}

export type AchievementKind =
  | "case_solved"
  | "case_no_hints"
  | "case_three_stars"
  | "protocol_first_try"
  | "secrets_found"
  | "all_optional"
  | "season_complete";

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  kind: AchievementKind;
  /** Параметр условия: id дела или нужное количество */
  param?: string | number;
  /** Скрыто до получения */
  hidden?: boolean;
}
