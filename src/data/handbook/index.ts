/**
 * Справочник аналитика («Методичка Ирины», GAME_DESIGN разд. 7.5).
 *
 * Статьи лежат по делам: cNN.json — статьи, которые открывает дело с этим
 * order (CaseDef.concepts). Так авторы дел правят каждый свой файл и не
 * пересекаются. id статей: `h.<понятие>` (страницы SQL) и `w.<тема>`
 * (карточки мира). Порядок статей — порядок файлов, затем порядок в файле.
 */
import type { HandbookEntry } from "@/types/case";

import c00 from "./c00.json";
import c01 from "./c01.json";
import c02 from "./c02.json";
import c03 from "./c03.json";
import c04 from "./c04.json";
import c05 from "./c05.json";
import c06 from "./c06.json";
import c07 from "./c07.json";
import c08 from "./c08.json";
import c09 from "./c09.json";
import c10 from "./c10.json";
import c11 from "./c11.json";
import c12 from "./c12.json";

const SOURCES: ReadonlyArray<readonly [caseShort: string, raw: unknown]> = [
  ["c00", c00],
  ["c01", c01],
  ["c02", c02],
  ["c03", c03],
  ["c04", c04],
  ["c05", c05],
  ["c06", c06],
  ["c07", c07],
  ["c08", c08],
  ["c09", c09],
  ["c10", c10],
  ["c11", c11],
  ["c12", c12],
];

const REQUIRED = ["id", "title", "summary", "syntax", "example"] as const;

/**
 * JSON типизируется TypeScript «по факту», поэтому форму проверяем здесь
 * минимально (обязательные строки, pitfalls — массив строк). Смысловые
 * проверки — в src/__tests__/content/season.test.ts.
 */
function entriesOf(caseShort: string, raw: unknown): HandbookEntry[] {
  if (!Array.isArray(raw)) throw new Error(`handbook/${caseShort}.json: ожидается массив статей`);
  return raw.map((item: unknown, i) => {
    const entry = item as Record<string, unknown> | null;
    const where = `handbook/${caseShort}.json[${i}]`;
    if (typeof entry !== "object" || entry === null) throw new Error(`${where}: статья должна быть объектом`);
    for (const key of REQUIRED) {
      if (typeof entry[key] !== "string") throw new Error(`${where}: нет строки «${key}»`);
    }
    const pitfalls = entry.pitfalls;
    if (pitfalls !== undefined && !(Array.isArray(pitfalls) && pitfalls.every((p) => typeof p === "string"))) {
      throw new Error(`${where}: pitfalls должен быть массивом строк`);
    }
    return entry as unknown as HandbookEntry;
  });
}

/** Статьи по коротким префиксам дел: «c00» → статьи пролога */
export const handbookByCase: Readonly<Record<string, readonly HandbookEntry[]>> = Object.fromEntries(
  SOURCES.map(([caseShort, raw]) => [caseShort, entriesOf(caseShort, raw)])
);

/** Все статьи сезона */
export const handbook: HandbookEntry[] = SOURCES.flatMap(([caseShort]) => handbookByCase[caseShort]);

/** Статья по id (h.select, w.time, …) */
export const handbookById: ReadonlyMap<string, HandbookEntry> = new Map(handbook.map((e) => [e.id, e]));
