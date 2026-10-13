/**
 * Контракт контента v2 (GAME_DESIGN, разд. 6.4–6.10, 11.1, 11.3):
 * id реплик и дел, эмоции и варианты портретов, допрос, обвинение,
 * предсказание, часы, события, белый список записи, типы пропусков.
 */
import { describe, it, expect } from "vitest";
import {
  LINE_ID_RE,
  caseShort,
  collectEvidenceIds,
  lineIdProblem,
  parseLineId,
  portraitKey,
  sceneLinks,
  validateCaseContent,
  validateSeasonContent,
} from "@/engine/story";
import { EMOTIONS, PORTRAIT_VARIANTS, type CharacterDef, type Scene } from "@/types/story";
import type { CaseDef } from "@/types/case";
import { CHARACTERS, PROTOCOL, makeCase, objective } from "../helpers/case-fixture";

const base = makeCase();
const EVIDENCE = collectEvidenceIds([base]);
const problemsOf = (caseDef: CaseDef, characters: CharacterDef[] = CHARACTERS) =>
  validateCaseContent(caseDef, characters, new Set([...EVIDENCE, ...collectEvidenceIds([caseDef])]));
const expectProblem = (problems: string[], fragment: string) => {
  expect(problems.filter((p) => p.includes(fragment)), problems.join("\n")).toHaveLength(1);
};

describe("EMOTIONS и варианты портретов (разд. 11.1)", () => {
  it("прежние 10 и ещё 7; frost нет", () => {
    expect(EMOTIONS).toHaveLength(17);
    expect(EMOTIONS.slice(10)).toEqual(["uneasy", "ashamed", "broken", "cold", "shaken", "determined", "lie"]);
    expect(EMOTIONS as readonly string[]).not.toContain("frost");
    expect(PORTRAIT_VARIANTS).toEqual(["outdoor"]);
  });

  it("portraitKey: уличный вариант, если он есть у персонажа", () => {
    const dasha: CharacterDef = {
      ...CHARACTERS[0],
      id: "dasha",
      emotions: ["neutral", "smug", "angry", "scared", "determined", "hurt", "broken"],
      variants: { outdoor: ["neutral", "determined"] },
    };
    expect(portraitKey(dasha, "determined", true)).toBe("determined_outdoor");
    expect(portraitKey(dasha, "angry", true)).toBe("angry");
    expect(portraitKey(dasha, "determined")).toBe("determined");
    expect(portraitKey(dasha, undefined, true)).toBe("neutral_outdoor");
  });

  it("сезон: варианты только для эмоций из набора персонажа", () => {
    const bad: CharacterDef = { ...CHARACTERS[1], variants: { outdoor: ["hurt"] } };
    const problems = validateSeasonContent([base], [CHARACTERS[0], bad]);
    expect(problems).toContain("персонажи: у «lev» вариант outdoor для «hurt», которой нет в emotions");
  });

  it("эмоция реплики — из набора говорящего", () => {
    const bad = {
      ...base,
      scenes: base.scenes.map((s) =>
        s.id === "intro" ? { ...s, lines: [{ id: "c03.intro.001", speaker: "lev", emotion: "broken" as const, text: "…" }] } : s
      ),
    };
    expectProblem(problemsOf(bad), "у «lev» нет портрета «broken»");
  });
});

