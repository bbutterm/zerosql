/**
 * Ночи между делами (docs/design/NIGHTS.md, «Тесты»): для каждого дела с
 * полем night и каждой комбинации флагов из when —
 *  - реплики: рассказчик, до 160 знаков, без цифр, id по правилу;
 *  - check.sql каждой строки ленты (и сообщения с проверкой) на базе дела на
 *    старте часов возвращает check.expect — литералы ленты сверены с миром;
 *  - строка входа zero в последнем щелчке совпадает с logins.last_login_at;
 *  - длительность по формуле дизайна укладывается в 20–45 с;
 *  - запретные строки по делам (спойлеры) и тексты заданий zero только после коды Д8.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import {
  compareClock,
  executeSQL,
  getScene,
  lineIdProblem,
  nightBeatKind,
  NARRATOR,
  openCaseDatabase,
  validateCaseContent,
  collectEvidenceIds,
  type CaseDef,
  type CellValue,
  type FlagCondition,
  type FlagValue,
  type NightBeat,
  type NightCheck,
} from "@/engine";
import { cases, characters } from "@/data";
import { buildNightView, type NightStep } from "@/stores/game/selectors";
import type { Season, SolvedCase } from "@/stores/game/types";
import { emptySeason } from "@/stores/game/rules";
import { sharedWorld } from "../world/helpers";

const NIGHT_CASES = cases.filter((c) => c.night);

let bytes: Uint8Array;
beforeAll(async () => {
  ({ bytes } = await sharedWorld());
}, 120_000);

/** База дела на старте часов: таблицы дела, игрок и патчи ветки сезона из check.patches */
const openFor = (def: CaseDef, patches: string[] = []): Promise<Database> =>
  openCaseDatabase(bytes, {
    clock: def.date,
    tables: def.tables,
    patches: [{ id: "p0.player", params: { playerName: "Тестов" } }, ...patches],
  });

function runCheck(db: Database, def: CaseDef, check: NightCheck): { rows: CellValue[][]; error: string | null } {
  const r = executeSQL(db, check.sql, def.tables);
  return { rows: r.rows as CellValue[][], error: r.error ?? null };
}

/** Все комбинации флагов из when (плюс «не задан»), не больше 64 */
function flagCombos(def: CaseDef): Array<Record<string, FlagValue>> {
  const values = new Map<string, Set<FlagValue | null>>();
  for (const b of def.night?.beats ?? []) {
    for (const [name, v] of Object.entries((b.when ?? {}) as FlagCondition)) {
      const set = values.get(name) ?? new Set<FlagValue | null>([null]);
      for (const x of Array.isArray(v) ? v : [v]) set.add(x);
      values.set(name, set);
    }
  }
  let combos: Array<Record<string, FlagValue>> = [{}];
  for (const [name, set] of values) {
    combos = combos.flatMap((c) => [...set].map((v) => (v === null ? c : { ...c, [name]: v })));
  }
  return combos.slice(0, 64);
}

/** Сезон «как по порядку»: ранние дела раскрыты */
const seasonBefore = (def: CaseDef, patch: Partial<Season> = {}): Season => ({
  ...emptySeason(),
  solved: Object.fromEntries(cases.filter((c) => c.order < def.order).map((c) => [c.id, { caseId: c.id } as SolvedCase])),
  ...patch,
});

/** Оценка длительности по формуле дизайна, мс: знаки / 14 + 1 с на реплику, 1,2 с на строку, 3,5 с на полный такт, 6 с на карточку */
function estimateMs(stamp: string, steps: NightStep[]): number {
  let ms = 1500 + 6000 + (stamp.length > 60 ? 500 : 0);
  for (const s of steps) {
    if (s.kind === "line") ms += (s.text.length / 14) * 1000 + 1000;
    else if (s.kind === "row" || s.kind === "status") ms += 1200;
    else if (s.kind === "sessions") ms += 2400;
    else if (s.kind === "montage") ms += 500 * s.dates.length;
    else ms += (s.full ? 3500 : 800) + 1200 * ((s.login ? 1 : 0) + s.cronRows.length);
  }
  return ms;
}

/** Запретные строки (спойлеры): до какого дела (order) нельзя и где */
const FORBIDDEN: Array<{ re: RegExp; before: number; where: "lines" | "all" }> = [
  { re: /(?<![\p{L}.])nol(?![\p{L}])|CRON|cron|три двенадцать/iu, before: 99, where: "lines" },
  { re: /(?<![\p{L}.])(zero|i\.valts)(?![\p{L}])/u, before: 5, where: "lines" },
  { re: /Сазонов|Портовая|Петровна/u, before: 5, where: "all" },
  { re: /Береговая/u, before: 6, where: "all" },
  { re: /Северная/u, before: 7, where: "all" },
  { re: /Лыков|B-4210|чабрец|02:47:19/u, before: 9, where: "all" },
];

