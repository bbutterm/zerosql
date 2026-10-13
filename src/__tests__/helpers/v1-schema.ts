export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS suspects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  alias TEXT,
  birth_date TEXT,
  gender TEXT CHECK(gender IN ('М', 'Ж')),
  address TEXT,
  phone TEXT,
  occupation TEXT,
  criminal_record TEXT,
  status TEXT DEFAULT 'под наблюдением'
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  district TEXT,
  address TEXT,
  owner TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS crimes (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  description TEXT,
  date_committed TEXT,
  date_reported TEXT,
  location_id INTEGER REFERENCES locations(id),
  status TEXT DEFAULT 'открыто',
  severity INTEGER CHECK(severity BETWEEN 1 AND 10)
);

CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY,
  crime_id INTEGER REFERENCES crimes(id),
  type TEXT NOT NULL,
  description TEXT,
  found_at TEXT,
  found_date TEXT,
  stored_location TEXT,
  status TEXT DEFAULT 'на экспертизе'
);

CREATE TABLE IF NOT EXISTS crime_suspects (
  crime_id INTEGER REFERENCES crimes(id),
  suspect_id INTEGER REFERENCES suspects(id),
  role TEXT,
  PRIMARY KEY (crime_id, suspect_id)
);

CREATE TABLE IF NOT EXISTS communications (
  id INTEGER PRIMARY KEY,
  from_suspect_id INTEGER REFERENCES suspects(id),
  to_suspect_id INTEGER REFERENCES suspects(id),
  timestamp TEXT NOT NULL,
  channel TEXT,
  content TEXT,
  flagged INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  from_account TEXT,
  to_account TEXT,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'RUB',
  date TEXT NOT NULL,
  description TEXT,
  suspect_id INTEGER REFERENCES suspects(id),
  suspicious INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS org_members (
  suspect_id INTEGER PRIMARY KEY REFERENCES suspects(id),
  rank TEXT,
  joined_date TEXT,
  department TEXT
);
`;
