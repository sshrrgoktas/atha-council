-- AC-MEM-007: private, owner+room scoped runtime projection of the approved
-- Atha Council Handoff Page. NOT an autonomous decision writer or shared public log.
-- Additive migration only; no existing conversations, OAuth grants or replies are modified.
CREATE TABLE IF NOT EXISTS atha_council_room_handoffs (
 owner_id TEXT NOT NULL,
 room_id TEXT NOT NULL,
 project_id TEXT NOT NULL CHECK(project_id='atha-council'),
 version INTEGER NOT NULL CHECK(version>=1),
 source_page TEXT NOT NULL,
 reviewed_at TEXT NOT NULL,
 decisions_json TEXT NOT NULL CHECK(json_valid(decisions_json)),
 open_tasks_json TEXT NOT NULL CHECK(json_valid(open_tasks_json)),
 verified_changes_json TEXT NOT NULL CHECK(json_valid(verified_changes_json)),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(owner_id,room_id)
);
