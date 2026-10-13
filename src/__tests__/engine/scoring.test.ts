/**
 * Очки, звёзды, звания и достижения.
 */
import { describe, it, expect } from "vitest";
import {
  scoreCase,
  starsFor,
  rankFor,
  RANKS,
  SCORING,
  checkAchievements,
  queryAllowance,
  freeHints,
  type CaseStats,
  type AchievementState,
  type SolvedCaseRecord,
} from "@/engine/scoring";
import type { AchievementDef, CaseDef } from "@/types/case";
import { makeCase } from "../helpers/case-fixture";

const PERFECT: CaseStats = {
  queries: 6,
  errors: 0,
  hintsUsed: 0,
  protocolAttempts: 1,
  optionalDone: 0,
  optionalTotal: 1,
};

const medium = makeCase(); // 2 основные + 1 доп. задача, протокол
const tutorial = makeCase({ difficulty: "tutorial", protocol: undefined, outroScene: "outro" });
const sum = (lines: { value: number }[]) => lines.reduce((s, l) => s + l.value, 0);

describe("scoreCase: очки", () => {
  it("идеальное дело без доп. задач — ровно 1000", () => {
    const score = scoreCase(PERFECT, medium);
    expect(score.points).toBe(1000);
    expect(score.stars).toBe(3);
    expect(score.breakdown).toEqual([{ label: "Дело раскрыто", value: 1000 }]);
  });

  it("сумма строк разбивки всегда равна итогу", () => {
    const cases: CaseStats[] = [
      PERFECT,
      { ...PERFECT, hintsUsed: 3, errors: 4, queries: 60, protocolAttempts: 3, optionalDone: 1 },
      { ...PERFECT, hintsUsed: 50, errors: 50, queries: 500, protocolAttempts: 20 },
      { ...PERFECT, optionalDone: 1 },
    ];
    for (const stats of cases) {
      const score = scoreCase(stats, medium);
      expect(sum(score.breakdown)).toBe(score.points);
    }
  });

  it("подсказки: −40 каждая", () => {
    const score = scoreCase({ ...PERFECT, hintsUsed: 3 }, medium);
    expect(score.points).toBe(1000 - 120);
    expect(score.breakdown).toContainEqual({ label: "Подсказки: 3", value: -120 });
  });

  it("подсказки: потолок штрафа −400", () => {
    expect(scoreCase({ ...PERFECT, hintsUsed: 10 }, medium).points).toBe(600);
    expect(scoreCase({ ...PERFECT, hintsUsed: 11 }, medium).points).toBe(600);
  });

  it("в tutorial/easy первая подсказка бесплатна", () => {
    expect(freeHints("tutorial")).toBe(1);
    expect(freeHints("easy")).toBe(1);
    expect(freeHints("medium")).toBe(0);
    const one = scoreCase({ ...PERFECT, hintsUsed: 1, protocolAttempts: 0 }, tutorial);
    expect(one.points).toBe(1000);
    expect(one.breakdown).toHaveLength(1);
    const two = scoreCase({ ...PERFECT, hintsUsed: 2, protocolAttempts: 0 }, tutorial);
    expect(two.points).toBe(960);
    expect(two.breakdown).toContainEqual({ label: "Подсказки: 2 (первая бесплатно)", value: -40 });
  });

  it("неверные сверки протокола: −100 за каждую, потолок −300", () => {
    expect(scoreCase({ ...PERFECT, protocolAttempts: 2 }, medium).points).toBe(900);
    expect(scoreCase({ ...PERFECT, protocolAttempts: 4 }, medium).points).toBe(700);
    expect(scoreCase({ ...PERFECT, protocolAttempts: 9 }, medium).points).toBe(700);
  });

  it("у дела без протокола сверки не считаются", () => {
    expect(scoreCase({ ...PERFECT, protocolAttempts: 5 }, tutorial).points).toBe(1000);
  });

  it("ошибки стоят немного: −5, потолок −100", () => {
    const score = scoreCase({ ...PERFECT, errors: 4, queries: 10 }, medium);
    expect(score.points).toBe(980);
    expect(score.breakdown).toContainEqual({ label: "Ошибки в запросах: 4", value: -20 });
    expect(scoreCase({ ...PERFECT, errors: 100, queries: 106 }, medium).points).toBe(900);
  });

  it("норма запросов зависит от числа задач и бесплатна", () => {
    expect(queryAllowance(medium)).toBe(10 + 5 * 3);
    expect(scoreCase({ ...PERFECT, queries: 25 }, medium).points).toBe(1000);
    const over = scoreCase({ ...PERFECT, queries: 30 }, medium);
    expect(over.points).toBe(990);
    expect(over.breakdown).toContainEqual({ label: "Запросы сверх нормы (25): 5", value: -10 });
  });

  it("ошибочные запросы не входят в «лишние» — не штрафуются дважды", () => {
    // 35 запросов, из них 10 с ошибкой: 25 успешных = норма
    expect(scoreCase({ ...PERFECT, queries: 35, errors: 10 }, medium).points).toBe(1000 - 50);
  });

  it("лишние запросы: потолок −100", () => {
    expect(scoreCase({ ...PERFECT, queries: 1000 }, medium).points).toBe(900);
  });

  it("всё плохо — не меньше 300 за раскрытое дело", () => {
    const score = scoreCase({ ...PERFECT, hintsUsed: 99, errors: 99, queries: 999, protocolAttempts: 99 }, medium);
    // 1000 − 400 − 300 − 100 − 100 = 100 → поднимается до 300
    expect(score.points).toBe(SCORING.floor);
    expect(score.breakdown).toContainEqual({ label: "Минимум за раскрытое дело", value: 200 });
    expect(score.stars).toBe(1);
  });

  it("доп. задачи добавляются поверх минимума", () => {
    const score = scoreCase(
      { ...PERFECT, hintsUsed: 99, errors: 99, queries: 999, protocolAttempts: 99, optionalDone: 1 },
      medium
    );
    expect(score.points).toBe(300 + 100 + 50);
  });

  it("доп. задачи: +100 за каждую и +50 за все", () => {
    const partial = scoreCase({ ...PERFECT, optionalDone: 2, optionalTotal: 3 }, medium);
    expect(partial.points).toBe(1200);
    expect(partial.breakdown).toContainEqual({ label: "Дополнительные задачи: 2 из 3", value: 200 });
    const all = scoreCase({ ...PERFECT, optionalDone: 3, optionalTotal: 3 }, medium);
    expect(all.points).toBe(1350);
    expect(all.breakdown).toContainEqual({ label: "Все дополнительные задачи", value: 50 });
  });

  it("нет доп. задач — нет и бонуса «все»", () => {
    expect(scoreCase({ ...PERFECT, optionalDone: 0, optionalTotal: 0 }, medium).points).toBe(1000);
  });

  it("мусор в статистике (NaN, отрицательные, done > total) не ломает расчёт", () => {
    const score = scoreCase(
      { queries: NaN, errors: -3, hintsUsed: -1, protocolAttempts: Infinity, optionalDone: 9, optionalTotal: 2 },
      medium
    );
    expect(score.points).toBe(1000 + 200 + 50);
    expect(score.stars).toBe(3);
    expect(sum(score.breakdown)).toBe(score.points);
  });

  it("durationMs на очки не влияет", () => {
    expect(scoreCase({ ...PERFECT, durationMs: 10 * 60 * 60 * 1000 }, medium).points).toBe(1000);
  });
});

