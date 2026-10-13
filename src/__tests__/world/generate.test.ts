/**
 * Генератор мира: детерминизм, время, объёмы разд. 8.2, схема разд. 8.2.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { Database } from "sql.js";
import { generateWorld, worldStats, worldSeedNumber } from "@/engine/world/generate";
import { WORLD_TABLES, WORLD_LATE_TABLES, TABLE_BY_NAME } from "@/engine/world/schema";
import { WORLD_SEED } from "@/engine/world/facts";
import { one, rows } from "./helpers";

/** Ожидаемая схема (разд. 8.2 библии): таблица → столбцы по порядку */
const EXPECTED_SCHEMA: Record<string, string[]> = {
  incidents: ["id", "kusp_no", "reported_at", "kind", "district", "address_text", "description", "vehicle_id", "applicant_text", "officer_staff_id", "status", "x_m", "y_m"],
  incident_persons: ["id", "incident_id", "kusp_no", "person_id", "role", "note"],
  persons: ["id", "last_name", "first_name", "patronymic", "full_name", "birth_date", "sex", "father_id", "mother_id", "prev_last_name", "special_marks", "death_date", "created_at"],
  staff: ["id", "person_id", "full_name", "login", "rank", "position", "dept", "workstation", "badge_id", "hired_at", "fired_at", "contract_no"],
  logins: ["login", "staff_id", "role", "created_at", "created_by", "enabled", "last_login_at"],
  workstations: ["id", "room", "floor", "kind", "note"],
  audit_log: ["id", "ts", "login", "workstation", "action", "table_name", "row_id", "field", "old_value", "new_value"],
  query_log: ["id", "logged_at", "login", "terminal", "query_text", "rows_returned", "status", "ts_real", "case_id", "objective_id", "run_id"],
  evidence_registry: ["id", "pinned_at", "pinned_by", "node", "card_title", "source_table", "source_class", "key_json", "value_hash", "status"],
  cron_jobs: ["id", "created_at", "created_by", "condition_json", "sql_template", "fire_after_case", "fired_at"],
  attachments: ["id", "author_login", "table_name", "row_key_json", "created_at", "note_no"],
  cases: ["id", "title", "opened_at", "applicant_text", "investigator", "status", "status_at"],
  doc_registry: ["id", "year", "reg_no", "registered_at", "doc_type", "case_id", "registered_by", "note"],
  statements: ["id", "case_id", "doc_reg_no", "person_id", "person_text", "taken_at", "taken_by", "typed_by", "text", "status"],
  sokol_stage_registry: ["id", "year", "reg_no", "reg_date", "doc_type", "case_id", "registered_by"],
  sokol_stage_statements: ["id", "case_id", "doc_reg_no", "person_text", "taken_at", "taken_by", "typed_by", "text"],
  sokol_stage_persons: ["id", "last_name", "first_name", "patronymic", "full_name", "birth_date", "special_marks", "death_date"],
  zags_deaths: ["act_no", "person_id", "died_at", "cause", "registered_at"],
  morgue_records: ["id", "kusp_no", "received_at", "full_name_text", "person_id", "identified_at", "identified_by"],
  hospital_admissions: ["id", "person_id", "full_name", "admitted_at", "discharged_at", "department", "diagnosis"],
  registrations: ["id", "person_id", "address_id", "from_date", "to_date"],
  addresses: ["id", "district", "street", "house", "apt"],
  vehicles: ["id", "plate", "make", "model", "color", "year", "owner_person_id", "owner_company_id", "owner_name", "registered_at", "sold_at", "deregistered_at"],
  cameras: ["id", "name", "district", "status", "status_reason"],
  plate_reads: ["id", "camera_id", "plate", "read_at", "confidence", "direction"],
  intercom_events: ["id", "ts", "address_id", "method", "code", "key_owner", "guest_name"],
  heat_readings: ["id", "flat_id", "address_id", "ts", "temp_c"],
  delivery_orders: ["id", "courier_person_id", "courier_name", "accepted_at", "delivered_at", "pickup_text", "drop_text", "amount"],
  transit_taps: ["id", "ts", "card_no", "card_kind", "holder_text", "route", "stop"],
  door_access: ["id", "ts", "badge_id", "door", "direction", "note"],
  purchases: ["id", "ts", "merchant", "payer_person_id", "payer_name", "item", "qty", "amount"],
  accounts: ["id", "holder_person_id", "holder_company_id", "holder_name", "bank", "opened_at"],
  transactions: ["id", "ts", "account_id", "amount", "counterparty", "counterparty_account", "channel", "purpose"],
  phones: ["msisdn", "person_id", "company_id", "registered_at"],
  messenger_events: ["id", "ts", "created_at", "from_msisdn", "to_msisdn", "kind", "size_kb", "cell_id", "status"],
  companies: ["id", "name", "inn", "kind", "registered_at", "liquidated_at", "director_person_id"],
  company_owners: ["id", "company_id", "owner_type", "owner_id", "share", "since", "until"],
  share_deals: ["deal_no", "deal_date", "buyer_company_id", "seller_text", "shares", "amount"],
  contracts: ["doc_no", "company_id", "person_id", "counterparty_text", "subject", "signed_at", "clause", "amount"],
  grant_requests: ["id", "requested_at", "requester_person_id", "org_text", "request_text", "status"],
  migration_jobs: ["id", "run_at", "action", "target", "responsible_login", "status"],
  properties: ["id", "address_id", "address_text", "owner_person_id", "acquired_at", "basis", "grantor_company_id"],
  employment: ["id", "person_id", "company_id", "position", "from_date", "to_date"],
  construction_docs: ["id", "doc_no", "subject", "signed_at", "signed_by_person_id", "supersedes_doc_id", "x_m", "y_m", "rationale"],
  outfall_temp: ["id", "ts", "temp_c", "station"],
  diver_reports: ["id", "report_date", "location", "note", "checked_by"],
  gs_comms_2015: ["id", "ts_unix", "kind", "from_ext", "to_number", "recipient_name", "duration_sec", "text"],
  gs_phonebook: ["ext", "room", "holder_person_id", "from_date", "to_date"],
};

