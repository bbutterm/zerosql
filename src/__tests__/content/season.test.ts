/**
 * Контент сезона «Полынья»: дела, каст, справочник, достижения.
 *
 * Дела пишут разные авторы параллельно, поэтому здесь — сквозные правила,
 * которые не видит тест отдельного дела (src/__tests__/cases/cNN.test.ts).
 * Заготовка дела (objectives пустой) проходит всё, кроме требования иметь
 * основную задачу; справочник для заготовок проверяется мягко.
 */
import { describe, it, expect } from "vitest";
import {
  caseShort,
  validateCaseContent,
  validateSeasonContent,
  collectEvidenceIds,
  EMOTIONS,
  NARRATOR,
  PLAYER,
} from "@/engine";
import type { AchievementKind, CaseDef, Difficulty } from "@/types/case";
import {
  achievements,
  cases,
  characterById,
  characters,
  getCase,
  handbook,
  handbookByCase,
  handbookById,
} from "@/data";

/** Канонический порядок дел (TECH_SPEC разд. 2, GAME_DESIGN разд. 5 и 11.3) */
const CASE_IDS = [
  "case-00-nulevoy-etazh",
  "case-01-med",
  "case-02-minus-41",
  "case-03-polyarnaya",
  "case-04-mertvaya-dusha",
  "case-05-nomer-3312",
  "case-06-polynya",
  "case-07-sluzhebnaya-kvartira",
  "case-08-prizrak",
  "case-09-matryoshka",
  "case-10-kopirka",
  "case-11-chernovik",
  "case-12-pervoe-solntse",
];

const DIFFICULTIES = ["tutorial", "easy", "medium", "hard", "expert"] as const satisfies readonly Difficulty[];

const ACHIEVEMENT_KINDS = [
  "case_solved",
  "case_no_hints",
  "case_three_stars",
  "protocol_first_try",
  "secrets_found",
  "all_optional",
  "season_complete",
  "flag",
  "counter",
  "event",
] as const satisfies readonly AchievementKind[];

const SQL_NAME_RE = /^[a-z][a-z0-9_]*$/;
const HANDBOOK_ID_RE = /^[hw]\.[a-z0-9_]+$/;

/** Заготовка: автор ещё не написал задачи */
const isStub = (c: CaseDef) => c.objectives.length === 0;

/** Единственная жалоба валидатора, которая прощается заготовке */
const STUB_PROBLEM = "нет ни одной основной задачи";

/** Убирает из списка проблем то, что заготовкам простительно */
function withoutStubGaps(problems: string[]): string[] {
  return problems.filter((p) => {
    const owner = cases.find((c) => p.startsWith(`${c.id}: `));
    return !(owner && isStub(owner) && p.includes(STUB_PROBLEM));
  });
}

const words = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

describe("дела сезона", () => {
  it("13 дел с каноническими id; NN в id равен order", () => {
    expect(cases.map((c) => c.id)).toEqual(CASE_IDS);
    cases.forEach((c, i) => {
      expect(c.order, c.id).toBe(i);
      expect(c.id.slice(5, 7), c.id).toBe(String(c.order).padStart(2, "0"));
    });
  });

  it("getCase находит дело по id", () => {
    expect(getCase("case-06-polynya")?.order).toBe(6);
    expect(getCase("case-99-nope")).toBeUndefined();
  });

  it("validateSeasonContent: проблем нет (заготовкам прощается только отсутствие задач)", () => {
    expect(withoutStubGaps(validateSeasonContent(cases, characters))).toEqual([]);
  });

  const evidence = collectEvidenceIds(cases);
  it.each(cases.map((c) => [c.id, c] as const))("validateCaseContent: %s", (_id, c) => {
    expect(withoutStubGaps(validateCaseContent(c, characters, evidence))).toEqual([]);
  });

  it("код, акт, сложность и время начала", () => {
    cases.forEach((c, i) => {
      expect(c.code.trim(), c.id).not.toBe("");
      expect(c.title.trim(), c.id).not.toBe("");
      expect(c.briefing.trim(), c.id).not.toBe("");
      expect(DIFFICULTIES, c.id).toContain(c.difficulty);
      expect([1, 2, 3], c.id).toContain(c.act);
      expect(c.date, c.id).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/);
      if (i > 0) {
        const prev = cases[i - 1];
        expect(c.act, `${c.id}: акт не может идти назад`).toBeGreaterThanOrEqual(prev.act);
        expect(c.date >= prev.date, `${c.id}: дата ${c.date} раньше ${prev.id} (${prev.date})`).toBe(true);
      }
    });
  });

  it("таблицы накапливаются, newTables — ровно новые таблицы дела", () => {
    let previous: string[] = [];
    for (const c of cases) {
      const fresh = c.newTables ?? [];
      expect(new Set(c.tables).size, `${c.id}: таблица указана дважды`).toBe(c.tables.length);
      for (const t of c.tables) expect(t, c.id).toMatch(SQL_NAME_RE);
      expect(
        previous.filter((t) => !c.tables.includes(t)),
        `${c.id}: пропали таблицы предыдущего дела`
      ).toEqual([]);
      expect(
        fresh.filter((t) => previous.includes(t)),
        `${c.id}: в newTables таблицы, открытые раньше`
      ).toEqual([]);
      expect(
        c.tables.filter((t) => !previous.includes(t) && !fresh.includes(t)),
        `${c.id}: новые таблицы не отмечены в newTables`
      ).toEqual([]);
      expect(
        (c.writableTables ?? []).filter((t) => !c.tables.includes(t)),
        `${c.id}: writableTables вне tables`
      ).toEqual([]);
      previous = c.tables;
    }
  });
});