describe("starsFor: звёзды", () => {
  it("★★★ — без подсказок и протокол с первой сверки", () => {
    expect(starsFor(PERFECT, medium)).toBe(3);
  });

  it("ошибки и число запросов на звёзды не влияют", () => {
    expect(starsFor({ ...PERFECT, errors: 50, queries: 500 }, medium)).toBe(3);
  });

  it("одна подсказка в medium — уже ★★", () => {
    expect(starsFor({ ...PERFECT, hintsUsed: 1 }, medium)).toBe(2);
  });

  it("в tutorial/easy одна подсказка ещё ★★★, две — ★★", () => {
    expect(starsFor({ ...PERFECT, hintsUsed: 1, protocolAttempts: 0 }, tutorial)).toBe(3);
    expect(starsFor({ ...PERFECT, hintsUsed: 2, protocolAttempts: 0 }, tutorial)).toBe(2);
  });

  it("одна неудачная сверка — ★★", () => {
    expect(starsFor({ ...PERFECT, protocolAttempts: 2 }, medium)).toBe(2);
  });

  it("граница ★★: подсказок ≤ max(2, основных задач), сверок ≤ 2 неудачных", () => {
    // У medium 2 основные задачи → порог max(2, 2) = 2
    expect(starsFor({ ...PERFECT, hintsUsed: 2 }, medium)).toBe(2);
    expect(starsFor({ ...PERFECT, hintsUsed: 3 }, medium)).toBe(1);
    expect(starsFor({ ...PERFECT, protocolAttempts: 3 }, medium)).toBe(2);
    expect(starsFor({ ...PERFECT, protocolAttempts: 4 }, medium)).toBe(1);
  });

  it("больше основных задач — больше допустимых подсказок для ★★", () => {
    const big: CaseDef = makeCase({
      objectives: Array.from({ length: 6 }, (_, i) => ({ ...medium.objectives[0], id: `o${i}`, order: i })),
    });
    expect(starsFor({ ...PERFECT, hintsUsed: 6 }, big)).toBe(2);
    expect(starsFor({ ...PERFECT, hintsUsed: 7 }, big)).toBe(1);
  });

  it("протокол не отправлялся ни разу (0 сверок) — как первая попытка", () => {
    expect(starsFor({ ...PERFECT, protocolAttempts: 0 }, medium)).toBe(3);
  });
});

