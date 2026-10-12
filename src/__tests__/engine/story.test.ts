/**
 * Сюжетный слой: поиск сцен и проверка контента дела/сезона.
 */
import { describe, it, expect } from "vitest";
import {
  getScene,
  sceneChain,
  sceneLinks,
  caseShort,
  collectEvidenceIds,
  validateCaseContent,
  validateSeasonContent,
  LINE_ID_RE,
} from "@/engine/story";
import type { CaseDef } from "@/types/case";
import type { Scene } from "@/types/story";
import { CHARACTERS, makeCase, objective, PROTOCOL } from "../helpers/case-fixture";

const base = makeCase();
const EVIDENCE = collectEvidenceIds([base]);
const problemsOf = (caseDef: CaseDef, evidence: ReadonlySet<string> = EVIDENCE) =>
  validateCaseContent(caseDef, CHARACTERS, evidence);

/** Заменяет сцену по id */
const withScene = (caseDef: CaseDef, id: string, patch: Partial<Scene>): CaseDef => ({
  ...caseDef,
  scenes: caseDef.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)),
});

/** Проверка: есть ровно одна проблема, содержащая фрагмент */
const expectProblem = (problems: string[], fragment: string) => {
  expect(problems.filter((p) => p.includes(fragment)), problems.join("\n")).toHaveLength(1);
};

describe("поиск сцен", () => {
  it("getScene", () => {
    expect(getScene(base, "intro")?.lines[0].text).toBe("Начнём.");
    expect(getScene(base, "nope")).toBeUndefined();
  });

  it("sceneChain идёт по next до сцены с выбором", () => {
    expect(sceneChain(base, "intro").map((s) => s.id)).toEqual(["intro", "briefing"]);
    expect(sceneChain(base, "found").map((s) => s.id)).toEqual(["found"]);
    expect(sceneChain(base, "nope")).toEqual([]);
  });

  it("sceneChain не зацикливается", () => {
    const loop = withScene(withScene(base, "intro", { next: "briefing" }), "briefing", { next: "intro" });
    expect(sceneChain(loop, "intro").map((s) => s.id)).toEqual(["intro", "briefing"]);
  });

  it("sceneLinks: next, выборы, предъявление", () => {
    expect(sceneLinks(getScene(base, "found") as Scene)).toEqual(["confront", "briefing"]);
    expect(sceneLinks(getScene(base, "confront") as Scene)).toEqual(["outro", "confront_fail"]);
    expect(sceneLinks(getScene(base, "outro") as Scene)).toEqual([]);
  });

  it("caseShort по order", () => {
    expect(caseShort({ order: 0 })).toBe("c00");
    expect(caseShort({ order: 7 })).toBe("c07");
    expect(caseShort({ order: 12 })).toBe("c12");
  });

  it("формат id реплики", () => {
    expect(LINE_ID_RE.test("c03.interrogation.007")).toBe(true);
    expect(LINE_ID_RE.test("c03.confront_fail.001")).toBe(true);
    expect(LINE_ID_RE.test("c3.intro.001")).toBe(false);
    expect(LINE_ID_RE.test("c03.Intro.001")).toBe(false);
    expect(LINE_ID_RE.test("c03.intro.1")).toBe(false);
    expect(LINE_ID_RE.test("case-03.intro.001")).toBe(false);
  });
});

describe("collectEvidenceIds", () => {
  it("собирает улики всех задач всех дел", () => {
    const other = makeCase({
      id: "case-04",
      order: 4,
      objectives: [objective({ id: "x", order: 1, evidence: { id: "ev.c04.x", title: "", text: "", kind: "lead" } })],
    });
    expect([...collectEvidenceIds([base, other])].sort()).toEqual(["ev.c03.list", "ev.c03.salary", "ev.c04.x"]);
    expect(collectEvidenceIds([]).size).toBe(0);
  });
});

