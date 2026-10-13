/**
 * Расписание zero (М6, GAME_DESIGN «03:12:00 — журнал отвечает»): девять
 * заданий Ирины. CRON-01 входит каждую ночь в 03:12:00 и пишет в query_log,
 * только когда задание срабатывает. Задание 1 живое: Д5, первый запрос после
 * 5.1, текст — по увиденным 3311 и 3313. Остальные срабатывают ночью после
 * своего дела (fire_after_case), если выполнено условие по реестру увиденного;
 * не выполнено — проверяются после следующего дела.
 *
 * Здесь только правила. Строку в query_log вставляет сюжетный патч cron.fire,
 * стор передаёт ему параметры отсюда.
 */
import type { StoryPatchParams } from "./world/patches";
import { CRON_JOBS } from "./world/facts";
import { lastCronLogin } from "./world/patches";
import { normalizeCell } from "./values";

export const CRON_PATCH = "cron.fire";

type Seen = readonly string[];

/** Ключи условий cron_jobs.condition_json → проверка по реестру увиденного */
const SEEN_KEYS: Record<string, (norm: ReadonlySet<string>, raw: Seen) => boolean> = {
  "doc_registry:3311": (n) => n.has("3311"),
  "doc_registry:3313": (n) => n.has("3313"),
  "construction_docs:ПД-117/изм.3:signed_by_person_id": (n) => n.has(normalizeCell("ПД-117/изм.3")) && n.has("1001"),
  "gs_comms_2015:sms:2-14:2015-02-19": (_, raw) => raw.some((v) => /старому причалу/i.test(v)),
};

function seenKey(key: unknown, norm: ReadonlySet<string>, raw: Seen): boolean {
  return typeof key === "string" && Boolean(SEEN_KEYS[key]?.(norm, raw));
}

const caseOrder = (key: string) => Number(key.replace(/^c/, ""));

/** Задание живое (срабатывает событием дела, а не ночью после него) */
const isLive = (condition: string) => condition.includes('"live"');

/** Ветка текста задания 1: обе строки 3311 и 3313 увидены — a, одна — b, ни одной — c */
export function cronJob1Variant(seen: Seen): "a" | "b" | "c" {
  const norm = new Set(seen.map(normalizeCell));
  const n = ["3311", "3313"].filter((k) => norm.has(k)).length;
  return n === 2 ? "a" : n === 1 ? "b" : "c";
}

/** Ближайшие 03:12:00 не раньше часов — ночь после дела */
export function nextCronNight(clock: string): string {
  const t = Date.parse(`${clock.slice(0, 10)}T${clock.slice(11, 19) || "00:00:00"}Z`) + 86_400_000;
  return lastCronLogin(new Date(t).toISOString().slice(0, 19).replace("T", " "));
}

/** Условие задания выполнено (живое задание ночью срабатывает всегда — если событие его не запустило) */
export function cronConditionHolds(condition: string, seen: Seen): boolean {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(condition) as Record<string, unknown>;
  } catch {
    return false;
  }
  if (parsed.always === true || "live" in parsed) return true;
  const norm = new Set(seen.map(normalizeCell));
  if ("seen" in parsed) return seenKey(parsed.seen, norm, seen);
  if ("not_seen" in parsed) return !seenKey(parsed.not_seen, norm, seen);
  return false;
}

/** id сработавших заданий по уже применённым патчам */
export function firedCronJobs(patches: ReadonlyArray<string | { id: string; params?: StoryPatchParams }>): Set<number> {
  const out = new Set<number>();
  for (const p of patches) {
    if (typeof p !== "string" && p.id === CRON_PATCH && typeof p.params?.jobId === "number") out.add(p.params.jobId);
  }
  return out;
}

/**
 * Параметры патча cron.fire для живого события дела (Д5, задание 1). null —
 * у дела нет живого задания.
 */
export function cronLiveParams(order: number, seen: Seen): StoryPatchParams | null {
  const job = CRON_JOBS.find((j) => caseOrder(j.fireAfter) === order && isLive(j.condition));
  if (!job) return null;
  return { jobId: job.id, ...(job.id === 1 ? { variant: cronJob1Variant(seen) } : {}) };
}

/**
 * Задания, которые срабатывают ночью после дела order: дело задания не позже
 * этого, задание ещё не сработало, условие выполнено по реестру увиденного дела.
 * Возвращает параметры патчей cron.fire в порядке id.
 */
export function cronFiresAfterCase(order: number, seen: Seen, fired: ReadonlySet<number>, clock: string): StoryPatchParams[] {
  const at = nextCronNight(clock);
  return CRON_JOBS.filter((j) => caseOrder(j.fireAfter) <= order && !fired.has(j.id) && cronConditionHolds(j.condition, seen)).map((j) => ({
    jobId: j.id,
    at,
    ...(j.id === 1 ? { variant: cronJob1Variant(seen) } : {}),
  }));
}