describe("rankFor: звания", () => {
  it("звания упорядочены по порогу и начинаются с нуля", () => {
    expect(RANKS[0].at).toBe(0);
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i].at).toBeGreaterThan(RANKS[i - 1].at);
    expect(new Set(RANKS.map((r) => r.id)).size).toBe(RANKS.length);
    expect(RANKS[0].title).toBe("Стажёр-аналитик");
    expect(RANKS[RANKS.length - 1].title).toBe("Главный аналитик");
  });

  it("0 очков — стажёр, следующее звание известно", () => {
    expect(rankFor(0)).toEqual({
      id: "intern",
      title: "Стажёр-аналитик",
      at: 0,
      next: { title: "Младший аналитик", at: 1200 },
    });
  });

  it("ровно на пороге — уже новое звание", () => {
    expect(rankFor(1199).id).toBe("intern");
    expect(rankFor(1200).id).toBe("junior");
    expect(rankFor(3000).title).toBe("Аналитик");
  });

  it("высшее звание без next", () => {
    const top = rankFor(1_000_000);
    expect(top.id).toBe("chief");
    expect(top.next).toBeUndefined();
    expect(rankFor(RANKS[RANKS.length - 1].at).next).toBeUndefined();
  });

  it("отрицательные и NaN — стажёр", () => {
    expect(rankFor(-50).id).toBe("intern");
    expect(rankFor(NaN).id).toBe("intern");
  });
});

describe("checkAchievements", () => {
  const record = (caseId: string, patch: Partial<CaseStats> = {}, stars: 1 | 2 | 3 = 3): SolvedCaseRecord => ({
    caseId,
    stats: { ...PERFECT, ...patch },
    stars,
  });
  const state = (patch: Partial<AchievementState> = {}): AchievementState => ({
    solved: [],
    secretsFound: 0,
    seasonComplete: false,
    ...patch,
  });
  const def = (id: string, kind: AchievementDef["kind"], param?: string | number): AchievementDef => ({
    id,
    title: id,
    description: "",
    kind,
    ...(param !== undefined ? { param } : {}),
  });

  it("case_solved: по id дела, по количеству, без параметра", () => {
    const defs = [def("first", "case_solved"), def("c00", "case_solved", "case-00"), def("three", "case_solved", 3)];
    expect(checkAchievements(defs, state())).toEqual([]);
    expect(checkAchievements(defs, state({ solved: [record("case-01")] }))).toEqual(["first"]);
    expect(
      checkAchievements(defs, state({ solved: [record("case-00"), record("case-01"), record("case-02")] }))
    ).toEqual(["first", "c00", "three"]);
  });

  it("числовой параметр строкой ('3') — это количество", () => {
    const defs = [def("three", "case_solved", "3")];
    expect(checkAchievements(defs, state({ solved: [record("a"), record("b")] }))).toEqual([]);
    expect(checkAchievements(defs, state({ solved: [record("a"), record("b"), record("c")] }))).toEqual(["three"]);
  });

  it("повторно раскрытое дело не считается дважды", () => {
    const defs = [def("two", "case_solved", 2)];
    expect(checkAchievements(defs, state({ solved: [record("a"), record("a")] }))).toEqual([]);
  });

  it("case_no_hints", () => {
    const defs = [def("clean", "case_no_hints"), def("clean-b", "case_no_hints", "b")];
    const s = state({ solved: [record("a", { hintsUsed: 0 }), record("b", { hintsUsed: 2 }, 2)] });
    expect(checkAchievements(defs, s)).toEqual(["clean"]);
  });

  it("case_three_stars", () => {
    const defs = [def("star", "case_three_stars"), def("stars2", "case_three_stars", 2)];
    expect(checkAchievements(defs, state({ solved: [record("a", {}, 2)] }))).toEqual([]);
    expect(checkAchievements(defs, state({ solved: [record("a", {}, 3), record("b", {}, 3)] }))).toEqual([
      "star",
      "stars2",
    ]);
  });

  it("protocol_first_try: ровно одна сверка; дело без протокола (0) не считается", () => {
    const defs = [def("sharp", "protocol_first_try")];
    expect(checkAchievements(defs, state({ solved: [record("a", { protocolAttempts: 0 })] }))).toEqual([]);
    expect(checkAchievements(defs, state({ solved: [record("a", { protocolAttempts: 2 })] }))).toEqual([]);
    expect(checkAchievements(defs, state({ solved: [record("a", { protocolAttempts: 1 })] }))).toEqual(["sharp"]);
  });

  it("secrets_found: по количеству, по умолчанию 1", () => {
    const defs = [def("one", "secrets_found"), def("five", "secrets_found", 5)];
    expect(checkAchievements(defs, state({ secretsFound: 0 }))).toEqual([]);
    expect(checkAchievements(defs, state({ secretsFound: 4 }))).toEqual(["one"]);
    expect(checkAchievements(defs, state({ secretsFound: 5 }))).toEqual(["one", "five"]);
  });

  it("all_optional: из статистики дела или из optionalByCase", () => {
    const defs = [def("any", "all_optional"), def("b", "all_optional", "b")];
    expect(
      checkAchievements(defs, state({ solved: [record("a", { optionalDone: 1, optionalTotal: 1 })] }))
    ).toEqual(["any"]);
    // optionalByCase перекрывает статистику на момент раскрытия
    expect(
      checkAchievements(
        defs,
        state({
          solved: [record("b", { optionalDone: 0, optionalTotal: 2 })],
          optionalByCase: { b: { done: 2, total: 2 } },
        })
      )
    ).toEqual(["any", "b"]);
  });

  it("all_optional: дело без доп. задач не засчитывается", () => {
    const defs = [def("any", "all_optional")];
    expect(checkAchievements(defs, state({ solved: [record("a", { optionalDone: 0, optionalTotal: 0 })] }))).toEqual(
      []
    );
  });

  it("season_complete", () => {
    const defs = [def("season", "season_complete")];
    expect(checkAchievements(defs, state())).toEqual([]);
    expect(checkAchievements(defs, state({ seasonComplete: true }))).toEqual(["season"]);
  });

  it("уже полученные не выдаются повторно", () => {
    const defs = [def("first", "case_solved"), def("season", "season_complete")];
    const s = state({ solved: [record("a")], seasonComplete: true, earned: new Set(["first"]) });
    expect(checkAchievements(defs, s)).toEqual(["season"]);
  });

  it("неизвестный вид из JSON не выдаётся", () => {
    const bogus = { ...def("x", "case_solved"), kind: "unknown" } as unknown as AchievementDef;
    expect(checkAchievements([bogus], state({ solved: [record("a")], seasonComplete: true }))).toEqual([]);
  });
});

