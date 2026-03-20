import type { Mission } from "@/types/mission";

export const interceptMission: Mission = {
  id: "mission-02-intercept",
  title: "Тени порта — Перехват",
  subtitle: "Что скрывают перехваченные переговоры?",
  briefing: `Детектив, отдел перехвата открыл вам доступ к таблице communications — перехваченным сообщениям подозреваемых.

Каналы разные: телефон, мессенджеры, личные встречи под записью. Часть сообщений уже помечена как подозрительные (flagged).

Ваша задача — найти переписку, связанную с контрабандой на Причале 3. Кто координировал операцию? Кто отдавал приказы?

Ищите упоминания груза, порта и январских дат.`,

  objectives: [
    {
      id: "obj-flagged-comms",
      description: "Найдите все помеченные (flagged) перехваченные сообщения",
      hint: "В таблице communications есть поле flagged (0 или 1)",
      order: 1,
      validation: {
        type: "compound",
        rules: [
          { type: "requires_column", column: "content" },
          { type: "row_count", expected: 5, comparison: "gte" },
        ],
        successMessage:
          "Вот они — все подозрительные переговоры. Теперь сузим поиск.",
      },
    },
    {
      id: "obj-communications",
      description:
        "Найдите перехваченные сообщения, связанные с контрабандой (упоминание груза или порта, январь 2024)",
      hint: "Ищите в communications по content с LIKE и фильтруйте по дате",
      order: 2,
      validation: {
        type: "compound",
        rules: [
          { type: "requires_column", column: "content" },
          {
            type: "any_of",
            rules: [
              { type: "contains_substring", column: "content", substring: "груз" },
              { type: "contains_substring", column: "content", substring: "порт" },
            ],
            successMessage: "",
          },
        ],
        successMessage:
          "Отлично. Ворон координировал операцию через Тень. Цепочка выстраивается.",
      },
    },
    {
      id: "obj-voronov-contacts",
      description:
        "Определите, с кем переписывался Воронов (suspect_id = 1) — выведите имена собеседников",
      hint: "JOIN communications с suspects по to_suspect_id, где from_suspect_id = 1",
      order: 3,
      validation: {
        type: "compound",
        rules: [
          { type: "requires_column", column: "name" },
          { type: "row_count", expected: 2, comparison: "gte" },
        ],
        successMessage:
          "Ворон на связи с несколькими членами группировки. Сеть контактов ширится.",
      },
    },
  ],

  hints: [
    "SELECT * FROM communications WHERE flagged = 1 — помеченные сообщения.",
    "LIKE '%груз%' — ищет подстроку в тексте сообщения.",
    "WHERE timestamp LIKE '2024-01%' — фильтр по январю 2024.",
    "JOIN suspects ON communications.to_suspect_id = suspects.id — имя получателя.",
  ],

  narrativeOnComplete: `Превосходно, детектив.

Переговоры подтверждают: Воронов лично координировал доставку через Тень и Быка. Шифрованные сообщения, одноразовые каналы — они знали, что мы слушаем.

Но слова — это слова. Нам нужны деньги. Финансовый отдел открывает вам доступ к таблице транзакций.

Деньги не лгут. Проследите финансовый след.`,

  difficulty: "easy",
  sqlConcepts: ["LIKE", "WHERE", "JOIN", "AND/OR"],
  unlockedTables: ["suspects", "crimes", "crime_suspects", "communications"],
};