const EXPECTED_LATE: Record<string, string[]> = {
  bank_statements: ["id", "ts", "statement_no", "payer", "payer_account", "payee", "payee_account", "amount", "purpose"],
  nina_carbon: ["id", "doc_reg_no", "person_text", "typed_at_text", "text"],
  draft_statements: EXPECTED_SCHEMA.statements,
  draft_persons: EXPECTED_SCHEMA.persons,
  draft_publication: ["id", "person_id", "person_text", "person_birth_date", "source_role", "ts", "place", "what", "source_class"],
  publication_source: ["id", "person_id", "person_text", "person_birth_date", "source_role", "ts", "place", "what", "source_class"],
  publication: ["id", "person_id", "person_text", "person_birth_date", "source_role", "ts", "place", "what", "source_class"],
};

/** Отпечаток таблицы: FNV-1a по всем строкам в порядке rowid */
function checksum(db: Database, table: string): string {
  let h = 0x811c9dc5;
  const stmt = db.prepare(`SELECT * FROM main.${table} ORDER BY rowid`);
  try {
    while (stmt.step()) {
      const s = JSON.stringify(stmt.get());
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    }
  } finally {
    stmt.free();
  }
  return h.toString(16);
}

function tableNames(db: Database): string[] {
  return rows(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => String(r[0]));
}

let a: Database;
let b: Database;
let msA = 0;
let msB = 0;

beforeAll(async () => {
  let t = performance.now();
  a = await generateWorld();
  msA = performance.now() - t;
  t = performance.now();
  b = await generateWorld(WORLD_SEED);
  msB = performance.now() - t;
  const stats = worldStats(b);
  console.log(`[world] генерация: ${Math.round(msA)} мс (с загрузкой WASM), ${Math.round(msB)} мс (повтор); строк: ${Object.values(stats?.rows ?? {}).reduce((x, y) => x + y, 0)}`);
}, 30_000);

