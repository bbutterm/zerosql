/**
 * Чистые правила стора: флаги выборов, погода дела, класс источника карточки,
 * цена подсказок, значения по умолчанию. Без зависимостей от zustand.
 */
import type { CaseDef, FlagValue, PinnedCard, SourceClass, Stars } from "@/engine";
import type { Flags, PersistedGame, PlayMode, Season, Settings, Profile, Weather } from "./types";

// --- Флаги ---

/**
 * Применяет флаг выбора (DialogueChoice.flag):
 *   "name"       → true
 *   "!name"      → false
 *   "name=value" → строка / число / true / false
 *   "name+1", "name-2" → числовой сдвиг (доверие)
 */
export function applyFlag(flags: Flags, spec: string): Flags {
  const s = spec.trim();
  if (!s) return flags;
  const delta = /^([a-z0-9_.]+)\s*([+-])\s*(\d+)$/i.exec(s);
  if (delta) {
    const prev = Number(flags[delta[1]] ?? 0);
    const step = Number(delta[3]) * (delta[2] === "-" ? -1 : 1);
    return { ...flags, [delta[1]]: (Number.isFinite(prev) ? prev : 0) + step };
  }
  if (s.startsWith("!")) return { ...flags, [s.slice(1).trim()]: false };
  const eq = s.indexOf("=");
  if (eq > 0) return { ...flags, [s.slice(0, eq).trim()]: parseFlagValue(s.slice(eq + 1).trim()) };
  return { ...flags, [s]: true };
}

