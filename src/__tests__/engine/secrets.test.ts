/**
 * Тайники: срабатывают по правилу на результате любого запроса, только при
 * открытых таблицах, один раз.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { Database } from "sql.js";
import { createDatabase, executeQuery } from "@/engine/database";
import { checkSecrets } from "@/engine/secrets";
import type { SecretDef } from "@/types/case";
import { PEOPLE_SQL } from "../helpers/case-fixture";

let db: Database;
const run = (sql: string) => executeQuery(db, sql);

beforeAll(async () => {
  db = await createDatabase();
  db.run(PEOPLE_SQL);
  db.run("CREATE TABLE vault (code TEXT); INSERT INTO vault VALUES ('ПОЛЯРНАЯ НОЧЬ');");
});

const SECRETS: SecretDef[] = [
  {
    id: "secret.yolkin",
    title: "Ёлкин",
    text: "Он здесь.",
    trigger: { type: "cell_value", value: "борис елкин", columns: ["name"] },
  },
  {
    id: "secret.vault",
    title: "Сейф",
    text: "Код от сейфа.",
    trigger: { type: "cell_value", value: "Полярная ночь" },
    tables: ["vault"],
  },
  {
    id: "secret.many",
    title: "Все четверо",
    text: "Полный состав.",
    trigger: { type: "row_count", expected: 4, comparison: "gte" },
    tables: ["People"],
  },
];

describe("checkSecrets", () => {
  it("срабатывает по правилу (с учётом ё/е и регистра)", () => {
    expect(checkSecrets(SECRETS, run("SELECT name FROM people WHERE id = 2"), db, new Set(), null)).toEqual([
      "secret.yolkin",
    ]);
  });

  it("несколько тайников одним запросом — в порядке объявления", () => {
    expect(checkSecrets(SECRETS, run("SELECT name FROM people"), db, new Set(), null)).toEqual([
      "secret.yolkin",
      "secret.many",
    ]);
  });

  it("уже найденные не возвращаются", () => {
    const found = new Set(["secret.yolkin"]);
    expect(checkSecrets(SECRETS, run("SELECT name FROM people"), db, found, null)).toEqual(["secret.many"]);
  });

  it("закрытые таблицы блокируют тайник, даже если правило прошло", () => {
    const result = run("SELECT code FROM vault");
    expect(checkSecrets(SECRETS, result, db, new Set(), ["people"])).toEqual([]);
    expect(checkSecrets(SECRETS, result, db, new Set(), ["people", "vault"])).toEqual(["secret.vault"]);
  });

  it("имена таблиц без учёта регистра", () => {
    expect(checkSecrets(SECRETS, run("SELECT id FROM people"), db, new Set(), ["PEOPLE"])).toEqual(["secret.many"]);
  });

  it("null — открыты все таблицы; тайник без tables не зависит от доступа", () => {
    expect(checkSecrets(SECRETS, run("SELECT code FROM vault"), db, new Set(), null)).toEqual(["secret.vault"]);
    expect(checkSecrets(SECRETS, run("SELECT 'Борис Ёлкин' AS name"), db, new Set(), [])).toEqual(["secret.yolkin"]);
  });

  it("ошибка запроса — ничего", () => {
    expect(checkSecrets(SECRETS, run("SELECT * FROM nope"), db, new Set(), null)).toEqual([]);
  });

  it("пустой результат и NULL — без ложных срабатываний", () => {
    expect(checkSecrets(SECRETS, run("SELECT name FROM people WHERE 0"), db, new Set(), null)).toEqual([]);
    expect(checkSecrets(SECRETS, run("SELECT NULL AS name"), db, new Set(), null)).toEqual([]);
  });

  it("сломанное правило пропускается, остальные проверяются", () => {
    const broken: SecretDef[] = [
      {
        id: "secret.broken",
        title: "",
        text: "",
        trigger: {
          type: "custom",
          check: () => {
            throw new Error("boom");
          },
        },
      },
      ...SECRETS,
    ];
    expect(checkSecrets(broken, run("SELECT name FROM people WHERE id = 2"), db, new Set(), null)).toEqual([
      "secret.yolkin",
    ]);
  });

  it("дубликат id в определениях не выдаётся дважды", () => {
    expect(checkSecrets([SECRETS[0], SECRETS[0]], run("SELECT name FROM people"), db, new Set(), null)).toEqual([
      "secret.yolkin",
    ]);
  });
});