describe("id реплик (разд. 11.3)", () => {
  it.each([
    "c03.interrogation.007",
    "c11.draft.014",
    "c12.int_granin.020",
    "note.n02.001",
    "ep.irina_last.001",
    "bark.tokha_eqnull.001",
    "hint.c00_p1.001",
    "hint.c05_o5_1.002",
    "hint.c10_o10_2b.001",
    "sys.protocol_ok.001",
  ])("%s — по правилу", (id) => {
    expect(LINE_ID_RE.test(id)).toBe(true);
    expect(lineIdProblem(id)).toBeNull();
  });

  it.each(["c3.intro.001", "c03.Intro.001", "c03.intro.1", "mira.x.001", "note.x.001.002", "c03b.intro.001"])("%s — нет", (id) => {
    expect(LINE_ID_RE.test(id)).toBe(false);
  });

  it("правила сцены по префиксу", () => {
    expect(lineIdProblem("note.irina.001")).toMatch(/n01…n10/);
    expect(lineIdProblem("hint.o5_1.001")).toMatch(/cNN_<id задачи>/);
  });

  it("parseLineId", () => {
    expect(parseLineId("hint.c05_o5_1.002")).toEqual({ prefix: "hint", scene: "c05_o5_1", n: 2 });
    expect(parseLineId("broken")).toBeNull();
  });

  it("интерлюдия и финал: case-11-chernovik = c11, case-12-pervoe-solntse = c12", () => {
    expect(caseShort({ order: 11 })).toBe("c11");
    const finale = makeCase({
      id: "case-12-pervoe-solntse",
      order: 12,
      objectives: base.objectives.map((o) => (o.evidence ? { ...o, evidence: { ...o.evidence, id: o.evidence.id.replace("c03", "c12") } } : o)),
      scenes: base.scenes.map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l, id: l.id.replace("c03", "c12") })) })),
    });
    expect(problemsOf(finale)).toEqual([]);
  });

  it("реплика дела не может быть служебной", () => {
    const bad = {
      ...base,
      scenes: base.scenes.map((s) => (s.id === "briefing" ? { ...s, lines: [{ id: "note.n02.001", speaker: "narrator", text: "…" }] } : s)),
    };
    expectProblem(problemsOf(bad), "«note.n02.001»: id должен начинаться с «c03.briefing.»");
  });

  it("реплика наводки: hint.<cNN>_<id задачи>.<nnn>", () => {
    const bad = makeCase({
      objectives: [
        objective({ id: "o3_1", order: 1, sceneAfter: "found", hints: [{ text: "1", by: "lev", line: "hint.c03_o3_1.001" }, { text: "2", line: "hint.c03_o3_2.001" }, { text: "3", line: "hint.o3_1.001" }] }),
      ],
    });
    const problems = problemsOf(bad);
    expectProblem(problems, "подсказка 2: id реплики должен начинаться с «hint.c03_o3_1.»");
    expectProblem(problems, "подсказка 3: «hint.o3_1.001»");
  });
});

describe("карточка дела", () => {
  it("id дела: case-NN-<slug>, NN = order", () => {
    expectProblem(problemsOf(makeCase({ id: "case-3-test" })), "id дела должен быть вида case-NN-<slug>");
    expectProblem(problemsOf(makeCase({ id: "case-04-test" })), "номер в id (04) не равен order (3)");
  });

  it("date с секундами допустим", () => {
    expect(problemsOf(makeCase({ date: "2026-12-14 02:44:30" }))).toEqual([]);
  });

  it("writableTables ⊆ tables; allowWrites упразднён", () => {
    const bad = { ...makeCase({ writableTables: ["people", "vault", "people"] }), allowWrites: true } as CaseDef;
    const problems = problemsOf(bad);
    expectProblem(problems, "writableTables: таблица «vault» не входит в tables");
    expectProblem(problems, "writableTables: «people» указана дважды");
    expectProblem(problems, "allowWrites упразднён");
  });

  it("id задачи — только a-z, 0-9, _ и -", () => {
    expectProblem(problemsOf(makeCase({ objectives: [objective({ id: "Задача 1", order: 1, sceneAfter: "found" })] })), "id задачи");
  });

  it("id улики — ev.<cNN>.<slug>", () => {
    const bad = makeCase({ objectives: [objective({ id: "a", order: 1, sceneAfter: "found", evidence: { id: "ev.c04.wrong", title: "", text: "", kind: "lead" } })] });
    expectProblem(problemsOf(bad), "улика «ev.c04.wrong»: id должен быть вида ev.c03.<slug>");
  });
});

describe("предсказание", () => {
  const withPrediction = (prediction: NonNullable<CaseDef["objectives"][number]["prediction"]>) =>
    makeCase({ objectives: [objective({ id: "o3_5", order: 1, sceneAfter: "found", prediction })] });

  it("корректное — без проблем", () => {
    expect(problemsOf(withPrediction({ question: "Сколько строк вернёт JOIN по КУСП 4515?", options: [0, 1, 2], answer: 0 }))).toEqual([]);
  });

  it("ровно три различных целых варианта, ответ среди них", () => {
    const problems = problemsOf(withPrediction({ question: "?", options: [1, 1, 2.5, 3], answer: 7 }));
    expectProblem(problems, "вариантов должно быть ровно три");
    expectProblem(problems, "варианты — целые числа");
    expectProblem(problems, "вариант 1 повторяется");
    expectProblem(problems, "ответ 7 не входит в варианты");
  });
});