export function parseFlagValue(raw: string): FlagValue {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

export function shiftFlag(flags: Flags, name: string, delta: number): Flags {
  const prev = Number(flags[name] ?? 0);
  return { ...flags, [name]: (Number.isFinite(prev) ? prev : 0) + delta };
}

/** Флаги перед делом: склейка флагов ранних дел по порядку (последнее значение побеждает) */
export function flagsBefore(caseDef: Pick<CaseDef, "order">, cases: readonly CaseDef[], caseFlags: Record<string, Flags>): Flags {
  return cases
    .filter((c) => c.order < caseDef.order)
    .sort((a, b) => a.order - b.order)
    .reduce<Flags>((acc, c) => ({ ...acc, ...(caseFlags[c.id] ?? {}) }), {});
}

/** Флаги, которые изменило дело относительно базы */
export function flagsDiff(base: Flags, now: Flags): Flags {
  const out: Flags = {};
  for (const [k, v] of Object.entries(now)) if (base[k] !== v) out[k] = v;
  return out;
}

export function sameFlags(a: Flags | undefined, b: Flags | undefined): boolean {
  const ka = Object.keys(a ?? {});
  const kb = Object.keys(b ?? {});
  return ka.length === kb.length && ka.every((k) => a?.[k] === b?.[k]);
}

// --- Погода дела (разд. 6.13) ---

export const WEATHER_LABELS: Record<Weather, string> = {
  blizzard: "Метель",
  overcast: "Пасмурно",
  clear: "Ясно",
  aurora: "Северное сияние",
};

export function weatherFor(stars: Stars, optionalDone: number, optionalTotal: number): Weather {
  if (stars === 3) return optionalTotal > 0 && optionalDone >= optionalTotal ? "aurora" : "clear";
  return stars === 2 ? "overcast" : "blizzard";
}

// --- Подсказки (разд. 7.1) ---

export const HINT_TIERS = 4;

/** Доступен ли уровень подсказки в режиме: «Ноль» — без подсказок, «Профи» — без наводок */
export function hintTierAllowed(mode: PlayMode, tier: number): boolean {
  if (mode === "zero") return false;
  if (mode === "pro" && tier === 1) return false;
  return tier >= 1 && tier <= HINT_TIERS;
}

/**
 * Бесплатен ли уровень: наводка в «Новичке»; «Понятие» — при первом появлении
 * понятия (оно входит в concepts этого дела). Жетон после второй неудачной
 * сверки учитывает стор.
 */
export function hintTierFree(mode: PlayMode, tier: number, caseDef: CaseDef, concept: string | undefined): boolean {
  if (tier === 1 && mode === "novice") return true;
  if (tier === 2 && concept !== undefined && caseDef.concepts.includes(concept)) return true;
  return false;
}

/** Предсказания включены в «Новичке» и «Стандарте» */
export const predictionsEnabled = (mode: PlayMode) => mode === "novice" || mode === "standard";

// --- Мастерство (разд. 6.3) ---

export const MASTERY = { start: 50, firstTry: 15, hint: -10, prediction: 10 } as const;

export function bumpMastery(mastery: Record<string, number>, concept: string | undefined, delta: number): Record<string, number> {
  if (!concept) return mastery;
  const prev = mastery[concept] ?? MASTERY.start;
  return { ...mastery, [concept]: Math.max(0, Math.min(100, prev + delta)) };
}

// --- Карточки ---

const PBD_TABLES = new Set([
  "incidents", "incident_persons", "persons", "staff", "logins", "workstations", "audit_log", "query_log",
  "evidence_registry", "cron_jobs", "attachments", "cases", "doc_registry", "statements",
]);
const CLASS_BY_TABLE: Record<string, SourceClass> = {
  plate_reads: "dorset",
  cameras: "dorset",
  phones: "operator",
  messenger_events: "operator",
  bank_statements: "bank",
  accounts: "bank",
  transactions: "bank",
  gs_comms_2015: "gs_archive",
  gs_phonebook: "gs_archive",
  nina_carbon: "carbon",
  outfall_temp: "hydropost",
  diver_reports: "witness",
};

/** Класс источника по таблице (эвристика по слоям мира; контент может уточнить) */
export function sourceClassFor(table: string | undefined): SourceClass | undefined {
  if (!table) return undefined;
  const t = table.toLowerCase();
  if (t.startsWith("sokol_stage_") || t.startsWith("arch16_")) return "sokol_2016";
  if (CLASS_BY_TABLE[t]) return CLASS_BY_TABLE[t];
  if (PBD_TABLES.has(t)) return "pbd";
  if (t.startsWith("draft_") || t.startsWith("publication")) return undefined;
  return "mirror_city";
}

/** Таблица-источник: первая таблица после FROM */
export function sourceTable(sql: string): string | undefined {
  const m = /\bfrom\s+["`[]?([a-z_][a-z0-9_]*)/i.exec(sql.replace(/--[^\n]*/g, " "));
  return m ? m[1].toLowerCase() : undefined;
}

export function fingerprint(columns: readonly string[], values: readonly unknown[]): string {
  const text = columns.map((c, i) => `${c.toLowerCase()}=${String(values[i] ?? "∅")}`).join("|");
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export function makeCard(
  row: readonly unknown[],
  columns: readonly string[],
  sql: string,
  clock: string
): PinnedCard {
  const values = row.map((v) => (v === undefined ? null : (v as PinnedCard["values"][number])));
  const fp = fingerprint(columns, values);
  const table = sourceTable(sql);
  const sourceClass = sourceClassFor(table);
  return {
    id: `card.${fp}`,
    columns: [...columns],
    values,
    ...(table ? { table } : {}),
    ...(sourceClass ? { sourceClass } : {}),
    sql,
    pinnedAt: clock,
    fingerprint: fp,
  };
}

/** «Приколоть всё» — только если в результате не больше 20 строк (разд. 6.5) */
export const PIN_ALL_LIMIT = 20;

// --- Значения по умолчанию ---

export const DEFAULT_SETTINGS: Settings = {
  textSpeed: "normal",
  autoAdvance: false,
  voiceVolume: 0.9,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  reducedMotion: false,
  noTimer: false,
  typewriter: true,
  lieHighlight: false,
};

export const DEFAULT_PROFILE: Profile = {
  playerName: "",
  mode: "standard",
  ageConfirmed: false,
  coldOpenSeen: false,
  onboarded: false,
};

export const emptySeason = (): Season => ({
  solved: {},
  caseFlags: {},
  casePatches: {},
  caseQueryLog: {},
  evidence: [],
  foundSecrets: [],
  achievements: [],
  events: [],
  counters: {},
  mastery: {},
  runs: {},
  ending: null,
  endingsSeen: [],
});

export const defaultPersisted = (): PersistedGame => ({
  profile: { ...DEFAULT_PROFILE },
  settings: { ...DEFAULT_SETTINGS },
  season: emptySeason(),
  session: null,
});

export const uniq = <T>(items: readonly T[]): T[] => [...new Set(items)];
export const pushUniq = <T>(items: readonly T[], ...add: T[]): T[] => uniq([...items, ...add]);
