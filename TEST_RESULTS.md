# ZeroSQL — Результаты тестирования

> Дата: 2026-03-19 | Vitest 3.2.4 | 125/125 PASS | Время: ~5s

---

## Сводка

| Категория | Тестов | Статус |
|-----------|--------|--------|
| Schema & Seed | 25 | ✅ PASS |
| Query Execution | 9 | ✅ PASS |
| Validator | 19 | ✅ PASS |
| Table Guard | 13 | ✅ PASS |
| Mission Runner | 9 | ✅ PASS |
| Миссия 0 — Туториал | 12 | ✅ PASS |
| Миссия 1 — Связи | 11 | ✅ PASS |
| Миссия 2 — Перехват | 13 | ✅ PASS |
| Миссия 3 — Деньги | 14 | ✅ PASS |
| **ИТОГО** | **125** | **✅ ALL PASS** |

---

## Найденные баги

| # | Серьёзность | Описание | Файл |
|---|-------------|----------|------|
| 1 | 🔴 Critical | Миссия 3, цель `obj-money-trail` непроходима по подсказке (seed: 1 транзакция, валидатор: >= 2) | `seed.ts` / `mission-03-money.ts` |
| 2 | 🟡 Medium | SQLite LIKE case-sensitive для кириллицы — `'%груз%'` не находит `'Груз'` | `seed.ts` |

---

## Часть 1: Фичи

### Schema & Seed — 25 тестов ✅

**Глубина проработки: ВЫСОКАЯ** — полная схема, seed, FK, constraints

- [x] Создаются ровно 8 таблиц
- [x] suspects: 10 столбцов с правильными именами
- [x] crimes: severity CHECK 1-10
- [x] suspects: gender CHECK М/Ж
- [x] crime_suspects: составной PK (crime_id, suspect_id)
- [x] FK: crimes.location_id → locations.id
- [x] FK: crime_suspects → crimes + suspects
- [x] Схема идемпотентна (повторный запуск)
- [x] suspects: 15 записей
- [x] locations: 8 записей
- [x] crimes: 8 записей
- [x] evidence: 10 записей
- [x] crime_suspects: 19 записей
- [x] communications: 12 записей
- [x] transactions: 12 записей
- [x] org_members: 12 записей
- [x] 3 подозреваемых «в розыске»
- [x] 6 открытых дел
- [x] suspect_id=1 = Воронов Игорь Петрович
- [x] Контрабанда существует (crime id=1)
- [x] 3 участника контрабанды
- [x] Организатор — Воронов (suspect_id=1)
- [x] Нет orphan FK в crime_suspects
- [x] Нет orphan FK в communications
- [x] Нет orphan FK в transactions

### Query Execution (database.ts) — 9 тестов ✅

**Глубина проработки: СРЕДНЯЯ** — core функции без edge cases

- [x] SELECT возвращает columns, rows, rowCount
- [x] Пустой результат: rowCount=0, columns=[]
- [x] Ошибочный SQL → error, пустые массивы
- [x] Multi-statement → последний результат
- [x] DDL/DML без ошибки
- [x] executionTimeMs >= 0
- [x] getTableSchema: 8 таблиц с столбцами
- [x] suspects: PK id, NOT NULL name
- [x] getForeignKeys: FK для таблиц со ссылками

### Validator (validator.ts) — 19 тестов ✅

**Глубина проработки: ВЫСОКАЯ** — все 5 типов валидации

- [x] row_count eq: pass при совпадении
- [x] row_count eq: fail при несовпадении
- [x] row_count gte: pass при >=
- [x] row_count gte: fail при <
- [x] row_count lte: pass при <=
- [x] row_count lte: fail при >
- [x] Error result → всегда fail
- [x] contains_columns: pass, все найдены
- [x] contains_columns: pass, case-insensitive
- [x] contains_columns: fail, перечисляет отсутствующие
- [x] contains_value: pass, значение найдено
- [x] contains_value: pass, case-insensitive
- [x] contains_value: fail, значение не найдено
- [x] contains_value: fail, столбец не найден
- [x] exact_match: pass, данные в другом порядке
- [x] exact_match: fail, разные данные
- [x] exact_match: fail, разное количество столбцов
- [x] exact_match: fail, ошибка reference query
- [x] custom: делегирует check-функции

### Table Guard (table-guard.ts) — 13 тестов ✅

**Глубина проработки: СРЕДНЯЯ** — парсинг SQL и контроль доступа

