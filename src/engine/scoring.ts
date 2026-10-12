import type { AchievementDef, CaseDef, Difficulty } from "@/types/case";

/**
 * Оценка раскрытого дела, звания и достижения.
 *
 * Формула очков (всё — целые числа):
 *
 *   основа             1000 — дело раскрыто
 *   подсказки          −40 за каждую, максимум −400
 *                      (в tutorial/easy первая подсказка бесплатна)
 *   неверные сверки    −100 за каждую неудачную сверку протокола
 *                      (protocolAttempts − 1), максимум −300; без протокола — 0
 *   ошибки             −5 за запрос с ошибкой, максимум −100
 *                      (учиться на ошибках не страшно)
 *   лишние запросы     норма = 10 + 5 × (число задач, включая дополнительные);
 *                      −2 за каждый успешный запрос сверх нормы, максимум −100
 *                      (ошибочные запросы в норму не считаются — они уже учтены выше)
 *   ─────────────────────────────────────────────
 *   промежуточный итог не меньше 300 — за раскрытое дело всегда есть очки
 *   доп. задачи        +100 за каждую выполненную
 *   все доп. задачи    +50, если выполнены все (и они есть)
 *
 * Итог: от 300 до 1000 + 150 × доп. задач. Время (durationMs) не штрафуется.
 *
 * Звёзды (только подсказки и протокол — ошибки и число запросов на них не влияют):
 *   ★★★ — без подсказок (в tutorial/easy — не больше одной) и протокол с первой сверки;
 *   ★★  — подсказок не больше бесплатных + max(2, число основных задач)
 *         и не больше двух неудачных сверок;
 *   ★   — дело раскрыто.
 */

export interface CaseStats {
  /** Все запросы в деле, включая ошибочные */
  queries: number;
  /** Запросы с ошибкой (синтаксис, закрытая таблица, только чтение) */
  errors: number;
  /** Открытые уровни подсказок, всего по делу */
  hintsUsed: number;
  /** Сверки протокола, включая успешную; 0 — у дела нет протокола */
  protocolAttempts: number;
  optionalDone: number;
  optionalTotal: number;
  /** Время на дело — только для статистики, в очки не идёт */
  durationMs?: number;
}

export type Stars = 1 | 2 | 3;

export interface ScoreLine {
  label: string;
  value: number;
}

export interface CaseScore {
  stars: Stars;
  points: number;
  /** Слагаемые итога: сумма value всегда равна points */
  breakdown: ScoreLine[];
}

export const SCORING = {
  base: 1000,
  hintCost: 40,
  hintCap: 400,
  failedCheckCost: 100,
  failedCheckCap: 300,
  errorCost: 5,
  errorCap: 100,
  extraQueryCost: 2,
  extraQueryCap: 100,
  queryAllowanceBase: 10,
  queryAllowancePerObjective: 5,
  floor: 300,
  optionalBonus: 100,
  allOptionalBonus: 50,
} as const;

const GENTLE: ReadonlySet<Difficulty> = new Set<Difficulty>(["tutorial", "easy"]);

/** Сколько подсказок не штрафуется и не отнимает звезду */
export function freeHints(difficulty: Difficulty): number {
  return GENTLE.has(difficulty) ? 1 : 0;
}

/** Неотрицательное целое: защита от NaN и мусора в сохранениях */
function count(n: number | undefined): number {
  return Number.isFinite(n) && (n as number) > 0 ? Math.floor(n as number) : 0;
}

/** Неудачные сверки протокола; у дела без протокола — 0 */
export function failedProtocolChecks(stats: CaseStats, caseDef: CaseDef): number {
  return caseDef.protocol ? Math.max(0, count(stats.protocolAttempts) - 1) : 0;
}

/** Норма запросов, которая не штрафуется */
export function queryAllowance(caseDef: CaseDef): number {
  return SCORING.queryAllowanceBase + SCORING.queryAllowancePerObjective * caseDef.objectives.length;
}

