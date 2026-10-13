/**
 * Картины сцен: канон локаций (src/data/locations.json), цепочка запасных картин и то, что
 * видит игрок, пока сданы не все картины (UI_ART_DIRECTION §7.14, ART_BIBLE §5.5).
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cases } from "@/data";
import {
  BACKGROUND_FALLBACK,
  LOCATION_IDS,
  NIGHT_BACKGROUND,
  TITLE_PAINTING,
  backgroundChain,
  backgroundUrl,
  locationById,
  locations,
} from "@/data/backgrounds";
import { LOCATION_ID_RE } from "@/engine";
import {
  type BackdropStack,
  backdropRetarget,
  backdropSettled,
  backdropShown,
  backgroundCandidates,
} from "@/components/story/scene-backdrop";
import { LOCATIONS as ART_LOCATIONS, promptRows } from "../../../scripts/art-prompts.mjs";

const PUBLIC = join(__dirname, "..", "..", "..", "public");
const delivered = (url: string) => existsSync(join(PUBLIC, url));
/** Что покажет сцена сейчас: первый файл цепочки, который лежит в public/ */
const shownNow = (location: string) => backgroundCandidates(location, "/backgrounds", (url) => !delivered(url))[0] ?? null;

const BASEMENT_FAMILY = [
  "basement_b0_03_night",
  "basement_b0_03_day",
  "basement_b0_03_morning",
  "basement_b0_03_morning_tv",
  "basement_new_year",
  "ocr_office",
];

describe("канон локаций", () => {
  it("id уникальны, snake_case, у каждой есть подпись", () => {
    const ids = locations.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of locations) {
      expect(l.id, l.id).toMatch(LOCATION_ID_RE);
      expect(l.name.trim(), l.id).not.toBe("");
    }
    expect(LOCATION_IDS.size).toBe(ids.length);
  });

  it("каждая локация сцен сезона — из канона", () => {
    for (const c of cases) {
      for (const s of c.scenes) if (s.location !== undefined) expect(LOCATION_IDS.has(s.location), `${c.id}/${s.id}: ${s.location}`).toBe(true);
    }
  });

  it("запасные картины: известные id, не ключевые картины, без петель", () => {
    for (const [from, to] of BACKGROUND_FALLBACK) {
      expect(LOCATION_IDS.has(from), from).toBe(true);
      expect(LOCATION_IDS.has(to), `${from} → ${to}`).toBe(true);
      expect(locationById.get(from)?.title, from).toBeFalsy();
      expect(locationById.get(to)?.title, to).toBeFalsy();
    }
    for (const l of locations) {
      const chain = backgroundChain(l.id);
      const last = chain[chain.length - 1];
      expect(BACKGROUND_FALLBACK.has(last), `${l.id}: цепочка ${chain.join(" → ")} замкнулась`).toBe(false);
    }
  });

  it("константы экранов — из канона", () => {
    expect(LOCATION_IDS.has(NIGHT_BACKGROUND)).toBe(true);
    expect(locationById.get(TITLE_PAINTING)?.title).toBe(true);
  });

  it("scripts/art-prompts.mjs берёт список из того же JSON и даёт каждой локации промпт", () => {
    expect(ART_LOCATIONS.map((l: { id: string }) => l.id)).toEqual(locations.map((l) => l.id));
    const backgroundRows = promptRows().filter((r: unknown[]) => String(r[0]).startsWith("public/backgrounds/"));
    expect(backgroundRows.map((r: unknown[]) => r[1]).sort()).toEqual([...LOCATION_IDS].sort());
    for (const r of backgroundRows) expect(String(r[5]).length, String(r[1])).toBeGreaterThan(200);
  });
});

describe("цепочка картин", () => {
  it("своя картина, затем запасные по порядку", () => {
    expect(backgroundChain("basement_b0_03_evening")).toEqual(["basement_b0_03_evening"]);
    for (const id of ["basement_b0_03_day", "basement_b0_03_night", "basement_b0_03_morning", "basement_b0_03_morning_tv"]) {
      expect(backgroundChain(id), id).toEqual([id, "basement_b0_03_evening"]);
    }
    expect(backgroundChain("first_sun_window")).toEqual(["first_sun_window", "ocr_office", "basement_b0_03_evening"]);
    expect(backgroundChain("server_tambour")).toEqual(["server_tambour", "server_room_b0_11"]);
    expect(backgroundChain("interrogation_glass")).toEqual(["interrogation_glass"]);
  });

  it("нет локации — нет цепочки; незнакомый id пробуется как есть", () => {
    expect(backgroundChain(null)).toEqual([]);
    expect(backgroundChain(undefined)).toEqual([]);
    expect(backgroundChain("")).toEqual([]);
    expect(backgroundChain("future_place")).toEqual(["future_place"]);
  });

  it("кандидаты: файлы цепочки без тех, что уже дали 404", () => {
    const missing = new Set(["/backgrounds/basement_b0_03_day.webp"]);
    expect(backgroundCandidates("basement_b0_03_day", "/backgrounds", (u) => missing.has(u))).toEqual([
      "/backgrounds/basement_b0_03_evening.webp",
    ]);
    expect(backgroundCandidates("basement_b0_03_day", "/art", () => false)).toEqual([
      "/art/basement_b0_03_day.webp",
      "/art/basement_b0_03_evening.webp",
    ]);
    expect(backgroundCandidates("basement_b0_03_day", "/backgrounds", () => true)).toEqual([]);
    expect(backgroundCandidates(null)).toEqual([]);
    expect(backgroundUrl("title_night")).toBe("/backgrounds/title_night.webp");
  });
});