describe("checkAchievements: флаги, счётчики, события", () => {
  const base = { solved: [], secretsFound: 0, seasonComplete: false };
  const make = (kind: AchievementDef["kind"], param?: string | number): AchievementDef => ({
    id: `a.${kind}`,
    title: kind,
    description: kind,
    kind,
    param,
  });

  it("flag: выдаётся, только когда флаг поднят", () => {
    const def = make("flag", "tokha_turned");
    expect(checkAchievements([def], base)).toEqual([]);
    expect(checkAchievements([def], { ...base, flags: { tokha_turned: false } })).toEqual([]);
    expect(checkAchievements([def], { ...base, flags: { tokha_turned: true } })).toEqual(["a.flag"]);
    expect(checkAchievements([def], { ...base, flags: { tokha_turned: "yes" } })).toEqual(["a.flag"]);
  });

  it("counter: порог из параметра «имя:порог»", () => {
    const def = make("counter", "ficus_pets:10");
    expect(checkAchievements([def], { ...base, counters: { ficus_pets: 9 } })).toEqual([]);
    expect(checkAchievements([def], { ...base, counters: { ficus_pets: 10 } })).toEqual(["a.counter"]);
    expect(checkAchievements([make("counter", "notes_heard")], { ...base, counters: { notes_heard: 1 } })).toEqual([
      "a.counter",
    ]);
  });

  it("event: по id события, включая события задач", () => {
    const def = make("event", "objective_first_try:case-03-polyarnaya/o3_2");
    expect(checkAchievements([def], { ...base, events: new Set(["first_query"]) })).toEqual([]);
    expect(
      checkAchievements([def], { ...base, events: new Set(["objective_first_try:case-03-polyarnaya/o3_2"]) })
    ).toEqual(["a.event"]);
  });

  it("пустой параметр не выдаёт ничего", () => {
    const defs = [make("flag"), make("counter"), make("event")];
    expect(
      checkAchievements(defs, { ...base, flags: { "": true }, counters: { "": 5 }, events: new Set([""]) })
    ).toEqual([]);
  });
});
