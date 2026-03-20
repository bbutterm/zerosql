# ZeroSQL — Результаты тестирования

> Дата: 2026-03-19 | Vitest 3.2.4 | 125/125 PASS | ~5s

## Сводка

| Категория | Тестов | Статус |
|-----------|--------|--------|
| Schema & Seed | 25 | PASS |
| Query Execution | 9 | PASS |
| Validator | 19 | PASS |
| Table Guard | 13 | PASS |
| Mission Runner | 9 | PASS |
| Миссия 0 — Туториал | 12 | PASS |
| Миссия 1 — Связи | 11 | PASS |
| Миссия 2 — Перехват | 13 | PASS |
| Миссия 3 — Деньги | 14 | PASS |
| **ИТОГО** | **125** | **ALL PASS** |

## Архитектура тестирования

Тесты обращаются к внутренним модулям engine напрямую (в обход фасада) — это допустимо и по дизайну. Фасад (`src/engine/index.ts`) тестируется косвенно через интеграционные тесты миссий.

```
__tests__/
├── engine/
│   ├── database.test.ts       # SQL.js обёртка (9)
│   ├── schema-seed.test.ts    # DDL + данные (25)
│   ├── validator.test.ts      # 5 типов валидации (19)
│   ├── table-guard.test.ts    # Контроль доступа (13)
│   └── mission-runner.test.ts # Прогресс целей (9)
│
├── missions/
│   ├── mission-00.test.ts     # Туториал (12)
│   ├── mission-01.test.ts     # Связи (11)
│   ├── mission-02.test.ts     # Перехват (13)
│   └── mission-03.test.ts     # Деньги (14)
│
└── helpers/
    └── setup-db.ts            # Инициализация тестовой БД
```

## Покрытие по модулям

### Schema & Seed — 25 тестов

- 8 таблиц создаются корректно
- Все столбцы с правильными именами и типами
- CHECK-ограничения: severity 1-10, gender М/Ж
- Составной PK: crime_suspects (crime_id, suspect_id)
- FK: crimes → locations, crime_suspects → crimes/suspects
- Идемпотентность схемы (повторный запуск)
- Количество записей: suspects(15), locations(8), crimes(8), evidence(10), crime_suspects(19), communications(12), transactions(12), org_members(12)
- Целостность FK: нет orphan-записей

### Query Execution — 9 тестов

- SELECT → columns, rows, rowCount
- Пустой результат: rowCount=0
- Ошибочный SQL → error, пустые массивы
- Multi-statement → последний результат
- executionTimeMs >= 0
- getTableSchema/getForeignKeys — интроспекция

### Validator — 19 тестов

- row_count: eq, gte, lte — pass и fail
- contains_columns: точное и case-insensitive совпадение
- contains_value: значение найдено / не найдено / столбец отсутствует
- exact_match: совпадение, разные данные, разное количество столбцов
- custom: делегирование check-функции
- Error result → всегда fail

### Table Guard — 13 тестов

- Парсинг: FROM, JOIN, INSERT INTO, UPDATE
- Case-insensitive ключевые слова
- Дедупликация таблиц, lowercase
- unlockedTables=null → всё разрешено
- sqlite_master — всегда разрешена
- Блокировка: allowed:false + имя таблицы

### Mission Runner — 9 тестов

- Пропуск завершённых целей
- Проверка по порядку (order)
- Максимум 1 цель за вызов
- storyReward приоритетнее сообщения валидатора
- isMissionComplete: true/false

## Покрытие по миссиям

### Миссия 0 — Туториал (12 тестов)

| Цель | SQL-концепт | Валидация |
|------|-------------|-----------|
| obj-see-tables | sqlite_master | contains_value |
| obj-list-suspects | SELECT * | row_count eq 15 |
| obj-wanted | WHERE status | exact_match |
| obj-count-crimes | COUNT + WHERE | custom |

Полный прогон 4/4 целей последовательно.

### Миссия 1 — Связи (11 тестов)

| Цель | SQL-концепт | Валидация |
|------|-------------|-----------|
| obj-crime-details | WHERE type | contains_value |
| obj-suspects-in-crime | WHERE crime_id | custom (3 rows + role) |
| obj-find-organizer | JOIN + WHERE role | contains_value |

Полный прогон 3/3 целей последовательно.

### Миссия 2 — Перехват (13 тестов)

| Цель | SQL-концепт | Валидация |
|------|-------------|-----------|
| obj-flagged-comms | WHERE flagged | custom (>=5 + content) |
| obj-communications | LIKE | custom (груз/порт) |
| obj-voronov-contacts | JOIN communications | custom (>=2 + name) |

Полный прогон 3/3. Задокументирован баг с кириллицей в LIKE.

### Миссия 3 — Деньги (14 тестов)

| Цель | SQL-концепт | Валидация |
|------|-------------|-----------|
| obj-suspicious-transactions | WHERE suspicious | custom (>=5 + amount) |
| obj-money-trail | WHERE suspect_id AND suspicious | custom (>=2 + amount) |
| obj-total-amount | SUM(amount) | custom (1 row, >0) |

Полный прогон 3/3 через workaround (account LIKE '%VORONOV%'). Прогон по подсказкам застревает на цели 2.

## Известные баги

### Bug #1 — Mission 3 obj-money-trail (Critical)

Seed содержит 1 транзакцию для `suspect_id=1 AND suspicious=1`. Валидатор ожидает `rowCount >= 2`. Игрок, следующий подсказке, застрянет.

Фикс: добавить транзакцию в seed или понизить порог валидатора.

### Bug #2 — SQLite LIKE + кириллица (Medium)

SQLite LIKE case-insensitive только для ASCII. `'%груз%'` не найдёт `'Груз'`. Не блокирует прохождение — валидатор принимает альтернативный паттерн `'%порт%'`.

## Команды

```bash
npm run test:run   # Все тесты (125)
npm run test       # Watch-режим
```
