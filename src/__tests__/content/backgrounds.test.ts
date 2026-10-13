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
import { backgroundCandidates } from "@/components/story/scene-backdrop";
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
