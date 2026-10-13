/**
 * Контент сезона «Полынья» — единая точка входа для стора и тестов.
 *
 *   cases         CaseDef[]       — src/data/cases/<id>/{case,script}.json
 *   characters    CharacterDef[]  — src/data/characters.json
 *   handbook      HandbookEntry[] — src/data/handbook/cNN.json
 *   achievements  AchievementDef[] — src/data/achievements.json
 *   secrets       SecretDef[]     — src/data/secrets.json (тайники, EASTER_EGGS.md)
 */
import type { AchievementDef, SecretDef } from "@/types/case";
import type { CharacterDef } from "@/types/story";

import charactersJson from "./characters.json";
import achievementsJson from "./achievements.json";
import secretsJson from "./secrets.json";

export { cases, getCase } from "./cases";
export { handbook, handbookById, handbookByCase } from "./handbook";

/** Массив объектов с обязательными строковыми полями — минимальная проверка формы JSON */
function records(source: string, raw: unknown, required: readonly string[]): Record<string, unknown>[] {
  if (!Array.isArray(raw)) throw new Error(`${source}: ожидается массив`);
  return raw.map((item: unknown, i) => {
    const record = item as Record<string, unknown> | null;
    if (typeof record !== "object" || record === null) throw new Error(`${source}[${i}]: ожидается объект`);
    for (const key of required) {
      if (typeof record[key] !== "string") throw new Error(`${source}[${i}]: нет строки «${key}»`);
    }
    return record;
  });
}

/**
 * Канонический каст. Приведение типа: JSON даёт string[] вместо Emotion[];
 * что каждая эмоция входит в EMOTIONS, проверяет тест контента.
 */
export const characters: CharacterDef[] = records("characters.json", charactersJson, [
  "id",
  "name",
  "shortName",
  "role",
  "accent",
  "bio",
]).map((c, i) => {
  if (!Array.isArray(c.emotions) || c.emotions.length === 0) {
    throw new Error(`characters.json[${i}]: нужен непустой массив emotions`);
  }
  return c as unknown as CharacterDef;
});

/** Персонаж по id */
export const characterById: ReadonlyMap<string, CharacterDef> = new Map(characters.map((c) => [c.id, c]));

/** Достижения. Приведение типа: kind в JSON — строка; допустимость вида проверяет тест контента */
export const achievements: AchievementDef[] = records("achievements.json", achievementsJson, [
  "id",
  "title",
  "description",
  "kind",
]) as unknown as AchievementDef[];

/** Тайники. Приведение типа: trigger в JSON — ValidationRule без литеральных типов; правила проверяет тест */
export const secrets: SecretDef[] = records("secrets.json", secretsJson, ["id", "title", "text"]) as unknown as SecretDef[];
