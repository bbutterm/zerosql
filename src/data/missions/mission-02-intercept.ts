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
        type: "custom",
        check: (result) => {
          const hasContent = result.columns.some(
            (c) => c.toLowerCase() === "content"
          );
          if (!hasContent) {
            return {
              passed: false,
              message: "Нужно содержание сообщений. Включите столбец content.",
            };
          }
          if (result.rowCount < 5) {
            return {
              passed: false,
              message:
                "Помеченных сообщений больше. Проверьте условие фильтрации.",
            };
          }
          return {
            passed: true,
            message:
              "Вот они — все подозрительные переговоры. Теперь сузим поиск.",
          };
        },
      },
    },
    {
      id: "obj-communications",
      description:
        "Найдите перехваченные сообщения, связанные с контрабандой (упоминание груза или порта, январь 2024)",
      hint: "Ищите в communications по content с LIKE и фильтруйте по дате",
      order: 2,
      validation: {
        type: "custom",
        check: (result) => {
          const hasContent = result.columns.some(
            (c) => c.toLowerCase() === "content"
          );
          if (!hasContent) {
            return {
              passed: false,
              message: "Где содержание сообщений? Нужен столбец content.",
            };
          }
          const contentIdx = result.columns.findIndex(
            (c) => c.toLowerCase() === "content"
          );
          const hasGruz = result.rows.some((r) =>
            String(r[contentIdx]).toLowerCase().includes("груз")
          );
          const hasPort = result.rows.some((r) =>
            String(r[contentIdx]).toLowerCase().includes("порт")
          );
          if (!hasGruz && !hasPort) {
            return {
              passed: false,
              message:
                "Ищите сообщения про «груз» или «порт». Они там есть.",
            };
          }
          return {
            passed: true,
            message:
              "Отлично. Ворон координировал операцию через Тень. Цепочка выстраивается.",
          };
        },
      },
    },
    {
      id: "obj-voronov-contacts",
      description:
        "Определите, с кем переписывался Воронов (suspect_id = 1) — выведите имена собеседников",
      hint: "JOIN communications с suspects по to_suspect_id, где from_suspect_id = 1",
      order: 3,
      validation: {
        type: "custom",
        check: (result) => {
          const hasName = result.columns.some(
            (c) => c.toLowerCase() === "name"
          );
          if (!hasName) {
            return {
              passed: false,
              message:
                "Нужны имена собеседников. Используйте JOIN с таблицей suspects.",
            };
          }
          if (result.rowCount < 2) {
            return {
              passed: false,
              message:
                "У Воронова больше контактов. Проверьте запрос.",
            };
          }
          return {
            passed: true,
            message:
              "Ворон на связи с несколькими членами группировки. Сеть контактов ширится.",
          };
        },
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
