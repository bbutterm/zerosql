import type { Mission } from "@/types/mission";

export const tutorialMission: Mission = {
  id: "mission-00-tutorial",
  title: "Первый день в участке",
  subtitle: "Обучение работе с базой данных",
  briefing: `Добро пожаловать в аналитический отдел полиции DataCity, детектив.

Меня зовут капитан Морозов. Я буду вашим куратором.

Ваш главный инструмент — база данных полицейского управления. Здесь всё: подозреваемые, улики, перехваченные переговоры, финансовые транзакции.

Забудьте про мышку. Здесь всё решает SQL.

Начнём с основ. Освойтесь с системой, прежде чем мы дадим вам настоящее дело.`,

  objectives: [
    {
      id: "obj-see-tables",
      description: "Просмотрите список таблиц в базе данных",
      hint: "В SQLite системные данные хранятся в таблице sqlite_master",
      order: 1,
      validation: {
        type: "contains_value",
        column: "name",
        value: "suspects",
      },
      storyReward:
        "Вижу, вы нашли нашу систему. 8 таблиц — вся жизнь этого города.",
    },
    {
      id: "obj-list-suspects",
      description: "Получите полный список подозреваемых",
      order: 2,
      validation: {
        type: "row_count",
        expected: 15,
        comparison: "eq",
      },
      storyReward:
        "15 душ на карандаше. Запомните эти лица — скоро они вам пригодятся.",
    },
    {
      id: "obj-wanted",
      description: "Найдите всех подозреваемых со статусом «в розыске»",
      hint: "Используйте WHERE для фильтрации по столбцу status",
      order: 3,
      validation: {
        type: "exact_match",
        referenceQuery: "SELECT * FROM suspects WHERE status = 'в розыске'",
      },
      storyReward:
        "Трое в бегах. Медведь, Жук и Призрак. Город большой, но не настолько.",
    },
    {
      id: "obj-count-crimes",
      description: "Узнайте, сколько открытых дел в системе",
      hint: "Функция COUNT(*) считает количество записей",
      order: 4,
      validation: {
        type: "custom",
        check: (result) => {
          if (result.rowCount !== 1) {
            return {
              passed: false,
              message: "Нужно одно число — общее количество.",
            };
          }
          const val = Number(result.rows[0]?.[0]);
          return {
            passed: val === 6,
            message:
              val === 6
                ? "Шесть открытых дел. Не считая тех, о которых мы ещё не знаем."
                : "Не совсем. Проверьте условие фильтрации.",
          };
        },
      },
    },
  ],

  hints: [
    "SELECT * FROM table_name — покажет все данные из таблицы.",
    "SELECT name, type FROM sqlite_master WHERE type='table' — список таблиц.",
    "WHERE column = 'значение' — фильтрует строки по условию.",
    "SELECT COUNT(*) FROM crimes WHERE status = 'открыто' — считает записи.",
  ],

  narrativeOnComplete: `Неплохо для первого дня, детектив.

Вы освоили основы. Теперь вы знаете, как искать данные, фильтровать и считать.

Но это была разминка. В DataCity происходят вещи посерьёзнее.

Загляните в следующее дело, когда будете готовы. Группировка «BASE» не будет ждать.`,

  difficulty: "tutorial",
  sqlConcepts: ["SELECT", "FROM", "WHERE", "COUNT"],
  unlockedTables: ["suspects", "crimes"],
};
