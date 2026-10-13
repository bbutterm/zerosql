import { beforeAll, describe, expect, it } from "vitest";
import { ANSWER_SQL, PEOPLE, SAMPLE_SQL, STAFF, WIDE_SQL, LAB_QUERIES, createLabWorld, type LabWorld } from "@/app/lab/world";
import { CHARACTERS, EVIDENCE, EXTRA_EVIDENCE, OBJECTIVES, PROTOCOL, PROTOCOL_ANSWERS } from "@/app/lab/mock";

/**
 * Лаборатория показывает мир, который игрок будет читать: никаких противоречий на экране.
 * Имя ↔ пропуск ↔ смена — один к одному; результат соответствует показанному запросу;
 * распечатки улик — это вывод их же запросов.
 */

let world: LabWorld;
beforeAll(async () => {
  world = await createLabWorld();
});

const rowsOf = (sql: string) => {
  const r = world.run(sql);
  expect(r.error).toBeNull();
  return r;
};

describe("lab world: состав", () => {
  it("каждый пропуск принадлежит одному человеку, у человека не больше одного пропуска", () => {
    const r = rowsOf(
      "SELECT s.badge_id, COUNT(DISTINCT r.full_name) FROM staff s JOIN residents r ON r.id = s.resident_id GROUP BY s.badge_id"
    );
    expect(r.rows.length).toBe(STAFF.length);
    for (const [, names] of r.rows) expect(names).toBe(1);
    const per = rowsOf("SELECT resident_id, COUNT(*) FROM staff GROUP BY resident_id HAVING COUNT(*) > 1");
    expect(per.rows).toHaveLength(0);
  });

  it("в журнале пропусков нет чужих пропусков", () => {
    const r = rowsOf("SELECT DISTINCT badge_id FROM access_log WHERE badge_id NOT IN (SELECT badge_id FROM staff)");
    expect(r.rows).toHaveLength(0);
  });

  it("в любом результате с именем и пропуском пара всегда одна и та же", () => {
    const r = rowsOf(SAMPLE_SQL);
    const name = r.columns.indexOf("full_name");
    const badge = r.columns.indexOf("badge_id");
    const byBadge = new Map<unknown, Set<unknown>>();
    for (const row of r.rows) byBadge.set(row[badge], (byBadge.get(row[badge]) ?? new Set()).add(row[name]));
    for (const names of byBadge.values()) expect(names.size).toBe(1);
    const roster = new Map(STAFF.map((p) => [p.badge, p.name]));
    for (const [b, names] of byBadge) expect([...names][0]).toBe(roster.get(b as string));
  });

  it("возраст персонажей сходится с годом рождения в реестре жителей", () => {
    for (const c of Object.values(CHARACTERS)) {
      const p = PEOPLE.find((x) => x.name === c.name);
      expect(p, c.name).toBeDefined();
      expect(2026 - Number(p!.born.slice(0, 4))).toBe(c.age);
    }
  });
});