describe("персонажи", () => {
  it("id уникальны, snake_case, не служебные", () => {
    const ids = characters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(ids).not.toContain(NARRATOR);
    expect(ids).not.toContain(PLAYER);
    expect(characterById.size).toBe(ids.length);
  });

  it.each(characters.map((c) => [c.id, c] as const))("карточка %s заполнена по контракту", (_id, c) => {
    for (const text of [c.name, c.shortName, c.role, c.bio]) expect(text.trim()).not.toBe("");
    expect(c.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);

    expect(c.emotions.length).toBeGreaterThan(0);
    expect(new Set(c.emotions).size).toBe(c.emotions.length);
    expect(c.emotions.filter((e) => !(EMOTIONS as readonly string[]).includes(e))).toEqual([]);
    for (const list of Object.values(c.variants ?? {})) {
      expect(list.filter((e) => !c.emotions.includes(e))).toEqual([]);
    }

    if (c.age !== undefined) expect(Number.isInteger(c.age) && c.age > 0).toBe(true);
    // Учётная карточка: «Имя, отчество» — полное имя пишется с отчеством
    if (c.patronymic) expect(c.name.split(/\s+/)).toContain(c.patronymic);
    if (c.dossierNote) expect(words(c.dossierNote)).toBeLessThanOrEqual(12);
  });

  it("каждый говорящий в сценариях и каждый автор подсказки — персонаж из characters.json", () => {
    const unknown = new Set<string>();
    for (const c of cases) {
      for (const scene of c.scenes) {
        for (const line of scene.lines) {
          if (line.speaker !== NARRATOR && line.speaker !== PLAYER && !characterById.has(line.speaker)) {
            unknown.add(`${c.id}: ${line.id} → ${line.speaker}`);
          }
        }
      }
      for (const o of c.objectives) {
        for (const hint of o.hints) {
          if (hint.by !== undefined && !characterById.has(hint.by)) unknown.add(`${c.id}: ${o.id} → ${hint.by}`);
        }
      }
    }
    expect([...unknown]).toEqual([]);
  });
});

describe("справочник", () => {
  it("id уникальны и вида h.* / w.*, поля заполнены", () => {
    const ids = handbook.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(handbookById.size).toBe(ids.length);
    for (const e of handbook) {
      expect(e.id).toMatch(HANDBOOK_ID_RE);
      for (const text of [e.title, e.summary, e.syntax, e.example]) expect(text.trim(), e.id).not.toBe("");
      for (const p of e.pitfalls ?? []) expect(p.trim(), e.id).not.toBe("");
    }
  });

  it("concepts дел — id статей, и ни одна статья не открывается дважды", () => {
    const opened = cases.flatMap((c) => c.concepts);
    for (const id of opened) expect(id).toMatch(HANDBOOK_ID_RE);
    expect(opened.filter((id, i) => opened.indexOf(id) !== i)).toEqual([]);
  });

  it("файл cNN.json содержит только статьи, которые открывает дело cNN", () => {
    for (const [short, entries] of Object.entries(handbookByCase)) {
      const owner = cases.find((c) => caseShort(c) === short);
      expect(owner, `handbook/${short}.json: нет дела с таким order`).toBeDefined();
      expect(
        entries.map((e) => e.id).filter((id) => !owner?.concepts.includes(id)),
        `handbook/${short}.json: статьи не из concepts дела`
      ).toEqual([]);
    }
  });

  it("у пролога и у дел с задачами на каждую concepts есть статья", () => {
    for (const c of cases) {
      if (c.order !== 0 && isStub(c)) continue; // заготовка: статьи напишет автор дела
      expect(
        c.concepts.filter((id) => !handbookById.has(id)),
        `${c.id}: нет статей справочника`
      ).toEqual([]);
    }
  });

  it("concept задачи — статья, открытая этим или более ранним делом", () => {
    const openedBefore = new Set<string>();
    for (const c of cases) {
      for (const id of c.concepts) openedBefore.add(id);
      for (const o of c.objectives) {
        if (o.concept === undefined) continue;
        expect(openedBefore.has(o.concept), `${c.id}/${o.id}: «${o.concept}» ещё не открыт`).toBe(true);
        expect(handbookById.has(o.concept), `${c.id}/${o.id}: нет статьи «${o.concept}»`).toBe(true);
      }
    }
  });
});

describe("достижения", () => {
  it("id уникальны, вид из AchievementKind, параметр-дело существует", () => {
    const ids = achievements.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of achievements) {
      expect(a.id).toMatch(/^ach\.[a-z0-9_]+$/);
      expect(a.title.trim(), a.id).not.toBe("");
      expect(a.description.trim(), a.id).not.toBe("");
      expect(ACHIEVEMENT_KINDS as readonly string[], a.id).toContain(a.kind);
      // flag / counter / event — имя флага, «счётчик:порог» или id события; у прочих строка — id дела
      const byCase = !["flag", "counter", "event"].includes(a.kind);
      if (byCase && typeof a.param === "string" && !/^\d+$/.test(a.param)) {
        expect(getCase(a.param), `${a.id}: нет дела «${a.param}»`).toBeDefined();
      }
      if (a.kind === "counter") expect(String(a.param), a.id).toMatch(/^[a-z_]+:\d+$/);
      if (a.kind === "flag" || a.kind === "event") expect(String(a.param ?? "").trim(), a.id).not.toBe("");
    }
  });
});