describe("validateCaseContent", () => {
  it("корректное дело — без проблем", () => {
    expect(problemsOf(base)).toEqual([]);
  });

  it("проблемы помечены id дела", () => {
    const problems = problemsOf(makeCase({ introScene: "missing" }));
    expect(problems.every((p) => p.startsWith("case-03-test: "))).toBe(true);
  });

  describe("сцены и реплики", () => {
    it("повтор id сцены", () => {
      const dup = { ...base, scenes: [...base.scenes, { ...base.scenes[5] }] };
      expect(problemsOf(dup).some((p) => p.includes("сцена «outro» объявлена дважды"))).toBe(true);
    });

    it("повтор id реплики", () => {
      const dup = withScene(base, "intro", {
        lines: [
          { id: "c03.intro.001", speaker: "marta", text: "А" },
          { id: "c03.intro.001", speaker: "marta", text: "Б" },
        ],
      });
      expectProblem(problemsOf(dup), "реплика «c03.intro.001» объявлена дважды");
    });

    it("id реплики: формат и префикс дела/сцены", () => {
      const bad = withScene(base, "intro", {
        lines: [
          { id: "intro-1", speaker: "marta", text: "А" },
          { id: "c04.intro.002", speaker: "marta", text: "Б" },
          { id: "c03.briefing.003", speaker: "marta", text: "В" },
        ],
      });
      const problems = problemsOf(bad);
      expectProblem(problems, "«intro-1»: id должен быть вида c03.intro.001");
      expectProblem(problems, "«c04.intro.002»: id должен начинаться с «c03.intro.»");
      expectProblem(problems, "«c03.briefing.003»: id должен начинаться с «c03.intro.»");
    });

    it("id сцены — только a-z, 0-9, _ и -", () => {
      const bad = makeCase({
        introScene: "Вступление",
        scenes: [{ id: "Вступление", lines: [{ id: "c03.x.001", speaker: "marta", text: "А" }] }],
        protocol: { ...PROTOCOL, successScene: "Вступление" },
        objectives: base.objectives.map((o) => ({ ...o, sceneAfter: undefined })),
      });
      expectProblem(problemsOf(bad), "id сцены должен состоять из");
    });

    it("неизвестный говорящий; narrator и player допустимы", () => {
      const bad = withScene(base, "intro", {
        lines: [
          { id: "c03.intro.001", speaker: "ghost", text: "У-у" },
          { id: "c03.intro.002", speaker: "narrator", text: "Тишина" },
          { id: "c03.intro.003", speaker: "player", text: "Кто здесь?" },
        ],
      });
      const problems = problemsOf(bad);
      expectProblem(problems, "неизвестный говорящий «ghost»");
      expect(problems).toHaveLength(1);
    });

    it("эмоция вне EMOTIONS", () => {
      const bad = withScene(base, "intro", {
        lines: [{ id: "c03.intro.001", speaker: "marta", emotion: "furious" as "angry", text: "!" }],
      });
      expectProblem(problemsOf(bad), "эмоции «furious» нет в EMOTIONS");
    });

    it("пустая сцена и пустой текст", () => {
      const bad = withScene(withScene(base, "briefing", { lines: [] }), "intro", {
        lines: [{ id: "c03.intro.001", speaker: "marta", text: "  " }],
      });
      const problems = problemsOf(bad);
      expectProblem(problems, "сцена «briefing»: нет ни одной реплики");
      expectProblem(problems, "«c03.intro.001»: пустой текст");
    });

    it("ссылки на несуществующие сцены: next, выбор, предъявление", () => {
      let bad = withScene(base, "intro", { next: "nowhere" });
      bad = withScene(bad, "found", { choices: [{ id: "go", text: "Туда", goto: "void" }] });
      bad = withScene(bad, "confront", {
        present: { prompt: "?", correct: ["ev.c03.list"], success: "win", failure: "lose" },
      });
      const problems = problemsOf(bad);
      expectProblem(problems, "next: сцена «nowhere» не найдена");
      expectProblem(problems, "выбор «go»: сцена «void» не найдена");
      expectProblem(problems, "предъявление success: сцена «win» не найдена");
      expectProblem(problems, "предъявление failure: сцена «lose» не найдена");
    });

    it("introScene / outroScene / sceneAfter / successScene", () => {
      const bad = makeCase({
        introScene: "a",
        outroScene: "b",
        protocol: { ...PROTOCOL, successScene: "c" },
        objectives: base.objectives.map((o, i) => (i === 0 ? { ...o, sceneAfter: "d" } : o)),
      });
      const problems = problemsOf(bad);
      expectProblem(problems, "introScene: сцена «a» не найдена");
      expectProblem(problems, "outroScene: сцена «b» не найдена");
      expectProblem(problems, "protocol.successScene: сцена «c» не найдена");
      expectProblem(problems, "sceneAfter: сцена «d» не найдена");
    });

    it("повтор id выбора в сцене", () => {
      const bad = withScene(base, "found", {
        choices: [
          { id: "ask", text: "А", goto: "confront" },
          { id: "ask", text: "Б", goto: "briefing" },
        ],
      });
      expectProblem(problemsOf(bad), "выбор «ask» объявлен дважды");
    });

    it("улики в выборах и предъявлении должны существовать в сезоне", () => {
      let bad = withScene(base, "found", {
        choices: [{ id: "ask", text: "?", goto: "confront", requires: ["ev.c09.future"] }],
      });
      bad = withScene(bad, "confront", {
        present: { prompt: "?", correct: ["ev.fake"], success: "outro", failure: "confront_fail" },
      });
      const problems = problemsOf(bad);
      expectProblem(problems, "выбор «ask»: улика «ev.c09.future» не существует");
      expectProblem(problems, "предъявление: улика «ev.fake» не существует");
      // Улика из другого дела сезона — допустима
      expect(problemsOf(bad, new Set([...EVIDENCE, "ev.c09.future", "ev.fake"]))).toEqual([]);
    });

    it("предъявление без верных улик", () => {
      const bad = withScene(base, "confront", {
        present: { prompt: "?", correct: [], success: "outro", failure: "confront_fail" },
      });
      expectProblem(problemsOf(bad), "у предъявления нет верных улик");
    });

    it("недостижимая сцена", () => {
      const orphan = { ...base, scenes: [...base.scenes, { id: "orphan", lines: [{ id: "c03.orphan.001", speaker: "marta", text: "?" }] }] };
      expectProblem(problemsOf(orphan), "сцена «orphan» недостижима");
    });
  });

  describe("задачи и улики", () => {
    it("повтор id задачи и order основных задач", () => {
      const bad = makeCase({
        objectives: [
          objective({ id: "a", order: 1 }),
          objective({ id: "a", order: 2 }),
          objective({ id: "b", order: 2 }),
          objective({ id: "opt", order: 2, optional: true }),
        ],
      });
      const problems = problemsOf(bad);
      expectProblem(problems, "задача «a» объявлена дважды");
      expectProblem(problems, "order 2 повторяется у основных задач");
    });

    it("одинаковый order у доп. задачи и основной — допустимо", () => {
      const ok = makeCase({
        objectives: [
          objective({ id: "a", order: 1, sceneAfter: "found" }),
          objective({ id: "opt", order: 1, optional: true }),
        ],
      });
      expect(problemsOf(ok)).toEqual([]);
    });

    it("нет основных задач", () => {
      const bad = makeCase({ objectives: [objective({ id: "opt", order: 1, optional: true })] });
      expectProblem(problemsOf(bad), "нет ни одной основной задачи");
    });

    it("подсказок меньше трёх; неизвестный автор подсказки", () => {
      const bad = makeCase({
        objectives: [
          objective({ id: "few", order: 1, hints: [{ text: "1" }, { text: "2" }] }),
          objective({ id: "who", order: 2, hints: [{ text: "1" }, { text: "2", by: "stranger" }, { text: "3", by: "narrator" }] }),
        ],
      });
      const problems = problemsOf(bad);
      expectProblem(problems, "задача «few»: подсказок 2, нужно не меньше 3");
      expectProblem(problems, "подсказка 2: неизвестный персонаж «stranger»");
      // Подсказки звучат голосами героев — рассказчик не персонаж
      expectProblem(problems, "подсказка 3: неизвестный персонаж «narrator»");
    });

    it("повтор и формат id улики", () => {
      const ev = { id: "ev.c03.same", title: "", text: "", kind: "record" as const };
      const bad = makeCase({
        objectives: [
          objective({ id: "a", order: 1, evidence: ev }),
          objective({ id: "b", order: 2, evidence: ev }),
          objective({ id: "c", order: 3, evidence: { ...ev, id: "clue-1" } }),
        ],
      });
      const problems = problemsOf(bad, new Set(["ev.c03.list", "ev.c03.same", "clue-1"]));
      expectProblem(problems, "улика «ev.c03.same» объявлена дважды");
      expectProblem(problems, "улика «clue-1»: id должен начинаться с «ev.»");
    });
  });

  describe("карточка дела", () => {
    it("дата, order и newTables", () => {
      const problems = problemsOf(makeCase({ date: "14.12.2026", order: 100, newTables: ["vault"] }));
      expectProblem(problems, "date «14.12.2026»");
      expectProblem(problems, "order должен быть целым от 0 до 99");
      expectProblem(problems, "newTables: таблица «vault» не входит в tables");
    });

    it("дело без протокола должно иметь outroScene", () => {
      expectProblem(problemsOf(makeCase({ protocol: undefined })), "нет ни протокола, ни outroScene");
      expect(problemsOf(makeCase({ protocol: undefined, outroScene: "outro" }))).toEqual([]);
    });
  });

  describe("протокол", () => {
    const withProtocol = (patch: Partial<typeof PROTOCOL>) => makeCase({ protocol: { ...PROTOCOL, ...patch } });

    it("ответ должен быть среди вариантов", () => {
      const bad = withProtocol({
        blanks: PROTOCOL.blanks.map((b) => (b.id === "city" ? { ...b, answer: "Москва" } : b)),
      });
      expectProblem(problemsOf(bad), "пропуск «city»: ответ «Москва» не входит в options");
    });

    it("пропуск в тексте не объявлен / объявлен, но не используется", () => {
      const bad = withProtocol({ statements: ["Деньги получил {payee} в {town}.", "Сумма {amount}, посредник {broker}."] });
      const problems = problemsOf(bad);
      expectProblem(problems, "пропуск {town} не объявлен в blanks");
      expectProblem(problems, "пропуск «city» не используется");
    });

    it("повтор id пропуска", () => {
      const bad = withProtocol({ blanks: [...PROTOCOL.blanks, { ...PROTOCOL.blanks[1] }] });
      expectProblem(problemsOf(bad), "пропуск «city» объявлен дважды");
    });

    it("неразличимые варианты (ё/е, регистр, 80 и 80.0)", () => {
      const bad = withProtocol({
        blanks: [
          { id: "payee", options: ["Борис Ёлкин", "борис елкин"], answer: "Борис Ёлкин" },
          { id: "city", options: ["Северск"], answer: "Северск" },
          { id: "amount", options: ["80", "80.0"], answer: "80" },
          { id: "broker", options: ["Глеб Орлов"], answer: "Глеб Орлов" },
        ],
      });
      const problems = problemsOf(bad);
      expectProblem(problems, "пропуск «payee»: варианты неразличимы («Борис Ёлкин», «борис елкин»)");
      expectProblem(problems, "пропуск «amount»: варианты неразличимы");
    });

    it("batchSize и пустой протокол", () => {
      expectProblem(problemsOf(withProtocol({ batchSize: 0 })), "protocol.batchSize должен быть целым ≥ 1");
      expectProblem(problemsOf(withProtocol({ batchSize: 2.5 })), "protocol.batchSize");
      expectProblem(problemsOf(withProtocol({ blanks: [], statements: [] })), "в протоколе нет пропусков");
    });
  });
});

