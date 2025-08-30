CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS balances (
  user_id TEXT NOT NULL REFERENCES users(id),
  nestcoins INTEGER NOT NULL DEFAULT 0,
  pawpoints INTEGER NOT NULL DEFAULT 0,
  paintokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id)
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(currency IN ('NC','PP','PT')),
  delta INTEGER NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS birthdays (
  user_id TEXT PRIMARY KEY,
  date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wordle_attempts (
  user_id TEXT NOT NULL,
  yyyymmdd TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  solved INTEGER NOT NULL,
  PRIMARY KEY (user_id, yyyymmdd)
);