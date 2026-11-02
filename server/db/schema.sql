-- TestVantage production schema (PostgreSQL 14+)

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  subject TEXT,
  data JSONB NOT NULL,
  updated_at BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_questions_updated ON questions (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions (subject);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  test_id TEXT NOT NULL,
  submitted_at BIGINT NOT NULL,
  data JSONB NOT NULL,
  saved_at BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_attempts_owner ON attempts (owner_key, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_test ON attempts (test_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS bank_meta (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at BIGINT NOT NULL DEFAULT 0
);

-- Schools, classes, assignments, users (live sync bundle keys)
CREATE TABLE IF NOT EXISTS org_snapshots (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at BIGINT NOT NULL DEFAULT 0
);
