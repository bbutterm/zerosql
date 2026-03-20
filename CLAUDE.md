# ZeroSQL — Руководство для разработки

## Что это

Браузерный SQL-детектив. Игрок пишет SQL-запросы для расследования дел. Вся логика — клиентская: SQL.js (SQLite → WASM) работает в браузере, серверной части нет.

## Ключевые правила

### Engine Facade

Ядро (`src/engine/`) доступно **только через фасад** `src/engine/index.ts`.

```
✅ import { initEngine, executeSQL } from "@/engine"
❌ import { executeQuery } from "@/engine/database"
❌ import { SCHEMA_SQL } from "@/engine/schema"
```

Исключение — тесты: они проверяют внутренние модули напрямую.

Проверка отсутствия прямых импортов:
```bash
grep -rn "from.*engine/database\|from.*engine/schema\|from.*engine/seed\|from.*engine/mission-runner\|from.*engine/validator\|from.*engine/table-guard" src/ --include="*.ts" --include="*.tsx" | grep -v "engine/index" | grep -v "__tests__"
# Должно быть пусто
```

### Фасад — API

| Функция | Что делает |
|---------|-----------|
| `initEngine()` | Создаёт БД, накатывает schema + seed, возвращает `{ db, schema, foreignKeys }` |
| `executeSQL(db, sql, unlockedTables)` | Проверяет доступ к таблицам + выполняет запрос. При блокировке — `QueryResult` с `error`, не исключение |
| `checkMissionProgress(mission, result, db, completed)` | Проверяет цели миссии по результату запроса |
| `isMissionComplete(mission, completed)` | Завершена ли миссия |
| `getSchema(db)` / `getForeignKeys(db)` | Данные для UI-панели схемы |

Реэкспортируемые типы: `QueryResult`, `TableInfo`, `ForeignKey`, `Mission`, `ValidationOutcome`, `ObjectiveResult`.

### Поток данных

```
Игрок вводит SQL → game-store.executeSQL()
  → engine.executeSQL(db, sql, unlockedTables)
    → table-guard: проверка доступа
    → database: выполнение запроса
  ← QueryResult
  → engine.checkMissionProgress(mission, result, db, completed)
    → mission-runner: проверка целей по порядку
    → validator: 5 типов валидации
  ← ObjectiveResult[]
  → обновление стора (прогресс, фидбек, нарратив)
```

### Валидация миссий

Система проверяет **результат запроса**, не текст SQL. 5 типов:
- `row_count` — количество строк (eq/gte/lte)
- `contains_columns` — наличие столбцов
- `contains_value` — значение в столбце
- `exact_match` — точное совпадение с reference-запросом
- `custom` — произвольная функция

Цели проверяются **последовательно** по полю `order`. За один запрос можно пройти максимум одну цель.

### Контроль доступа к таблицам

Каждая миссия определяет `unlockedTables`. Table guard парсит SQL (FROM, JOIN, INTO, UPDATE) и блокирует обращения к закрытым таблицам. `sqlite_master` всегда доступна.

## Структура проекта

- `src/engine/` — ядро (фасад + 6 внутренних модулей)
- `src/data/missions/` — определения миссий
- `src/stores/game-store.ts` — Zustand стор (единственный потребитель фасада)
- `src/components/game/` — UI компоненты (все `'use client'`)
- `src/types/` — TypeScript типы
- `src/__tests__/` — 125 тестов

## Команды

```bash
npm run dev        # Дев-сервер
npm run build      # Продакшен-сборка
npm run test:run   # 125 тестов
npm run lint       # ESLint
```

## Ограничения при изменениях

- **Внутренние модули engine** (`database.ts`, `validator.ts`, ...) — менять можно, но фасад (`index.ts`) должен оставаться единственной точкой входа для внешних потребителей
- **Типы** (`src/types/`) — реэкспортируются через фасад, расширять можно
- **Миссии** — добавлять в `src/data/missions/`, обязательно писать тесты
- **UI компоненты** — взаимодействуют только через Zustand стор, не импортируют из engine напрямую
- **Тесты** — после любых изменений: `npm run test:run` (все 125 должны быть зелёными)

## Известные баги

1. **Миссия 3, `obj-money-trail`**: seed = 1 транзакция (suspect_id=1, suspicious=1), валидатор ожидает >= 2. Фикс: добавить транзакцию в seed или понизить порог.
2. **SQLite LIKE + кириллица**: case-insensitive работает только для ASCII. `'%груз%'` не найдёт `'Груз'`. Обходной путь в валидаторе — альтернативный паттерн `'%порт%'`.