export function starsFor(stats: CaseStats, caseDef: CaseDef): Stars {
  const hints = count(stats.hintsUsed);
  const failed = failedProtocolChecks(stats, caseDef);
  const free = freeHints(caseDef.difficulty);
  if (hints <= free && failed === 0) return 3;
  const mainCount = caseDef.objectives.filter((o) => !o.optional).length;
  if (hints <= free + Math.max(2, mainCount) && failed <= 2) return 2;
  return 1;
}

export function scoreCase(stats: CaseStats, caseDef: CaseDef): CaseScore {
  const breakdown: ScoreLine[] = [{ label: "Дело раскрыто", value: SCORING.base }];
  const penalty = (label: string, value: number) => {
    if (value > 0) breakdown.push({ label, value: -value });
    return value;
  };

  const hints = count(stats.hintsUsed);
  const free = freeHints(caseDef.difficulty);
  const paidHints = Math.max(0, hints - free);
  const failed = failedProtocolChecks(stats, caseDef);
  const errors = count(stats.errors);
  const allowance = queryAllowance(caseDef);
  const extraQueries = Math.max(0, count(stats.queries) - errors - allowance);

  let subtotal: number = SCORING.base;
  subtotal -= penalty(
    free > 0 && hints > 0 ? `Подсказки: ${hints} (первая бесплатно)` : `Подсказки: ${hints}`,
    Math.min(SCORING.hintCap, paidHints * SCORING.hintCost)
  );
  subtotal -= penalty(
    `Неверные сверки протокола: ${failed}`,
    Math.min(SCORING.failedCheckCap, failed * SCORING.failedCheckCost)
  );
  subtotal -= penalty(`Ошибки в запросах: ${errors}`, Math.min(SCORING.errorCap, errors * SCORING.errorCost));
  subtotal -= penalty(
    `Запросы сверх нормы (${allowance}): ${extraQueries}`,
    Math.min(SCORING.extraQueryCap, extraQueries * SCORING.extraQueryCost)
  );
  if (subtotal < SCORING.floor) {
    breakdown.push({ label: "Минимум за раскрытое дело", value: SCORING.floor - subtotal });
    subtotal = SCORING.floor;
  }

  const total = count(stats.optionalTotal);
  const done = Math.min(count(stats.optionalDone), total);
  let points = subtotal;
  if (done > 0) {
    const bonus = done * SCORING.optionalBonus;
    breakdown.push({ label: `Дополнительные задачи: ${done} из ${total}`, value: bonus });
    points += bonus;
  }
  if (total > 0 && done === total) {
    breakdown.push({ label: "Все дополнительные задачи", value: SCORING.allOptionalBonus });
    points += SCORING.allOptionalBonus;
  }

  return { stars: starsFor(stats, caseDef), points, breakdown };
}

// --- Звания ---

export interface RankDef {
  id: string;
  title: string;
  /** Сколько очков нужно набрать за сезон */
  at: number;
}

/** Карьера гражданского аналитика: от стажёра до главного аналитика */
export const RANKS: readonly RankDef[] = [
  { id: "intern", title: "Стажёр-аналитик", at: 0 },
  { id: "junior", title: "Младший аналитик", at: 1200 },
  { id: "analyst", title: "Аналитик", at: 3000 },
  { id: "senior", title: "Старший аналитик", at: 5000 },
  { id: "lead", title: "Ведущий аналитик", at: 7500 },
  { id: "chief", title: "Главный аналитик", at: 10000 },
];

export interface RankInfo {
  id: string;
  title: string;
  at: number;
  /** Следующее звание; нет — достигнуто высшее */
  next?: { title: string; at: number };
}

export function rankFor(totalPoints: number): RankInfo {
  const points = Number.isFinite(totalPoints) ? totalPoints : 0;
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (points >= RANKS[i].at) index = i;
  }
  const { id, title, at } = RANKS[index];
  const next = RANKS[index + 1];
  return next ? { id, title, at, next: { title: next.title, at: next.at } } : { id, title, at };
}