describe("детерминизм", () => {
  it("зерно 'POLYNYA-S1' хешируется в одно и то же uint32", () => {
    expect(worldSeedNumber()).toBe(worldSeedNumber("POLYNYA-S1"));
    expect(worldSeedNumber("POLYNYA-S1")).not.toBe(worldSeedNumber("POLYNYA-S2"));
  });

  it("две генерации дают одинаковые таблицы (отпечатки совпадают)", () => {
    const names = tableNames(a);
    expect(tableNames(b)).toEqual(names);
    for (const t of names) expect(checksum(b, t), t).toBe(checksum(a, t));
  });
});

describe("время генерации", () => {
  it("меньше 4 с в Node (цель — меньше 2 с)", () => {
    expect(msA).toBeLessThan(4000);
    expect(msB).toBeLessThan(4000);
  });
});

describe("схема (разд. 8.2)", () => {
  it("есть все таблицы базового мира с нужными столбцами по порядку", () => {
    for (const [table, columns] of Object.entries(EXPECTED_SCHEMA)) {
      const actual = rows(a, `PRAGMA table_xinfo('${table}')`).map((r) => String(r[1]));
      expect(actual, table).toEqual(columns);
    }
    expect(tableNames(a).sort()).toEqual(Object.keys(EXPECTED_SCHEMA).sort());
  });

  it("поздние таблицы не созданы, но их DDL готов и совпадает со схемой", () => {
    expect(Object.keys(WORLD_LATE_TABLES).sort()).toEqual(Object.keys(EXPECTED_LATE).sort());
    for (const t of Object.keys(EXPECTED_LATE)) expect(tableNames(a)).not.toContain(t);
    for (const [t, cols] of Object.entries(EXPECTED_LATE)) {
      expect(TABLE_BY_NAME.get(t)?.columns.map((c) => c.name), t).toEqual(cols);
    }
  });

  it("persons.full_name — генерируемый столбец", () => {
    expect(one(a, "SELECT sql FROM sqlite_master WHERE name = 'persons'")).toMatch(/full_name TEXT GENERATED ALWAYS AS/);
    expect(one(a, "SELECT full_name FROM persons WHERE id = 4127")).toBe("Вальц Ирина Петровна");
  });

  it("staging-таблицы «Сокола» есть и пусты", () => {
    for (const t of ["sokol_stage_registry", "sokol_stage_statements", "sokol_stage_persons"]) {
      expect(one(a, `SELECT COUNT(*) FROM ${t}`)).toBe(0);
    }
  });

  it("индексы из разд. 8.2 есть, индекса по incidents.reported_at нет (М1)", () => {
    const idx = rows(a, "SELECT tbl_name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL").map((r) => `${r[0]}: ${r[1]}`);
    for (const need of ["plate_reads(plate)", "plate_reads(camera_id, read_at)", "door_access(badge_id, ts)", "audit_log(login, ts)", "query_log(login, logged_at)", "transactions(account_id, ts)", "doc_registry(year, reg_no)", "intercom_events(address_id, ts)"]) {
      expect(idx.some((s) => s.includes(need)), need).toBe(true);
    }
    expect(idx.some((s) => /incidents\(reported_at/.test(s))).toBe(false);
  });

  it("метаданные схемы: у каждой таблицы со столбцом горизонта он существует", () => {
    for (const t of WORLD_TABLES) {
      if (t.horizon) expect(t.columns.some((c) => c.name === t.horizon), t.name).toBe(true);
    }
  });
});

describe("объёмы (разд. 8.2, ±15 %)", () => {
  it("каждая таблица базового мира в пределах ±15 % от цели", () => {
    for (const t of WORLD_TABLES) {
      if (t.late || t.target === 0) continue;
      // logins и staff без игрока: его вставляет патч p0.player
      const n = Number(one(a, `SELECT COUNT(*) FROM ${t.name}`));
      expect(n, t.name).toBeGreaterThanOrEqual(Math.floor(t.target * 0.85));
      expect(n, t.name).toBeLessThanOrEqual(Math.ceil(t.target * 1.15));
    }
  });

  it("всего ≈ 55 400 строк базового мира", () => {
    const total = tableNames(a).reduce((s, t) => s + Number(one(a, `SELECT COUNT(*) FROM ${t}`)), 0);
    expect(total).toBeGreaterThan(50_000);
    expect(total).toBeLessThan(62_000);
  });
});
