-- Additive, account-scoped Council task drafts. No autonomous tool execution.
CREATE TABLE IF NOT EXISTS atha_council_tasks (
 task_id TEXT NOT NULL PRIMARY KEY,
 owner_id TEXT NOT NULL,
 room_id TEXT NOT NULL,
 request_text TEXT NOT NULL,
 assignee TEXT NOT NULL CHECK(assignee IN ('opencode','gemini','qwen','chatgpt')),
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','approved','blocked')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 FOREIGN KEY(owner_id,room_id) REFERENCES atha_sync_rooms(owner_id,room_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_council_tasks_owner_room_time ON atha_council_tasks(owner_id,room_id,updated_at DESC);