// --- Достижения ---

export interface SolvedCaseRecord {
  caseId: string;
  stats: CaseStats;
  stars: Stars;
}

export interface AchievementState {
  /** Раскрытые дела */
  solved: readonly SolvedCaseRecord[];
  /** Сколько тайников найдено за сезон */
  secretsFound: number;
  /**
   * Дополнительные задачи по делам: caseId → выполнено/всего. Нужна, если
   * доп. задачи можно добивать после раскрытия; иначе берётся из stats дела.
   */
  optionalByCase?: Readonly<Record<string, { done: number; total: number }>>;
  /** Все дела сезона раскрыты */
  seasonComplete: boolean;
  /** Уже полученные — повторно не выдаются */
  earned?: ReadonlySet<string>;
}

/**
 * Параметр условия: число (или строка из цифр) — нужное количество,
 * другая строка — id дела, нет параметра — «хотя бы одно».
 */
type Param = { caseId: string } | { atLeast: number };

function parseParam(param: string | number | undefined): Param {
  if (typeof param === "number") return { atLeast: Math.max(1, Math.floor(param)) };
  if (typeof param === "string" && /^\d+$/.test(param.trim())) return { atLeast: Math.max(1, Number(param)) };
  if (typeof param === "string" && param.trim() !== "") return { caseId: param.trim() };
  return { atLeast: 1 };
}

function matchCases(param: Param, caseIds: readonly string[]): boolean {
  return "caseId" in param ? caseIds.includes(param.caseId) : new Set(caseIds).size >= param.atLeast;
}

function optionalComplete(state: AchievementState): string[] {
  const progress = new Map<string, { done: number; total: number }>();
  for (const record of state.solved) {
    progress.set(record.caseId, { done: record.stats.optionalDone, total: record.stats.optionalTotal });
  }
  for (const [caseId, value] of Object.entries(state.optionalByCase ?? {})) {
    progress.set(caseId, value);
  }
  return [...progress].filter(([, p]) => count(p.total) > 0 && count(p.done) >= count(p.total)).map(([id]) => id);
}

function isEarned(def: AchievementDef, state: AchievementState): boolean {
  const casesWhere = (predicate: (r: SolvedCaseRecord) => boolean) =>
    state.solved.filter(predicate).map((r) => r.caseId);

  switch (def.kind) {
    case "case_solved":
      return matchCases(parseParam(def.param), casesWhere(() => true));
    case "case_no_hints":
      return matchCases(parseParam(def.param), casesWhere((r) => count(r.stats.hintsUsed) === 0));
    case "case_three_stars":
      return matchCases(parseParam(def.param), casesWhere((r) => r.stars === 3));
    case "protocol_first_try":
      // Сверка была ровно одна — значит, у дела есть протокол и он сошёлся сразу
      return matchCases(parseParam(def.param), casesWhere((r) => count(r.stats.protocolAttempts) === 1));
    case "secrets_found": {
      const param = parseParam(def.param);
      const needed = "atLeast" in param ? param.atLeast : 1;
      return count(state.secretsFound) >= needed;
    }
    case "all_optional":
      return matchCases(parseParam(def.param), optionalComplete(state));
    case "season_complete":
      return state.seasonComplete;
    default:
      // Неизвестный вид из JSON — не выдаём
      return false;
  }
}

/** id достижений, полученных сейчас (в порядке объявления) */
export function checkAchievements(defs: readonly AchievementDef[], state: AchievementState): string[] {
  const earned = state.earned ?? new Set<string>();
  const fresh: string[] = [];
  for (const def of defs) {
    if (earned.has(def.id) || fresh.includes(def.id)) continue;
    if (isEarned(def, state)) fresh.push(def.id);
  }
  return fresh;
}
