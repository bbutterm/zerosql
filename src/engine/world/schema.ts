/**
 * Схема мира «Полыньи» — все таблицы разд. 8.2 библии (ПБД, ЗЕРКАЛО,
 * независимые носители) и метаданные к ним: слой, дело, в котором таблица
 * открывается, столбец горизонта, целевой объём.
 *
 * DDL собирается из метаданных, поэтому описание и база не расходятся.
 * Внешние ключи объявлены для панели схемы, но не проверяются
 * (PRAGMA foreign_keys = OFF): грязь вроде опечаток в staff.person_id —
 * часть сюжета (Д4).
 *
 * Поздние таблицы (nina_carbon, bank_statements, draft_*, publication,
 * publication_source) физически создаются только сюжетным патчем при
 * открытии дела — их DDL лежит отдельно, в WORLD_LATE_TABLES.
 */
import { CASE_START, type CaseKey } from "./facts";

export type Layer = "ПБД" | "ЗЕР" | "НОС";
export type ColumnType = "INTEGER" | "TEXT" | "REAL";

export interface ColumnDef {
  name: string;
  type: ColumnType;
  pk?: boolean;
  /** Выражение генерируемого столбца (STORED) */
  generated?: string;
  /** Ссылка для панели схемы: 'persons(id)' */
  references?: string;
}

export interface TableDef {
  name: string;
  layer: Layer;
  /** Короткий ключ дела, в котором таблица открывается (null — закрыта до сюжетного патча) */
  opensIn: CaseKey | null;
  /** Столбец горизонта: строки позже game_now() скрыты TEMP VIEW */
  horizon?: string;
  /** Целевой объём из разд. 8.2 (для поздних — после наполнения) */
  target: number;
  /** Создаётся сюжетным патчем при открытии дела */
  late?: boolean;
  /** Дела, где таблица открыта на запись (представление горизонта снимается) */
  writableIn?: CaseKey[];
  columns: ColumnDef[];
}

const I = (name: string, references?: string): ColumnDef => ({ name, type: "INTEGER", references });
const T = (name: string): ColumnDef => ({ name, type: "TEXT" });
const R = (name: string): ColumnDef => ({ name, type: "REAL" });
const PK = (name = "id", type: ColumnType = "INTEGER"): ColumnDef => ({ name, type, pk: true });

/** Генерируемое ФИО: до || в Д10 игроку не нужно склеивать его вручную */
export const FULL_NAME_EXPR =
  "trim(last_name || ' ' || first_name || coalesce(' ' || patronymic, ''))";
const FULL_NAME: ColumnDef = { name: "full_name", type: "TEXT", generated: FULL_NAME_EXPR };

const PERSON_COLUMNS: ColumnDef[] = [
  PK(), T("last_name"), T("first_name"), T("patronymic"), FULL_NAME, T("birth_date"), T("sex"),
  I("father_id", "persons(id)"), I("mother_id", "persons(id)"), T("prev_last_name"), T("special_marks"),
  T("death_date"), T("created_at"),
];

const STATEMENT_COLUMNS: ColumnDef[] = [
  PK(), { ...T("case_id"), references: "cases(id)" }, I("doc_reg_no"), I("person_id", "persons(id)"),
  T("person_text"), T("taken_at"), T("taken_by"), T("typed_by"), T("text"), T("status"),
];

const PUBLICATION_COLUMNS: ColumnDef[] = [
  PK(), I("person_id", "persons(id)"), T("person_text"), T("person_birth_date"), T("source_role"), T("ts"),
  T("place"), T("what"), T("source_class"),
];

/** Столбцы снимков «Сокола» (staging и представления arch16_*) */
const STAGE_REGISTRY_COLUMNS: ColumnDef[] = [
  PK(), I("year"), I("reg_no"), T("reg_date"), T("doc_type"), T("case_id"), T("registered_by"),
];
const STAGE_STATEMENT_COLUMNS: ColumnDef[] = [
  PK(), T("case_id"), I("doc_reg_no"), T("person_text"), T("taken_at"), T("taken_by"), T("typed_by"), T("text"),
];
const STAGE_PERSON_COLUMNS: ColumnDef[] = [
  PK(), T("last_name"), T("first_name"), T("patronymic"), FULL_NAME, T("birth_date"), T("special_marks"),
  T("death_date"),
];