- [x] FROM → извлекает таблицу
- [x] JOIN → извлекает таблицу
- [x] INSERT INTO → извлекает таблицу
- [x] UPDATE → извлекает таблицу
- [x] Case-insensitive ключевые слова
- [x] Несколько таблиц без дупликатов
- [x] Приводит имена к lowercase
- [x] unlockedTables=null → всё разрешено
- [x] sqlite_master всегда разрешена
- [x] Разрешённая таблица → allowed:true
- [x] Заблокированная → allowed:false + имя
- [x] Case-insensitive сравнение таблиц
- [x] JOIN с недоступной таблицей → блокировка

### Mission Runner (mission-runner.ts) — 9 тестов ✅

**Глубина проработки: СРЕДНЯЯ** — последовательность, break-логика

- [x] Пропускает завершённые цели
- [x] Проверяет по порядку (order)
- [x] Максимум 1 цель за вызов
- [x] Возвращает [] когда ничего нового
- [x] storyReward перезаписывает сообщение
- [x] Без storyReward — сообщение валидатора
- [x] isMissionComplete: true (все завершены)
- [x] isMissionComplete: false (не все)
- [x] isMissionComplete: false (пусто)

---

## Часть 2: Миссии (проходимость)

### Миссия 0 — Туториал: «Первый день в участке» — 12 тестов ✅

**Глубина проработки: ВЫСОКАЯ** | Сложность: Tutorial | SQL: SELECT, WHERE, COUNT
Таблицы: `suspects`, `crimes`

| # | Цель | SQL | Валидация | Статус |
|---|------|-----|-----------|--------|
| 1 | obj-see-tables | `SELECT name FROM sqlite_master WHERE type='table'` | contains_value | ✅ PASS |
| 2 | obj-list-suspects | `SELECT * FROM suspects` | row_count eq 15 | ✅ PASS |
| 3 | obj-wanted | `SELECT * FROM suspects WHERE status = 'в розыске'` | exact_match | ✅ PASS |
| 4 | obj-count-crimes | `SELECT COUNT(*) FROM crimes WHERE status = 'открыто'` | custom (=6) | ✅ PASS |

- [x] Цель 1: основной запрос pass
- [x] Цель 1: альтернативный запрос pass
- [x] Цель 2: 15 строк pass
- [x] Цель 2: 14 строк fail
- [x] Цель 3: exact_match pass
- [x] Цель 3: другие столбцы → fail (column count)
- [x] Цель 4: COUNT=6 pass
- [x] Цель 4: неверное значение fail
- [x] Доступ: suspects, crimes — разрешены
- [x] Доступ: communications — заблокирована
- [x] Доступ: transactions — заблокирована
- [x] **Полный прогон: 4/4 целей последовательно ✅**

### Миссия 1 — «Тени порта — Связи» — 11 тестов ✅

**Глубина проработки: ВЫСОКАЯ** | Сложность: Easy | SQL: JOIN, WHERE, AND
Таблицы: `suspects`, `crimes`, `crime_suspects`

| # | Цель | SQL | Валидация | Статус |
|---|------|-----|-----------|--------|
| 1 | obj-crime-details | `SELECT * FROM crimes WHERE type = 'контрабанда'` | contains_value | ✅ PASS |
| 2 | obj-suspects-in-crime | `SELECT * FROM crime_suspects WHERE crime_id = 1` | custom (3 row + role) | ✅ PASS |
| 3 | obj-find-organizer | `JOIN crime_suspects + suspects WHERE role='организатор'` | contains_value | ✅ PASS |

- [x] Цель 1: основной запрос pass
- [x] Цель 1: SELECT * FROM crimes (все) тоже pass
- [x] Цель 2: 3 строки с role pass
- [x] Цель 2: без столбца role fail
- [x] Цель 2: rowCount != 3 fail
- [x] Цель 3: JOIN → Воронов pass
- [x] Цель 3: все участники pass (contains_value)
- [x] Доступ: suspects, crimes, crime_suspects — OK
- [x] Доступ: communications — заблокирована
- [x] Доступ: transactions — заблокирована
- [x] **Полный прогон: 3/3 целей последовательно ✅**

### Миссия 2 — «Тени порта — Перехват» — 13 тестов ✅

**Глубина проработки: ВЫСОКАЯ** | Сложность: Easy | SQL: LIKE, WHERE, JOIN, AND/OR
Таблицы: `suspects`, `crimes`, `crime_suspects`, `communications`

