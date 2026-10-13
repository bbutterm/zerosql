/**
 * Доска улик (разд. 6.5) и обвинение свободным поиском (разд. 6.8).
 */
import { describe, it, expect } from "vitest";
import { cardHasKey, cardMatches, checkAccusation, conditionHolds, isSourceCard } from "@/engine/board";
import type { AccusationDef, PinnedCard } from "@/types/case";

const card = (id: string, columns: string[], values: PinnedCard["values"], patch: Partial<PinnedCard> = {}): PinnedCard => ({
  id,
  columns,
  values,
  ...patch,
});

const session = card("s1", ["login", "ts", "terminal", "action"], ["i.valts", "2026-12-22 02:47:19", "WS-07", "SELECT"], {
  table: "query_log",
  sourceClass: "pbd",
});
const loan = card("s2", ["counterparty", "amount", "account_id"], ["МФО «Быстро»", -38000, 7781], {
  table: "bank_statements",
  sourceClass: "bank",
});
const door = card("s3", ["badge_id", "door", "ts"], ["B-9000", "Б0-11", "2026-12-21 23:41:00"], {
  table: "door_access",
  sourceClass: "mirror_siyanie",
  stamp: "ghost",
});

describe("conditionHolds / cardMatches", () => {
  it("eq с нормализацией и числа с допуском", () => {
    expect(conditionHolds(session, { column: "login", eq: "I.VALTS" })).toBe(true);
    expect(conditionHolds(loan, { column: "amount", eq: -38000.004 })).toBe(true);
    expect(conditionHolds(loan, { column: "amount", eq: 38000 })).toBe(false);
  });

  it("любой столбец, если column не задан; несколько имён столбца", () => {
    expect(conditionHolds(session, { eq: "WS-07" })).toBe(true);
    expect(conditionHolds(session, { column: ["terminal", "ws"], eq: "ws-07" })).toBe(true);
  });

  it("prefix, contains, in, between", () => {
    expect(conditionHolds(session, { column: "ts", prefix: "2026-12-22 02" })).toBe(true);
    expect(conditionHolds(loan, { column: "counterparty", contains: "мфо" })).toBe(true);
    expect(conditionHolds(loan, { column: "account_id", in: [1, 7781] })).toBe(true);
    expect(conditionHolds(session, { column: "ts", between: ["2026-12-22 02:00:00", "2026-12-22 03:00:00"] })).toBe(true);
    expect(conditionHolds(loan, { column: "amount", between: [-40000, -30000] })).toBe(true);
    expect(conditionHolds(loan, { column: "amount", between: [0, 1] })).toBe(false);
  });

  it("несуществующий столбец — условие не выполняется", () => {
    expect(conditionHolds(session, { column: "plate", eq: "i.valts" })).toBe(false);
  });

  it("предикат: all, any, table, sourceClass, node", () => {
    expect(cardMatches(session, { all: [{ column: "login", eq: "i.valts" }, { column: "terminal", eq: "WS-07" }] })).toBe(true);
    expect(cardMatches(session, { all: [{ column: "login", eq: "i.valts" }, { column: "terminal", eq: "WS-03" }] })).toBe(false);
    expect(cardMatches(session, { any: [{ column: "terminal", eq: "WS-03" }, { column: "login", eq: "i.valts" }] })).toBe(true);
    expect(cardMatches(session, { table: ["audit_log", "QUERY_LOG"] })).toBe(true);
    expect(cardMatches(session, { sourceClass: "bank" })).toBe(false);
    expect(cardMatches({ ...session, node: "N7" }, { node: "N7" })).toBe(true);
    expect(cardMatches(session, {})).toBe(true);
  });

  it("isSourceCard: призраки, расхождения и подлоги — не источник", () => {
    expect(isSourceCard(session)).toBe(true);
    expect(isSourceCard({ ...session, stamp: "verified" })).toBe(true);
    for (const stamp of ["ghost", "mismatch", "forgery"] as const) expect(isSourceCard({ ...session, stamp })).toBe(false);
  });

  it("cardHasKey: id, логин, пропуск, номер машины", () => {
    expect(cardHasKey(session, ["i.valts"])).toBe(true);
    expect(cardHasKey(loan, [7781])).toBe(true);
    expect(cardHasKey(loan, ["7781"])).toBe(true);
    expect(cardHasKey(loan, [])).toBe(false);
  });
});

describe("checkAccusation", () => {
  const accusation: AccusationDef = {
    id: "ghost",
    prompt: "Под логином i.valts работал …",
    answer: "Лыков Антон Сергеевич",
    keys: [3105, "a.lykov", "B-9000", 7781, "i.valts"],
    successScene: "accused_tokha",
    wrong: [{ person: "Мельник Константин Игоревич", scene: "melnik_alibi" }],
    wrongScene: "wrong_accusation",
    trustFlag: "dasha_trust",
  };

  it("верный человек и ≥2 карточки с его ключами — принято", () => {
    const check = checkAccusation(accusation, "лыков антон сергеевич", [session, loan]);
    expect(check.outcome).toBe("accepted");
    expect(check.cards).toEqual(["s1", "s2"]);
    expect(check.scene).toBe("accused_tokha");
    expect(check.trustFlag).toBeUndefined();
  });

  it("обвиняемого можно выбрать и по id", () => {
    expect(checkAccusation(accusation, 3105, [session, loan]).outcome).toBe("accepted");
  });

  it("одной карточки мало; призрак не считается — без наказания", () => {
    const one = checkAccusation(accusation, "Лыков Антон Сергеевич", [session, door]);
    expect(one.outcome).toBe("weak_evidence");
    expect(one.scene).toBeUndefined();
    expect(one.trustFlag).toBeUndefined();
    expect(one.message).toBe("Карточек, где есть его id, логин, пропуск или номер машины: 1 из 2.");
  });

  it("ложное обвинение: сюжетная реакция и доверие −1", () => {
    const melnik = checkAccusation(accusation, "Мельник Константин Игоревич", [session, loan]);
    expect(melnik).toMatchObject({ outcome: "wrong_person", scene: "melnik_alibi", trustFlag: "dasha_trust" });
    expect(checkAccusation(accusation, "Ким Дарья Сергеевна", [session, loan]).scene).toBe("wrong_accusation");
  });

  it("minCards задаётся в обвинении", () => {
    expect(checkAccusation({ ...accusation, minCards: 1 }, "Лыков Антон Сергеевич", [session]).outcome).toBe("accepted");
    expect(checkAccusation({ ...accusation, minCards: 3 }, "Лыков Антон Сергеевич", [session, loan]).outcome).toBe("weak_evidence");
  });
});
