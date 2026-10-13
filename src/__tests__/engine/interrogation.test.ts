/**
 * Допрос «Наушник» (GAME_DESIGN, разд. 6.9): лента утверждений, «Надавить»,
 * «Предъявить», пробои, терпение Даши, режимы союзника и беседы.
 */
import { describe, it, expect } from "vitest";
import {
  interrogationEmotion,
  presentEvidence,
  presentMatches,
  pressPoint,
  reopenInterrogation,
  startInterrogation,
  visiblePoints,
} from "@/engine/interrogation";
import type { PinnedCard } from "@/types/case";
import type { InterrogationDef } from "@/types/story";

const kuspCard: PinnedCard = { id: "k1", columns: ["kusp_no", "reported_at"], values: [4518, "2026-11-18 23:50:00"], sourceClass: "pbd" };
const routeCard: PinnedCard = { id: "r1", columns: ["plate", "read_at"], values: ["К404ТО", "2026-11-18 23:34:00"], sourceClass: "dorset" };

const BURTSEV: InterrogationDef = {
  suspect: "burtsev",
  mode: "unwinnable",
  breakSteps: ["neutral", "cold", "thinking"],
  points: [
    {
      line: "c03.int_burtsev.002",
      press: "burtsev_press_1",
      present: { prompt: "КУСП", correct: ["ev.c03.kusp_order"], success: "burtsev_break_1", failure: "burtsev_miss" },
    },
    {
      line: "c03.int_burtsev.006",
      present: {
        prompt: "Маршрут",
        correct: [],
        cards: [{ all: [{ column: "plate", eq: "К404ТО" }, { column: "read_at", prefix: "2026-11-18 23:3" }] }],
        success: "burtsev_break_2",
        failure: "burtsev_miss",
      },
    },
    { line: "c03.int_burtsev.009", revealedBy: "c03.int_burtsev.002", press: "burtsev_press_2" },
  ],
  closedScene: "burtsev_closed",
  doneScene: "rat_call",
};

describe("presentMatches", () => {
  it("по id улики или по содержимому карточки", () => {
    expect(presentMatches(BURTSEV.points[0].present!, { evidenceIds: ["ev.c03.kusp_order"] })).toBe(true);
    expect(presentMatches(BURTSEV.points[1].present!, { cards: [routeCard] })).toBe(true);
    expect(presentMatches(BURTSEV.points[1].present!, { cards: [kuspCard] })).toBe(false);
  });

  it("призрак не пробивает", () => {
    expect(presentMatches(BURTSEV.points[1].present!, { cards: [{ ...routeCard, stamp: "ghost" }] })).toBe(false);
  });

  it("requireAll: пробой двумя карточками (Ратников, .016)", () => {
    const present = {
      prompt: "Фонд",
      correct: ["ev.c07.payments_24"],
      cards: [{ all: [{ column: "kusp_no", eq: 4518 }] }],
      requireAll: true,
      success: "s",
      failure: "f",
    };
    expect(presentMatches(present, { evidenceIds: ["ev.c07.payments_24"] })).toBe(false);
    expect(presentMatches(present, { evidenceIds: ["ev.c07.payments_24"], cards: [kuspCard] })).toBe(true);
  });

  it("пустое предъявление ничего не пробивает", () => {
    expect(presentMatches({ prompt: "", correct: [], success: "s", failure: "f" }, { evidenceIds: ["x"] })).toBe(false);
  });
});

