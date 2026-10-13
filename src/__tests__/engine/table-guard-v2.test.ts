/**
 * Политика запросов игрока v2 (GAME_DESIGN, разд. 6.14, п. 3 и 5):
 * белый список записи, представления, транзакции и запреты, которые
 * действуют всегда (ATTACH, PRAGMA, квалификаторы main./temp.).
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { createDatabase } from "@/engine/database";
import { analyzeSql, checkSqlAccess, checkSqlPolicy, describePolicyViolation, viewChanges } from "@/engine/table-guard";
import { executeSQL, queryLogStatus } from "@/engine";

const OPEN = ["statements", "arch16_statements", "persons", "draft_statements"];

describe("analyzeSql: действие и цель выражения", () => {
  it.each([
    ["SELECT 1", "select", undefined],
    ["WITH x AS (SELECT 1) SELECT * FROM x", "select", undefined],
    ["INSERT INTO statements(id) VALUES (1)", "insert", "statements"],
    ["INSERT OR REPLACE INTO statements VALUES (1)", "insert", "statements"],
    ["REPLACE INTO statements VALUES (1)", "insert", "statements"],
    ["WITH a AS (SELECT 1) INSERT INTO statements SELECT * FROM a", "insert", "statements"],
    ["UPDATE OR IGNORE persons SET x = 1", "update", "persons"],
    ["DELETE FROM draft_statements WHERE 1", "delete", "draft_statements"],
    ["CREATE VIEW evidence_package AS SELECT 1", "create_view", "evidence_package"],
    ["CREATE VIEW IF NOT EXISTS v AS SELECT 1", "create_view", "v"],
    ["DROP VIEW IF EXISTS v", "drop_view", "v"],
    ["CREATE TABLE t (x)", "ddl", undefined],
    ["BEGIN", "transaction", undefined],
    ["COMMIT", "transaction", undefined],
    ["PRAGMA table_info(persons)", "pragma", "persons"],
    ["ATTACH 'x.db' AS x", "attach", undefined],
    ["EXPLAIN QUERY PLAN SELECT 1", "explain", undefined],
  ])("%s → %s", (sql, action, target) => {
    const [st] = analyzeSql(sql).statements;
    expect(st.action).toBe(action);
    expect(st.target).toBe(target);
  });

  it("CREATE TEMP VIEW помечен temp", () => {
    expect(analyzeSql("CREATE TEMP VIEW v AS SELECT 1").statements[0].temp).toBe(true);
  });

  it("квалификаторы в позициях таблиц собираются", () => {
    expect(analyzeSql("SELECT * FROM main.persons JOIN temp.plate_reads ON 1").qualified).toEqual([
      { schema: "main", name: "persons" },
      { schema: "temp", name: "plate_reads" },
    ]);
  });
});

describe("checkSqlAccess: запрещено всегда", () => {
  const policy = { unlockedTables: OPEN, writableTables: ["statements"], allowViews: true };

  it.each([
    ["SELECT * FROM main.persons", "main."],
    ["SELECT * FROM temp.persons", "temp."],
    ['SELECT * FROM "main"."persons"', "main."],
    ["SELECT * FROM persons p JOIN main.statements s ON 1", "main."],
    ["INSERT INTO main.statements SELECT * FROM arch16_statements", "main."],
    ["DELETE FROM temp.statements", "temp."],
    ["CREATE VIEW temp.v AS SELECT 1", "temp."],
    ["ATTACH DATABASE ':memory:' AS spy", "ATTACH"],
    ["DETACH spy", "DETACH"],
    ["PRAGMA foreign_keys = OFF", "PRAGMA"],
    ["PRAGMA writable_schema = 1", "PRAGMA"],
    ["PRAGMA database_list", "PRAGMA"],
    ["PRAGMA main.table_info(persons)", "main."],
    ["CREATE TEMP VIEW persons AS SELECT 1", "CREATE TEMP VIEW"],
    ["SELECT 1; ATTACH 'x' AS y", "ATTACH"],
  ])("%s", (sql, keyword) => {
    const r = checkSqlAccess(sql, policy);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("forbidden");
    expect(r.blockedKeyword).toBe(keyword);
  });

  it("квалификатор в выражении (алиас temp) — не схема, пропускается", () => {
    expect(checkSqlAccess("SELECT temp.id FROM persons temp", policy).allowed).toBe(true);
  });

  it.each(["PRAGMA table_info(persons)", "PRAGMA table_xinfo('persons')", "PRAGMA foreign_key_list(statements)"])(
    "разрешена %s",
    (sql) => expect(checkSqlAccess(sql, policy).allowed).toBe(true)
  );

  it("PRAGMA table_info закрытой таблицы — locked_table", () => {
    const r = checkSqlAccess("PRAGMA table_info(bank_statements)", policy);
    expect(r.reason).toBe("locked_table");
    expect(r.blockedTable).toBe("bank_statements");
  });
});

describe("checkSqlAccess: белый список записи", () => {
  const policy = { unlockedTables: OPEN, writableTables: ["statements", "persons"] };

  it.each([
    "INSERT INTO statements(id, text) SELECT id, text FROM arch16_statements WHERE id NOT IN (SELECT id FROM statements)",
    "UPDATE persons SET special_marks = 'x' WHERE id = 2214",
    "DELETE FROM statements WHERE id = 5",
    "INSERT OR REPLACE INTO statements VALUES (1)",
    "REPLACE INTO persons(id) VALUES (1)",
    "WITH lost AS (SELECT * FROM arch16_statements) INSERT INTO statements SELECT * FROM lost",
    "BEGIN",
    "BEGIN; UPDATE persons SET x = 1; COMMIT",
    "ROLLBACK",
    "END",
    "SAVEPOINT a",
  ])("разрешено: %s", (sql) => {
    expect(checkSqlAccess(sql, policy).allowed).toBe(true);
  });

  it.each([
    ["INSERT INTO arch16_statements VALUES (1)", "arch16_statements", "INSERT"],
    ["UPDATE draft_statements SET x = 1", "draft_statements", "UPDATE"],
    ["DELETE FROM draft_statements", "draft_statements", "DELETE"],
    ["REPLACE INTO arch16_statements VALUES (1)", "arch16_statements", "REPLACE"],
    ["BEGIN; DELETE FROM arch16_statements; COMMIT", "arch16_statements", "DELETE"],
  ])("только чтение: %s", (sql, table, keyword) => {
    const r = checkSqlAccess(sql, policy);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("read_only");
    expect(r.blockedTable).toBe(table);
    expect(r.blockedKeyword).toBe(keyword);
  });

  it("запись в разрешённую, но закрытую таблицу — locked_table", () => {
    const r = checkSqlAccess("INSERT INTO statements VALUES (1)", { unlockedTables: ["persons"], writableTables: ["statements"] });
    expect(r.reason).toBe("locked_table");
  });

  it("без белого списка транзакции не нужны", () => {
    for (const sql of ["BEGIN", "COMMIT", "ROLLBACK"]) {
      const r = checkSqlAccess(sql, { unlockedTables: OPEN });
      expect(r.reason, sql).toBe("read_only");
    }
  });

  it("DDL кроме представлений — только чтение даже с белым списком", () => {
    for (const sql of ["CREATE TABLE notes (x)", "DROP TABLE statements", "ALTER TABLE persons ADD COLUMN x", "VACUUM"]) {
      expect(checkSqlAccess(sql, { ...policy, allowViews: true }).reason, sql).toBe("read_only");
    }
  });
});

describe("checkSqlAccess: представления", () => {
  const policy = { unlockedTables: OPEN, allowViews: true, playerViews: ["evidence_package"] };

  it("CREATE VIEW — только при allowViews", () => {
    const sql = "CREATE VIEW evidence_package AS SELECT * FROM statements";
    expect(checkSqlAccess(sql, policy).allowed).toBe(true);
    expect(checkSqlAccess(sql, { unlockedTables: OPEN }).reason).toBe("read_only");
  });

  it("тело представления проверяется на закрытые таблицы", () => {
    const r = checkSqlAccess("CREATE VIEW v AS SELECT * FROM bank_statements", policy);
    expect(r.reason).toBe("locked_table");
  });

  it("своё представление можно читать и удалять, чужое (горизонт) — нельзя", () => {
    expect(checkSqlAccess("SELECT * FROM evidence_package", policy).allowed).toBe(true);
    expect(checkSqlAccess("DROP VIEW evidence_package", policy).allowed).toBe(true);
    const r = checkSqlAccess("DROP VIEW persons", policy);
    expect(r.reason).toBe("read_only");
    expect(r.blockedTable).toBe("persons");
    expect(checkSqlAccess("DROP VIEW IF EXISTS plate_reads", policy).reason).toBe("read_only");
  });

  it("чужое представление нельзя читать, пока его нет в playerViews", () => {
    expect(checkSqlAccess("SELECT * FROM evidence_package", { unlockedTables: OPEN, allowViews: true }).reason).toBe("locked_table");
  });

  it("viewChanges: какие представления создал и удалил запрос", () => {
    expect(viewChanges("CREATE VIEW a AS SELECT 1; DROP VIEW IF EXISTS b; SELECT 1")).toEqual({ created: ["a"], dropped: ["b"] });
  });
});

describe("checkSqlPolicy: совместимость с v1", () => {
  it("allowWrites: true — любая запись и DDL, как раньше", () => {
    for (const sql of ["DELETE FROM persons", "DROP TABLE persons", "BEGIN", "CREATE VIEW v AS SELECT 1", "DROP VIEW persons"]) {
      expect(checkSqlPolicy(sql, { unlockedTables: OPEN, allowWrites: true }).allowed, sql).toBe(true);
    }
  });

  it("allowWrites не снимает запретов ATTACH / PRAGMA / main.", () => {
    expect(checkSqlPolicy("ATTACH 'x' AS y", { unlockedTables: null, allowWrites: true }).reason).toBe("forbidden");
    expect(checkSqlPolicy("SELECT * FROM main.persons", { unlockedTables: null, allowWrites: true }).reason).toBe("forbidden");
  });

  it("writableTables важнее allowWrites", () => {
    const r = checkSqlPolicy("DELETE FROM persons", { unlockedTables: OPEN, allowWrites: true, writableTables: ["statements"] });
    expect(r.reason).toBe("read_only");
  });
});

describe("describePolicyViolation: тексты на русском", () => {
  it("запись вне белого списка называет таблицу и белый список", () => {
    const policy = { unlockedTables: OPEN, writableTables: ["draft_statements", "statements"] };
    const v = describePolicyViolation(checkSqlAccess("DELETE FROM persons", policy), policy);
    expect(v.errorKind).toBe("read_only");
    expect(v.error).toContain("«persons»");
    expect(v.error).toContain("Запись разрешена в: draft_statements, statements");
  });

  it("квалификатор, PRAGMA, ATTACH, TEMP — forbidden с объяснением", () => {
    const policy = { unlockedTables: OPEN };
    expect(describePolicyViolation(checkSqlAccess("SELECT * FROM main.persons", policy)).error).toContain("«main.»");
    expect(describePolicyViolation(checkSqlAccess("PRAGMA foreign_keys = OFF", policy)).errorHelp.explanation).toContain("table_info");
    expect(describePolicyViolation(checkSqlAccess("ATTACH 'a' AS b", policy)).error).toContain("ATTACH");
    expect(describePolicyViolation(checkSqlAccess("CREATE TEMP VIEW v AS SELECT 1", { ...policy, allowViews: true })).error).toContain("TEMP");
  });

  it("закрытая таблица — прежний текст", () => {
    const v = describePolicyViolation(checkSqlAccess("SELECT * FROM bank_statements", { unlockedTables: OPEN }));
    expect(v.errorKind).toBe("locked_table");
    expect(v.error).toBe("[ДОСТУП ЗАПРЕЩЁН] Таблица «bank_statements» ещё не разблокирована.");
  });
});

describe("executeSQL с политикой v2 на настоящей базе", () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase();
    db.run(`
      CREATE TABLE statements (id INTEGER PRIMARY KEY, text TEXT, status TEXT);
      CREATE TABLE arch16_statements (id INTEGER PRIMARY KEY, text TEXT);
      CREATE TABLE persons (id INTEGER PRIMARY KEY, full_name TEXT);
      INSERT INTO arch16_statements VALUES (1, 'а'), (2, 'б'), (3, 'в');
      INSERT INTO statements VALUES (1, 'а', 'активна');
      INSERT INTO persons VALUES (1, 'Вальц Ирина Петровна');
      CREATE TEMP VIEW persons AS SELECT * FROM main.persons WHERE id < 100;
    `);
  });

  const options = { writableTables: ["statements"], allowViews: true };

  it("восстановление удалённого в транзакции (задача 11.2)", () => {
    expect(executeSQL(db, "BEGIN", OPEN, options).error).toBeNull();
    const insert = executeSQL(
      db,
      "INSERT INTO statements(id, text, status) SELECT id, text, 'восстановлено' FROM arch16_statements a WHERE a.id NOT IN (SELECT id FROM statements)",
      OPEN,
      options
    );
    expect(insert.error).toBeNull();
    expect(executeSQL(db, "COMMIT", OPEN, options).error).toBeNull();
    expect(executeSQL(db, "SELECT COUNT(*) FROM statements", OPEN, options).rows[0][0]).toBe(3);
  });

  it("запись в архив — read_only, данные не тронуты, в журнал — denied", () => {
    const r = executeSQL(db, "DELETE FROM arch16_statements", OPEN, options);
    expect(r.errorKind).toBe("read_only");
    expect(queryLogStatus(r)).toBe("denied");
    expect(executeSQL(db, "SELECT COUNT(*) FROM arch16_statements", OPEN, options).rows[0][0]).toBe(3);
  });

  it("обход горизонта через main. — forbidden, в журнал — denied", () => {
    const r = executeSQL(db, "SELECT * FROM main.persons", OPEN, options);
    expect(r.errorKind).toBe("forbidden");
    expect(queryLogStatus(r)).toBe("denied");
  });

  it("DROP VIEW представления горизонта — read_only, представление на месте", () => {
    const r = executeSQL(db, "DROP VIEW persons", OPEN, { ...options, playerViews: [] });
    expect(r.errorKind).toBe("read_only");
    const views = db.exec("SELECT COUNT(*) FROM sqlite_temp_master WHERE type = 'view' AND name = 'persons'");
    expect(views[0].values[0][0]).toBe(1);
  });

  it("CREATE VIEW, чтение и удаление своего представления", () => {
    const sql = "CREATE VIEW evidence_package AS SELECT id, status FROM statements";
    expect(executeSQL(db, sql, OPEN, options).error).toBeNull();
    const views = viewChanges(sql).created;
    expect(executeSQL(db, "SELECT * FROM evidence_package", OPEN, { ...options, playerViews: views }).rowCount).toBe(1);
    expect(executeSQL(db, "DROP VIEW evidence_package", OPEN, { ...options, playerViews: views }).error).toBeNull();
  });

  it("PRAGMA table_info работает", () => {
    const r = executeSQL(db, "PRAGMA table_info(statements)", OPEN, options);
    expect(r.error).toBeNull();
    expect(r.rows.map((row) => row[1])).toEqual(["id", "text", "status"]);
  });
});
