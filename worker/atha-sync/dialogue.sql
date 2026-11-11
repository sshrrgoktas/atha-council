-- Short-lived encrypted provider sessions for owner-authorized dialogue.
CREATE TABLE IF NOT EXISTS atha_dialogue_sessions (
 owner_id TEXT NOT NULL, room_id TEXT NOT NULL, cookie_cipher TEXT NOT NULL,
 expires_at INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0,
 next_at INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
 last_error TEXT, blocked_parent TEXT,
 PRIMARY KEY(owner_id,room_id),
 FOREIGN KEY(owner_id,room_id) REFERENCES atha_sync_rooms(owner_id,room_id) ON DELETE CASCADE
);