describe.skipIf(NIGHT_CASES.length === 0)("ночи между делами", () => {
  it("ночи есть у дел (первая — перед Д4)", () => {
    expect(NIGHT_CASES.map((c) => c.id)).toContain("case-04-mertvaya-dusha");
  });

  for (const def of NIGHT_CASES) {
    describe(def.id, () => {
      const night = def.night!;

      it("контент ночи без проблем", () => {
        const problems = validateCaseContent(def, characters, collectEvidenceIds(cases));
        expect(problems.filter((p) => p.includes("ночь") || p.includes("night")), problems.join("\n")).toEqual([]);
      });

      it("реплики: рассказчик, до 160 знаков, без цифр, id по правилу", () => {
        const sceneIds = new Set(night.beats.flatMap((b) => ("scene" in b ? [b.scene] : [])));
        expect(sceneIds.size).toBeGreaterThan(0);
        for (const id of sceneIds) {
          const scene = getScene(def, id)!;
          expect(scene, id).toBeDefined();
          expect(id === "night" || id.startsWith("night_"), `${id}: сцены ночи — night и night_<вариант>`).toBe(true);
          for (const line of scene.lines) {
            expect(line.speaker, line.id).toBe(NARRATOR);
            expect(line.text.length, line.id).toBeLessThanOrEqual(160);
            expect(/\d/.test(line.text), `${line.id}: числа словами`).toBe(false);
            expect(lineIdProblem(line.id), line.id).toBeNull();
          }
        }
      });

      it("строки ленты и сообщения с проверкой сверены с миром", async () => {
        const checked = night.beats.filter((b): b is NightBeat & { check: NightCheck } => "check" in b && Boolean((b as { check?: NightCheck }).check));
        for (const beat of checked) {
          const db = await openFor(def, beat.check.patches);
          const { rows, error } = runCheck(db, def, beat.check);
          const label = `${nightBeatKind(beat)} ${beat.at ?? ""}: ${beat.check.sql}`;
          expect(error, label).toBeNull();
          if (Array.isArray(beat.check.expect)) expect(rows, label).toEqual(beat.check.expect);
          else {
            expect(rows, label).toHaveLength(1);
            expect(rows[0][0], label).toEqual(beat.check.expect);
          }
          db.close();
        }
        // Строка ленты всегда с проверкой
        expect(night.beats.filter((b) => "row" in b).every((b) => "check" in b)).toBe(true);
      });

      it("строка входа zero в последнем щелчке — тот же момент, что logins.last_login_at на старте дела", async () => {
        const logins = night.beats.filter((b) => "click" in b && b.login) as Array<NightBeat & { at: string }>;
        if (logins.length === 0) return;
        const last = logins.reduce((a, b) => (compareClock(b.at, a.at) > 0 ? b : a));
        const db = await openFor(def);
        const r = executeSQL(db, "SELECT last_login_at FROM logins WHERE login = 'zero'", def.tables);
        expect(r.error ?? null).toBeNull();
        expect(r.rows[0]?.[0]).toBe(last.at.length === 16 ? `${last.at}:00` : last.at);
        db.close();
      });

      it("длительность по формуле — 20–45 с при любых флагах", () => {
        for (const flags of flagCombos(def)) {
          const view = buildNightView(def, { season: seasonBefore(def), flags })!;
          const ms = estimateMs(view.stamp, view.steps);
          expect(ms, JSON.stringify(flags)).toBeGreaterThanOrEqual(20_000);
          expect(ms, JSON.stringify(flags)).toBeLessThanOrEqual(45_000);
        }
      });

      it("запретные строки по делам и тексты заданий zero только после коды Д8", () => {
        const lines = night.beats
          .flatMap((b) => ("scene" in b ? (getScene(def, b.scene)?.lines ?? []) : []))
          .map((l) => l.text);
        const data = night.beats.flatMap((b) => ("row" in b ? [b.row.text] : "status" in b ? [b.status] : []));
        for (const f of FORBIDDEN) {
          if (def.order >= f.before) continue;
          for (const text of f.where === "lines" ? lines : [...lines, ...data]) expect(f.re.test(text), `${def.id}: «${text}»`).toBe(false);
        }
        const prev = [...cases].filter((c) => c.order < def.order).sort((a, b) => b.order - a.order)[0];
        const fired = { [prev.id]: [2, 3].map((jobId) => ({ id: "cron.fire", params: { jobId, at: `${def.date.slice(0, 10)} 03:12:00` } })) };
        const view = buildNightView(def, { season: seasonBefore(def, { casePatches: fired }) })!;
        for (const s of view.steps) {
          if (s.kind === "click" && def.order < 9) expect(s.cronRows, def.id).toEqual([]);
        }
      });
    });
  }
});