describe("сданные картины в public/backgrounds", () => {
  it("каждый файл — картина известной локации", () => {
    const files = readdirSync(join(PUBLIC, "backgrounds")).filter((f) => f.endsWith(".webp"));
    for (const f of files) expect(LOCATION_IDS.has(f.replace(/\.webp$/, "")), f).toBe(true);
  });

  it("вечерний подвал закрывает всю семью подвала, пока остальные не написаны", () => {
    expect(delivered(backgroundUrl("basement_b0_03_evening"))).toBe(true);
    for (const id of [...BASEMENT_FAMILY, "first_sun_window"]) {
      const own = backgroundUrl(id);
      expect(shownNow(id), id).toBe(delivered(own) ? own : backgroundUrl("basement_b0_03_evening"));
    }
    expect(shownNow(NIGHT_BACKGROUND)).not.toBeNull();
  });

  it("локация без своей картины и без семьи — чистая комната", () => {
    if (!delivered(backgroundUrl("stairwell_b"))) expect(shownNow("stairwell_b")).toBeNull();
  });
});

describe("фон сцены: стопка картин в потоке сцен (UI §7.14)", () => {
  const A = "/backgrounds/a.webp";
  const B = "/backgrounds/b.webp";
  const C = "/backgrounds/c.webp";
  const shown = (s: BackdropStack) => s.layers.map((l, i) => `${l.url}:${backdropShown(s, i) ? 1 : 0}`);
  const first: BackdropStack = { layers: [{ url: A, enter: false }], top: A };

  it("новая картина проявляется поверх прошлой; прошлая уходит, когда новая проявилась", () => {
    const next = backdropRetarget(first, B, false);
    expect(next.layers).toEqual([
      { url: A, enter: false },
      { url: B, enter: true },
    ]);
    expect(shown(next)).toEqual([`${A}:1`, `${B}:1`]);
    // Посреди перехода ничего не убирается
    expect(backdropSettled(next, B, "0.4")).toBe(next);
    expect(backdropSettled(next, B, "1")).toEqual({ layers: [{ url: B, enter: true }], top: B });
  });

  it("смена посреди проявления: картина гаснет с того места, где была, и уходит, погаснув", () => {
    const fading = backdropRetarget(backdropRetarget({ layers: [], top: null }, A, false), null, false);
    // Слой не пересоздаётся (тот же url, тот же порядок) — CSS-переход продолжает непрозрачность
    expect(fading.layers).toEqual([{ url: A, enter: true }]);
    expect(shown(fading)).toEqual([`${A}:0`]);
    expect(backdropSettled(fading, A, "0.3")).toBe(fading);
    expect(backdropSettled(fading, A, "0")).toEqual({ layers: [], top: null });
  });

  it("возврат к картине под проявляющейся: верхняя гаснет, нижняя не шевелится", () => {
    const back = backdropRetarget(backdropRetarget(first, B, false), A, false);
    expect(back.layers.map((l) => l.url)).toEqual([A, B]);
    expect(shown(back)).toEqual([`${A}:1`, `${B}:0`]);
    expect(backdropSettled(back, B, "0")).toEqual({ layers: [{ url: A, enter: false }], top: A });
  });

  it("третья картина посреди перехода ложится сверху, обе прошлые остаются под ней до конца", () => {
    const third = backdropRetarget(backdropRetarget(first, B, false), C, false);
    expect(shown(third)).toEqual([`${A}:1`, `${B}:1`, `${C}:1`]);
    expect(backdropSettled(third, B, "1")).toBe(third);
    expect(backdropSettled(third, C, "1")).toEqual({ layers: [{ url: C, enter: true }], top: C });
  });

  it("меньше движения: в кадре сразу одна цель", () => {
    expect(backdropRetarget(backdropRetarget(first, B, false), C, true)).toEqual({ layers: [{ url: C, enter: false }], top: C });
    expect(backdropRetarget(first, null, true)).toEqual({ layers: [], top: null });
  });
});
