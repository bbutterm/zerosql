import { describe, it, expect } from "vitest";
import { splitName } from "@/components/story/portrait";
import { characters } from "@/data";

describe("учётная карточка: ФИО персонажа", () => {
  it("отчество не дублируется, если оно уже есть в name", () => {
    expect(splitName({ name: "Лев Борисович Ратников", patronymic: "Борисович" })).toEqual({ surname: "Ратников", given: "Лев Борисович" });
    expect(splitName({ name: "Лев Ратников", patronymic: "Борисович" })).toEqual({ surname: "Ратников", given: "Лев Борисович" });
    expect(splitName({ name: "МИРА" })).toEqual({ surname: "МИРА", given: "" });
    for (const c of characters) {
      const words = splitName(c).given.split(" ").filter(Boolean);
      expect(new Set(words).size, c.id).toBe(words.length);
    }
  });
});
