import type { CaseDef, CaseObjective, HintDef, ProtocolDef } from "@/types/case";
import type { CharacterDef } from "@/types/story";

/**
 * Небольшое корректное дело для тестов движка v2: две основные задачи,
 * одна дополнительная, протокол из четырёх пропусков и связный сюжет.
 * Таблица мира: people (см. PEOPLE_SQL).
 */

export const PEOPLE_SQL = `
  CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT, city TEXT, salary REAL);
  INSERT INTO people VALUES
    (1, 'Анна Лебедева', 'Северск', 120.5),
    (2, 'Борис Ёлкин', 'Северск', 80),
    (3, 'Вера Котова', 'Южный', 95.25),
    (4, 'Глеб Орлов', NULL, 80);
`;

export const CHARACTERS: CharacterDef[] = [
  {
    id: "marta",
    name: "Марта Сергеевна Белова",
    shortName: "Марта",
    role: "Начальник аналитического отдела",
    accent: "#7aa2f7",
    bio: "Строгая, но справедливая.",
    emotions: ["neutral", "angry"],
  },
  {
    id: "lev",
    name: "Лев Орлов",
    shortName: "Лев",
    role: "Архивариус",
    accent: "#9ece6a",
    bio: "Знает, где что лежит.",
    emotions: ["neutral"],
  },
];

export const hints = (n = 3): HintDef[] =>
  Array.from({ length: n }, (_, i) => ({ text: `Подсказка ${i + 1}`, by: i % 2 ? "lev" : "marta" }));

export const objective = (patch: Partial<CaseObjective> & Pick<CaseObjective, "id" | "order">): CaseObjective => ({
  task: `Задача ${patch.id}`,
  validation: { type: "row_count", expected: 4, comparison: "eq" },
  hints: hints(),
  success: `Готово: ${patch.id}`,
  solution: "SELECT * FROM people",
  ...patch,
});

export const PROTOCOL: ProtocolDef = {
  statements: ["Деньги получил {payee} из города {city}.", "Сумма — {amount}, посредник — {broker}."],
  blanks: [
    { id: "payee", kind: "person", options: ["Анна Лебедева", "Борис Ёлкин", "Вера Котова"], answer: "Борис Ёлкин" },
    { id: "city", kind: "text", options: ["Северск", "Южный"], answer: "Северск" },
    { id: "amount", kind: "number", options: ["80", "95.25", "120.5"], answer: "80" },
    { id: "broker", kind: "person", options: ["Глеб Орлов", "Анна Лебедева"], answer: "Глеб Орлов", requireSeen: false },
  ],
  successScene: "outro",
  failureLines: ["Не сходится.", "Ещё раз.", "Думай."],
};

export function makeCase(patch: Partial<CaseDef> = {}): CaseDef {
  return {
    id: "case-03-test",
    order: 3,
    act: 1,
    code: "Дело № 03",
    title: "Тестовое дело",
    subtitle: "Для движка",
    date: "2026-12-14 02:44",
    difficulty: "medium",
    concepts: ["select"],
    tables: ["people"],
    newTables: ["people"],
    briefing: "Найти всех.",
    introScene: "intro",
    objectives: [
      objective({
        id: "obj-all",
        order: 1,
        validation: { type: "row_count", expected: 4, comparison: "eq" },
        evidence: { id: "ev.c03.list", title: "Список", text: "Все сотрудники", kind: "record" },
        sceneAfter: "found",
      }),
      objective({
        id: "obj-north",
        order: 2,
        validation: { type: "column_values", columns: ["name"], values: ["Анна Лебедева", "Борис Ёлкин"] },
      }),
      objective({
        id: "obj-extra",
        order: 99,
        optional: true,
        validation: { type: "cell_value", value: 95.25 },
        evidence: { id: "ev.c03.salary", title: "Зарплата", text: "95.25", kind: "document" },
      }),
    ],
    protocol: PROTOCOL,
    scenes: [
      {
        id: "intro",
        lines: [
          { id: "c03.intro.001", speaker: "marta", emotion: "neutral", text: "Начнём." },
          { id: "c03.intro.002", speaker: "player", text: "Слушаю." },
        ],
        next: "briefing",
      },
      {
        id: "briefing",
        lines: [{ id: "c03.briefing.001", speaker: "narrator", text: "Ночь." }],
      },
      {
        id: "found",
        lines: [{ id: "c03.found.001", speaker: "lev", text: "Нашёл?" }],
        choices: [
          { id: "ask", text: "Спросить", goto: "confront", requires: ["ev.c03.list"] },
          { id: "leave", text: "Уйти", goto: "briefing" },
        ],
      },
      {
        id: "confront",
        lines: [{ id: "c03.confront.001", speaker: "lev", emotion: "scared", text: "Это не я." }],
        present: { prompt: "Докажи", correct: ["ev.c03.list"], success: "outro", failure: "confront_fail" },
      },
      {
        id: "confront_fail",
        lines: [{ id: "c03.confront_fail.001", speaker: "lev", emotion: "smug", text: "Мимо." }],
        next: "confront",
      },
      {
        id: "outro",
        lines: [{ id: "c03.outro.001", speaker: "marta", emotion: "happy", text: "Дело закрыто." }],
      },
    ],
    ...patch,
  };
}
