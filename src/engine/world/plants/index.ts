/**
 * Реестр посадок: core → c00 … c12 → eggs. Порядок фиксирован (TECH_SPEC,
 * разд. 3): посадки идут до шума, и каждая следующая видит резервы и
 * исключения предыдущих. Переставлять модули нельзя — сдвинутся id.
 */
import type { LateFillers, PlantModule } from "./types";
import * as core from "./core";
import * as c00 from "./c00";
import * as c01 from "./c01";
import * as c02 from "./c02";
import * as c03 from "./c03";
import * as c04 from "./c04";
import * as c05 from "./c05";
import * as c06 from "./c06";
import * as c07 from "./c07";
import * as c08 from "./c08";
import * as c09 from "./c09";
import * as c10 from "./c10";
import * as c11 from "./c11";
import * as c12 from "./c12";
import * as eggs from "./eggs";

export type { PlantFn, LateFiller, LateFillers, PlantModule } from "./types";

export const PLANT_REGISTRY: readonly PlantModule[] = [
  { key: "core", plant: core.plant },
  { key: "c00", plant: c00.plant },
  { key: "c01", plant: c01.plant },
  { key: "c02", plant: c02.plant },
  { key: "c03", plant: c03.plant },
  { key: "c04", plant: c04.plant },
  { key: "c05", plant: c05.plant },
  { key: "c06", plant: c06.plant },
  { key: "c07", plant: c07.plant },
  { key: "c08", plant: c08.plant },
  { key: "c09", plant: c09.plant, late: c09.late },
  { key: "c10", plant: c10.plant, late: c10.late },
  { key: "c11", plant: c11.plant, late: c11.late },
  { key: "c12", plant: c12.plant, late: c12.late },
  { key: "eggs", plant: eggs.plant },
];

/** Наполнители поздних таблиц из всех модулей (таблица → функция) */
export const LATE_FILLERS: LateFillers = Object.assign({}, ...PLANT_REGISTRY.map((m) => m.late ?? {}));