describe("типы пропусков протокола", () => {
  const withBlanks = (blanks: typeof PROTOCOL.blanks) =>
    makeCase({ protocol: { ...PROTOCOL, statements: [blanks.map((b) => `{${b.id}}`).join(" ")], blanks } });

  it("fixture корректен", () => {
    expect(problemsOf(base)).toEqual([]);
  });

  it("неизвестный kind; tolerance и precision не своего типа", () => {
    const problems = problemsOf(
      withBlanks([
        { id: "a", kind: "money" as "number", options: ["1"], answer: "1" },
        { id: "b", kind: "text", options: ["x"], answer: "x", tolerance: 1, precision: "day" },
      ])
    );
    expectProblem(problems, "пропуск «a»: kind должен быть");
    expectProblem(problems, "пропуск «b»: tolerance бывает только у number");
    expectProblem(problems, "пропуск «b»: precision бывает только у datetime");
  });

  it("number: варианты — числа и не сливаются по модулю с допуском", () => {
    const problems = problemsOf(withBlanks([{ id: "n", kind: "number", options: ["38000", "−38000", "много"], answer: "38000" }]));
    expectProblem(problems, "вариант «много» — не число");
    expectProblem(problems, "варианты «38000» и «−38000» совпадают с допуском");
  });

  it("datetime: варианты — даты; ответ не грубее точности", () => {
    const problems = problemsOf(
      withBlanks([{ id: "d", kind: "datetime", options: ["2026-11-18", "вчера"], answer: "2026-11-18", precision: "minute" }])
    );
    expectProblem(problems, "вариант «вчера» — не дата");
    expectProblem(problems, "записан грубее точности minute");
  });

  it("aliases только для вариантов из options", () => {
    const problems = problemsOf(withBlanks([{ id: "p", kind: "person", options: ["Вальц Ирина Петровна"], answer: "Вальц Ирина Петровна", aliases: { "Вальц И.": [4127] } }]));
    expectProblem(problems, "aliases для «Вальц И.»");
  });
});

describe("допрос", () => {
  const scenes: Scene[] = [
    ...base.scenes.filter((s) => s.id !== "confront"),
    {
      id: "confront",
      lines: [
        { id: "c03.confront.001", speaker: "lev", emotion: "neutral", text: "Угнали в десять сорок." },
        { id: "c03.confront.002", speaker: "lev", text: "Больше не видели." },
        { id: "c03.confront.003", speaker: "marta", text: "Ну-ну." },
      ],
      interrogation: {
        suspect: "lev",
        breakSteps: ["neutral", "scared", "smug"],
        points: [
          { line: "c03.confront.001", press: "briefing", present: { prompt: "?", correct: ["ev.c03.list"], success: "outro", failure: "confront_fail" } },
          { line: "c03.confront.002", revealedBy: "c03.confront.001", press: "briefing" },
        ],
        closedScene: "confront_fail",
        doneScene: "outro",
      },
    },
  ];
  const withInt = (patch: Partial<NonNullable<Scene["interrogation"]>>, lines?: Scene["lines"]) =>
    makeCase({
      scenes: scenes.map((s) =>
        s.id === "confront" ? { ...s, ...(lines ? { lines } : {}), interrogation: { ...s.interrogation!, ...patch } } : s
      ),
    });

  it("корректный допрос — без проблем; ветки допроса достижимы", () => {
    expect(problemsOf(withInt({}))).toEqual([]);
    expect(sceneLinks(scenes.find((s) => s.id === "confront")!)).toEqual(["briefing", "outro", "confront_fail", "briefing", "confront_fail", "outro"]);
  });

  it("шаги пробоя — только из набора подозреваемого", () => {
    const problems = problemsOf(withInt({ breakSteps: ["neutral", "broken", "furious" as "angry"] }));
    expectProblem(problems, "у «lev» нет портрета «broken»");
    expectProblem(problems, "эмоции «furious» нет в EMOTIONS");
  });

  it("подозреваемый, допрашивающий, терпение, утверждения", () => {
    const problems = problemsOf(
      withInt({
        suspect: "ghost",
        interrogator: "nobody",
        mode: "ally",
        patience: 3,
        breakSteps: ["neutral"],
        points: [
          { line: "c03.confront.003", present: { prompt: "", correct: [], success: "nowhere", failure: "outro" } },
          { line: "c03.confront.999", revealedBy: "c03.confront.404" },
        ],
      })
    );
    expectProblem(problems, "неизвестный подозреваемый «ghost»");
    expectProblem(problems, "неизвестный допрашивающий «nobody»");
    expectProblem(problems, "у режима «ally» нет шкалы терпения");
    expectProblem(problems, "в breakSteps нужен исход");
    expectProblem(problems, "«c03.confront.003»: утверждение говорит не подозреваемый");
    expectProblem(problems, "у предъявления нет верных улик");
    expectProblem(problems, "сцена «nowhere» не найдена");
    expectProblem(problems, "«c03.confront.999»: реплики нет в сцене");
    expectProblem(problems, "revealedBy «c03.confront.404»");
    expectProblem(problems, "«c03.confront.999»: нет ни «Надавить», ни «Предъявить»");
  });

  it("предъявление по содержимому карточки допустимо без id улик", () => {
    const ok = withInt({
      points: [
        {
          line: "c03.confront.001",
          present: { prompt: "?", correct: [], cards: [{ all: [{ column: "plate", eq: "К404ТО" }] }], success: "outro", failure: "confront_fail" },
        },
      ],
    });
    expect(problemsOf(ok)).toEqual([]);
  });
});

