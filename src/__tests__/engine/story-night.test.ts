/**
 * Ночь между делами в проверке контента (docs/design/NIGHTS.md, «Встраивание»):
 * сцены ночи достижимы через такты, ссылки на сцены существуют,
 * from ≤ at ≤ дата дела, время идёт вперёд, формы тактов верны.
 */
import { describe, it, expect } from "vitest";
import { validateCaseContent, collectEvidenceIds, lineIdProblem, nightBeatKind, LINE_ID_RE } from "@/engine/story";
import type { CaseDef, NightBeat, NightDef } from "@/types/case";
import { CHARACTERS, makeCase } from "../helpers/case-fixture";

const NIGHT_SCENES = [
  {
    id: "night",
    lines: [
      { id: "c03.night.001", speaker: "narrator", text: "Мороз крепчает третьи сутки подряд." },
      { id: "c03.night.002", speaker: "narrator", text: "К утру подъезды снова парят. Не все." },
    ],
  },
  { id: "night_soft", lines: [{ id: "c03.night_soft.001", speaker: "narrator", text: "Записка его рукой." }] },
  { id: "night_hard", lines: [{ id: "c03.night_hard.001", speaker: "narrator", text: "Записка, подпись — фамилия." }] },
];

const NIGHT: NightDef = {
  from: "2026-12-11 22:30",
  stamp: "Б0-03, WS-03. 11–14 декабря 2026 года.",
  beats: [
    { scene: "night", line: 1 },
    { scene: "night_soft", when: { trust: 1 } },
    { scene: "night_hard", when: { trust: [-1, null] } },
    { at: "2026-12-12 10:00", status: "Теплосеть: подача восстановлена" },
    { at: "2026-12-13 02:47:19", sessions: 2, until: "2026-12-13 02:51:00" },
    { at: "2026-12-13 03:12:00", click: "full", cron: true },
    { montage: { from: "2026-12-13", to: "2026-12-13" } },
    { at: "2026-12-14 01:00", row: { table: "people", text: "Анна Лебедева  Северск" }, check: { sql: "SELECT city FROM people WHERE id = 1", expect: "Северск" } },
    { scene: "night", line: 2 },
  ],
};

const withNight = (night: Partial<NightDef> | null, patch: Partial<CaseDef> = {}): CaseDef => {
  const base = makeCase(patch);
  return {
    ...base,
    scenes: [...base.scenes, ...NIGHT_SCENES],
    ...(night ? { night: { ...NIGHT, ...night } } : {}),
  };
};
const beats = (...list: NightBeat[]) => ({ beats: [{ scene: "night" } as NightBeat, { scene: "night_soft" } as NightBeat, { scene: "night_hard" } as NightBeat, ...list] });

const problemsOf = (c: CaseDef) => validateCaseContent(c, CHARACTERS, collectEvidenceIds([c]));
const expectProblem = (c: CaseDef, fragment: string) => {
  const problems = problemsOf(c);
  expect(problems.filter((p) => p.includes(fragment)), problems.join("\n")).toHaveLength(1);
};