| # | Цель | SQL | Валидация | Статус |
|---|------|-----|-----------|--------|
| 1 | obj-flagged-comms | `SELECT * FROM communications WHERE flagged = 1` | custom (>=5 + content) | ✅ PASS |
| 2 | obj-communications | `WHERE content LIKE '%Груз%' OR '%порт%'` | custom (содержит груз/порт) | ✅ PASS |
| 3 | obj-voronov-contacts | `JOIN communications + suspects WHERE from_id=1` | custom (>=2 + name) | ✅ PASS |

- [x] Цель 1: flagged=1 → 9 строк pass
- [x] Цель 1: точное количество = 9
- [x] Цель 1: без content fail
- [x] Цель 2: LIKE + январь pass
- [x] Цель 2: ⚠ `'%груз%'` (строчная) → 0 строк (SQLite кириллица case-sensitive)
- [x] Цель 2: `'%Груз%'` (заглавная) → pass
- [x] Цель 2: без «груз»/«порт» → fail
- [x] Цель 3: JOIN → 3 контакта pass
- [x] Цель 3: Воронов → 3 собеседника (Тень, Лис, Соль)
- [x] Цель 3: без столбца name fail
- [x] Доступ: communications — разрешена
- [x] Доступ: transactions — заблокирована
- [x] **Полный прогон: 3/3 целей последовательно ✅**

### Миссия 3 — «Тени порта — Деньги» — 14 тестов ✅

**Глубина проработки: СРЕДНЯЯ (есть баг)** | Сложность: Easy | SQL: SUM, WHERE, AND
Таблицы: `suspects`, `crimes`, `crime_suspects`, `communications`, `transactions`

| # | Цель | SQL по подсказке | Валидация | Статус |
|---|------|------------------|-----------|--------|
| 1 | obj-suspicious-transactions | `WHERE suspicious = 1` | custom (>=5 + amount) | ✅ PASS |
| 2 | obj-money-trail | `WHERE suspect_id = 1 AND suspicious = 1` | custom (>=2 + amount) | 🔴 BUG |
| 3 | obj-total-amount | `SUM(amount) WHERE suspect_id = 1 AND suspicious = 1` | custom (1 row, >0) | ✅ PASS |

- [x] Цель 1: suspicious=1 → 11 строк pass
- [x] Цель 1: точное количество = 11
- [x] Цель 1: без amount fail
- [x] Цель 2: seed = 1 транзакция (suspect_id=1, suspicious=1)
- [x] Цель 2: 🔴 **запрос по подсказке FAIL** (rowCount=1, нужно >=2)
- [x] Цель 2: workaround по account LIKE '%VORONOV%' → 3 строки pass
- [x] Цель 3: SUM = 5,000,000₽ pass
- [x] Цель 3: workaround SUM по account name pass
- [x] Цель 3: rowCount != 1 fail
- [x] Доступ: transactions — разрешена
- [x] Доступ: все 5 таблиц — OK
- [x] Доступ: org_members — заблокирована
- [x] **Полный прогон (workaround): 3/3 ✅**
- [x] **Прогон по подсказкам: застревает на цели 2 (задокументирован)**

---

## Баг #1 — подробности

**Миссия 3, цель `obj-money-trail`**

```
Подсказка:  WHERE suspect_id = 1 AND suspicious = 1
Seed-данные: только 1 строка (transaction ID=1, amount=5M₽)
Валидатор:   if (result.rowCount < 2) → fail
Результат:   игрок ЗАСТРЯНЕТ на этой цели, следуя подсказке
```

**Рекомендуемые фиксы** (один из):
- Понизить порог: `rowCount < 2` → `rowCount < 1`
- Добавить транзакцию в seed: `INSERT INTO transactions VALUES (13, 'RU006-VOSTOK', 'RU001-VORONOV', 2500000, 'RUB', '2024-03-01', 'Возврат инвестиций', 1, 1);`

## Баг #2 — подробности

**SQLite LIKE для кириллицы**

```
Seed:     'Груз прибывает...' (заглавная Г)
Запрос:   LIKE '%груз%'       (строчная г)
Ожидание: найдёт (LIKE case-insensitive)
Факт:     НЕ найдёт (SQLite LIKE case-insensitive только для ASCII)
```

Не блокирует прохождение (в валидаторе принимается также `'%порт%'`), но может путать игрока.

---

## Команды

```bash
npm run test:run    # Запуск всех тестов
npm run test        # Watch-режим
```
