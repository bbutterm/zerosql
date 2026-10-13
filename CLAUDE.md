# ZeroSQL — Руководство для разработки

## Что это

Браузерный SQL-детектив. Игрок пишет SQL-запросы для расследования дел. Вся логика — клиентская: SQL.js (SQLite → WASM) работает в браузере, серверной части нет.

## Ключевые правила

### Engine Facade

Ядро (`src/engine/`) доступно **только через фасад** `src/engine/index.ts`.

```
✅ import { initEngine, executeSQL } from "@/engine"
❌ import { executeQuery } from "@/engine/database"
❌ import { createEngineClient } from "@/engine/runtime/client"
```

Ядро импортируют только сторы (`src/stores/game/*`, `src/stores/archive.ts`). UI-компоненты и маршруты работают через стор `@/stores/game`.

Исключение — тесты: они проверяют внутренние модули напрямую.

Проверка отсутствия прямых импортов:
```bash
grep -rnE "from \"@/engine/|from \"\.\./engine/|from \"\.\./\.\./engine/" src/ --include="*.ts" --include="*.tsx" | grep -v "^src/engine/" | grep -v "__tests__"
# Должно быть пусто
grep -rln "from \"@/engine\"" src/components src/app --include="*.ts" --include="*.tsx" | grep -v "^src/app/lab/"
# Тоже пусто: экраны и компоненты ядро не импортируют (кроме /lab — витрины компонентов)
```

### Фасад — API (v2)

| Что | Где |
|-----|-----|
| `createEngineClient()` | Ядро в Web Worker: мир (кеш IndexedDB или генерация), `openCase`, `run` (политика, задачи, реестр, тайники, линтер, query_log), патчи, часы, журнал |
| `executeSQL(db, sql, unlockedTables, opts)` | Проверка доступа + выполнение; ошибки — в `QueryResult.error`, не исключения |
| `checkCaseProgress`, `scanSeen`, `checkProtocol`, `checkAccusation`, допрос, часы, оценка, звания | Чистые функции правил дела |
| `createEmptyDatabase()`, `getSchema(db)`, `getForeignKeys(db)` | Пустая база и схема для лаборатории |

### Поток данных

```
Экран (src/app/play, src/components/*) → стор @/stores/game (useGame / useGameView, действия)
  → createEngineClient (worker) → база дела, проверка задач, реестр увиденного, тайники
  ← Evaluation → стор: прогресс, сцены, реплики (barks), тосты, разбор
```

Маршруты: `/` — 18+, холодное открытие, окно входа; `/play` — журнал дел ⇄ стол ⇄ разбор ⇄ финал; `/archive` — свободный архив; `/lab` — витрина компонентов; `/game` → `/play`.

### Валидация миссий

Система проверяет **результат запроса**, не текст SQL. 10 типов:
- `row_count` — количество строк (eq/gte/lte)
- `contains_columns` — наличие столбцов
- `contains_value` — значение в столбце
- `exact_match` — точное совпадение с reference-запросом
- `requires_column` — столбец существует + опционально minRows
- `contains_substring` — подстрока в любой строке столбца
- `value_check` — числовое сравнение конкретной ячейки [row][col]
- `compound` — все подправила должны пройти
- `any_of` — хотя бы одно подправило проходит
- `custom` — произвольная функция (только в TS-миссиях)

Цели проверяются **последовательно** по полю `order`. За один запрос можно пройти максимум одну цель.

### Контроль доступа к таблицам

Каждое дело определяет `tables` (CaseDef). Table guard парсит SQL (FROM, JOIN, INTO, UPDATE) и блокирует обращения к закрытым таблицам. `sqlite_master` всегда доступна.

## Структура проекта

- `src/engine/` — ядро (фасад `index.ts`, правила дела, мир `world/`, рантайм `runtime/`)
- `src/data/` — сезон: дела `cases/`, персонажи, методичка `handbook/`, достижения, тайники, тексты финала
- `src/stores/game/` — стор v2 (Zustand, сохранение, селекторы, звуковая шина `sfx.ts`); `src/stores/archive.ts` — свободный архив
- `src/app/play/` — экраны игры поверх стора; `src/components/` — презентационные компоненты (`'use client'`)
- `src/types/` — TypeScript типы
- `src/__tests__/` — тесты (v1-схема и сид остались только фикстурой `helpers/v1-*.ts` для тестов валидатора)

## Команды

```bash
npm run dev        # Дев-сервер
npm run build      # Продакшен-сборка
npm run test:run   # все тесты
npm run lint       # ESLint
```

## Ограничения при изменениях

- **Внутренние модули engine** (`database.ts`, `validator.ts`, ...) — менять можно, но фасад (`index.ts`) должен оставаться единственной точкой входа для внешних потребителей
- **Типы** (`src/types/`) — реэкспортируются через фасад, расширять можно
- **Дела** — папка `src/data/cases/case-NN-<slug>/` (`case.json` + `script.json`), обязательно писать тесты
- **UI компоненты** — взаимодействуют только через Zustand стор, не импортируют из engine напрямую
- **Тесты** — после любых изменений: `npm run test:run` (все должны быть зелёными)

## Известные баги

1. **SQLite LIKE + кириллица**: case-insensitive работает только для ASCII. `'%груз%'` не найдёт `'Груз'`. Обходной путь в валидаторе — альтернативный паттерн `'%порт%'`.
