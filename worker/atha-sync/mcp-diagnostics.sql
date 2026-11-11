-- Bounded protocol metadata only: no message text, secrets or complete callback URLs.
CREATE TABLE IF NOT EXISTS atha_mcp_event_diagnostics (
 owner_id TEXT NOT NULL, room_id TEXT NOT NULL,
 reason TEXT NOT NULL, callback_origin TEXT, last_seen INTEGER NOT NULL,
 attempt_count INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(owner_id,room_id),
 FOREIGN KEY(owner_id,room_id) REFERENCES atha_sync_rooms(owner_id,room_id) ON DELETE CASCADE
);
