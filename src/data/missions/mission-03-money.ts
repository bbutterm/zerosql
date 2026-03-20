import type { Mission } from "@/types/mission";

export const moneyTrailMission: Mission = {
  id: "mission-03-money",
  title: "Тени порта — Деньги",
  subtitle: "Проследите финансовый след контрабанды",
  briefing: `Детектив, финансовый отдел передал вам доступ к таблице transactions — все банковские переводы, связанные с подозреваемыми.

Каждая транзакция имеет отправителя, получателя, сумму и пометку «подозрительная» (suspicious).

Воронов — бизнесмен. Его деньги проходят через подставные фирмы: «БизнесКонсалт», казино «Джокер», ООО «Восток». Найдите финансовые улики.

Помните: деньги оставляют следы, которые нельзя стереть.`,

  objectives: [
    {
      id: "obj-suspicious-transactions",
      description:
        "Найдите все подозрительные транзакции (suspicious = 1)",
      order: 1,
      validation: {
        type: "compound",
        rules: [
          { type: "requires_column", column: "amount" },
          { type: "row_count", expected: 5, comparison: "gte" },
        ],
        successMessage:
          "Вот они — все подозрительные переводы. Миллионы проходят мимо налоговой.",
      },
    },
    {
      id: "obj-money-trail",
      description:
        "Найдите подозрительные транзакции именно Воронова (suspect_id = 1)",
      hint: "WHERE suspect_id = 1 AND suspicious = 1",
      order: 2,
      validation: {
        type: "compound",
        rules: [
          { type: "requires_column", column: "amount" },
          { type: "row_count", expected: 2, comparison: "gte" },
        ],
        successMessage:
          "Деньги не лгут. Миллионы идут через подставные фирмы. Ворон отмывает через всю сеть.",
      },
    },
    {
      id: "obj-total-amount",
      description:
        "Подсчитайте общую сумму подозрительных транзакций Воронова",
      hint: "Используйте SUM(amount) с GROUP BY или WHERE",
      order: 3,
      validation: {
        type: "compound",
        rules: [
          { type: "row_count", expected: 1, comparison: "eq" },
          { type: "value_check", row: 0, col: 0, comparison: "gt", expected: 0 },
        ],
        successMessage:
          "Вот сколько прошло через руки Ворона. Достаточно для обвинения.",
      },
    },
  ],

  hints: [
    "SELECT * FROM transactions WHERE suspicious = 1 — все подозрительные.",
    "Добавьте AND suspect_id = 1 — только транзакции Воронова.",
    "SELECT SUM(amount) FROM transactions WHERE suspect_id = 1 AND suspicious = 1 — итого.",
  ],

  narrativeOnComplete: `Отличная работа, детектив.

Вы собрали полную картину: Воронов организовал контрабанду через порт, используя Быка как силовика и Сеть как пешку на месте. Деньги уходили через «БизнесКонсалт» и казино «Джокер».

Но это только верхушка айсберга. Группировка BASE куда больше, чем одна контрабандная операция.

Убийство информатора на Причале 3, схема отмывания через казино, фиктивные инвестиции — всё связано.

Продолжайте копать. DataCity рассчитывает на вас.`,

  difficulty: "easy",
  sqlConcepts: ["SUM", "WHERE", "AND", "GROUP BY"],
  unlockedTables: [
    "suspects",
    "crimes",
    "crime_suspects",
    "communications",
    "transactions",
  ],
};
