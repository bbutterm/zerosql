/**
 * Реестр увиденного и типы пропусков протокола (GAME_DESIGN, разд. 6.4, 6.7):
 * какие значения игрок «увидел», какие варианты ему доступны и как
 * сверяются ответы person / number / datetime / text.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { Database } from "sql.js";
import { createDatabase, executeQuery } from "@/engine/database";
import {
  availableOptions,
  checkProtocol,
  isBlankCorrect,
  isEntityColumn,
  optionSeen,
  scanSeen,
  scanSeenOptions,
  SEEN_FULL_SCAN_ROWS,
} from "@/engine/protocol";
import type { ProtocolBlank, ProtocolDef } from "@/types/case";
import type { QueryResult } from "@/types/database";

let db: Database;
const run = (sql: string) => executeQuery(db, sql);

beforeAll(async () => {
  db = await createDatabase();
  db.run(`
    CREATE TABLE persons (id INTEGER PRIMARY KEY, full_name TEXT, birth_date TEXT);
    CREATE TABLE morgue_records (id INTEGER PRIMARY KEY, full_name_text TEXT, person_id INTEGER, received_at TEXT);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, account_id INTEGER, amount REAL, purpose TEXT, ts TEXT);
    CREATE TABLE plate_reads (id INTEGER PRIMARY KEY, plate TEXT, read_at TEXT);
    INSERT INTO persons VALUES
      (4127, 'Вальц Ирина Петровна', '1997-04-03'),
      (2214, 'Бурцев Валерий Николаевич', '1972-01-15'),
      (1001, 'Гранин Эдуард Витальевич', '1967-06-30');
    INSERT INTO morgue_records VALUES (1, 'Неизвестная, ~30 лет', NULL, '2026-11-18 03:10:00'),
                                      (2, 'Вальц И. П.', 4127, '2026-11-19 09:00:00');
    INSERT INTO plate_reads VALUES (1, 'К404ТО', '2026-11-18 23:34:00'), (2, 'А001АА', '2026-11-18 22:00:00');
  `);
  // Большая таблица: 300 платежей, среди них −38000 и «возврат»
  const stmt = db.prepare("INSERT INTO transactions VALUES (?, ?, ?, ?, ?)");
  for (let i = 1; i <= 300; i++) {
    const amount = i === 150 ? -38000 : i * 10;
    const purpose = i === 150 ? "возврат: отказ получателя" : "перевод";
    stmt.run([i, 500 + (i % 7), amount, purpose, `2026-11-${String(1 + (i % 28)).padStart(2, "0")} 12:00:00`]);
  }
  stmt.free();
});

const result = (columns: string[], rows: unknown[][]): QueryResult => ({
  columns,
  rows,
  rowCount: rows.length,
  executionTimeMs: 0,
  error: null,
});

const blank = (patch: Partial<ProtocolBlank> & Pick<ProtocolBlank, "id" | "kind" | "options" | "answer">): ProtocolBlank => patch;

const PROTOCOL: ProtocolDef = {
  statements: ["Погибшая — {victim}; номер {plate} в {seen_at}; сумма {amount}, пометка {purpose}; строк {rows}."],
  blanks: [
    blank({
      id: "victim",
      kind: "person",
      options: ["Вальц Ирина Петровна", "Бурцев Валерий Николаевич"],
      answer: "Вальц Ирина Петровна",
      aliases: { "Вальц Ирина Петровна": [4127, "Вальц И. П."] },
    }),
    blank({ id: "plate", kind: "text", options: ["К404ТО", "А001АА"], answer: "К404ТО" }),
    blank({ id: "seen_at", kind: "datetime", options: ["2026-11-18 23:34:00", "2026-11-18 22:00:00"], answer: "2026-11-18 23:34:00" }),
    blank({ id: "amount", kind: "number", options: ["38000", "300000"], answer: "38000" }),
    blank({ id: "purpose", kind: "text", options: ["возврат: отказ получателя", "перевод"], answer: "возврат: отказ получателя" }),
    blank({ id: "rows", kind: "number", options: ["2", "3", "4"], answer: "3" }),
  ],
  successScene: "outro",
};

describe("isEntityColumn", () => {
  it.each(["id", "person_id", "full_name", "owner_name", "plate", "login", "badge_id", "msisdn", "doc_reg_no", "фио", "Номер", "кто"])(
    "%s — сущность",
    (name) => expect(isEntityColumn(name)).toBe(true)
  );
  it.each(["amount", "purpose", "ts", "read_at", "position", "c0", "сумма"])("%s — не сущность", (name) =>
    expect(isEntityColumn(name)).toBe(false)
  );
});

describe("scanSeen: реестр одного результата", () => {
  it("до 200 строк — каждая ячейка, плюс число строк; NULL не попадает", () => {
    const seen = scanSeen(run("SELECT id, full_name_text, person_id FROM morgue_records ORDER BY id"));
    expect(seen).toEqual(["1", "Неизвестная, ~30 лет", "2", "Вальц И. П.", "4127"]);
  });

  it("число строк всегда видно как число, даже у пустого результата", () => {
    expect(scanSeen(run("SELECT * FROM persons WHERE id = -1"))).toEqual(["0"]);
  });

  it("больше 200 строк — только столбцы-сущности", () => {
    const seen = scanSeen(run("SELECT id, account_id, amount, purpose FROM transactions"));
    expect(seen).toContain("150"); // id
    expect(seen).toContain("501"); // account_id
    expect(seen).not.toContain("-38000"); // amount — не сущность
    expect(seen).not.toContain("возврат: отказ получателя");
    expect(seen).toContain("300"); // число строк
  });

  it("ФИО под русским алиасом в большом результате видны", () => {
    const rows = Array.from({ length: SEEN_FULL_SCAN_ROWS + 1 }, (_, i) => [i % 2 ? "Вальц Ирина Петровна" : "Ким Д. С.", i]);
    const seen = scanSeen(result(["кому", "сумма"], rows));
    expect(seen).toContain("Вальц Ирина Петровна");
    expect(seen).toContain("Ким Д. С.");
    expect(seen).not.toContain("7");
  });

  it("ошибка и запрос без столбцов — пусто", () => {
    expect(scanSeen(run("SELECT * FROM nope"))).toEqual([]);
    expect(scanSeen(result([], []))).toEqual([]);
  });
});

describe("scanSeenOptions: типы пропусков", () => {
  it("person: ФИО целиком или через aliases (persons.id, запись морга)", () => {
    expect(scanSeenOptions(PROTOCOL, run("SELECT full_name FROM persons WHERE id = 4127"))).toEqual(["Вальц Ирина Петровна"]);
    expect(scanSeenOptions(PROTOCOL, run("SELECT person_id FROM morgue_records WHERE id = 2"))).toEqual(["Вальц Ирина Петровна"]);
    expect(scanSeenOptions(PROTOCOL, run("SELECT full_name_text FROM morgue_records WHERE id = 2"))).toEqual(["Вальц Ирина Петровна"]);
  });

  it("person: фамилия без имени не открывает вариант", () => {
    expect(scanSeenOptions(PROTOCOL, result(["x"], [["Вальц"]]))).toEqual([]);
  });

  it("number: по модулю — −38000 открывает 38000", () => {
    expect(scanSeenOptions(PROTOCOL, run("SELECT amount FROM transactions WHERE id = 150"))).toContain("38000");
  });

  it("number: число строк результата — увиденное число", () => {
    const seen = scanSeenOptions(PROTOCOL, run("SELECT full_name FROM persons"));
    expect(seen).toContain("3");
    expect(seen).not.toContain("2");
  });

  it("number: допуск задаётся в пропуске", () => {
    const p: ProtocolDef = { ...PROTOCOL, blanks: [blank({ id: "a", kind: "number", options: ["100"], answer: "100", tolerance: 1 })] };
    expect(scanSeenOptions(p, result(["v"], [[100.9]]))).toEqual(["100"]);
    expect(scanSeenOptions(p, result(["v"], [[101.5]]))).toEqual([]);
  });

  it("datetime: префикс точности; day — момент того же дня", () => {
    const day: ProtocolDef = {
      ...PROTOCOL,
      blanks: [blank({ id: "d", kind: "datetime", options: ["2026-11-18"], answer: "2026-11-18", precision: "day" })],
    };
    expect(scanSeenOptions(day, run("SELECT read_at FROM plate_reads WHERE id = 1"))).toEqual(["2026-11-18"]);
    expect(scanSeenOptions(PROTOCOL, run("SELECT read_at FROM plate_reads WHERE id = 1"))).toContain("2026-11-18 23:34:00");
  });

  it("datetime: 'ДД.ММ.ГГГГ' в ячейке (arch16_registry.reg_date)", () => {
    const p: ProtocolDef = { ...PROTOCOL, blanks: [blank({ id: "d", kind: "datetime", options: ["2016-09-30"], answer: "2016-09-30" })] };
    expect(scanSeenOptions(p, result(["reg_date"], [["30.09.2016"]]))).toEqual(["2016-09-30"]);
  });

  it("большой результат: сумма и пометка вне столбцов-сущностей не видны, номер — виден", () => {
    const big = run("SELECT id, amount, purpose, account_id FROM transactions");
    expect(big.rowCount).toBe(300);
    const seen = scanSeenOptions(PROTOCOL, big);
    expect(seen).not.toContain("38000");
    expect(seen).not.toContain("возврат: отказ получателя");
    // Тот же платёж в маленьком результате — виден
    const small = scanSeenOptions(PROTOCOL, run("SELECT id, amount, purpose FROM transactions WHERE id BETWEEN 140 AND 160"));
    expect(small).toEqual(expect.arrayContaining(["38000", "возврат: отказ получателя"]));
  });

  it("большой результат: ФИО в столбце-несущности находится (ФИО под алиасом)", () => {
    const rows = Array.from({ length: 300 }, (_, i) => [i, i === 299 ? "Вальц Ирина Петровна" : "кто-то"]);
    expect(scanSeenOptions(PROTOCOL, result(["n", "x"], rows))).toEqual(["Вальц Ирина Петровна"]);
  });

  it("порядок — как в протоколе; без повторов", () => {
    const seen = scanSeenOptions(PROTOCOL, result(["a", "b", "c"], [["К404ТО", 4127, "Вальц Ирина Петровна"]]));
    expect(seen).toEqual(["Вальц Ирина Петровна", "К404ТО"]);
  });

  it("быстро на 5000×10 с типами", () => {
    const columns = ["id", "full_name", "plate", "amount", "ts", "a", "b", "c", "d", "e"];
    // id из другого диапазона: 4127 (alias варианта) и 2/3/4 в столбце-сущности были бы честно «увидены»
    const rows = Array.from({ length: 5000 }, (_, r) => [100_000 + r, `Человек ${r}`, `Х${r}`, r * 3, "2026-01-01 00:00:00", r, r, r, r, r]);
    rows[4999][1] = "Бурцев Валерий Николаевич";
    const start = performance.now();
    const seen = scanSeenOptions(PROTOCOL, result(columns, rows));
    expect(performance.now() - start).toBeLessThan(500);
    expect(seen).toEqual(["Бурцев Валерий Николаевич"]);
  });
});

describe("availableOptions / optionSeen с реестром увиденного", () => {
  const [victim, plate, seenAt, amount] = PROTOCOL.blanks;

  it("реестр из scanSeen открывает варианты по правилам типа", () => {
    const registry = new Set([
      ...scanSeen(run("SELECT person_id, read_at FROM morgue_records m, plate_reads p WHERE m.id = 2 AND p.id = 1")),
      "-38000",
    ]);
    expect(availableOptions(victim, registry)).toEqual(["Вальц Ирина Петровна"]);
    expect(availableOptions(seenAt, registry)).toEqual(["2026-11-18 23:34:00"]);
    expect(availableOptions(amount, registry)).toEqual(["38000"]);
    expect(availableOptions(plate, registry)).toEqual([]);
  });

  it("реестр из scanSeenOptions (сами варианты) тоже работает", () => {
    expect(optionSeen(plate, "К404ТО", new Set(["К404ТО"]))).toBe(true);
    expect(optionSeen(plate, "А001АА", new Set(["К404ТО"]))).toBe(false);
  });
});

describe("isBlankCorrect / checkProtocol с типами", () => {
  const [victim, plate, seenAt, amount] = PROTOCOL.blanks;

  it("person / text — нормализация", () => {
    expect(isBlankCorrect(victim, "вальц ирина петровна")).toBe(true);
    expect(isBlankCorrect(plate, "к404то")).toBe(true);
    expect(isBlankCorrect(plate, "А001АА")).toBe(false);
  });

  it("number — по модулю с допуском", () => {
    expect(isBlankCorrect(amount, "−38000")).toBe(true);
    expect(isBlankCorrect(amount, "38000.004")).toBe(true);
    expect(isBlankCorrect(amount, "300000")).toBe(false);
  });

  it("datetime — по точности ответа", () => {
    expect(isBlankCorrect(seenAt, "2026-11-18 23:34:00")).toBe(true);
    expect(isBlankCorrect(seenAt, "2026-11-18 22:00:00")).toBe(false);
    expect(isBlankCorrect({ ...seenAt, precision: "day" }, "2026-11-18 22:00:00")).toBe(true);
  });

  it("пакетная сверка сохраняется: 3 верных из 6 подтверждаются, не говоря какие неверны", () => {
    const answers = {
      victim: "Вальц Ирина Петровна",
      plate: "К404ТО",
      seen_at: "2026-11-18 23:34:00",
      amount: "300000",
      purpose: "перевод",
      rows: "2",
    };
    const check = checkProtocol(PROTOCOL, answers, new Set());
    expect(check.newlyConfirmed).toEqual(["victim", "plate", "seen_at"]);
    expect(check.message).not.toMatch(/amount|сумм/);
    const rest = checkProtocol(PROTOCOL, { ...answers, amount: "−38000", purpose: "возврат: отказ получателя", rows: "3" }, new Set(check.confirmed));
    expect(rest.solved).toBe(true);
  });
});
