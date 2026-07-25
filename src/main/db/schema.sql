CREATE TABLE IF NOT EXISTS book (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  file_path TEXT NOT NULL UNIQUE,
  format TEXT NOT NULL CHECK (format IN ('epub', 'pdf')),
  cover_path TEXT,
  added_at TEXT NOT NULL,
  last_opened_at TEXT,
  total_locations INTEGER
);

CREATE TABLE IF NOT EXISTS reading_progress (
  book_id TEXT PRIMARY KEY REFERENCES book(id) ON DELETE CASCADE,
  current_location TEXT NOT NULL,
  percent_complete REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmark (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id) ON DELETE CASCADE,
  location TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS highlight (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id) ON DELETE CASCADE,
  location TEXT NOT NULL,
  selected_text TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'yellow',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id) ON DELETE CASCADE,
  highlight_id TEXT REFERENCES highlight(id) ON DELETE SET NULL,
  location TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reading_session (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  locations_read INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
