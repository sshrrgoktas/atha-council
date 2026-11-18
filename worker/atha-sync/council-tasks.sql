-- Atha Council task centre v1: owner-scoped, explicitly approved OpenCode work orders.
-- Only additive migration; no messages, OAuth credentials or previous D1 tables altered.
CREATE TABLE IF NOT EXISTS atha_council_tasks (
 task_id TEXT NOT NULL PRIMARY KEY,
 owner_id TEXT NOT NULL,
 room_id TEXT NOT NULL,
 request_text TEXT NOT NULL CHECK(length(request_text) BETWEEN 1 AND 2000),
 target_repo TEXT NOT NULL CHECK(target_repo='sshrrgoktas/atha-council'),
 assignee TEXT NOT NULL CHECK(assignee='opencode'),
 source_message_id TEXT,
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','approved','running','review','done','blocked','failed')),
 approved_at INTEGER,
 claimed_at INTEGER,
 claimed_by TEXT,
 completed_at INTEGER,
 result_summary TEXT,
 result_json TEXT,
 error_code TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 FOREIGN KEY(owner_id,room_id) REFERENCES atha_sync_rooms(owner_id,room_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_council_tasks_owner_room_time ON atha_council_tasks(owner_id,room_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_council_tasks_queue ON atha_council_tasks(state,assignee,approved_at);