describe("ночь между делами: проверка контента", () => {
  it("корректная ночь проходит; сцены ночи достижимы через такты", () => {
    expect(problemsOf(withNight({}))).toEqual([]);
  });

  it("без такта сцена ночи недостижима", () => {
    expectProblem(withNight(null), "сцена «night» недостижима");
  });

  it("id реплик ночи проходят LINE_ID_RE без нового префикса", () => {
    for (const id of ["c04.night.001", "c05.night_soft.001", "c12.night_warned.001"]) {
      expect(LINE_ID_RE.test(id)).toBe(true);
      expect(lineIdProblem(id)).toBeNull();
    }
  });

  it("ссылка на несуществующую сцену и номер реплики вне сцены", () => {
    expectProblem(withNight(beats({ scene: "night_none" })), "сцена «night_none» не найдена");
    expectProblem(withNight(beats({ scene: "night", line: 3 })), "нет реплики № 3");
  });

  it("ночью говорит только рассказчик, у сцены ночи нет выбора и next", () => {
    const c = withNight({});
    const scenes = c.scenes.map((s) =>
      s.id === "night_soft" ? { ...s, lines: [{ id: "c03.night_soft.001", speaker: "lev", text: "Я тут." }], next: "outro" } : s
    );
    const problems = problemsOf({ ...c, scenes });
    expect(problems.some((p) => p.includes("ночью говорит только рассказчик"))).toBe(true);
    expect(problems.some((p) => p.includes("не бывает выбора"))).toBe(true);
  });

  it("from ≤ at ≤ дата дела, время не идёт назад", () => {
    expectProblem(withNight(beats({ at: "2026-12-11 20:00", status: "Рано" })), "раньше начала паузы");
    expectProblem(withNight(beats({ at: "2026-12-14 03:12:00", click: "short" })), "позже даты дела");
    expectProblem(
      withNight(beats({ at: "2026-12-13 10:00", status: "Позже" }, { at: "2026-12-12 10:00", status: "Раньше" })),
      "время идёт только вперёд"
    );
    expectProblem(withNight({ from: "2026-12-15 00:00" }), "from позже даты дела");
    expectProblem(withNight({ from: "вчера" }), "from «вчера»");
  });

  it("вид такта — ровно один", () => {
    expectProblem(withNight(beats({ at: "2026-12-12 10:00", status: "Два", click: "short" } as unknown as NightBeat)), "нужен ровно один вид");
    expectProblem(withNight(beats({ at: "2026-12-12 10:00" } as unknown as NightBeat)), "нужен ровно один вид");
    expect(nightBeatKind({ status: "x" })).toBe("status");
    expect(nightBeatKind({ at: "2026-12-12 03:12:00", click: "full" })).toBe("click");
  });

  it("строка ленты: таблица дела, проверка, без средней точки", () => {
    const row = (patch: object) => ({ at: "2026-12-12 10:00", row: { table: "people", text: "Анна  Северск" }, check: { sql: "SELECT 1", expect: 1 }, ...patch });
    expectProblem(withNight(beats(row({ row: { table: "logins", text: "zero  вход" } }) as NightBeat)), "таблица «logins» не открыта в деле");
    expectProblem(withNight(beats(row({ row: { table: "people", text: "Анна · Северск" } }) as NightBeat)), "средняя точка");
    expectProblem(withNight(beats(row({ check: { sql: " ", expect: 1 } }) as NightBeat)), "нет проверки check.sql");
    expectProblem(withNight(beats(row({ at: undefined }) as NightBeat)), "у строки ленты нет at");
  });

  it("щелчок только в 03:12:00; строка входа — только с logins в деле", () => {
    expectProblem(withNight(beats({ at: "2026-12-12 03:11:00", click: "full" })), "только в 03:12:00");
    expectProblem(withNight(beats({ at: "2026-12-12 03:12:00", click: "short", login: true })), "строка входа без таблицы logins");
    expect(problemsOf(withNight(beats({ at: "2026-12-12 03:12:00", click: "short", login: true }), { tables: ["people", "logins"] }))).toEqual([]);
  });

  it("«сеансов: 2» — until позже at; монтаж — даты по порядку", () => {
    expectProblem(withNight(beats({ at: "2026-12-12 02:12:00", sessions: 2, until: "2026-12-12 02:00:00" })), "until должен быть позже at");
    expectProblem(withNight(beats({ montage: { from: "2026-12-13", to: "2026-12-12" } })), "montage.from позже montage.to");
    expectProblem(withNight(beats({ montage: { from: "13.12", to: "2026-12-13" } } as NightBeat)), "montage — даты");
  });

  it("звук такта — только из списка звуков ночи", () => {
    expect(problemsOf(withNight(beats({ at: "2026-12-12 10:00", status: "Салют", sfx: "amb.newyear" })))).toEqual([]);
    expectProblem(withNight(beats({ at: "2026-12-12 10:00", status: "Гром", sfx: "amb.thunder" } as unknown as NightBeat)), "звук «amb.thunder»");
  });

  it("условие when не пустое; у проверки сообщения нужны sql и expect", () => {
    expectProblem(withNight(beats({ scene: "night", when: {} })), "пустое условие на флаги");
    expectProblem(withNight(beats({ at: "2026-12-12 10:00", status: "Синхронизация", check: { sql: "", expect: 1 } })), "у проверки сообщения");
  });
});