export const WORLD_TABLES: readonly TableDef[] = [
  // ---------------------------------------------------------------- ПБД
  {
    name: "incidents", layer: "ПБД", opensIn: "c00", horizon: "reported_at", target: 2000,
    columns: [
      PK(), I("kusp_no"), T("reported_at"), T("kind"), T("district"), T("address_text"), T("description"),
      I("vehicle_id", "vehicles(id)"), T("applicant_text"), I("officer_staff_id", "staff(id)"), T("status"),
      R("x_m"), R("y_m"),
    ],
  },
  {
    name: "incident_persons", layer: "ПБД", opensIn: "c03", target: 1500,
    columns: [PK(), I("incident_id", "incidents(id)"), I("kusp_no"), I("person_id", "persons(id)"), T("role"), T("note")],
  },
  { name: "persons", layer: "ПБД", opensIn: "c03", target: 4301, writableIn: ["c12"], columns: PERSON_COLUMNS },
  {
    name: "staff", layer: "ПБД", opensIn: "c00", target: 150,
    columns: [
      PK(), I("person_id", "persons(id)"), T("full_name"), T("login"), T("rank"), T("position"), T("dept"),
      T("workstation"), T("badge_id"), T("hired_at"), T("fired_at"), T("contract_no"),
    ],
  },
  {
    name: "logins", layer: "ПБД", opensIn: "c04", target: 170,
    columns: [
      PK("login", "TEXT"), I("staff_id", "staff(id)"), T("role"), T("created_at"), T("created_by"), I("enabled"),
      T("last_login_at"),
    ],
  },
  {
    name: "workstations", layer: "ПБД", opensIn: "c04", target: 40,
    columns: [PK("id", "TEXT"), T("room"), T("floor"), T("kind"), T("note")],
  },
  {
    name: "audit_log", layer: "ПБД", opensIn: "c04", horizon: "ts", target: 3800,
    columns: [
      PK(), T("ts"), T("login"), T("workstation"), T("action"), T("table_name"), T("row_id"), T("field"),
      T("old_value"), T("new_value"),
    ],
  },
  {
    name: "query_log", layer: "ПБД", opensIn: "c04", horizon: "logged_at", target: 1200,
    columns: [
      PK(), T("logged_at"), T("login"), T("terminal"), T("query_text"), I("rows_returned"), T("status"),
      T("ts_real"), T("case_id"), T("objective_id"), T("run_id"),
    ],
  },
  {
    name: "evidence_registry", layer: "ПБД", opensIn: "c10", horizon: "pinned_at", target: 300, writableIn: ["c12"],
    columns: [
      PK(), T("pinned_at"), T("pinned_by"), T("node"), T("card_title"), T("source_table"), T("source_class"),
      T("key_json"), T("value_hash"), T("status"),
    ],
  },
  {
    name: "cron_jobs", layer: "ПБД", opensIn: "c08", target: 9,
    columns: [
      PK(), T("created_at"), T("created_by"), T("condition_json"), T("sql_template"), T("fire_after_case"),
      T("fired_at"),
    ],
  },
  {
    name: "attachments", layer: "ПБД", opensIn: "c10", target: 40,
    columns: [PK(), T("author_login"), T("table_name"), T("row_key_json"), T("created_at"), I("note_no")],
  },
  {
    name: "cases", layer: "ПБД", opensIn: "c05", target: 600,
    columns: [
      PK("id", "TEXT"), T("title"), T("opened_at"), T("applicant_text"), T("investigator"), T("status"),
      T("status_at"),
    ],
  },
  {
    name: "doc_registry", layer: "ПБД", opensIn: "c05", target: 5850,
    columns: [
      PK(), I("year"), I("reg_no"), T("registered_at"), T("doc_type"), { ...T("case_id"), references: "cases(id)" },
      T("registered_by"), T("note"),
    ],
  },
  {
    name: "statements", layer: "ПБД", opensIn: "c05", horizon: "taken_at", target: 1300, writableIn: ["c12"],
    columns: STATEMENT_COLUMNS,
  },
  { name: "sokol_stage_registry", layer: "ПБД", opensIn: null, target: 0, columns: STAGE_REGISTRY_COLUMNS },
  { name: "sokol_stage_statements", layer: "ПБД", opensIn: null, target: 0, columns: STAGE_STATEMENT_COLUMNS },
  { name: "sokol_stage_persons", layer: "ПБД", opensIn: null, target: 0, columns: STAGE_PERSON_COLUMNS },

  // ---------------------------------------------------------------- ЗЕРКАЛО
  {
    name: "zags_deaths", layer: "ЗЕР", opensIn: "c04", horizon: "registered_at", target: 400,
    columns: [PK("act_no", "TEXT"), I("person_id", "persons(id)"), T("died_at"), T("cause"), T("registered_at")],
  },
  {
    name: "morgue_records", layer: "ЗЕР", opensIn: "c03", horizon: "received_at", target: 400,
    columns: [
      PK(), I("kusp_no"), T("received_at"), T("full_name_text"), I("person_id", "persons(id)"), T("identified_at"),
      T("identified_by"),
    ],
  },
  {
    name: "hospital_admissions", layer: "ЗЕР", opensIn: "c07", horizon: "admitted_at", target: 600,
    columns: [
      PK(), I("person_id", "persons(id)"), T("full_name"), T("admitted_at"), T("discharged_at"), T("department"),
      T("diagnosis"),
    ],
  },
  {
    name: "registrations", layer: "ЗЕР", opensIn: "c06", target: 2200,
    columns: [PK(), I("person_id", "persons(id)"), I("address_id", "addresses(id)"), T("from_date"), T("to_date")],
  },
  {
    name: "addresses", layer: "ЗЕР", opensIn: "c06", target: 900,
    columns: [PK(), T("district"), T("street"), T("house"), T("apt")],
  },
  {
    name: "vehicles", layer: "ЗЕР", opensIn: "c01", target: 1400,
    columns: [
      PK(), T("plate"), T("make"), T("model"), T("color"), I("year"), I("owner_person_id", "persons(id)"),
      I("owner_company_id", "companies(id)"), T("owner_name"), T("registered_at"), T("sold_at"),
      T("deregistered_at"),
    ],
  },
  {
    name: "cameras", layer: "ЗЕР", opensIn: "c01", target: 60,
    columns: [PK(), T("name"), T("district"), T("status"), T("status_reason")],
  },
  {
    name: "plate_reads", layer: "ЗЕР", opensIn: "c01", horizon: "read_at", target: 4000,
    columns: [PK(), I("camera_id", "cameras(id)"), T("plate"), T("read_at"), R("confidence"), T("direction")],
  },
  {
    name: "intercom_events", layer: "ЗЕР", opensIn: "c02", horizon: "ts", target: 1200,
    columns: [
      PK(), T("ts"), I("address_id", "addresses(id)"), T("method"), T("code"), T("key_owner"), T("guest_name"),
    ],
  },
  {
    name: "heat_readings", layer: "ЗЕР", opensIn: "c02", horizon: "ts", target: 864,
    columns: [PK(), T("flat_id"), I("address_id", "addresses(id)"), T("ts"), R("temp_c")],
  },
  {
    name: "delivery_orders", layer: "ЗЕР", opensIn: "c02", horizon: "accepted_at", target: 300,
    columns: [
      PK(), I("courier_person_id", "persons(id)"), T("courier_name"), T("accepted_at"), T("delivered_at"),
      T("pickup_text"), T("drop_text"), R("amount"),
    ],
  },
  {
    name: "transit_taps", layer: "ЗЕР", opensIn: "c00", horizon: "ts", target: 300,
    columns: [PK(), T("ts"), T("card_no"), T("card_kind"), T("holder_text"), T("route"), T("stop")],
  },
  {
    name: "door_access", layer: "ЗЕР", opensIn: "c08", horizon: "ts", target: 3500,
    columns: [PK(), T("ts"), T("badge_id"), T("door"), T("direction"), T("note")],
  },
  {
    name: "purchases", layer: "ЗЕР", opensIn: "c08", horizon: "ts", target: 1200,
    columns: [
      PK(), T("ts"), T("merchant"), I("payer_person_id", "persons(id)"), T("payer_name"), T("item"), I("qty"),
      R("amount"),
    ],
  },
  {
    name: "accounts", layer: "ЗЕР", opensIn: "c07", target: 1300,
    columns: [
      PK("id", "TEXT"), I("holder_person_id", "persons(id)"), I("holder_company_id", "companies(id)"),
      T("holder_name"), T("bank"), T("opened_at"),
    ],
  },
  {
    name: "transactions", layer: "ЗЕР", opensIn: "c02", horizon: "ts", target: 4200,
    columns: [
      PK(), T("ts"), { ...T("account_id"), references: "accounts(id)" }, R("amount"), T("counterparty"),
      T("counterparty_account"), T("channel"), T("purpose"),
    ],
  },
  {
    name: "phones", layer: "ЗЕР", opensIn: "c08", target: 1800,
    columns: [
      PK("msisdn", "TEXT"), I("person_id", "persons(id)"), I("company_id", "companies(id)"), T("registered_at"),
    ],
  },
  {
    name: "messenger_events", layer: "ЗЕР", opensIn: "c08", horizon: "created_at", target: 2000,
    columns: [
      PK(), T("ts"), T("created_at"), T("from_msisdn"), T("to_msisdn"), T("kind"), I("size_kb"), T("cell_id"),
      T("status"),
    ],
  },
  {
    name: "companies", layer: "ЗЕР", opensIn: "c03", target: 250,
    columns: [
      PK(), T("name"), T("inn"), T("kind"), T("registered_at"), T("liquidated_at"),
      I("director_person_id", "persons(id)"),
    ],
  },
  {
    name: "company_owners", layer: "ЗЕР", opensIn: "c09", target: 400,
    columns: [
      PK(), I("company_id", "companies(id)"), T("owner_type"), I("owner_id"), R("share"), T("since"), T("until"),
    ],
  },
  {
    name: "share_deals", layer: "ЗЕР", opensIn: "c09", target: 300,
    columns: [
      PK("deal_no", "TEXT"), T("deal_date"), I("buyer_company_id", "companies(id)"), T("seller_text"), I("shares"),
      R("amount"),
    ],
  },
  {
    name: "contracts", layer: "ЗЕР", opensIn: "c09", target: 300,
    columns: [
      PK("doc_no", "TEXT"), I("company_id", "companies(id)"), I("person_id", "persons(id)"), T("counterparty_text"),
      T("subject"), T("signed_at"), T("clause"), R("amount"),
    ],
  },
  {
    name: "grant_requests", layer: "ЗЕР", opensIn: "c09", target: 120,
    columns: [
      PK(), T("requested_at"), I("requester_person_id", "persons(id)"), T("org_text"), T("request_text"),
      T("status"),
    ],
  },
  {
    name: "migration_jobs", layer: "ЗЕР", opensIn: "c09", target: 20,
    columns: [PK(), T("run_at"), T("action"), T("target"), T("responsible_login"), T("status")],
  },
  {
    name: "properties", layer: "ЗЕР", opensIn: "c07", target: 1000,
    columns: [
      PK(), I("address_id", "addresses(id)"), T("address_text"), I("owner_person_id", "persons(id)"),
      T("acquired_at"), T("basis"), I("grantor_company_id", "companies(id)"),
    ],
  },
  {
    name: "employment", layer: "ЗЕР", opensIn: "c07", target: 1800,
    columns: [
      PK(), I("person_id", "persons(id)"), I("company_id", "companies(id)"), T("position"), T("from_date"),
      T("to_date"),
    ],
  },
  {
    name: "construction_docs", layer: "ЗЕР", opensIn: "c06", target: 300,
    columns: [
      PK(), T("doc_no"), T("subject"), T("signed_at"), I("signed_by_person_id", "persons(id)"),
      I("supersedes_doc_id", "construction_docs(id)"), R("x_m"), R("y_m"), T("rationale"),
    ],
  },
  {
    name: "outfall_temp", layer: "ЗЕР", opensIn: "c06", horizon: "ts", target: 1600,
    columns: [PK(), T("ts"), R("temp_c"), T("station")],
  },
  {
    name: "diver_reports", layer: "ЗЕР", opensIn: "c06", target: 80,
    columns: [PK(), T("report_date"), T("location"), T("note"), T("checked_by")],
  },
  {
    name: "gs_comms_2015", layer: "ЗЕР", opensIn: "c06", target: 1200,
    columns: [
      PK(), I("ts_unix"), T("kind"), T("from_ext"), T("to_number"), T("recipient_name"), I("duration_sec"),
      T("text"),
    ],
  },
  {
    name: "gs_phonebook", layer: "ЗЕР", opensIn: "c06", target: 150,
    columns: [T("ext"), T("room"), I("holder_person_id", "persons(id)"), T("from_date"), T("to_date")],
  },

  // ---------------------------------------------------------------- независимые носители (поздние)
  {
    name: "bank_statements", layer: "НОС", opensIn: "c09", target: 500, late: true,
    columns: [
      PK(), T("ts"), T("statement_no"), T("payer"), T("payer_account"), T("payee"), T("payee_account"),
      R("amount"), T("purpose"),
    ],
  },
  {
    name: "nina_carbon", layer: "НОС", opensIn: "c10", target: 4, late: true,
    columns: [PK(), I("doc_reg_no"), T("person_text"), T("typed_at_text"), T("text")],
  },
  {
    name: "draft_statements", layer: "НОС", opensIn: "c11", target: 200, late: true, writableIn: ["c11"],
    columns: STATEMENT_COLUMNS,
  },
  {
    name: "draft_persons", layer: "НОС", opensIn: "c11", target: 100, late: true, writableIn: ["c11"],
    columns: PERSON_COLUMNS,
  },
  {
    name: "draft_publication", layer: "НОС", opensIn: "c11", target: 50, late: true, writableIn: ["c11"],
    columns: PUBLICATION_COLUMNS,
  },
  {
    name: "publication_source", layer: "НОС", opensIn: "c12", target: 60, late: true,
    columns: PUBLICATION_COLUMNS,
  },
  {
    name: "publication", layer: "НОС", opensIn: "c12", target: 0, late: true, writableIn: ["c12"],
    columns: PUBLICATION_COLUMNS,
  },
];

