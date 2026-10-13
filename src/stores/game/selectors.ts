/**
 * Производные данные для экранов. Чистые функции от состояния стора:
 * UI не импортирует ядро — всё, что требует логики ядра (варианты протокола,
 * видимые утверждения допроса, эмоция подозреваемого), считается здесь.
 *
 * В React вызывать через useGameView(selector) из ./index.ts (мемоизация по
 * срезам состояния), а не напрямую в useGame(): селекторы возвращают новые
 * объекты.
 */
import {
  activeObjective,
  availableOptions,
  getScene,
  interrogationEmotion,
  mainObjectives,
  objectiveApplies,
  rankFor,
  statementParts,
  visiblePoints,
  type CaseDef,
  type CaseObjective,
  type DialogueChoice,
  type DialogueLine,
  type EvidenceDef,
  type InterrogationDef,
  type InterrogationState,
  type PredictionDef,
  type RankInfo,
  type Scene,
  type StatementPart,
  type TestimonyPoint,
  type Emotion,
} from "@/engine";
import { cases as seasonCases } from "@/data";
import { HINT_TIERS, hintTierAllowed, hintTierFree, predictionsEnabled } from "./rules";
import { casePlayable, isCaseUnlocked, seasonPoints, type GameState } from "./store";
import type { Flags, PersistedGame, SolvedCase, Weather } from "./types";

type State = PersistedGame & Pick<GameState, "last">;
type Cases = readonly CaseDef[];

export function caseOf(state: State, cases: Cases = seasonCases): CaseDef | null {
  const id = state.session?.caseId;
  return (id && cases.find((c) => c.id === id)) || null;
}

export function flagsOf(state: State): Flags {
  return state.session ? { ...state.session.baseFlags, ...state.session.flags } : {};
}

// --- Календарь ---

export type CalendarStatus = "locked" | "open" | "solved" | "draft";

export interface CalendarEntry {
  id: string;
  order: number;
  act: number;
  code: string;
  title: string;
  subtitle: string;
  date: string;
  status: CalendarStatus;
  /** Дело сейчас открыто на столе */
  active: boolean;
  stars?: SolvedCase["bestStars"];
  weather?: Weather;
  consequencesChanged?: boolean;
}

export function calendar(state: State, cases: Cases = seasonCases): CalendarEntry[] {
  return [...cases]
    .sort((a, b) => a.order - b.order)
    .map((c) => {
      const solved = state.season.solved[c.id];
      const status: CalendarStatus = !casePlayable(c)
        ? "draft"
        : solved
          ? "solved"
          : isCaseUnlocked(c.id, cases, state.season.solved)
            ? "open"
            : "locked";
      return {
        id: c.id,
        order: c.order,
        act: c.act,
        code: c.code,
        title: c.title,
        subtitle: c.subtitle,
        date: c.date,
        status,
        active: state.session?.caseId === c.id,
        ...(solved
          ? { stars: solved.bestStars, weather: solved.weather, ...(solved.consequencesChanged ? { consequencesChanged: true } : {}) }
          : {}),
      };
    });
}

/** Дело для кнопки «Продолжить»: начатое, иначе первое открытое нераскрытое */
export function continueTarget(state: State, cases: Cases = seasonCases): string | null {
  if (state.session && state.session.phase !== "debrief") return state.session.caseId;
  return calendar(state, cases).find((c) => c.status === "open")?.id ?? null;
}

export function rankOf(state: State): RankInfo & { points: number } {
  const points = seasonPoints(state.season.solved);
  return { ...rankFor(points), points };
}

// --- Задачи и подсказки ---

export interface HintShown {
  tier: number;
  text: string;
  by?: string;
  line?: string;
  free: boolean;
}

export interface ObjectiveView {
  id: string;
  order: number;
  task: string;
  concept?: string;
  optional: boolean;
  state: "done" | "active" | "locked";
  hints: HintShown[];
  /** Следующий уровень подсказки и бесплатен ли он; null — больше нет */
  nextHint: { tier: number; free: boolean } | null;
  withHint: boolean;
  /** Предсказание ждёт ответа (перед ключевым запросом) */
  prediction: (PredictionDef & { answered?: { answer: number; correct: boolean } }) | null;
}

