/**
 * Игровые часы: сдвиг времени и русский формат.
 */
import { describe, it, expect } from "vitest";
import { advanceClock, formatClockRu, parseClock, formatClock } from "@/engine/clock";

describe("parseClock", () => {
  it("корректная строка → UTC-дата", () => {
    expect(parseClock("2026-12-14 02:44")?.toISOString()).toBe("2026-12-14T02:44:00.000Z");
  });

  it("неверный формат и несуществующие даты → null", () => {
    for (const bad of [
      "",
      "2026-12-14",
      "2026-12-14T02:44",
      "2026-12-14 2:44",
      "2026-13-01 00:00",
      "2026-02-30 10:00",
      "2026-12-14 24:00",
      "2026-12-14 10:60",
    ]) {
      expect(parseClock(bad), bad).toBeNull();
    }
  });

  it("29 февраля — только в високосный год", () => {
    expect(parseClock("2028-02-29 12:00")).not.toBeNull();
    expect(parseClock("2026-02-29 12:00")).toBeNull();
  });

  it("formatClock — обратная операция", () => {
    expect(formatClock(parseClock("2026-01-05 07:09") as Date)).toBe("2026-01-05 07:09");
  });
});

describe("advanceClock", () => {
  it("минуты внутри часа", () => {
    expect(advanceClock("2026-12-14 02:44", 2)).toBe("2026-12-14 02:46");
  });

  it("переход через час, полночь, месяц и год", () => {
    expect(advanceClock("2026-12-14 02:58", 5)).toBe("2026-12-14 03:03");
    expect(advanceClock("2026-12-14 23:59", 1)).toBe("2026-12-15 00:00");
    expect(advanceClock("2026-11-30 23:30", 45)).toBe("2026-12-01 00:15");
    expect(advanceClock("2026-12-31 23:58", 3)).toBe("2027-01-01 00:01");
    expect(advanceClock("2028-02-28 23:00", 60)).toBe("2028-02-29 00:00");
  });

  it("назад во времени и ноль", () => {
    expect(advanceClock("2027-01-01 00:01", -3)).toBe("2026-12-31 23:58");
    expect(advanceClock("2026-12-14 02:44", 0)).toBe("2026-12-14 02:44");
  });

  it("дробные минуты округляются, NaN — без сдвига", () => {
    expect(advanceClock("2026-12-14 02:44", 1.6)).toBe("2026-12-14 02:46");
    expect(advanceClock("2026-12-14 02:44", NaN)).toBe("2026-12-14 02:44");
  });

  it("сутки и больше", () => {
    expect(advanceClock("2026-12-14 02:44", 24 * 60 * 3)).toBe("2026-12-17 02:44");
  });

  it("переход на летнее время у игрока ни на что не влияет (всё в UTC)", () => {
    // В Европе 2026-03-29 02:00 часы переводят вперёд
    expect(advanceClock("2026-03-29 01:30", 60)).toBe("2026-03-29 02:30");
    expect(advanceClock("2026-10-25 02:30", 60)).toBe("2026-10-25 03:30");
  });

  it("неверная строка — RangeError", () => {
    expect(() => advanceClock("вчера", 5)).toThrow(RangeError);
  });
});

describe("formatClockRu", () => {
  it("пример из дизайна", () => {
    expect(formatClockRu("2026-12-14 02:44")).toBe("пн, 14 декабря · 02:44");
  });

  it("все дни недели", () => {
    const week = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
    week.forEach((day, i) => {
      expect(formatClockRu(`2026-12-${String(14 + i).padStart(2, "0")} 10:00`).startsWith(`${day}, `)).toBe(true);
    });
  });

  it("месяцы в родительном падеже, число без ведущего нуля", () => {
    const months = [
      "января", "февраля", "марта", "апреля", "мая", "июня",
      "июля", "августа", "сентября", "октября", "ноября", "декабря",
    ];
    months.forEach((month, i) => {
      const text = formatClockRu(`2026-${String(i + 1).padStart(2, "0")}-01 09:05`);
      expect(text).toMatch(new RegExp(`^[а-я]{2}, 1 ${month} · 09:05$`));
    });
  });

  it("полночь и 23:59", () => {
    expect(formatClockRu("2026-01-01 00:00")).toBe("чт, 1 января · 00:00");
    expect(formatClockRu("2026-12-31 23:59")).toBe("чт, 31 декабря · 23:59");
  });

  it("неверная строка — RangeError", () => {
    expect(() => formatClockRu("2026-12-14")).toThrow(RangeError);
  });
});