describe("lab world: показанный запрос и его результат", () => {
  it("SAMPLE_SQL: шесть столбцов из SELECT, только ночь, по времени входа", () => {
    const r = rowsOf(SAMPLE_SQL);
    expect(r.columns).toEqual(["id", "full_name", "badge_id", "gate", "entered_at", "exited_at"]);
    expect(r.rows.length).toBeGreaterThanOrEqual(20);
    const entered = r.rows.map((row) => String(row[4]));
    for (const t of entered) expect(t >= "2026-12-13 22:00").toBe(true);
    expect([...entered].sort()).toEqual(entered);
    // Выходы позже синхронизации зеркала (02:30) не известны
    for (const row of r.rows) if (row[5] !== null) expect(String(row[5]) <= "2026-12-14 02:30").toBe(true);
  });

  it("ответ задания 3 — ровно проход Рябова в 01:52, без выхода", () => {
    const r = rowsOf(ANSWER_SQL);
    expect(r.rows).toHaveLength(1);
    const row = Object.fromEntries(r.columns.map((c, i) => [c, r.rows[0][i]]));
    expect(row).toMatchObject({ id: 1060, badge_id: "B-0417", gate: "северный шлюз", entered_at: "2026-12-14 01:52", exited_at: null });
  });

  it("Лапин — B-0233, вход в 01:47 без выхода; Рябов вышел в 23:58", () => {
    expect(STAFF.find((p) => p.badge === "B-0233")?.name).toBe("Игорь Лапин");
    expect(OBJECTIVES.find((o) => o.id === "o2")?.outcome).toContain("Игорь Лапин");
    const lapin = rowsOf("SELECT entered_at, exited_at FROM access_log WHERE badge_id = 'B-0233' ORDER BY entered_at DESC LIMIT 1");
    expect(lapin.rows[0]).toEqual(["2026-12-14 01:47", null]);
    const ryabov = rowsOf("SELECT exited_at FROM access_log WHERE badge_id = 'B-0417' AND gate = 'главный вход'");
    expect(ryabov.rows[0][0]).toBe("2026-12-13 23:58");
  });

  it("северный шлюз в ночь на 14-е открывали девять раз (следствие задания 1)", () => {
    const r = rowsOf(
      "SELECT COUNT(*) FROM access_log WHERE gate = 'северный шлюз' AND entered_at BETWEEN '2026-12-13 22:00' AND '2026-12-14 06:00'"
    );
    expect(r.rows[0][0]).toBe(9);
    expect(OBJECTIVES.find((o) => o.id === "o1")?.outcome).toMatch(/девять/);
  });

  it("ночная смена — трое, как говорит Ахметов", () => {
    const r = rowsOf("SELECT r.full_name FROM staff s JOIN residents r ON r.id = s.resident_id WHERE s.shift = 'ночь' ORDER BY 1");
    expect(r.rows.map((x) => x[0])).toEqual(["Дмитрий Рябов", "Игорь Лапин", "Тимур Ахметов"]);
  });

  it("широкий запрос и телеметрия дают настоящий объём", () => {
    expect(rowsOf(WIDE_SQL).columns).toHaveLength(8);
    expect(rowsOf(LAB_QUERIES.long).rowCount).toBeGreaterThan(1000);
    expect(rowsOf(LAB_QUERIES.empty).rowCount).toBe(0);
  });
});

describe("lab world: распечатки улик — вывод их запросов", () => {
  for (const card of [...EVIDENCE, EXTRA_EVIDENCE].filter((c) => c.excerpt)) {
    it(card.id, () => {
      const r = rowsOf(card.sourceQuery!);
      expect(r.columns).toEqual(card.excerpt!.columns);
      expect(r.rows).toEqual(card.excerpt!.rows);
    });
  }

  it("время на предмете совпадает с отмеченной строкой", () => {
    const badge = EVIDENCE.find((c) => c.id === "ev-ryabov-badge")!;
    const [r, c] = badge.excerpt!.mark!;
    expect(badge.excerpt!.rows[r][c]).toBe("B-0417");
    expect(badge.excerpt!.rows[r][3]).toBe(badge.at);
  });

  it("звонок в 02:12 есть в calls и длится столько же, сколько запись", () => {
    const call = EVIDENCE.find((c) => c.id === "ev-call")!;
    const r = rowsOf(call.sourceQuery!);
    expect(r.rows).toHaveLength(1);
    const seconds = Number(r.rows[0][r.columns.indexOf("seconds")]);
    const [m, s] = call.duration!.split(":").map(Number);
    expect(m * 60 + s).toBe(seconds);
  });

  it("найдено не раньше, чем случилось", () => {
    for (const c of [...EVIDENCE, EXTRA_EVIDENCE]) {
      if (c.at && c.foundAt) expect(c.foundAt >= c.at, c.id).toBe(true);
    }
  });

  it("бланк заключения отвечает данными мира", () => {
    expect(PROTOCOL.find((q) => q.id === "q1")?.text).toMatch(/северный шлюз/);
    expect(PROTOCOL_ANSWERS["p-who"]).toBe("ryabov");
    expect(PROTOCOL_ANSWERS["p-when"]).toBe("0152");
  });
});

describe("lab world: ошибки — настоящие, через фасад", () => {
  it("опечатка в столбце предлагает full_name", () => {
    const r = world.run(LAB_QUERIES.error);
    expect(r.errorKind).toBe("sql");
    expect(r.errorHelp?.suggestion).toMatch(/full_name/);
  });
  it("засекреченная таблица — отказ, а не ошибка SQLite", () => {
    expect(world.run(LAB_QUERIES.locked).errorKind).toBe("locked_table");
  });
  it("запись в зеркало запрещена", () => {
    expect(world.run(LAB_QUERIES.readOnly).errorKind).toBe("read_only");
  });
});