export function objectivesView(state: State, cases: Cases = seasonCases): ObjectiveView[] {
  const def = caseOf(state, cases);
  const s = state.session;
  if (!def || !s) return [];
  const flags = flagsOf(state);
  const done = new Set(s.completed);
  const active = activeObjective(def, done, flags);
  const mode = state.profile.mode;
  return def.objectives
    .filter((o) => objectiveApplies(o, flags))
    .sort((a, b) => Number(Boolean(a.optional)) - Number(Boolean(b.optional)) || a.order - b.order)
    .map((o: CaseObjective) => {
      const reveals = s.hints.filter((h) => h.objectiveId === o.id).sort((a, b) => a.tier - b.tier);
      const shownTier = reveals.reduce((m, h) => Math.max(m, h.tier), 0);
      let tier = shownTier + 1;
      const maxTier = Math.min(HINT_TIERS, o.hints.length);
      while (tier <= maxTier && !hintTierAllowed(mode, tier)) tier++;
      const isDone = done.has(o.id);
      const state_: ObjectiveView["state"] = isDone ? "done" : o.optional || active?.id === o.id ? "active" : "locked";
      const answered = s.predictions[o.id];
      return {
        id: o.id,
        order: o.order,
        task: o.task,
        ...(o.concept ? { concept: o.concept } : {}),
        optional: Boolean(o.optional),
        state: state_,
        hints: reveals.map((h) => ({ tier: h.tier, free: h.free, ...o.hints[h.tier - 1] })),
        nextHint:
          !isDone && tier <= maxTier
            ? { tier, free: hintTierFree(mode, tier, def, o.concept) || s.freeHintTokens > 0 }
            : null,
        withHint: s.withHint.includes(o.id),
        prediction:
          o.prediction && predictionsEnabled(mode) && state_ === "active"
            ? { ...o.prediction, ...(answered ? { answered } : {}) }
            : null,
      };
    });
}

export function progressOf(state: State, cases: Cases = seasonCases): { done: number; total: number } {
  const def = caseOf(state, cases);
  const s = state.session;
  if (!def || !s) return { done: 0, total: 0 };
  const main = mainObjectives(def, flagsOf(state));
  return { done: main.filter((o) => s.completed.includes(o.id)).length, total: main.length };
}

// --- Улики ---

export function evidenceOf(state: State, cases: Cases = seasonCases): EvidenceDef[] {
  const ids = new Set([...state.season.evidence, ...(state.session?.evidence ?? [])]);
  const out: EvidenceDef[] = [];
  for (const c of cases) for (const o of c.objectives) if (o.evidence && ids.has(o.evidence.id)) out.push(o.evidence);
  return out;
}

// --- Протокол ---

export interface ProtocolBlankView {
  id: string;
  kind: string;
  options: Array<{ value: string; available: boolean }>;
  value: string | null;
  confirmed: boolean;
}

export interface ProtocolView {
  statements: StatementPart[][];
  blanks: ProtocolBlankView[];
  batchSize: number;
  attempts: number;
  failures: number;
  message: string | null;
  solved: boolean;
  /** Все неподтверждённые пропуски заполнены */
  canSubmit: boolean;
}

export function protocolView(state: State, cases: Cases = seasonCases): ProtocolView | null {
  const def = caseOf(state, cases);
  const s = state.session;
  if (!def?.protocol || !s) return null;
  const seen = new Set(s.seen);
  const blanks = def.protocol.blanks.map((b) => {
    const avail = new Set(availableOptions(b, seen));
    return {
      id: b.id,
      kind: b.kind,
      options: b.options.map((value) => ({ value, available: avail.has(value) })),
      value: s.slots[b.id] ?? null,
      confirmed: s.protocolConfirmed.includes(b.id),
    };
  });
  const solved = blanks.every((b) => b.confirmed);
  return {
    statements: def.protocol.statements.map(statementParts),
    blanks,
    batchSize: def.protocol.batchSize ?? 3,
    attempts: s.protocolAttempts,
    failures: s.protocolFailures,
    message: s.protocolMessage,
    solved,
    canSubmit: !solved && s.closingScene === null && blanks.every((b) => b.confirmed || b.value !== null),
  };
}

