import initSqlJs, { type Database } from "sql.js";
import { SCHEMA_SQL } from "./v1-schema";
import { SEED_SQL } from "./v1-seed";

/**
 * Creates a fresh in-memory SQLite database with schema and seed data.
 * Each call returns an isolated DB instance — no shared state between tests.
 */
export async function setupTestDb(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("PRAGMA foreign_keys = ON;");
  db.run(SCHEMA_SQL);
  db.run(SEED_SQL);
  return db;
}
