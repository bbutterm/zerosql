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
  flagsMatch,
  getScene,
  nightBeatKind,
  nightCronJobs,
  toGameTime,
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
  type NightBeat,
} from "@/engine";
import { cases as seasonCases } from "@/data";
import { plural } from "@/lib/plural";
import { HINT_TIERS, flagsBefore, hintTierAllowed, hintTierFree, predictionsEnabled } from "./rules";
import { casePlayable, isCaseUnlocked, seasonPoints, type GameState } from "./store";
import type { Flags, PersistedGame, Season, SolvedCase, Weather } from "./types";

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

// --- Ночь между делами (docs/design/NIGHTS.md) ---

/** День первого солнца: от него считается «До солнца N дней» (журнал дел и карточка ночи) */
export const SUNRISE_DATE = "2027-01-11";
/** Восход 11 января: «Солнце встаёт в 12:58» */
export const SUNRISE_AT = "2027-01-11 12:58:00";

/** Дней до солнца от даты дела: та же формула, что у журнала дел */
export function daysToSunrise(date: string): number {
  return Math.max(0, Math.ceil((Date.parse(`${SUNRISE_DATE}T00:00:00Z`) - Date.parse(`${date.slice(0, 10)}T00:00:00Z`)) / 86_400_000));
}

/** Тайминги экрана ночи, мс (NIGHTS.md, «Движение») */
export const NIGHT_TIMING = {
  /** Штамп: старт печати, мс на знак, пауза после */
  stampStart: 300,
  stampChar: 22,
  stampHold: 500,
  /** Реплика: проявление, без голоса — 1100 + 28 × длина, после голоса +600, уход */
  lineIn: 400,
  lineBase: 1100,
  lineChar: 28,
  lineAfterVoice: 600,
  lineOut: 240,
  /** Шаг ленты */
  row: 1200,
  /** Системное сообщение: такт; в строке состояния держится 6 с */
  status: 1600,
  /** «сеансов: 2» горит, затем часы идут к until */
  sessions: 2400,
  /** Полный такт 03:12 */
  at311: 400,
  silence: 1200,
  loginDelay: 300,
  burst: 600,
  burstGap: 300,
  humBack: 600,
  /** Короткий щелчок */
  shortClick: 800,
  /** Монтаж: на дату */
  montageDay: 500,
  /** Карточка: гашение зоны B, задержка «К делу», «Авто» уходит в дело */
  cardFade: 240,
  startDelay: 1200,
  autoStart: 4000,
} as const;

/** Кусок записи ленты: текст или маска фиксированной длины (Redaction) */
export type NightTextPart = { text: string } | { mask: string };

export interface NightRowView {
  key: string;
  /** «03:12:00» */
  time: string;
  table: string;
  parts: NightTextPart[];
  /** Перенос до трёх строк (query_log с заданиями zero) */
  wrap: boolean;
}

export type NightStep =
  | { kind: "line"; at: string | null; lineId: string; text: string; ms: number }
  | { kind: "row"; at: string; row: NightRowView; ms: number }
  | { kind: "status"; at: string | null; text: string; ms: number }
  | { kind: "sessions"; at: string; until: string; ms: number }
  | {
      kind: "click";
      at: string;
      full: boolean;
      /** Очереди клавиш ui.key_burst: по одной на задание zero, сработавшее этой ночью */
      bursts: number;
      /** Строка входа zero (через 300 мс после щелчка) */
      login: NightRowView | null;
      /** После коды Д8 — строки заданий zero в query_log, после очередей клавиш */
      cronRows: NightRowView[];
      ms: number;
    }
  | { kind: "montage"; dates: string[]; ms: number };

export interface NightCardView {
  /** Только на смене акта: «Часть вторая. Дыры во льду» */
  part: string | null;
  /** «Дело № 04» (неразрывный пробел) или «Интерлюдия» */
  code: string;
  title: string;
  subtitle: string;
  /** «11 декабря 2026 года, пятница, 10:00. До солнца 31 день.» */
  date: string;
}

export interface NightView {
  caseId: string;
  stamp: string;
  /** Время строки состояния на входе 'YYYY-MM-DD HH:MM:SS' */
  from: string;
  /** Время на карточке — старт дела */
  caseAt: string;
  steps: NightStep[];
  card: NightCardView;
  /** Оценка длительности без голоса (штамп, такты, карточка), мс */
  totalMs: number;
}

/** Строки частей сезона на смене акта (GAME_DESIGN.md, «Акты») */
export const ACT_TITLES: Record<number, string> = {
  2: "Часть вторая. Дыры во льду",
  3: "Часть третья. Первое солнце",
};

const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

/** «11 декабря 2026 года, пятница, 10:00. До солнца 31 день.»; в день солнца — «До солнца 1 ч 28 мин.» */
export function nightCardDate(date: string): string {
  const at = toGameTime(date);
  const [y, m, d] = at.slice(0, 10).split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const head = `${d} ${MONTHS_GEN[m - 1]} ${y} года, ${weekday}, ${at.slice(11, 16)}.`;
  const days = daysToSunrise(at);
  if (days > 0) return `${head} До солнца ${days} ${plural(days, ["день", "дня", "дней"])}.`;
  const minutes = Math.max(0, Math.round((Date.parse(SUNRISE_AT.replace(" ", "T") + "Z") - Date.parse(at.replace(" ", "T") + "Z")) / 60_000));
  return `${head} До солнца ${Math.floor(minutes / 60)} ч ${minutes % 60} мин.`;
}

