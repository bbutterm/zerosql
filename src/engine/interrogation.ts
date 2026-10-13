import type { PinnedCard } from "@/types/case";
import type { Emotion, EvidencePresent, InterrogationDef, InterrogationMode, TestimonyPoint } from "@/types/story";
import { cardMatches, isSourceCard } from "./board";

/**
 * Допрос «Наушник» (GAME_DESIGN, разд. 6.9) — чистые функции состояния.
 *
 * Лента из 3–5 утверждений. «Надавить» проигрывает уточнение и может открыть
 * новое утверждение. «Предъявить» карточку: верная — «Пробой» (эмоция по
 * breakSteps, новая ветка), неверная — минус деление терпения Даши (3).
 * Терпение кончилось — подозреваемый «закрылся»: это не поражение, дело идёт
 * дальше обходной задачей. Вернуться можно один раз (reopenInterrogation).
 * Союзник (ally): терпения нет, неверная карточка — реплика-боль и −1 к доверию.
 * Беседа (talk): одно предъявление.
 */

export const DEFAULT_PATIENCE = 3;

export interface InterrogationState {
  /** Пробитые утверждения (id реплик) в порядке пробоя */
  broken: string[];
  /** Утверждения, на которых уже надавили */
  pressed: string[];
  /** Оставшиеся деления терпения; null — шкалы нет (ally, talk) */
  patience: number | null;
  /** Подозреваемый «закрылся» */
  closed: boolean;
  /** Допрос окончен: все пробои сделаны или беседа состоялась */
  done: boolean;
  /** Сколько было предъявлений */
  presents: number;
  /** Допрос уже открывали заново после «закрылся» */
  reopened: boolean;
}

/** Что предъявил игрок: улики по id и/или карточки доски по содержимому */
export interface OfferedEvidence {
  evidenceIds?: readonly string[];
  cards?: readonly PinnedCard[];
}

export type PresentResult = "break" | "miss" | "closed" | "done" | "ignored";

export interface PresentOutcome {
  state: InterrogationState;
  result: PresentResult;
  /** Сцена, которую нужно проиграть */
  scene?: string;
  /** Эмоция подозреваемого после хода */
  emotion: Emotion;
  /** Изменение флага доверия (ally): { flag, delta: -1 } */
  trust?: { flag: string; delta: number };
}

const modeOf = (def: InterrogationDef): InterrogationMode => def.mode ?? "standard";
const hasPatience = (def: InterrogationDef) => modeOf(def) === "standard" || modeOf(def) === "unwinnable";

export function startInterrogation(def: InterrogationDef): InterrogationState {
  return {
    broken: [],
    pressed: [],
    patience: hasPatience(def) ? Math.max(1, Math.floor(def.patience ?? DEFAULT_PATIENCE)) : null,
    closed: false,
    done: false,
    presents: 0,
    reopened: false,
  };
}

/** Эмоция подозреваемого: breakSteps[число пробоев] (последний шаг — итог) */
export function interrogationEmotion(def: InterrogationDef, state: InterrogationState): Emotion {
  const steps = def.breakSteps;
  if (steps.length === 0) return "neutral";
  return steps[Math.min(state.broken.length, steps.length - 1)];
}

/** Утверждения, видимые в ленте: без revealedBy или открытые нажимом */
export function visiblePoints(def: InterrogationDef, state: InterrogationState): TestimonyPoint[] {
  return def.points.filter((p) => !p.revealedBy || state.pressed.includes(p.revealedBy));
}

/**
 * Засчитывается ли предъявление: позиции — улики из correct (по id) и
 * предикаты cards (по содержимому карточек-источников). requireAll — нужны
 * все позиции, иначе любая одна.
 */
export function presentMatches(present: EvidencePresent, offered: OfferedEvidence): boolean {
  const ids = new Set(offered.evidenceIds ?? []);
  const cards = (offered.cards ?? []).filter(isSourceCard);
  const checks: boolean[] = [
    ...present.correct.map((id) => ids.has(id)),
    ...(present.cards ?? []).map((p) => cards.some((c) => cardMatches(c, p))),
  ];
  if (checks.length === 0) return false;
  return present.requireAll ? checks.every(Boolean) : checks.some(Boolean);
}

/** «Надавить»: сцена-уточнение; повторный нажим допустим (сцена та же) */
export function pressPoint(
  def: InterrogationDef,
  state: InterrogationState,
  line: string
): { state: InterrogationState; scene?: string } {
  const point = visiblePoints(def, state).find((p) => p.line === line);
  if (!point || state.closed || state.done) return { state };
  const pressed = state.pressed.includes(line) ? state.pressed : [...state.pressed, line];
  return { state: { ...state, pressed }, ...(point.press ? { scene: point.press } : {}) };
}

/** Все утверждения, которые можно пробить, пробиты */
function allBroken(def: InterrogationDef, broken: readonly string[]): boolean {
  return def.points.filter((p) => p.present).every((p) => broken.includes(p.line));
}

/** «Предъявить» карточку на утверждении line */
export function presentEvidence(
  def: InterrogationDef,
  state: InterrogationState,
  line: string,
  offered: OfferedEvidence
): PresentOutcome {
  const mode = modeOf(def);
  const point = visiblePoints(def, state).find((p) => p.line === line);
  const ignored = (): PresentOutcome => ({ state, result: "ignored", emotion: interrogationEmotion(def, state) });
  if (state.closed || state.done || !point?.present || state.broken.includes(line)) return ignored();

  const presents = state.presents + 1;

  if (presentMatches(point.present, offered)) {
    const broken = [...state.broken, line];
    const done = mode === "talk" || allBroken(def, broken);
    const next: InterrogationState = { ...state, broken, presents, done };
    return {
      state: next,
      result: "break",
      scene: point.present.success,
      emotion: interrogationEmotion(def, next),
    };
  }

  if (mode === "talk") {
    const next: InterrogationState = { ...state, presents, done: true };
    return { state: next, result: "done", scene: point.present.failure, emotion: interrogationEmotion(def, next) };
  }
  if (mode === "ally") {
    const next: InterrogationState = { ...state, presents };
    return {
      state: next,
      result: "miss",
      scene: point.present.failure,
      emotion: interrogationEmotion(def, next),
      ...(def.trustFlag ? { trust: { flag: def.trustFlag, delta: -1 } } : {}),
    };
  }

  const patience = Math.max(0, (state.patience ?? DEFAULT_PATIENCE) - 1);
  if (patience === 0) {
    const next: InterrogationState = { ...state, presents, patience, closed: true };
    return {
      state: next,
      result: "closed",
      scene: def.closedScene ?? point.present.failure,
      emotion: interrogationEmotion(def, next),
    };
  }
  const next: InterrogationState = { ...state, presents, patience };
  return { state: next, result: "miss", scene: point.present.failure, emotion: interrogationEmotion(def, next) };
}

/**
 * Вернуться к «закрывшемуся» подозреваемому — один раз, когда появилась новая
 * карточка. Пробои сохраняются, терпение восстанавливается. null — нельзя.
 */
export function reopenInterrogation(def: InterrogationDef, state: InterrogationState): InterrogationState | null {
  if (!state.closed || state.reopened) return null;
  return { ...state, closed: false, reopened: true, patience: startInterrogation(def).patience };
}