export const TABLE_BY_NAME: ReadonlyMap<string, TableDef> = new Map(WORLD_TABLES.map((t) => [t.name, t]));

/** Таблицы базового мира (создаются генератором) */
export const BASE_TABLES: readonly TableDef[] = WORLD_TABLES.filter((t) => !t.late);

/** Таблицы со столбцом горизонта: имя → столбец */
export const HORIZON_COLUMNS: Readonly<Record<string, string>> = Object.fromEntries(
  WORLD_TABLES.filter((t) => t.horizon).map((t) => [t.name, t.horizon as string])
);

/** Представления arch16_* поверх staging-контура «Сокола» (создаются импортом диска в Д10) */
export const ARCH16_VIEWS: Readonly<Record<string, { stage: string; sql: string }>> = {
  arch16_persons: {
    stage: "sokol_stage_persons",
    sql: `CREATE VIEW IF NOT EXISTS arch16_persons AS SELECT ${STAGE_PERSON_COLUMNS.map((c) => c.name).join(", ")} FROM sokol_stage_persons`,
  },
  arch16_statements: {
    stage: "sokol_stage_statements",
    sql: `CREATE VIEW IF NOT EXISTS arch16_statements AS SELECT ${STAGE_STATEMENT_COLUMNS.map((c) => c.name).join(", ")} FROM sokol_stage_statements`,
  },
  arch16_registry: {
    stage: "sokol_stage_registry",
    sql: `CREATE VIEW IF NOT EXISTS arch16_registry AS SELECT ${STAGE_REGISTRY_COLUMNS.map((c) => c.name).join(", ")} FROM sokol_stage_registry`,
  },
};