/**
 * Маски ленты: логин или имя — «*****», пропуск — «B-****» (длина маски не
 * выдаёт, кто под ней). reveal — order дела, после раскрытия которого строка
 * видна; null — скрыта всегда (nol).
 */
const NIGHT_MASKS: ReadonlyArray<{ re: RegExp; mask: string; reveal: number | null }> = [
  { re: /(?<![\p{L}\d._-])nol(?![\p{L}\d._-])/gu, mask: "*****", reveal: null },
  { re: /(?<![\p{L}\d._-])(?:zero|i\.valts)(?![\p{L}\d._-])/gu, mask: "*****", reveal: 4 },
  { re: /(?<![\p{L}\d._-])a\.lykov(?![\p{L}\d._-])/gu, mask: "*****", reveal: 8 },
  { re: /B-4210/g, mask: "B-****", reveal: 8 },
  { re: /Лыков[а-яё]*(?: [А-ЯЁ]\. ?[А-ЯЁ]\.| [А-ЯЁ][а-яё]+(?: [А-ЯЁ][а-яё]+)?)?/gu, mask: "*****", reveal: 8 },
];

/** Запись ленты с масками по раскрытым делам (solvedOrders — order раскрытых дел) */
export function maskNightText(text: string, solvedOrders: ReadonlySet<number>): NightTextPart[] {
  const hits: Array<{ start: number; end: number; mask: string }> = [];
  for (const m of NIGHT_MASKS) {
    if (m.reveal !== null && solvedOrders.has(m.reveal)) continue;
    for (const hit of text.matchAll(m.re)) {
      const start = hit.index ?? 0;
      const end = start + hit[0].length;
      if (!hits.some((h) => start < h.end && end > h.start)) hits.push({ start, end, mask: m.mask });
    }
  }
  hits.sort((a, b) => a.start - b.start);
  const parts: NightTextPart[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.start > pos) parts.push({ text: text.slice(pos, h.start) });
    parts.push({ mask: h.mask });
    pos = h.end;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos) });
  return parts;
}

/** Что нужно ночи из сохранения: раскрытые дела, флаги и патчи прошлых дел */
export interface NightContext {
  season: Pick<Season, "solved" | "caseFlags" | "casePatches">;
  cases?: Cases;
  /** Флаги поверх флагов ранних дел (лаборатория: ?flags=ratnikov_full) */
  flags?: Flags;
}

/** Расписание такта 03:12 от начала такта, мс (NIGHTS.md, «Полный такт 03:12») */
export interface ClickSchedule {
  /** До этого момента часы показывают 03:11 (только полный такт) */
  showAt311Until: number;
  /** Гул обрывается без фейда (полный такт; null — короткий щелчок) */
  cutAt: number | null;
  /** Щелчок ui.key_click, часы — 03:12:00 */
  clickAt: number;
  /** Строка входа zero */
  loginAt: number | null;
  /** Очереди клавиш ui.key_burst */
  bursts: number[];
  /** Строки заданий zero */
  cronRows: number[];
  /** Гул возвращается за 600 мс (полный такт) */
  resumeAt: number | null;
  end: number;
}

export function clickSchedule(step: { full: boolean; bursts: number; login: unknown; cronRows: readonly unknown[] }): ClickSchedule {
  const t = NIGHT_TIMING;
  const clickAt = step.full ? t.at311 + t.silence : 0;
  const loginAt = step.login ? clickAt + t.loginDelay : null;
  const burstStart = clickAt + t.loginDelay + (step.login ? t.loginDelay : 0);
  const bursts = Array.from({ length: step.bursts }, (_, k) => burstStart + k * (t.burst + t.burstGap));
  const rowsStart = burstStart + step.bursts * (t.burst + t.burstGap);
  const cronRows = step.cronRows.map((_, j) => rowsStart + j * t.row);
  const settle = rowsStart + step.cronRows.length * t.row;
  if (!step.full) return { showAt311Until: 0, cutAt: null, clickAt, loginAt, bursts, cronRows, resumeAt: null, end: Math.max(t.shortClick, settle) };
  return { showAt311Until: clickAt, cutAt: t.at311, clickAt, loginAt, bursts, cronRows, resumeAt: settle, end: settle + t.humBack };
}

const lineMs = (text: string) => NIGHT_TIMING.lineIn + NIGHT_TIMING.lineBase + NIGHT_TIMING.lineChar * text.length + NIGHT_TIMING.lineOut;

/**
 * Таймлайн ночи перед делом def: такты по флагам ранних дел (when), реплики
 * из сцен, строки ленты с масками, очереди клавиш по заданиям zero прошлого
 * дела (после Д8 — и их строки), карточка. null — у дела нет ночи.
 */
