/**
 * Протокол-дедукция: какие варианты игрок видел, какие может выбрать и как
 * работает пакетное подтверждение (Return of the Obra Dinn).
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { Database } from "sql.js";
import { createDatabase, executeQuery } from "@/engine/database";
import {
  scanSeenOptions,
  availableOptions,
  checkProtocol,
  statementParts,
  confirmedPhrase,
  protocolFailureLine,
} from "@/engine/protocol";
import type { ProtocolDef } from "@/types/case";
import type { QueryResult } from "@/types/database";
import { PEOPLE_SQL, PROTOCOL } from "../helpers/case-fixture";

let db: Database;
const run = (sql: string) => executeQuery(db, sql);

beforeAll(async () => {
  db = await createDatabase();
  db.run(PEOPLE_SQL);
});

const result = (rows: unknown[][], columns = rows[0]?.map((_, i) => `c${i}`) ?? ["c0"]): QueryResult => ({
  columns,
  rows,
  rowCount: rows.length,
  executionTimeMs: 0,
  error: null,
});

describe("statementParts", () => {
  it("разбирает текст и пропуски", () => {
    expect(statementParts("Деньги получил {payee} из {city}.")).toEqual([
      { kind: "text", text: "Деньги получил " },
      { kind: "blank", blankId: "payee" },
      { kind: "text", text: " из " },
      { kind: "blank", blankId: "city" },
      { kind: "text", text: "." },
    ]);
  });

  it("пропуски подряд, в начале и в конце; строка без пропусков", () => {
    expect(statementParts("{a}{b}")).toEqual([
      { kind: "blank", blankId: "a" },
      { kind: "blank", blankId: "b" },
    ]);
    expect(statementParts("Просто текст")).toEqual([{ kind: "text", text: "Просто текст" }]);
    expect(statementParts("")).toEqual([]);
  });
});

describe("scanSeenOptions", () => {
  it("находит варианты в ячейках реального результата", () => {
    expect(scanSeenOptions(PROTOCOL, run("SELECT name, city FROM people WHERE id = 2"))).toEqual([
      "Борис Ёлкин",
      "Северск",
    ]);
  });

  it("сравнение как у валидатора: регистр, пробелы, ё = е", () => {
    const seen = scanSeenOptions(PROTOCOL, result([["  БОРИС ЕЛКИН "], ["южный"]]));
    expect(seen).toEqual(["Борис Ёлкин", "Южный"]);
  });

  it("числа: 80 = '80' = 80.0, 95.25 = '95.250'", () => {
    expect(scanSeenOptions(PROTOCOL, result([[80.0], ["95.250"]]))).toEqual(["80", "95.25"]);
    expect(scanSeenOptions(PROTOCOL, run("SELECT salary FROM people WHERE id IN (2, 3)"))).toEqual(["80", "95.25"]);
  });

  it("только совпадение ячейки целиком, не подстрока", () => {
    expect(scanSeenOptions(PROTOCOL, result([["Анна Лебедева-Смит"], ["Северский"]]))).toEqual([]);
  });

  it("NULL, пустые результаты и ошибки — ничего", () => {
    expect(scanSeenOptions(PROTOCOL, result([[null, null]]))).toEqual([]);
    expect(scanSeenOptions(PROTOCOL, result([], ["name"]))).toEqual([]);
    expect(scanSeenOptions(PROTOCOL, run("SELECT * FROM nope"))).toEqual([]);
  });

  it("вариант из нескольких пропусков возвращается один раз, в порядке протокола", () => {
    // «Анна Лебедева» есть и в payee, и в broker
    expect(scanSeenOptions(PROTOCOL, result([["Глеб Орлов", "Анна Лебедева"]]))).toEqual([
      "Анна Лебедева",
      "Глеб Орлов",
    ]);
  });

  it("одинаково нормализуемые написания в разных пропусках возвращаются оба", () => {
    const protocol: ProtocolDef = {
      ...PROTOCOL,
      blanks: [
        { id: "a", kind: "person", options: ["Ёлкин"], answer: "Ёлкин" },
        { id: "b", kind: "text", options: ["Елкин"], answer: "Елкин" },
      ],
    };
    expect(scanSeenOptions(protocol, result([["ЕЛКИН"]]))).toEqual(["Ёлкин", "Елкин"]);
  });

  it("быстро на 5000×10; в большом результате числа вне столбцов-сущностей не видны (разд. 6.4)", () => {
    const rows = Array.from({ length: 5000 }, (_, r) =>
      Array.from({ length: 10 }, (_, c) => (c % 3 === 0 ? r * 10 + c : `Строка ${r}-${c}`))
    );
    rows[4999][9] = "борис ёлкин";
    const start = performance.now();
    const seen = scanSeenOptions(PROTOCOL, result(rows));
    const elapsed = performance.now() - start;
    // ФИО под любым алиасом: столбец «попал» в варианты person
    expect(seen).toContain("Борис Ёлкин");
    // 80 = r*10+c при r=8, c=0 — но столбец c0 не сущность, а строк больше 200
    expect(seen).not.toContain("80");
    expect(elapsed).toBeLessThan(500);
  });
});

describe("availableOptions", () => {
  const payee = PROTOCOL.blanks[0];
  const broker = PROTOCOL.blanks[3];

  it("по умолчанию — только увиденные", () => {
    expect(availableOptions(payee, new Set())).toEqual([]);
    expect(availableOptions(payee, new Set(["Борис Ёлкин"]))).toEqual(["Борис Ёлкин"]);
  });

  it("порядок вариантов — как в протоколе", () => {
    expect(availableOptions(payee, new Set(["Вера Котова", "Анна Лебедева"]))).toEqual([
      "Анна Лебедева",
      "Вера Котова",
    ]);
  });

  it("сравнение через normalizeCell", () => {
    expect(availableOptions(payee, new Set(["борис елкин"]))).toEqual(["Борис Ёлкин"]);
  });

  it("requireSeen: false — все варианты", () => {
    expect(availableOptions(broker, new Set())).toEqual(["Глеб Орлов", "Анна Лебедева"]);
  });

  it("requireSeen: true явно — как по умолчанию", () => {
    expect(availableOptions({ ...broker, requireSeen: true }, new Set(["Глеб Орлов"]))).toEqual(["Глеб Орлов"]);
  });
});

describe("checkProtocol: пакетное подтверждение", () => {
  const ALL_RIGHT = { payee: "Борис Ёлкин", city: "Северск", amount: "80", broker: "Глеб Орлов" };

  it("все верно с первой попытки — протокол решён", () => {
    const check = checkProtocol(PROTOCOL, ALL_RIGHT, new Set());
    expect(check.newlyConfirmed).toEqual(["payee", "city", "amount", "broker"]);
    expect(check.confirmed).toEqual(["payee", "city", "amount", "broker"]);
    expect(check.solved).toBe(true);
    expect(check.correctUnconfirmed).toBe(0);
    expect(check.message).toBe("Подтверждено 4 пункта. Протокол сходится полностью.");
  });

  it("ровно batchSize верных из 4 — подтверждаются, остальное не раскрывается", () => {
    const check = checkProtocol(PROTOCOL, { ...ALL_RIGHT, broker: "Анна Лебедева" }, new Set());
    expect(check.newlyConfirmed).toEqual(["payee", "city", "amount"]);
    expect(check.solved).toBe(false);
    expect(check.message).toBe("Подтверждено 3 пункта. Остальное пока не сходится.");
    expect(check.message).not.toMatch(/broker|Лебедева/);
  });

  it("верных меньше batchSize — ничего не подтверждается", () => {
    const check = checkProtocol(PROTOCOL, { payee: "Борис Ёлкин", city: "Северск", amount: "120.5" }, new Set());
    expect(check.newlyConfirmed).toEqual([]);
    expect(check.confirmed).toEqual([]);
    expect(check.correctUnconfirmed).toBe(2);
    expect(check.solved).toBe(false);
    expect(check.message).toBe("Слишком мало уверенности: верных меньше трёх. Ничего не подтверждено.");
  });

  it("все оставшиеся верны, даже если их меньше batchSize — подтверждаются", () => {
    const confirmed = new Set(["payee", "city"]);
    const check = checkProtocol(PROTOCOL, { ...ALL_RIGHT, payee: "", city: "" }, confirmed);
    expect(check.newlyConfirmed).toEqual(["amount", "broker"]);
    expect(check.confirmed).toEqual(["payee", "city", "amount", "broker"]);
    expect(check.solved).toBe(true);
  });

  it("один оставшийся пропуск: верен — решено, неверен — нет", () => {
    const confirmed = new Set(["payee", "city", "amount"]);
    const ok = checkProtocol(PROTOCOL, { broker: "Глеб Орлов" }, confirmed);
    expect(ok.newlyConfirmed).toEqual(["broker"]);
    expect(ok.solved).toBe(true);
    expect(ok.message).toBe("Подтверждён 1 пункт. Протокол сходится полностью.");

    const wrong = checkProtocol(PROTOCOL, { broker: "Анна Лебедева" }, confirmed);
    expect(wrong.newlyConfirmed).toEqual([]);
    expect(wrong.confirmed).toEqual(["payee", "city", "amount"]);
    expect(wrong.solved).toBe(false);
  });

  it("оставшиеся 2, верен 1 при batchSize 3 — ничего", () => {
    const confirmed = new Set(["payee", "city"]);
    const check = checkProtocol(PROTOCOL, { amount: "80", broker: "Анна Лебедева" }, confirmed);
    expect(check.newlyConfirmed).toEqual([]);
    expect(check.correctUnconfirmed).toBe(1);
  });

  it("подтверждённые пропуски не перепроверяются, даже если ответ потом сменили", () => {
    const confirmed = new Set(["payee", "city", "amount"]);
    const check = checkProtocol(PROTOCOL, { ...ALL_RIGHT, payee: "Вера Котова" }, confirmed);
    expect(check.solved).toBe(true);
    expect(check.newlyConfirmed).toEqual(["broker"]);
  });

  it("ответы сравниваются как ячейки: регистр, ё/е, числа", () => {
    const check = checkProtocol(
      PROTOCOL,
      { payee: "борис елкин", city: " СЕВЕРСК ", amount: "80.0", broker: "глеб орлов" },
      new Set()
    );
    expect(check.solved).toBe(true);
  });

  it("пустые и отсутствующие ответы — неверные", () => {
    const check = checkProtocol(PROTOCOL, { payee: "  ", city: undefined }, new Set());
    expect(check.newlyConfirmed).toEqual([]);
    expect(check.correctUnconfirmed).toBe(0);
  });

  it("всё уже подтверждено — повторная сверка безвредна", () => {
    const all = new Set(PROTOCOL.blanks.map((b) => b.id));
    const check = checkProtocol(PROTOCOL, {}, all);
    expect(check.solved).toBe(true);
    expect(check.newlyConfirmed).toEqual([]);
    expect(check.message).toBe("Протокол уже подтверждён полностью.");
  });

  it("лишние id в confirmed игнорируются", () => {
    const check = checkProtocol(PROTOCOL, ALL_RIGHT, new Set(["ghost"]));
    expect(check.confirmed).toEqual(["payee", "city", "amount", "broker"]);
  });

  describe("размер пачки", () => {
    const five: ProtocolDef = {
      ...PROTOCOL,
      blanks: ["a", "b", "c", "d", "e"].map((id) => ({ id, kind: "text" as const, options: ["x", "y"], answer: "x" })),
    };
    const answers = (right: number) =>
      Object.fromEntries(five.blanks.map((b, i) => [b.id, i < right ? "x" : "y"]));

    it.each([
      [3, 2, 0],
      [3, 3, 3],
      [3, 4, 4],
      [2, 1, 0],
      [2, 2, 2],
      [5, 4, 0],
      [5, 5, 5],
    ])("batchSize %i, верных %i → подтверждено %i", (batchSize, right, expected) => {
      const check = checkProtocol({ ...five, batchSize }, answers(right), new Set());
      expect(check.newlyConfirmed).toHaveLength(expected);
    });

    it("batchSize 1 — любой верный подтверждается", () => {
      const check = checkProtocol({ ...five, batchSize: 1 }, answers(1), new Set());
      expect(check.newlyConfirmed).toEqual(["a"]);
      expect(check.message).toBe("Подтверждён 1 пункт. Остальное пока не сходится.");
    });

    it("batchSize 1, ни одного верного — своё сообщение", () => {
      const check = checkProtocol({ ...five, batchSize: 1 }, answers(0), new Set());
      expect(check.message).toBe("Ни один пункт не сходится. Ничего не подтверждено.");
    });

    it("мусорный batchSize (0, дробь) приводится к целому ≥ 1", () => {
      expect(checkProtocol({ ...five, batchSize: 0 }, answers(1), new Set()).newlyConfirmed).toEqual(["a"]);
      expect(checkProtocol({ ...five, batchSize: 2.9 }, answers(2), new Set()).newlyConfirmed).toHaveLength(2);
    });

    it("родительный падеж числа в сообщении", () => {
      expect(checkProtocol({ ...five, batchSize: 2 }, answers(1), new Set()).message).toMatch(/меньше двух\./);
      expect(checkProtocol({ ...five, batchSize: 4 }, answers(1), new Set()).message).toMatch(/меньше четырёх\./);
      expect(checkProtocol({ ...five, batchSize: 5 }, answers(1), new Set()).message).toMatch(/меньше пяти\./);
    });

    it("5 подтверждённых — «Подтверждено 5 пунктов»", () => {
      expect(checkProtocol(five, answers(5), new Set()).message).toBe(
        "Подтверждено 5 пунктов. Протокол сходится полностью."
      );
    });
  });
});

describe("confirmedPhrase: склонение", () => {
  it.each([
    [1, "Подтверждён 1 пункт"],
    [2, "Подтверждено 2 пункта"],
    [5, "Подтверждено 5 пунктов"],
    [11, "Подтверждено 11 пунктов"],
    [21, "Подтверждён 21 пункт"],
    [22, "Подтверждено 22 пункта"],
    [25, "Подтверждено 25 пунктов"],
  ])("%i → %s", (n, phrase) => {
    expect(confirmedPhrase(n)).toBe(phrase);
  });
});

describe("protocolFailureLine", () => {
  it("реплики по кругу", () => {
    expect(protocolFailureLine(PROTOCOL, 1)).toBe("Не сходится.");
    expect(protocolFailureLine(PROTOCOL, 2)).toBe("Ещё раз.");
    expect(protocolFailureLine(PROTOCOL, 3)).toBe("Думай.");
    expect(protocolFailureLine(PROTOCOL, 4)).toBe("Не сходится.");
  });

  it("0 и отрицательные — первая реплика; без реплик — undefined", () => {
    expect(protocolFailureLine(PROTOCOL, 0)).toBe("Не сходится.");
    expect(protocolFailureLine({ ...PROTOCOL, failureLines: undefined }, 1)).toBeUndefined();
    expect(protocolFailureLine({ ...PROTOCOL, failureLines: [] }, 1)).toBeUndefined();
  });
});