describe("обвинение", () => {
  const accusation = {
    id: "ghost",
    prompt: "Под логином i.valts работал …",
    answer: "Борис Ёлкин",
    keys: [2, "b.yolkin"],
    successScene: "outro",
    wrong: [{ person: "Глеб Орлов", scene: "confront_fail" }],
    wrongScene: "briefing",
    objective: "obj-all",
  };

  it("корректное — без проблем; сцены обвинения считаются достижимыми", () => {
    const orphan = { id: "accused", lines: [{ id: "c03.accused.001", speaker: "marta", text: "Попался." }] };
    const c = makeCase({ accusations: [{ ...accusation, successScene: "accused" }], scenes: [...base.scenes, orphan] });
    expect(problemsOf(c)).toEqual([]);
  });

  it("ошибки обвинения", () => {
    const problems = problemsOf(
      makeCase({
        accusations: [
          { ...accusation, keys: [], minCards: 0, wrongScene: "nope", wrong: [{ person: "борис елкин", scene: "outro" }], objective: "o404" },
          accusation,
        ],
      })
    );
    expectProblem(problems, "обвинение «ghost» объявлено дважды");
    expectProblem(problems, "нет ключей обвиняемого");
    expectProblem(problems, "minCards должен быть целым ≥ 1");
    expectProblem(problems, "wrongScene: сцена «nope» не найдена");
    expectProblem(problems, "«борис елкин» — это верный ответ");
    expectProblem(problems, "задача «o404» не найдена");
  });
});

describe("часы и живые события", () => {
  it("корректные часы и события — без проблем; сцены событий достижимы", () => {
    const call = { id: "rat_call", lines: [{ id: "c03.rat_call.001", speaker: "marta", text: "Закрываем." }] };
    const c = makeCase({
      minutesPerQuery: 1,
      clock: {
        cap: "2026-12-14 06:00",
        holds: [{ at: "2026-12-14 03:11", until: { objective: "obj-all" }, resumeAt: "2026-12-14 03:12:30" }],
      },
      events: [
        { id: "zero", atTime: "2026-12-14 03:12:00", patch: "zero_row" },
        { id: "call", after: { objective: "obj-north" }, scene: "rat_call" },
        { id: "feed", atQuery: 2, line: "sys.feed.001", when: { melnik: [null, "blackmail"] } },
      ],
      scenes: [...base.scenes, call],
    });
    expect(problemsOf(c)).toEqual([]);
  });

  it("ошибки часов", () => {
    const problems = problemsOf(
      makeCase({
        minutesPerQuery: -1,
        clock: {
          cap: "2026-12-14 01:00",
          holds: [{ at: "завтра", until: {} }, { at: "2026-12-14 03:11", resumeAt: "2026-12-14 03:00", until: { objective: "o404" } }],
        },
      })
    );
    expectProblem(problems, "minutesPerQuery должен быть числом ≥ 0");
    expectProblem(problems, "clock.cap должен быть позже старта");
    expectProblem(problems, "clock.holds[0].at: «завтра»");
    expectProblem(problems, "clock.holds[0].until: пустой триггер");
    expectProblem(problems, "clock.holds[1]: resumeAt раньше остановки");
    expectProblem(problems, "clock.holds[1].until: задача «o404» не найдена");
  });

  it("ошибки событий", () => {
    const problems = problemsOf(
      makeCase({
        events: [
          { id: "a", scene: "outro" },
          { id: "a", atQuery: 0, atTime: "2026-12-14 03:00", patch: "x" },
          { id: "b", after: { interrogation: "intro" }, line: "bark.x.1" },
          { id: "c", after: { scene: "void" } },
        ],
      })
    );
    expectProblem(problems, "событие «a» объявлено дважды");
    expect(problems.filter((p) => p.includes("нужен ровно один триггер"))).toHaveLength(2);
    expectProblem(problems, "atQuery должен быть целым ≥ 1");
    expectProblem(problems, "в сцене «intro» нет допроса");
    expectProblem(problems, "line «bark.x.1»");
    expectProblem(problems, "after: сцена «void» не найдена");
    expectProblem(problems, "событие «c»: нет эффекта");
  });
});
