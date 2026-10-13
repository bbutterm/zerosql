import { describe, it, expect } from "vitest";
import { Rng, formatDateTime, parseDateTime, addMinutes } from "@/engine/world/rng";
import { feminineSurname, randomName, randomPlate, randomPhone, uniqueFactory, PLATE_LETTERS } from "@/engine/world/pools";

describe("Rng", () => {
  it("детерминирован: одно зерно → одна последовательность", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it("int в границах включительно", () => {
    const rng = new Rng(1);
    const values = Array.from({ length: 2000 }, () => rng.int(3, 5));
    expect(Math.min(...values)).toBe(3);
    expect(Math.max(...values)).toBe(5);
  });

  it("fork независим от дальнейших вызовов родителя", () => {
    const a = new Rng(7);
    const forkA = a.fork("calls").next();
    const b = new Rng(7);
    const forkB = b.fork("calls").next();
    expect(forkA).toBe(forkB);
    expect(new Rng(7).fork("calls").next()).not.toBe(new Rng(7).fork("cams").next());
  });

  it("weighted уважает веса", () => {
    const rng = new Rng(3);
    const picks = Array.from({ length: 3000 }, () => rng.weighted([["a", 9], ["b", 1]] as const));
    const share = picks.filter((p) => p === "a").length / picks.length;
    expect(share).toBeGreaterThan(0.85);
  });

  it("sample без повторов", () => {
    const s = new Rng(5).sample([1, 2, 3, 4, 5, 6], 4);
    expect(new Set(s).size).toBe(4);
  });
});

describe("даты", () => {
  it("формат и разбор в UTC: секунды пишутся всегда", () => {
    const d = parseDateTime("2026-10-03 23:10");
    expect(formatDateTime(d)).toBe("2026-10-03 23:10:00");
    expect(formatDateTime(addMinutes(d, 55))).toBe("2026-10-04 00:05:00");
    expect(formatDateTime(parseDateTime("2026-12-22 02:47:19"))).toBe("2026-12-22 02:47:19");
    expect(() => parseDateTime("02.12.2026")).toThrow(RangeError);
  });
});

describe("pools", () => {
  it("женские формы фамилий", () => {
    expect(feminineSurname("Иванов")).toBe("Иванова");
    expect(feminineSurname("Соловьёв")).toBe("Соловьёва");
    expect(feminineSurname("Ильин")).toBe("Ильина");
    expect(feminineSurname("Высоцкий")).toBe("Высоцкая");
    expect(feminineSurname("Ким")).toBe("Ким");
    expect(feminineSurname("Шевченко")).toBe("Шевченко");
  });

  it("ФИО согласовано по роду", () => {
    const rng = new Rng(11);
    for (let i = 0; i < 200; i++) {
      const n = randomName(rng);
      if (n.gender === "F") expect(n.middle).toMatch(/(?:вна|чна)$/);
      else expect(n.middle).toMatch(/(?:вич|ич)$/);
      expect(n.full).toBe(`${n.last} ${n.first} ${n.middle}`);
    }
  });

  it("госномер: допустимые буквы и регион", () => {
    const plate = randomPlate(new Rng(2), "47");
    expect(plate).toMatch(/^[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2} 47$/);
    expect(PLATE_LETTERS).toHaveLength(12);
  });

  it("телефон в едином формате", () => {
    expect(randomPhone(new Rng(9))).toMatch(/^\+7 9\d{2} \d{3}-\d{2}-\d{2}$/);
  });

  it("uniqueFactory не повторяет и не выдаёт зарезервированное", () => {
    let i = 0;
    const seq = ["a", "b", "a", "c", "d"];
    const next = uniqueFactory(() => seq[i++ % seq.length], String, ["c"]);
    expect([next(), next(), next()]).toEqual(["a", "b", "d"]);
  });
});