// --- Сцена ---

export interface StageView {
  scene: Scene;
  line: DialogueLine | null;
  lineIndex: number;
  awaiting: "choice" | "present" | null;
  choices: DialogueChoice[];
  present: Scene["present"] | null;
}

export function stageView(state: State, cases: Cases = seasonCases): StageView | null {
  const def = caseOf(state, cases);
  const stage = state.session?.stage;
  if (!def || !stage) return null;
  const scene = getScene(def, stage.sceneId);
  if (!scene) return null;
  const evidence = new Set([...state.season.evidence, ...(state.session?.evidence ?? [])]);
  return {
    scene,
    line: scene.lines[stage.line] ?? null,
    lineIndex: stage.line,
    awaiting: stage.awaiting ?? null,
    choices: stage.awaiting === "choice" ? (scene.choices ?? []).filter((c) => (c.requires ?? []).every((id) => evidence.has(id))) : [],
    present: stage.awaiting === "present" ? (scene.present ?? null) : null,
  };
}

// --- Допрос ---

export interface InterrogationView {
  sceneId: string;
  def: InterrogationDef;
  state: InterrogationState;
  /** Утверждения ленты с текстом реплик */
  points: Array<TestimonyPoint & { text: string; emotion?: Emotion; broken: boolean; pressed: boolean; lie: boolean }>;
  emotion: Emotion;
  /** Деления терпения (null — шкалы нет) */
  patience: number | null;
  liveQuery: boolean;
}

export function interrogationView(state: State, cases: Cases = seasonCases): InterrogationView | null {
  const def = caseOf(state, cases);
  const active = state.session?.interrogation;
  if (!def || !active) return null;
  const scene = getScene(def, active.sceneId);
  const idef = scene?.interrogation;
  if (!scene || !idef) return null;
  const lines = new Map(scene.lines.map((l) => [l.id, l]));
  return {
    sceneId: active.sceneId,
    def: idef,
    state: active.state,
    points: visiblePoints(idef, active.state).map((p) => {
      const l = lines.get(p.line);
      return {
        ...p,
        text: l?.text ?? "",
        ...(l?.emotion ? { emotion: l.emotion } : {}),
        broken: active.state.broken.includes(p.line),
        pressed: active.state.pressed.includes(p.line),
        lie: Boolean(l?.lie),
      };
    }),
    emotion: interrogationEmotion(idef, active.state),
    patience: active.state.patience,
    liveQuery: Boolean(idef.liveQuery),
  };
}

/** Допросы дела, к которым можно вернуться (закрылся, есть новая карточка) */
export function reopenableInterrogations(state: State): string[] {
  const s = state.session;
  if (!s || s.interrogation) return [];
  return Object.entries(s.interrogations)
    .filter(([id, st]) => st.closed && !st.reopened && s.pins.length + s.evidence.length > (s.closedAt[id] ?? Infinity))
    .map(([id]) => id);
}

// --- Бюджет и часы ---

export interface BudgetView {
  used: number;
  total: number | null;
  left: number | null;
}

export function budgetOf(state: State, cases: Cases = seasonCases): BudgetView {
  const def = caseOf(state, cases);
  const used = state.session?.queryCount ?? 0;
  const total = def?.queryBudget ?? null;
  return { used, total, left: total === null ? null : Math.max(0, total - used) };
}

/** Люди и значения для поиска обвинения: только увиденное */
export function seenValues(state: State, query = "", limit = 50): string[] {
  const q = query.trim().toLowerCase().replace(/ё/g, "е");
  const seen = state.session?.seen ?? [];
  return (q ? seen.filter((v) => v.toLowerCase().replace(/ё/g, "е").includes(q)) : seen).slice(0, limit);
}