export function buildNightView(def: CaseDef, ctx: NightContext): NightView | null {
  const night = def.night;
  if (!night) return null;
  const cases = ctx.cases ?? seasonCases;
  const flags: Flags = { ...flagsBefore(def, cases, ctx.season.caseFlags), ...(ctx.flags ?? {}) };
  const solvedOrders = new Set(cases.filter((c) => ctx.season.solved[c.id]).map((c) => c.order));
  const prev = [...cases].filter((c) => c.order < def.order).sort((a, b) => b.order - a.order)[0];
  const cronJobs = prev ? nightCronJobs(ctx.season.casePatches[prev.id] ?? []) : [];
  const withRows = def.order >= 9;
  let seq = 0;
  const row = (at: string, table: string, text: string, wrap = false): NightRowView => ({
    key: `r${++seq}`,
    time: at.slice(11, 19),
    table,
    parts: maskNightText(text, solvedOrders),
    wrap,
  });

  const beats = (night.beats as NightBeat[]).filter((b) => flagsMatch(b.when, flags));
  // Очереди клавиш — у щелчка с cron; если такого нет, у щелчка в ночь срабатывания (или у первого полного)
  const clicks = beats.filter((b): b is Extract<NightBeat, { click: string }> => nightBeatKind(b) === "click");
  const cronClick =
    clicks.find((b) => b.cron) ??
    (cronJobs.length
      ? (clicks.find((b) => toGameTime(b.at) === toGameTime(cronJobs[0].at)) ?? clicks.find((b) => b.click === "full") ?? null)
      : null);

  const steps: NightStep[] = [];
  for (const beat of beats) {
    const at = beat.at ? toGameTime(beat.at) : null;
    switch (nightBeatKind(beat)) {
      case "scene": {
        const b = beat as Extract<NightBeat, { scene: string }>;
        const scene = getScene(def, b.scene);
        if (!scene) break;
        const lines = b.line ? scene.lines.slice(b.line - 1, b.line) : scene.lines;
        lines.forEach((l, i) => steps.push({ kind: "line", at: i === 0 ? at : null, lineId: l.id, text: l.text, ms: lineMs(l.text) }));
        break;
      }
      case "row": {
        const b = beat as Extract<NightBeat, { row: unknown }>;
        steps.push({ kind: "row", at: at as string, row: row(at as string, b.row.table, b.row.text), ms: NIGHT_TIMING.row });
        break;
      }
      case "status":
        steps.push({ kind: "status", at, text: (beat as Extract<NightBeat, { status: string }>).status, ms: NIGHT_TIMING.status });
        break;
      case "sessions":
        steps.push({
          kind: "sessions",
          at: at as string,
          until: toGameTime((beat as Extract<NightBeat, { sessions: number }>).until),
          ms: NIGHT_TIMING.sessions,
        });
        break;
      case "click": {
        const b = beat as Extract<NightBeat, { click: string }>;
        const full = b.click === "full";
        const when = at as string;
        const login = b.login ? row(when, "logins", "zero  вход") : null;
        const isCron = b === cronClick;
        const bursts = isCron ? cronJobs.length : 0;
        const cronRows = isCron && withRows ? cronJobs.map((job) => row(when, "query_log", `zero  CRON-01  ${job.sql}`, true)) : [];
        const shape = { full, bursts, login, cronRows };
        steps.push({ kind: "click", at: when, ...shape, ms: clickSchedule(shape).end });
        break;
      }
      case "montage": {
        const m = (beat as Extract<NightBeat, { montage: { from: string; to: string } }>).montage;
        const dates: string[] = [];
        for (let t = Date.parse(`${m.from}T00:00:00Z`); t <= Date.parse(`${m.to}T00:00:00Z`) && dates.length < 60; t += 86_400_000) {
          dates.push(new Date(t).toISOString().slice(0, 10));
        }
        steps.push({ kind: "montage", dates, ms: dates.length * NIGHT_TIMING.montageDay });
        break;
      }
    }
  }

  const stamp = night.stamp;
  const card: NightCardView = {
    part: prev && prev.act !== def.act ? (ACT_TITLES[def.act] ?? null) : null,
    code: def.code.replace(/№\s*/, "№\u00A0"),
    title: def.title,
    subtitle: def.subtitle,
    date: nightCardDate(def.date),
  };
  const t = NIGHT_TIMING;
  const totalMs =
    t.stampStart + t.stampChar * stamp.length + t.stampHold + steps.reduce((sum, x) => sum + x.ms, 0) + t.cardFade + t.startDelay;
  return { caseId: def.id, stamp, from: toGameTime(night.from), caseAt: toGameTime(def.date), steps, card, totalMs };
}

/** Ночь активного дела (фаза night); null — не ночь */
export function nightView(state: State, cases: Cases = seasonCases): NightView | null {
  const s = state.session;
  if (!s || s.phase !== "night") return null;
  const def = cases.find((c) => c.id === s.caseId);
  return def ? buildNightView(def, { season: state.season, cases }) : null;
}