describe("стандартный допрос (нельзя выиграть — Бурцев)", () => {
  it("старт: 3 деления терпения, эмоция-исход, скрытое утверждение не видно", () => {
    const s = startInterrogation(BURTSEV);
    expect(s.patience).toBe(3);
    expect(interrogationEmotion(BURTSEV, s)).toBe("neutral");
    expect(visiblePoints(BURTSEV, s).map((p) => p.line)).toEqual(["c03.int_burtsev.002", "c03.int_burtsev.006"]);
  });

  it("«Надавить» проигрывает уточнение и открывает новое утверждение", () => {
    const { state, scene } = pressPoint(BURTSEV, startInterrogation(BURTSEV), "c03.int_burtsev.002");
    expect(scene).toBe("burtsev_press_1");
    expect(visiblePoints(BURTSEV, state).map((p) => p.line)).toContain("c03.int_burtsev.009");
    expect(pressPoint(BURTSEV, state, "c03.int_burtsev.002").state.pressed).toEqual(["c03.int_burtsev.002"]);
  });

  it("два пробоя: эмоции по шагам, допрос окончен", () => {
    let s = startInterrogation(BURTSEV);
    const first = presentEvidence(BURTSEV, s, "c03.int_burtsev.002", { evidenceIds: ["ev.c03.kusp_order"] });
    expect(first).toMatchObject({ result: "break", scene: "burtsev_break_1", emotion: "cold" });
    s = first.state;
    const second = presentEvidence(BURTSEV, s, "c03.int_burtsev.006", { cards: [routeCard] });
    expect(second).toMatchObject({ result: "break", scene: "burtsev_break_2", emotion: "thinking" });
    expect(second.state.done).toBe(true);
    expect(second.state.broken).toEqual(["c03.int_burtsev.002", "c03.int_burtsev.006"]);
  });

  it("повторное предъявление на пробитом утверждении игнорируется", () => {
    const s = presentEvidence(BURTSEV, startInterrogation(BURTSEV), "c03.int_burtsev.002", { evidenceIds: ["ev.c03.kusp_order"] }).state;
    expect(presentEvidence(BURTSEV, s, "c03.int_burtsev.002", { evidenceIds: ["ev.c03.kusp_order"] }).result).toBe("ignored");
  });

  it("три ошибки — «закрылся»; дальше предъявления игнорируются", () => {
    let s = startInterrogation(BURTSEV);
    const miss1 = presentEvidence(BURTSEV, s, "c03.int_burtsev.002", { cards: [routeCard] });
    expect(miss1).toMatchObject({ result: "miss", scene: "burtsev_miss" });
    expect(miss1.state.patience).toBe(2);
    s = presentEvidence(BURTSEV, miss1.state, "c03.int_burtsev.002", {}).state;
    const closed = presentEvidence(BURTSEV, s, "c03.int_burtsev.006", { evidenceIds: ["nope"] });
    expect(closed).toMatchObject({ result: "closed", scene: "burtsev_closed" });
    expect(closed.state.closed).toBe(true);
    expect(presentEvidence(BURTSEV, closed.state, "c03.int_burtsev.002", { evidenceIds: ["ev.c03.kusp_order"] }).result).toBe("ignored");
  });

  it("вернуться можно один раз: пробои сохраняются, терпение восстанавливается", () => {
    let s = startInterrogation({ ...BURTSEV, patience: 1 });
    s = presentEvidence({ ...BURTSEV, patience: 1 }, s, "c03.int_burtsev.002", {}).state;
    expect(s.closed).toBe(true);
    const back = reopenInterrogation({ ...BURTSEV, patience: 1 }, s);
    expect(back).toMatchObject({ closed: false, reopened: true, patience: 1 });
    expect(reopenInterrogation(BURTSEV, { ...(back as typeof s), closed: true })).toBeNull();
    expect(reopenInterrogation(BURTSEV, startInterrogation(BURTSEV))).toBeNull();
  });

  it("неизвестное или скрытое утверждение игнорируется", () => {
    const s = startInterrogation(BURTSEV);
    expect(presentEvidence(BURTSEV, s, "c03.int_burtsev.999", {}).result).toBe("ignored");
    expect(pressPoint(BURTSEV, s, "c03.int_burtsev.009").scene).toBeUndefined();
  });
});

describe("союзник и беседа", () => {
  const DASHA: InterrogationDef = {
    suspect: "dasha",
    interrogator: "player",
    mode: "ally",
    breakSteps: ["neutral", "angry", "hurt", "broken"],
    trustFlag: "dasha_trust",
    points: [
      { line: "c06.dream.003", present: { prompt: "", correct: ["ev.c06.registration"], success: "dream_b1", failure: "dream_pain" } },
    ],
  };

  it("союзник: терпения нет, неверная карточка — реплика-боль и −1 к доверию", () => {
    const s = startInterrogation(DASHA);
    expect(s.patience).toBeNull();
    let outcome = presentEvidence(DASHA, s, "c06.dream.003", { evidenceIds: ["x"] });
    for (let i = 0; i < 4; i++) outcome = presentEvidence(DASHA, outcome.state, "c06.dream.003", { evidenceIds: ["x"] });
    expect(outcome).toMatchObject({ result: "miss", scene: "dream_pain", trust: { flag: "dasha_trust", delta: -1 } });
    expect(outcome.state.closed).toBe(false);
  });

  it("беседа: одно предъявление — и всё", () => {
    const NINA: InterrogationDef = { ...DASHA, suspect: "nina", mode: "talk", trustFlag: undefined, breakSteps: ["neutral", "scared", "ashamed"] };
    const outcome = presentEvidence(NINA, startInterrogation(NINA), "c06.dream.003", { evidenceIds: ["x"] });
    expect(outcome).toMatchObject({ result: "done", scene: "dream_pain" });
    expect(outcome.state.done).toBe(true);
    expect(outcome.trust).toBeUndefined();
  });

  it("эмоция не выходит за последний шаг", () => {
    expect(interrogationEmotion(DASHA, { ...startInterrogation(DASHA), broken: ["a", "b", "c", "d", "e"] })).toBe("broken");
    expect(interrogationEmotion({ ...DASHA, breakSteps: [] }, startInterrogation(DASHA))).toBe("neutral");
  });
});
