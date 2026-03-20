# ZeroSQL — Браузерный SQL-детектив

Нуарная детективная игра, где **SQL-запросы — это геймплей**. Игрок — аналитик-детектив в городе DataCity, расследующий дела преступной группировки «БАЗА».

## Стек

| Слой | Технология |
|------|-----------|
| Фреймворк | Next.js 16 (App Router, Turbopack) |
| База данных | SQL.js — SQLite → WASM, работает целиком в браузере |
| Редактор | CodeMirror 6, подсветка SQL, автодополнение |
| Стейт | Zustand 5 + localStorage persistence |
| UI | shadcn/ui + Tailwind CSS, тёмная нуарная тема |
| Тесты | Vitest — 125 тестов |

## Архитектура

```
┌─────────────────────────────────────────────────┐
│  UI Components (src/components/game/)            │
│  sql-editor, results-table, case-panel, ...      │
└──────────────────────┬──────────────────────────┘
                       │ zustand
┌──────────────────────▼──────────────────────────┐
│  Game Store (src/stores/game-store.ts)           │
│  Состояние игры, прогресс миссий, история        │
└──────────────────────┬──────────────────────────┘
                       │ import from @/engine
┌──────────────────────▼──────────────────────────┐
│  Engine Facade (src/engine/index.ts)             │
│  Единая точка входа в ядро                       │
│                                                  │
│  initEngine()          — БД + schema + seed      │
│  executeSQL()          — доступ + выполнение     │
│  checkMissionProgress()— валидация целей          │
│  isMissionComplete()   — завершение миссии        │
│  getSchema() / getForeignKeys() — для UI         │
└──────────────────────┬──────────────────────────┘
                       │ обёртка
┌──────────────────────▼──────────────────────────┐
│  Engine Internals (не импортировать напрямую)    │
│  database.ts — SQL.js обёртка                    │
│  schema.ts   — DDL (8 таблиц)                   │
│  seed.ts     — INSERT-данные (115 строк)         │
│  table-guard.ts — контроль доступа к таблицам    │
│  validator.ts   — 5 типов валидации              │
│  mission-runner.ts — прогресс по целям           │
└─────────────────────────────────────────────────┘
```

**Весь код за пределами `src/engine/` импортирует только через фасад `@/engine`.**
Тесты обращаются к внутренним модулям напрямую — это допустимо.

## Структура проекта

```
src/
├── app/                     # Next.js App Router
│   ├── layout.tsx
│   ├── page.tsx             # Главная
│   └── game/page.tsx        # Игровой экран (client-side)
│
├── engine/                  # Ядро игры
│   ├── index.ts             # ★ Фасад — единственный публичный API
│   ├── database.ts          # SQL.js: инициализация, выполнение, схема
│   ├── schema.ts            # DDL — 8 таблиц
│   ├── seed.ts              # Данные — 115 строк
│   ├── table-guard.ts       # Блокировка таблиц по миссии
│   ├── validator.ts         # row_count, contains_columns, contains_value, exact_match, custom
│   └── mission-runner.ts    # Последовательная проверка целей
│
├── data/missions/           # Определения миссий
│   ├── index.ts
│   ├── mission-00-tutorial.ts   # SELECT, WHERE, COUNT
│   ├── mission-01-first-case.ts # JOIN
│   ├── mission-02-intercept.ts  # LIKE, AND/OR
│   └── mission-03-money.ts      # SUM, GROUP BY
│
├── stores/
│   └── game-store.ts        # Zustand — стейт + persistence
│
├── components/
│   ├── game/                # Игровые компоненты
│   └── ui/                  # shadcn/ui
│
├── types/                   # TypeScript типы
│   ├── database.ts          # QueryResult, TableInfo, ForeignKey
│   ├── game.ts              # GameState, QueryHistoryEntry
│   └── mission.ts           # Mission, Objective, ValidationRule
│
└── __tests__/               # 125 тестов
    ├── engine/              # Тесты ядра
    └── missions/            # Тесты проходимости миссий
```

## База данных (8 таблиц)

| Таблица | Записей | Описание |
|---------|---------|----------|
| `suspects` | 15 | Подозреваемые с позывными |
| `locations` | 8 | Локации города |
| `crimes` | 8 | Дела (контрабанда, отмывание, кражи...) |
| `evidence` | 10 | Улики |
| `crime_suspects` | 19 | Связи подозреваемый ↔ дело + роль |
| `communications` | 12 | Перехваченные сообщения |
| `transactions` | 12 | Финансовые операции |
| `org_members` | 12 | Структура группировки «БАЗА» |

## Миссии

| # | Название | SQL-концепции | Разблокированные таблицы |
|---|----------|--------------|------------------------|
| 0 | Первый день в участке | SELECT, WHERE, COUNT | suspects, crimes |
| 1 | Тени порта — Связи | JOIN, WHERE, AND | + crime_suspects |
| 2 | Тени порта — Перехват | LIKE, AND/OR | + communications |
| 3 | Тени порта — Деньги | SUM, GROUP BY | + transactions |

Каждая миссия — набор последовательных целей. Игрок пишет SQL, система проверяет **результат запроса** (не текст SQL). Любой корректный запрос засчитывается.

## Добавление новой миссии

1. Создать `src/data/missions/mission-XX-name.ts` по типу `Mission`
2. Добавить в массив `src/data/missions/index.ts`
3. Типы валидации: `row_count`, `contains_columns`, `contains_value`, `exact_match`, `custom`
4. Написать тесты в `src/__tests__/missions/`

## Команды

```bash
npm run dev        # Дев-сервер
npm run build      # Продакшен-сборка
npm run test:run   # Запуск всех тестов (125)
npm run test       # Тесты в watch-режиме
npm run lint       # ESLint
```

## Известные баги

1. **Mission 3, цель `obj-money-trail`** — seed содержит 1 транзакцию для suspect_id=1 + suspicious=1, валидатор ожидает >= 2. Игрок застревает, следуя подсказке.
2. **SQLite LIKE + кириллица** — `LIKE '%груз%'` не найдёт `'Груз'` (case-insensitive только для ASCII). Не блокирует прохождение, но может путать.
