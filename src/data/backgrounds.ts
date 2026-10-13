/**
 * Локации и картины сцен (UI_ART_DIRECTION §7.14, ART_BIBLE §5.5).
 *
 * Канон локаций — `src/data/locations.json`, единственный список id:
 *   locations  — id, подпись для производства, `title` у ключевых картин холодного открытия;
 *   fallback   — запасные картины: локация → картина её семьи.
 * Этот же файл читают `scripts/art-prompts.mjs` (промпты, prompts.csv, разд. 15 арт-библии) и
 * `scripts/production-manifest.mjs` (backgrounds.csv); `validateCaseContent` проверяет по нему
 * `Scene.location`. Новая локация — строка в JSON и промпт в `LOCATION_ART` скрипта.
 *
 * Картина локации — `public/backgrounds/<id>.webp`. Цепочка показа: своя картина → запасная →
 * запасная запасной… Пока своей картины нет, сцена показывает картину семьи: одна сданная картина
 * закрывает все времена суток той же комнаты. Семьи сейчас:
 *   - подвал Б0-03 (`basement_b0_03_evening`): ночь, день, утро, утро с телевизором в коридоре,
 *     новогодняя ночь, день финала (`ocr_office`), а через него и первое солнце в окне;
 *   - серверная Б0-11: тамбур серверной.
 * 404 запоминает `media-cache` (`markMediaMissing`): пропавший файл больше не запрашивается.
 * Ни одной картины — чистая комната `--room`, как без фонов вообще.
 */
import registry from "./locations.json";

export interface LocationDef {
  /** snake_case; имя файла public/backgrounds/<id>.webp */
  id: string;
  /** Подпись для производства и лаборатории. Игроку не показывается: титр сцены — CaseDef.location */
  name: string;
  /** Ключевая картина холодного открытия (2560×1440), а не фон сцены */
  title?: boolean;
}

export const locations: readonly LocationDef[] = registry.locations;

/** Все известные id локаций: Scene.location обязан быть одним из них */
export const LOCATION_IDS: ReadonlySet<string> = new Set(locations.map((l) => l.id));

export const locationById: ReadonlyMap<string, LocationDef> = new Map(locations.map((l) => [l.id, l]));

/** Запасная картина локации (из locations.json): та же комната в другое время суток */
export const BACKGROUND_FALLBACK: ReadonlyMap<string, string> = new Map(Object.entries(registry.fallback));

/**
 * Цепочка картин локации: сама локация, затем запасные по порядку. Петля обрывается.
 * Пустой массив — локации нет (чистая комната).
 */
export function backgroundChain(id: string | null | undefined): string[] {
  const chain: string[] = [];
  for (let at = id ?? undefined; at && !chain.includes(at); at = BACKGROUND_FALLBACK.get(at)) chain.push(at);
  return chain;
}

/** Файл картины: /backgrounds/<id>.webp */
export const backgroundUrl = (id: string, base = "/backgrounds") => `${base}/${id}.webp`;

/** Ключевая картина холодного открытия (UI §7.1, ART_BIBLE §5.6). Нет файла — титр на чистой комнате */
export const TITLE_PAINTING = "title_night";

/**
 * Фон ночи между делами (UI §7.20): подвал Б0-03 ночью. Пока ночной картины нет, цепочка
 * показывает вечерний кадр той же комнаты.
 */
export const NIGHT_BACKGROUND = "basement_b0_03_night";
