/**
 * Сравнение значений по типам пропусков (GAME_DESIGN, разд. 6.4).
 */
import { describe, it, expect } from "vitest";
import {
  asNumber,
  datetimesMatch,
  normalizeCell,
  numbersMatch,
  precisionOf,
  toIsoDateTime,
  valuesMatch,
} from "@/engine/values";

describe("normalizeCell", () => {
  it("типографский минус и плюс", () => {
    expect(normalizeCell("−38000")).toBe(normalizeCell(-38000));
    expect(normalizeCell("+5")).toBe(normalizeCell(5));
  });
});

describe("asNumber", () => {
  it("числа и числовые строки", () => {
    expect(asNumber(47)).toBe(47);
    expect(asNumber(" 47.5 ")).toBe(47.5);
    expect(asNumber("−38000")).toBe(-38000);
    expect(asNumber("47 руб")).toBeNull();
    expect(asNumber(null)).toBeNull();
    expect(asNumber(NaN)).toBeNull();
  });
});

describe("toIsoDateTime / precisionOf", () => {
  it.each([
    ["2026-11-20", "2026-11-20", "day"],
    ["2026-11-20 14", "2026-11-20 14", "hour"],
    ["2026-11-20 14:05", "2026-11-20 14:05", "minute"],
    ["2026-11-20 14:05:00", "2026-11-20 14:05:00", "second"],
    ["2026-11-20T14:05:00.123", "2026-11-20 14:05:00", "second"],
    ["30.09.2016", "2016-09-30", "day"],
    ["30.09.2016 08:15", "2016-09-30 08:15", "minute"],
  ])("%s → %s (%s)", (input, iso, precision) => {
    expect(toIsoDateTime(input)).toBe(iso);
    expect(precisionOf(input)).toBe(precision);
  });

  it("не даты", () => {
    for (const v of ["", "К404ТО", "2026-13-01", "20261120", 20261120, null]) {
      expect(toIsoDateTime(v), String(v)).toBeNull();
    }
  });
});

describe("numbersMatch: по модулю с допуском", () => {
  it("'−38000' и '38000' равны", () => {
    expect(numbersMatch("38000", "−38000")).toBe(true);
    expect(numbersMatch(-38000, 38000)).toBe(true);
  });

  it("допуск по умолчанию 0.01, задаётся явно", () => {
    expect(numbersMatch(98.6, 98.61)).toBe(true);
    expect(numbersMatch(98.6, 98.7)).toBe(false);
    expect(numbersMatch(98.6, 98.7, 0.5)).toBe(true);
    expect(numbersMatch(100, 101, 0)).toBe(false);
  });

  it("нечисловые значения не совпадают", () => {
    expect(numbersMatch("80", "восемьдесят")).toBe(false);
    expect(numbersMatch("80", null)).toBe(false);
  });
});

describe("datetimesMatch: префикс точности", () => {
  it("точность day: дата совпадает с моментом того же дня", () => {
    expect(datetimesMatch("2026-11-20", "2026-11-20 14:05:00", "day")).toBe(true);
    expect(datetimesMatch("2026-11-20", "2026-11-21 00:00:00", "day")).toBe(false);
  });

  it("точность по умолчанию — как записан ожидаемый ответ", () => {
    expect(datetimesMatch("2026-11-20", "2026-11-20 14:05:00")).toBe(true);
    expect(datetimesMatch("2026-11-18 23:34", "2026-11-18 23:34:59")).toBe(true);
    expect(datetimesMatch("2026-11-18 23:34:00", "2026-11-18 23:34:59")).toBe(false);
  });

  it("грубее точности — не совпадает", () => {
    expect(datetimesMatch("2026-11-20 14:05:00", "2026-11-20", "minute")).toBe(false);
  });

  it("'ДД.ММ.ГГГГ' приводится к ISO", () => {
    expect(datetimesMatch("2016-09-30", "30.09.2016", "day")).toBe(true);
  });

  it("не даты сравниваются как текст", () => {
    expect(datetimesMatch("никогда", "Никогда")).toBe(true);
    expect(datetimesMatch("2026-11-20", "никогда")).toBe(false);
  });
});

describe("valuesMatch", () => {
  it("person и text — точное совпадение после нормализации", () => {
    expect(valuesMatch("person", "Вальц Ирина Петровна", " вальц ирина петровна ")).toBe(true);
    expect(valuesMatch("text", "Береговая, 4", "береговая, 4")).toBe(true);
    expect(valuesMatch("text", "Береговая, 4", "Береговая 4")).toBe(false);
    expect(valuesMatch("text", "47", 47)).toBe(true);
  });

  it("number и datetime — со своими параметрами", () => {
    expect(valuesMatch("number", "300000", -300000)).toBe(true);
    expect(valuesMatch("number", "300000", 300001, { tolerance: 5 })).toBe(true);
    expect(valuesMatch("datetime", "2026-11-18 23:34:00", "2026-11-18 23:34:00")).toBe(true);
    expect(valuesMatch("datetime", "2026-11-18", "2026-11-18 23:34:00", { precision: "day" })).toBe(true);
  });
});