describe("validateSeasonContent", () => {
  const second = (patch: Partial<CaseDef> = {}) =>
    makeCase({
      id: "case-04-next",
      order: 4,
      objectives: base.objectives.map((o) =>
        o.evidence ? { ...o, evidence: { ...o.evidence, id: o.evidence.id.replace("c03", "c04") } } : o
      ),
      scenes: base.scenes.map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l, id: l.id.replace("c03", "c04") })) })),
      ...patch,
    });

  it("корректный сезон — без проблем; улики других дел видны", () => {
    const withCrossRef = second({
      scenes: second().scenes.map((s) =>
        s.id === "confront" && s.present ? { ...s, present: { ...s.present, correct: ["ev.c03.list"] } } : s
      ),
    });
    expect(validateSeasonContent([base, withCrossRef], CHARACTERS)).toEqual([]);
  });

  it("повтор id и order дел", () => {
    const problems = validateSeasonContent([base, second({ id: base.id, order: 3 })], CHARACTERS);
    expect(problems).toContain(`сезон: дело «${base.id}» объявлено дважды`);
    expect(problems.some((p) => p.startsWith("сезон: order 3 повторяется"))).toBe(true);
  });

  it("одна улика в двух делах", () => {
    const clash = second({ objectives: base.objectives });
    const problems = validateSeasonContent([base, clash], CHARACTERS);
    expect(problems).toContain("сезон: улика «ev.c03.list» объявлена в нескольких делах");
  });

  it("персонажи: повтор и зарезервированные id", () => {
    const problems = validateSeasonContent(
      [base],
      [...CHARACTERS, { ...CHARACTERS[0] }, { ...CHARACTERS[1], id: "narrator" }]
    );
    expect(problems).toContain("персонажи: «marta» объявлен дважды");
    expect(problems).toContain("персонажи: id «narrator» зарезервирован");
  });

  it("проблемы отдельных дел попадают в общий список", () => {
    const problems = validateSeasonContent([base, second({ introScene: "nope" })], CHARACTERS);
    expect(problems).toContain("case-04-next: introScene: сцена «nope» не найдена");
  });
});