function columnSql(c: ColumnDef): string {
  if (c.generated) return `${c.name} ${c.type} GENERATED ALWAYS AS (${c.generated}) STORED`;
  let sql = `${c.name} ${c.type}`;
  if (c.pk) sql += " PRIMARY KEY";
  if (c.references) sql += ` REFERENCES ${c.references}`;
  return sql;
}

/** CREATE TABLE для одной таблицы мира (без IF NOT EXISTS: двойное создание — ошибка генератора) */
export function tableDdl(table: TableDef, ifNotExists = false): string {
  return `CREATE TABLE ${ifNotExists ? "IF NOT EXISTS " : ""}${table.name} (\n  ${table.columns.map(columnSql).join(",\n  ")}\n)`;
}

/** DDL базового мира: все таблицы, кроме поздних */
export const WORLD_SCHEMA_SQL: string = BASE_TABLES.map((t) => tableDdl(t) + ";").join("\n");

/**
 * DDL поздних таблиц: создаются сюжетным патчем при открытии дела
 * (`applyStoryPatch(db, 'late.<table>')`).
 */
export const WORLD_LATE_TABLES: Readonly<Record<string, string>> = Object.fromEntries(
  WORLD_TABLES.filter((t) => t.late).map((t) => [t.name, tableDdl(t, true)])
);

