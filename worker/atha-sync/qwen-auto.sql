-- Explicit, account-scoped, temporary Workers AI Qwen participation.
-- No existing owner or Council room is automatically opted in by migration.
CREATE TABLE IF NOT EXISTS atha_qwen_auto_accounts (
 owner_id TEXT PRIMARY KEY,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS atha_qwen_auto_jobs (
 owner_id TEXT NOT NULL,
 room_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('running','replied','failed','skipped','quota')),
 created_at INTEGER NOT NULL,
 completed_at INTEGER,
 error_code TEXT,
 PRIMARY KEY(owner_id,room_id,event_id)
);
CREATE INDEX IF NOT EXISTS atha_qwen_auto_jobs_room_idx ON atha_qwen_auto_jobs(owner_id,room_id,created_at DESC);
CREATE TABLE IF NOT EXISTS atha_qwen_auto_usage (
 owner_id TEXT NOT NULL,
 utc_day TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(owner_id,utc_day)
);
