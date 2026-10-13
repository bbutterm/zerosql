/**
 * Дела сезона «Полынья». Каждое дело — папка case-NN-<slug> с двумя файлами:
 *   case.json   — CaseDef без scenes (карточка дела, задачи, протокол)
 *   script.json — { "scenes": Scene[] } (сюжет и реплики)
 * Здесь они склеиваются в CaseDef. Новое дело = новая папка + две строки импорта.
 */
import type { CaseDef } from "@/types/case";
import type { Scene } from "@/types/story";

import case00 from "./case-00-nulevoy-etazh/case.json";
import script00 from "./case-00-nulevoy-etazh/script.json";
import case01 from "./case-01-med/case.json";
import script01 from "./case-01-med/script.json";
import case02 from "./case-02-minus-41/case.json";
import script02 from "./case-02-minus-41/script.json";
import case03 from "./case-03-polyarnaya/case.json";
import script03 from "./case-03-polyarnaya/script.json";
import case04 from "./case-04-mertvaya-dusha/case.json";
import script04 from "./case-04-mertvaya-dusha/script.json";
import case05 from "./case-05-nomer-3312/case.json";
import script05 from "./case-05-nomer-3312/script.json";
import case06 from "./case-06-polynya/case.json";
import script06 from "./case-06-polynya/script.json";
import case07 from "./case-07-sluzhebnaya-kvartira/case.json";
import script07 from "./case-07-sluzhebnaya-kvartira/script.json";
import case08 from "./case-08-prizrak/case.json";
import script08 from "./case-08-prizrak/script.json";
import case09 from "./case-09-matryoshka/case.json";
import script09 from "./case-09-matryoshka/script.json";
import case10 from "./case-10-kopirka/case.json";
import script10 from "./case-10-kopirka/script.json";
import case11 from "./case-11-chernovik/case.json";
import script11 from "./case-11-chernovik/script.json";
import case12 from "./case-12-pervoe-solntse/case.json";
import script12 from "./case-12-pervoe-solntse/script.json";

/** [папка, case.json, script.json] */
const SOURCES: ReadonlyArray<readonly [folder: string, meta: unknown, script: unknown]> = [
  ["case-00-nulevoy-etazh", case00, script00],
  ["case-01-med", case01, script01],
  ["case-02-minus-41", case02, script02],
  ["case-03-polyarnaya", case03, script03],
  ["case-04-mertvaya-dusha", case04, script04],
  ["case-05-nomer-3312", case05, script05],
  ["case-06-polynya", case06, script06],
  ["case-07-sluzhebnaya-kvartira", case07, script07],
  ["case-08-prizrak", case08, script08],
  ["case-09-matryoshka", case09, script09],
  ["case-10-kopirka", case10, script10],
  ["case-11-chernovik", case11, script11],
  ["case-12-pervoe-solntse", case12, script12],
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Склеивает дело из двух JSON. TypeScript выводит для JSON «фактический» тип
 * (string вместо объединений вроде Difficulty), поэтому здесь — минимальная
 * проверка формы и приведение типа. Полную проверку контента делает
 * validateCaseContent в src/__tests__/content/season.test.ts.
 */
function assembleCase(folder: string, meta: unknown, script: unknown): CaseDef {
  const where = `cases/${folder}`;
  if (!isRecord(meta)) throw new Error(`${where}/case.json: ожидается объект CaseDef`);
  if (meta.id !== folder) throw new Error(`${where}/case.json: id «${String(meta.id)}» не совпадает с папкой`);
  if (typeof meta.order !== "number") throw new Error(`${where}/case.json: нет числового order`);
  for (const key of ["concepts", "tables", "objectives"] as const) {
    if (!Array.isArray(meta[key])) throw new Error(`${where}/case.json: «${key}» должен быть массивом`);
  }
  if (typeof meta.introScene !== "string") throw new Error(`${where}/case.json: нет introScene`);
  if ("scenes" in meta) throw new Error(`${where}/case.json: сцены живут в script.json`);
  if (!isRecord(script) || !Array.isArray(script.scenes)) {
    throw new Error(`${where}/script.json: ожидается { "scenes": [...] }`);
  }
  return { ...(meta as unknown as Omit<CaseDef, "scenes">), scenes: script.scenes as Scene[] };
}

/** Все дела сезона по порядку (order) */
export const cases: CaseDef[] = SOURCES.map(([folder, meta, script]) => assembleCase(folder, meta, script)).sort(
  (a, b) => a.order - b.order
);

/** Дело по id: getCase("case-03-polyarnaya") */
export function getCase(id: string): CaseDef | undefined {
  return cases.find((c) => c.id === id);
}
