/**
 * Семантический линтер (GAME_DESIGN, разд. 7.3): то, что SQLite молча
 * пропускает. Примеры — из дел сезона.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { Database } from "sql.js";
import { createDatabase, getTableSchema } from "@/engine/database";
import { lintSql, type LintRule, type LintOptions } from "@/engine/sql-lint";
import type { TableInfo } from "@/types/database";

let db: Database;
let schema: TableInfo[];

beforeAll(async () => {
  db = await createDatabase();
  db.run(`
    CREATE TABLE persons (id INTEGER PRIMARY KEY, full_name TEXT NOT NULL, birth_date TEXT, special_marks TEXT);
    CREATE TABLE incidents (id INTEGER PRIMARY KEY, kusp_no INTEGER, reported_at TEXT, kind TEXT);
    CREATE TABLE incident_persons (incident_id INTEGER, person_id INTEGER, role TEXT);
    CREATE TABLE plate_reads (id INTEGER PRIMARY KEY, plate TEXT, camera_id INTEGER, read_at TEXT);
    CREATE TABLE cameras (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE audit_log (id INTEGER PRIMARY KEY, ts TEXT, login TEXT, table_name TEXT, row_id TEXT);
    CREATE TABLE employment (id INTEGER PRIMARY KEY, person_id INTEGER, company TEXT);
    CREATE TABLE staff (id INTEGER PRIMARY KEY, person_id INTEGER NOT NULL, position TEXT, hired_at TEXT);
    CREATE TABLE statements (id INTEGER PRIMARY KEY, case_id TEXT, text TEXT);
    CREATE TABLE draft_statements (id INTEGER PRIMARY KEY, person_text TEXT);
    CREATE TABLE arch16_registry (id INTEGER PRIMARY KEY, reg_date TEXT);
    INSERT INTO persons VALUES (1, 'Вальц Ирина Петровна', '1997-04-03', NULL), (2, 'Ким Дарья Сергеевна', '2001-06-14', NULL);
    INSERT INTO incident_persons VALUES (4515, NULL, 'потерпевшая');
    INSERT INTO employment VALUES (1, 1, 'ГУ'), (2, NULL, 'подрядчик');
    INSERT INTO staff VALUES (151, 1, 'аналитик', '2026-12-02');
    INSERT INTO audit_log VALUES (1, '2026-11-19 02:10:00', 'i.valts', 'persons', '2214');
    INSERT INTO plate_reads VALUES (1, 'К372ОК', 22, '2026-11-17 02:00:00');
  `);
  // 1 200 строк в plate_reads и 400 в cameras — для SELECT * и JOIN без условия
  const stmt = db.prepare("INSERT INTO plate_reads VALUES (?, ?, ?, ?)");
  for (let i = 2; i <= 1200; i++) stmt.run([i, `А${String(i).padStart(3, "0")}АА`, i % 40, "2026-11-17 03:00:00"]);
  stmt.free();
  const cam = db.prepare("INSERT INTO cameras VALUES (?, ?)");
  for (let i = 1; i <= 400; i++) cam.run([i, `Камера ${i}`]);
  cam.free();
  schema = getTableSchema(db);
});

const rules = (sql: string, options: LintOptions = { db }) => lintSql(sql, schema, options).map((w) => w.rule);
const first = (sql: string, rule: LintRule, options: LintOptions = { db }) => lintSql(sql, schema, options).find((w) => w.rule === rule);

describe("чистые запросы — без замечаний", () => {
  it.each([
    "SELECT full_name FROM persons WHERE id = 1",
    "SELECT * FROM persons",
    "SELECT ip.role, p.full_name FROM incident_persons ip JOIN persons p ON p.id = ip.person_id WHERE ip.person_id IS NULL",
    "SELECT camera_id, COUNT(*) AS n FROM plate_reads GROUP BY camera_id HAVING COUNT(*) > 1",
    "SELECT p.id, p.full_name, COUNT(*) FROM persons p JOIN staff s ON s.person_id = p.id GROUP BY p.id",
    "SELECT date(read_at) AS d, COUNT(*) FROM plate_reads GROUP BY d",
    "SELECT date(read_at), COUNT(*) FROM plate_reads GROUP BY 1",
    "SELECT * FROM plate_reads WHERE plate = 'К372ОК'",
    "SELECT * FROM plate_reads LIMIT 50",
    "SELECT * FROM audit_log ORDER BY ts",
    "SELECT * FROM persons WHERE id NOT IN (SELECT person_id FROM staff)",
    "SELECT * FROM persons WHERE id NOT IN (SELECT person_id FROM employment WHERE person_id IS NOT NULL)",
    "SELECT * FROM plate_reads WHERE read_at BETWEEN '2026-11-17 02:00:00' AND '2026-11-17 02:40:00'",
    "SELECT * FROM plate_reads WHERE read_at < '2026-11-17 02:00'",
    "SELECT * FROM plate_reads WHERE date(read_at) = '2026-11-17'",
    "SELECT * FROM staff WHERE hired_at = '2026-12-02'",
    "SELECT * FROM arch16_registry WHERE reg_date = '30.09.2016'",
    "UPDATE persons SET special_marks = NULL WHERE id = 2",
    "SELECT p.full_name, (SELECT COUNT(*) FROM staff s WHERE s.person_id = p.id) AS n FROM persons p",
    "SELECT c.name, COUNT(r.id) FROM cameras c LEFT JOIN plate_reads r ON r.camera_id = c.id GROUP BY c.id",
    "SELECT 'login i.valts' AS x",
  ])("%s", (sql) => {
    expect(lintSql(sql, schema, { db })).toEqual([]);
  });
});

describe("1. сравнение с NULL", () => {
  it.each([
    "SELECT * FROM incident_persons WHERE person_id = NULL",
    "SELECT * FROM incident_persons WHERE person_id != NULL",
    "SELECT * FROM incident_persons WHERE person_id <> NULL",
    "SELECT * FROM incident_persons WHERE NULL = person_id",
    "UPDATE persons SET special_marks = 'x' WHERE special_marks = NULL",
  ])("%s", (sql) => {
    const w = first(sql, "null_compare");
    expect(w).toMatchObject({
      lineId: "bark.tokha_eqnull.001",
      speaker: "tokha",
      text: "С NULL так не сравнивают. Он даже сам себе не равен.",
    });
    expect(w?.pos).toBe(sql.lastIndexOf("NULL"));
  });
});

describe("2. NOT IN с NULL в подзапросе", () => {
  it("в employment.person_id есть NULL (по данным)", () => {
    const w = first("SELECT full_name FROM persons WHERE id NOT IN (SELECT person_id FROM employment)", "not_in_null");
    expect(w).toMatchObject({ speaker: "mira", text: "NOT IN споткнётся о NULL. Попробуй NOT EXISTS." });
    expect(w?.detail).toContain("employment.person_id");
  });

  it("с алиасом и DISTINCT", () => {
    expect(rules("SELECT * FROM persons p WHERE p.id NOT IN (SELECT DISTINCT e.person_id FROM employment e)")).toContain("not_in_null");
  });

  it("без базы — по схеме: NOT NULL не предупреждает, обычный столбец — предупреждает", () => {
    expect(rules("SELECT * FROM persons WHERE id NOT IN (SELECT person_id FROM staff)", {})).not.toContain("not_in_null");
    expect(rules("SELECT * FROM persons WHERE id NOT IN (SELECT person_id FROM employment)", {})).toContain("not_in_null");
  });

  it("IN без NOT — не предупреждает", () => {
    expect(rules("SELECT * FROM persons WHERE id IN (SELECT person_id FROM employment)")).not.toContain("not_in_null");
  });
});

describe("3. столбец не в GROUP BY и не в агрегате", () => {
  it("классика: имя при группировке по камере", () => {
    const w = first("SELECT camera_id, plate, COUNT(*) FROM plate_reads GROUP BY camera_id", "bare_column");
    expect(w).toMatchObject({ speaker: "mira", text: "SQLite возьмёт случайную строку группы." });
    expect(w?.detail).toBe("Столбца «plate» нет ни в GROUP BY, ни в агрегате.");
  });

  it("агрегат без GROUP BY и голый столбец", () => {
    expect(rules("SELECT login, MAX(ts) FROM audit_log")).toContain("bare_column");
  });

  it("SELECT * с GROUP BY", () => {
    expect(rules("SELECT * FROM plate_reads GROUP BY camera_id")).toContain("bare_column");
  });

  it("группировка по первичному ключу делает столбцы таблицы зависимыми", () => {
    expect(rules("SELECT p.full_name, COUNT(*) FROM persons p JOIN staff s ON s.person_id = p.id GROUP BY p.id")).not.toContain("bare_column");
    expect(rules("SELECT s.position, COUNT(*) FROM persons p JOIN staff s ON s.person_id = p.id GROUP BY p.id")).toContain("bare_column");
  });

  it("в подзапросе", () => {
    expect(rules("SELECT * FROM (SELECT camera_id, plate, COUNT(*) AS n FROM plate_reads GROUP BY camera_id)")).toContain("bare_column");
  });

  it("оконная функция — не агрегат группировки", () => {
    expect(rules("SELECT plate, COUNT(*) OVER (PARTITION BY camera_id) FROM plate_reads LIMIT 5")).not.toContain("bare_column");
  });
});

describe("4. соединение без условия", () => {
  it("1 200 × 400 строк без ON — предупреждение с оценкой", () => {
    const w = first("SELECT * FROM plate_reads, cameras", "missing_join");
    expect(w).toMatchObject({ text: "Похоже, забыто условие соединения." });
    expect(w?.detail).toMatch(/480\s000/);
  });

  it("JOIN без ON и ON на одну таблицу", () => {
    expect(rules("SELECT * FROM plate_reads r JOIN cameras c")).toContain("missing_join");
    expect(rules("SELECT * FROM plate_reads r JOIN cameras c ON c.id = 5")).toContain("missing_join");
  });

  it("условие в WHERE или ON — без предупреждения", () => {
    expect(rules("SELECT * FROM plate_reads r, cameras c WHERE r.camera_id = c.id")).not.toContain("missing_join");
    expect(rules("SELECT * FROM plate_reads r JOIN cameras c ON r.camera_id = c.id")).not.toContain("missing_join");
  });

  it("маленькие таблицы — без предупреждения (меньше 100 000 строк)", () => {
    expect(rules("SELECT * FROM persons, staff")).not.toContain("missing_join");
  });

  it("без базы и счётчиков — по структуре; явный CROSS JOIN считается намеренным", () => {
    expect(rules("SELECT * FROM persons, staff", {})).toContain("missing_join");
    expect(rules("SELECT * FROM persons CROSS JOIN staff", {})).not.toContain("missing_join");
    expect(rules("SELECT * FROM persons, staff", { rowCounts: { persons: 60_000, staff: 200 } })).toContain("missing_join");
  });
});

describe("5. латиница и кириллица в литерале", () => {
  it("номер К372ОК с латинской K (Д1)", () => {
    const w = first("SELECT * FROM plate_reads WHERE plate = 'K372ОК'", "homoglyph");
    expect(w).toMatchObject({
      lineId: "bark.tokha_homoglyph.001",
      speaker: "tokha",
      text: "Номера хранятся кириллицей. В литерале латинская K.",
    });
  });

  it("несколько латинских букв", () => {
    expect(first("SELECT * FROM plate_reads WHERE plate = 'К404TO'", "homoglyph")?.text).toBe(
      "Номера хранятся кириллицей. В литерале латинские T, O."
    );
  });

  it("номер целиком латиницей", () => {
    expect(rules("SELECT * FROM plate_reads WHERE plate = 'K404TO'")).toContain("homoglyph");
  });

  it("кириллица в латинском логине", () => {
    const w = first("SELECT * FROM audit_log WHERE login = 'i.vаlts'", "homoglyph");
    expect(w?.text).toBe("В латинском литерале кириллическая «а».");
  });

  it("обычный текст и LIKE-шаблоны — без предупреждения", () => {
    expect(rules("SELECT * FROM persons WHERE full_name LIKE '%Вальц%'")).toEqual([]);
    expect(rules("SELECT * FROM plate_reads WHERE plate LIKE '%372%'")).toEqual([]);
  });
});

describe("6. дата не в ISO", () => {
  it.each(["'02.12.2026'", "'2.12.2026'", "'02/12/2026'", "'2026.12.02'", "'02.12.2026 18:05'"])("%s", (literal) => {
    const w = first(`SELECT * FROM incidents WHERE date(reported_at) = ${literal}`, "date_format");
    expect(w?.text).toBe("Даты хранятся как ГГГГ-ММ-ДД.");
    expect(w?.detail).toContain("→ '2026-12-02'");
  });

  it("arch16_registry.reg_date хранится 'ДД.ММ.ГГГГ' — не предупреждает", () => {
    expect(rules("SELECT * FROM arch16_registry r WHERE r.reg_date = '30.09.2016'")).toEqual([]);
  });
});

describe("7. SELECT * без LIMIT по большой таблице", () => {
  it("1 200 строк — Тоха", () => {
    const w = first("SELECT * FROM plate_reads", "select_star");
    expect(w).toMatchObject({ lineId: "bark.tokha_limit.001", text: "Короч, больше тыщи строк. Давай с LIMIT." });
  });

  it("четыре тыщи — по счётчикам", () => {
    expect(first("SELECT * FROM audit_log", "select_star", { rowCounts: { audit_log: 4213 } })?.text).toBe(
      "Короч, четыре тыщи строк. Давай с LIMIT."
    );
  });

  it("с WHERE, LIMIT или маленькая таблица — молчит; без базы — молчит", () => {
    expect(rules("SELECT * FROM plate_reads WHERE camera_id = 3")).not.toContain("select_star");
    expect(rules("SELECT * FROM plate_reads LIMIT 10")).not.toContain("select_star");
    expect(rules("SELECT * FROM persons")).not.toContain("select_star");
    expect(rules("SELECT * FROM plate_reads", {})).not.toContain("select_star");
  });
});

describe("8. ORDER BY id по audit_log", () => {
  it.each(["SELECT * FROM audit_log ORDER BY id", "SELECT a.login FROM audit_log a ORDER BY a.id DESC", "SELECT * FROM audit_log WHERE login = 'i.valts' ORDER BY id LIMIT 5"])(
    "%s",
    (sql) => {
      expect(first(sql, "audit_order")?.text).toBe("id — порядок репликации, а не время.");
    }
  );

  it("другие таблицы и сортировка по ts — молчит", () => {
    expect(rules("SELECT * FROM incidents ORDER BY id")).not.toContain("audit_order");
    expect(rules("SELECT * FROM audit_log ORDER BY ts, id")).not.toContain("audit_order");
  });
});

describe("9. границы времени", () => {
  it("<= с минутами — секунды не попадут", () => {
    const w = first("SELECT * FROM plate_reads WHERE read_at <= '2026-11-17 02:00'", "time_seconds");
    expect(w?.text).toBe("Время хранится с секундами: '2026-11-17 02:00:00' больше, чем '2026-11-17 02:00', и в границу не попадёт.");
  });

  it("BETWEEN … AND '… 02:00' — верхняя граница", () => {
    expect(rules("SELECT * FROM plate_reads WHERE read_at BETWEEN '2026-11-17 01:00:00' AND '2026-11-17 02:00'")).toContain("time_seconds");
  });

  it("BETWEEN с числами перед строковым условием не путается", () => {
    expect(rules("SELECT * FROM plate_reads WHERE camera_id BETWEEN 1 AND 5 AND read_at >= '2026-11-17 02:00'")).not.toContain("time_seconds");
  });

  it("литерал-дата против даты-времени: =, <=, BETWEEN", () => {
    const w = first("SELECT * FROM audit_log WHERE ts = '2026-11-19'", "date_vs_datetime");
    expect(w?.text).toBe("Сравни date(ts) с датой.");
    expect(rules("SELECT * FROM plate_reads r WHERE r.read_at <= '2026-11-17'")).toContain("date_vs_datetime");
    expect(rules("SELECT * FROM plate_reads WHERE read_at BETWEEN '2026-11-16' AND '2026-11-17'")).toContain("date_vs_datetime");
  });

  it("столбец-дата (staff.hired_at) — не предупреждает; без базы — по списку библии", () => {
    expect(rules("SELECT * FROM staff WHERE hired_at = '2026-12-02'")).toEqual([]);
    expect(rules("SELECT * FROM staff WHERE hired_at = '2026-12-02'", {})).toEqual([]);
    expect(rules("SELECT * FROM audit_log WHERE ts = '2026-11-19'", {})).toContain("date_vs_datetime");
  });
});

describe("10. DELETE по уликам", () => {
  it.each([
    "DELETE FROM draft_statements WHERE person_text LIKE 'Ким Д%'",
    "DELETE FROM statements",
    "DELETE FROM persons WHERE id = 1",
    "WITH x AS (SELECT 1) DELETE FROM evidence_registry",
  ])("%s", (sql) => {
    expect(first(sql, "no_delete")).toMatchObject({ lineId: "bark.nina_no_delete.001", speaker: "nina", text: "Улики не удаляют, голубчик." });
  });

  it("DELETE из публикации — можно", () => {
    expect(rules("DELETE FROM publication WHERE source_role = 'информатор'")).not.toContain("no_delete");
  });
});

describe("общие свойства", () => {
  it("по одному предупреждению на правило, в порядке правил библии", () => {
    const list = rules("SELECT plate, COUNT(*) FROM plate_reads WHERE plate = 'K372ОК' AND camera_id = NULL GROUP BY camera_id");
    expect(list).toEqual(["null_compare", "bare_column", "homoglyph"]);
  });

  it("строки и комментарии не дают ложных срабатываний", () => {
    expect(rules("SELECT 'x = NULL' AS t -- WHERE a = NULL\n")).toEqual([]);
  });

  it("несколько выражений через ;", () => {
    expect(rules("SELECT 1; SELECT * FROM incident_persons WHERE person_id = NULL")).toEqual(["null_compare"]);
  });

  it("мусорный ввод не роняет линтер", () => {
    for (const sql of ["", ";;;", "SELECT (", "FROM WHERE", "SELECT * FROM ((("]) {
      expect(() => lintSql(sql, schema, { db })).not.toThrow();
    }
  });
});
