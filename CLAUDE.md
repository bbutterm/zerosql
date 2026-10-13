# ZeroSQL: Полынья — руководство для разработки

## Что это

Браузерный SQL-детектив «ZeroSQL: Полынья»: 13 дел (пролог, десять дел, интерлюдия, финал). Игрок пишет SQL к ведомственной системе «Зеркало». Вся логика клиентская: мир (~55 тыс. строк) генерируется детерминированно в браузере, sql.js (SQLite → WASM) работает в Web Worker, серверной части нет.

## Слои и правило фасада

```
UI (src/app, src/components)  →  стор (src/stores/game)  →  фасад @/engine  →  внутренности src/engine/*
```

- Код вне `src/engine` импортирует ядро **только** из `@/engine` (`src/engine/index.ts`). Исключение — тесты.
- Компоненты ядро не импортируют вовсе: данные — из стора (`useGame`, `useGameView` + селекторы) или через пропсы.
- Стор работает с ядром через `createEngineClient()` (`src/engine/runtime/`): режим `worker` в браузере, `in-process` в тестах. Остальные функции фасада — чистые вычисления (часы, события, протокол, очки), тесты и `/lab`.

```
✅ import { createEngineClient, checkProtocol } from "@/engine"
❌ import { generateWorld } from "@/engine/world/generate"
❌ import { gameStore } from "@/stores/game" внутри src/engine
```

Проверка прямых импортов (должно быть пусто):

```bash
grep -rnE "from ['\"](@/engine/|(\.\./)+engine/)" src --include=*.ts --include=*.tsx | grep -v "^src/engine/" | grep -v "^src/__tests__/"
```

## Ядро (src/engine)

| Модуль | Что делает |
|--------|-----------|
| `runtime/` | клиент ядра: воркер, сессия дела, журнал (воспроизведение базы), кеш мира в IndexedDB, таймаут 3 с |
| `world/` | схема мира, генератор, посадки фактов по делам (`plants/`), шум (`noise/`), сюжетные патчи (`patches.ts`), горизонт (TEMP VIEW «будущих» строк) |
| `execute`, `table-guard`, `sql-lint`, `sql-errors`, `sql-functions` | выполнение, доступ и запись по таблицам дела, линтер-реплики, разбор ошибок, Unicode-LIKE/lower |
| `validator`, `case-runner` | правила задач (`column_values`, `rows_match`, `cell_value`, `pin`, `seen`, `slot`, `view_match`, `table_state`, `compound`, `any_of`, `not` …), задачи по порядку, условные (`when`) и дополнительные |
| `protocol`, `board`, `interrogation` | протокол с пакетной сверкой, карточки и обвинение, допрос «Наушник» |
| `live`, `clock`, `cron` | живые события, игровые часы и остановки, расписание zero (М6) |
| `story`, `scoring`, `secrets`, `query-log` | целостность контента, оценка и звания, тайники, журнал запросов |

Проверяется **результат** запроса, а не текст SQL. Основные задачи идут по `order`; дополнительные проверяются на каждом запросе.

## Стор (src/stores/game)

`store.ts` — фабрика `createGameStore()`, единственный владелец состояния: профиль, настройки, сезон (раскрытые дела, флаги, патчи и `query_log` прошлых дел, улики, тайники, отметки), активное дело (сцены, допрос, задачи, карточки, протокол, журнал ядра). Сохранение — localStorage (`zerosql.season.v2`, `persist.ts` с миграцией). База не сохраняется: дело собирается заново из мира, патчей и журнала. `selectors.ts` — производные виды для экранов, `rules.ts` — чистые правила, `endings.ts` — концовки.

## Контент

```
src/data/
  cases/case-NN-<slug>/case.json    задачи (solution обязателен), протокол, обвинения, события, часы
  cases/case-NN-<slug>/script.json  сцены, выборы, предъявления, допросы
  characters.json, handbook/cNN.json, secrets.json, achievements.json, endings.ts
```

- Новое дело — папка + две строки в `cases/index.ts`, тест `src/__tests__/cases/cNN.test.ts` (контракт — `docs/design/TECH_SPEC.md`, разд. 4–5).
- Ответы протокола должны встречаться в результатах эталонов (`requireSeen`).
- Ассеты: `public/voice/<lineId>.mp3`, `public/portraits/<id>/<emotion>.webp` (`<emotion>_outdoor.webp`), `public/backgrounds/<id>.webp`. Нет файла — заглушка.

## Документы

`docs/design/` — `GAME_DESIGN.md` (библия, 380 КБ: читать точечно через grep), `TECH_SPEC.md` (контракт), `UI_ART_DIRECTION.md`, `EASTER_EGGS.md`. `docs/production/` — арт- и голосовая библии, манифесты (`npm run manifest`).

## Команды

```bash
npm run dev        # дев-сервер
npm run build      # продакшен-сборка
npm run test:run   # все тесты (1704)
npm run lint       # ESLint
npm run manifest   # манифесты ассетов в docs/production
npm run qa -- --base-url http://localhost:3150 --shots-dir /tmp/qa   # сезон в браузере (Playwright)
```

Перед коммитом зелёными должны быть `npx tsc --noEmit -p .`, `npm run lint`, `npm run test:run`, `npm run build`. Коммиты — на английском; тексты игры и комментарии — на русском.

## Автопрохождение

- `src/__tests__/store/season-playthrough.test.ts` — весь сезон через стор за секунды (входит в `test:run`).
- `scripts/qa-playthrough.mjs` — то же в настоящем браузере через интерфейс; состояние читает из localStorage, действует кликами по `data-testid`. Списки «строк для допросов» (`CARD_SQL`, `ACCUSE_SQL`, `PIN_SQL`) в обоих файлах одинаковые — меняя контент допросов, обновите оба.

## Известные пробелы

- Финальная доска (узлы N1–N9, запись пинов в `evidence_registry`) не реализована: флаг A и концовка «Первое солнце» недостижимы.
- Отметки «Зоркий глаз», «Снайпер», «Ювелир», «Фикус», «Все десять» ждут механик, которых нет.
- Нет блокнота аномалий, оценки изящества запроса и утренней сводки.
- Озвучка: пролог и дела 1–8 у Даши, Нины, Мельника, МИРЫ и Ирины; остальные голоса ждут создания (`PENDING_SLOT` в `docs/production/tts-voices.json`), реплики Тохи и Ратникова в прологе — от пилотных голосов. Портретов и фонов нет.
- Экрана «Отправка пакета» (задача 11.7) нет: отправка — выбором в сценах финала.
