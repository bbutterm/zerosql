import type { Mission } from "@/types/mission";

export const firstCaseMission: Mission = {
  id: "mission-01-port",
  title: "Тени порта — Связи",
  subtitle: "Кто стоит за контрабандой на Причале 3?",
  briefing: `Детектив, у нас горячее дело.

15 января на Причале 3 была перехвачена партия незадекларированного груза. Таможенная декларация — поддельная. Камеры порта зафиксировали подозрительную активность ночью.

Информатор «Сеть» (Рыбаков) задержан на месте, но он — мелкая рыба. Нам нужен организатор.

Для начала нужно установить всех причастных. Вам открыт доступ к таблице связей «подозреваемые — преступления» (crime_suspects). Используйте JOIN, чтобы соединить данные.`,

  objectives: [
    {
      id: "obj-crime-details",
      description:
        "Найдите подробности дела о контрабанде (преступление с типом «контрабанда»)",
      order: 1,
      validation: {
        type: "contains_value",
        column: "type",
        value: "контрабанда",
      },
      storyReward:
        "Вот оно. Дело №1 — контрабанда через порт. Тяжесть 7 из 10.",
    },
    {
      id: "obj-suspects-in-crime",
      description:
        "Найдите всех причастных к этому делу (таблица crime_suspects)",
      hint: "Отфильтруйте crime_suspects по crime_id дела о контрабанде",
      order: 2,
      validation: {
        type: "custom",
        check: (result) => {
          const hasRole = result.columns.some(
            (c) => c.toLowerCase() === "role"
          );
          if (!hasRole) {
            return {
              passed: false,
              message: "Нужны роли участников. Ищите в таблице crime_suspects.",
            };
          }
          if (result.rowCount !== 3) {
            return {
              passed: false,
              message: `Найдено ${result.rowCount}. В деле замешаны ровно трое.`,
            };
          }
          return {
            passed: true,
            message:
              "Трое: организатор, исполнитель и соучастник. Но кто есть кто? Нужны имена — используйте JOIN с suspects.",
          };
        },
      },
    },
    {
      id: "obj-find-organizer",
      description: "Установите имя организатора контрабанды",
      hint: "JOIN crime_suspects с suspects, отфильтруйте по role = 'организатор'",
      order: 3,
      validation: {
        type: "contains_value",
        column: "name",
        value: "Воронов Игорь Петрович",
      },
      storyReward:
        "Воронов. Кличка — «Ворон». Бизнесмен на бумаге, криминальный босс на деле.",
    },
  ],

  hints: [
    "Начните с таблицы crimes — найдите дело с type = 'контрабанда'.",
    "JOIN crime_suspects ON crimes.id = crime_suspects.crime_id — связывает дела с подозреваемыми.",
    "Добавьте ещё JOIN suspects ON crime_suspects.suspect_id = suspects.id для имён.",
    "WHERE role = 'организатор' — фильтр по роли в преступлении.",
  ],

  narrativeOnComplete: `Хорошая работа, детектив.

Вы установили всех трёх участников: Воронов — организатор, Бык — исполнитель, Сеть — пешка на месте.

Но одних связей мало. Нам нужны доказательства — переговоры, переписка. Отдел перехвата передаёт вам доступ к таблице коммуникаций.

Посмотрим, о чём они говорили.`,

  difficulty: "easy",
  sqlConcepts: ["JOIN", "WHERE", "AND"],
  unlockedTables: ["suspects", "crimes", "crime_suspects"],
};
