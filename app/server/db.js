// SQLite storage for Қолдау (docs/05). Node's built-in node:sqlite, no native modules to build.
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { seedDemo } = require("./seed");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  letter TEXT NOT NULL,
  name TEXT NOT NULL,
  demo_date TEXT,
  onboarding_done INTEGER NOT NULL DEFAULT 0,
  topics TEXT NOT NULL DEFAULT '[]',
  topics_other TEXT NOT NULL DEFAULT '',
  support_pref TEXT,
  specialist TEXT NOT NULL DEFAULT 'unknown',
  mascot TEXT,
  pose TEXT NOT NULL DEFAULT 'base',
  voice_mode TEXT NOT NULL DEFAULT 'voice',
  autospeak INTEGER NOT NULL DEFAULT 1,
  personalization INTEGER NOT NULL DEFAULT 1,
  keep_chat_text INTEGER NOT NULL DEFAULT 0,
  data_basic TEXT NOT NULL DEFAULT '{}',
  data_menstrual TEXT NOT NULL DEFAULT '{}',
  data_conditions TEXT NOT NULL DEFAULT '',
  data_meds TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL CHECK (source IN ('manual', 'conversation')),
  feeling TEXT CHECK (feeling IN ('good', 'hard', 'skip')),
  impact TEXT NOT NULL DEFAULT 'unknown' CHECK (impact IN ('none', 'some', 'strong', 'unknown')),
  impact_note TEXT NOT NULL DEFAULT '',
  context TEXT NOT NULL DEFAULT '',
  support_format TEXT,
  chat_text TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS record_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('symptom', 'feeling', 'context', 'impact', 'need', 'thought')),
  label TEXT NOT NULL,
  intensity TEXT CHECK (intensity IN ('weak', 'moderate', 'strong')),
  quote TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS supports (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('letter', 'voice', 'thought', 'action', 'request', 'chat')),
  title TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  audio TEXT,
  date TEXT NOT NULL,
  authorship TEXT NOT NULL CHECK (authorship IN ('self', 'chat')),
  topics TEXT NOT NULL DEFAULT '[]',
  record_id TEXT REFERENCES records(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS support_feedback (
  id TEXT PRIMARY KEY,
  support_id TEXT NOT NULL REFERENCES supports(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  value TEXT NOT NULL CHECK (value IN ('fit', 'not_now', 'not_fit')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  rhythm TEXT NOT NULL DEFAULT 'Каждый день',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('self', 'support', 'chat', 'habit')),
  source_ref TEXT,
  habit_id TEXT REFERENCES habits(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped', 'deferred')),
  deferred_to TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  text TEXT NOT NULL,
  date TEXT NOT NULL,
  source TEXT NOT NULL,
  indicator TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  record_ids TEXT NOT NULL,
  text TEXT NOT NULL,
  questions TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

const TABLES_IN_DELETE_ORDER = ["summaries", "support_feedback", "actions", "habits", "supports", "record_items", "records", "recommendations", "profiles"];

const open = (file) => {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON;");
  const hasOld = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entries'").get();
  if (hasOld) db.exec("DROP TABLE IF EXISTS observations; DROP TABLE IF EXISTS plan_items; DROP TABLE IF EXISTS entries; DROP TABLE IF EXISTS summaries; DROP TABLE IF EXISTS profiles;");
  db.exec(SCHEMA);
  if (db.prepare("SELECT COUNT(*) AS n FROM profiles").get().n === 0) seedDemo(db);
  return db;
};

const resetDemo = (db) => {
  db.exec(TABLES_IN_DELETE_ORDER.map((t) => `DELETE FROM ${t};`).join(" "));
  seedDemo(db);
};

// Human-readable ids that match docs/02: A-M1, A-C1, A-S1, A-F1, P-A1, B-03, H-B1, R-02, S-B1.
// Takes the first free number, so a gap such as B-03 between B-02 and B-04 gets filled first.
const nextId = (db, table, prefix, pad = 0) => {
  const used = new Set(db.prepare(`SELECT id FROM ${table} WHERE id LIKE ?`).all(`${prefix}%`)
    .map((r) => r.id.slice(prefix.length)).filter((s) => /^\d+$/.test(s)).map(Number));
  let n = 1;
  while (used.has(n)) n++;
  return `${prefix}${String(n).padStart(pad, "0")}`;
};

module.exports = { open, resetDemo, nextId };