/**
 * Индексы (разд. 8.2): без них наивные эталоны не укладываются в 1 с.
 * Индекса по incidents.reported_at нет намеренно (М1): 2 000 строк читаются
 * полным проходом, и `SELECT * FROM incidents LIMIT 10` отдаёт id 1–10.
 */
export const WORLD_INDEXES: readonly string[] = [
  "CREATE INDEX ix_plate_reads_plate ON plate_reads(plate)",
  "CREATE INDEX ix_plate_reads_cam_ts ON plate_reads(camera_id, read_at)",
  "CREATE INDEX ix_door_access_badge_ts ON door_access(badge_id, ts)",
  "CREATE INDEX ix_door_access_door_ts ON door_access(door, ts)",
  "CREATE INDEX ix_audit_log_login_ts ON audit_log(login, ts)",
  "CREATE INDEX ix_audit_log_table_row ON audit_log(table_name, row_id)",
  "CREATE INDEX ix_query_log_login_ts ON query_log(login, logged_at)",
  "CREATE INDEX ix_transactions_acc_ts ON transactions(account_id, ts)",
  "CREATE INDEX ix_transactions_counterparty ON transactions(counterparty)",
  "CREATE INDEX ix_messenger_from_ts ON messenger_events(from_msisdn, ts)",
  "CREATE INDEX ix_messenger_to_ts ON messenger_events(to_msisdn, ts)",
  "CREATE INDEX ix_purchases_merchant_ts ON purchases(merchant, ts)",
  "CREATE INDEX ix_registrations_address ON registrations(address_id)",
  "CREATE INDEX ix_registrations_person ON registrations(person_id)",
  "CREATE INDEX ix_doc_registry_year_reg ON doc_registry(year, reg_no)",
  "CREATE INDEX ix_statements_case ON statements(case_id)",
  "CREATE INDEX ix_statements_person ON statements(person_id)",
  "CREATE INDEX ix_company_owners_company ON company_owners(company_id)",
  "CREATE INDEX ix_company_owners_owner ON company_owners(owner_type, owner_id)",
  "CREATE INDEX ix_heat_readings_flat_ts ON heat_readings(flat_id, ts)",
  "CREATE INDEX ix_outfall_temp_ts ON outfall_temp(ts)",
  "CREATE INDEX ix_intercom_address_ts ON intercom_events(address_id, ts)",
  "CREATE INDEX ix_incidents_kusp ON incidents(kusp_no)",
  "CREATE INDEX ix_incident_persons_incident ON incident_persons(incident_id)",
  "CREATE INDEX ix_incident_persons_kusp ON incident_persons(kusp_no)",
  "CREATE INDEX ix_persons_last_name ON persons(last_name)",
  "CREATE INDEX ix_persons_father ON persons(father_id)",
  "CREATE INDEX ix_vehicles_plate ON vehicles(plate)",
  "CREATE INDEX ix_employment_person ON employment(person_id)",
  "CREATE INDEX ix_employment_company ON employment(company_id)",
  "CREATE INDEX ix_properties_owner ON properties(owner_person_id)",
  "CREATE INDEX ix_accounts_holder ON accounts(holder_person_id)",
  "CREATE INDEX ix_phones_person ON phones(person_id)",
  "CREATE INDEX ix_zags_person ON zags_deaths(person_id)",
  "CREATE INDEX ix_morgue_kusp ON morgue_records(kusp_no)",
  "CREATE INDEX ix_hospital_person ON hospital_admissions(person_id)",
  "CREATE INDEX ix_contracts_company ON contracts(company_id)",
  "CREATE INDEX ix_share_deals_buyer_date ON share_deals(buyer_company_id, deal_date)",
  "CREATE INDEX ix_staff_badge ON staff(badge_id)",
];

/** Время старта дела, в котором таблица открывается: позже него в таблице без горизонта строк быть не должно */
export function tableOpensAt(table: TableDef): string | null {
  return table.opensIn ? CASE_START[table.opensIn] : null;
}
