-- Atha replies are inserted only by an authorized connected Cloudflare account action.
-- The public Worker exposes read-only owner-scoped access to these rows.
-- The UI never uses this table to generate a synthetic model response.
CREATE TABLE IF NOT EXISTS atha_sync_replies (
  owner_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  reply_id TEXT NOT NULL,
  content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 12000),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id,room_id,reply_id),
  FOREIGN KEY (owner_id,room_id) REFERENCES atha_sync_rooms(owner_id,room_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_atha_sync_replies_owner_room_time
  ON atha_sync_replies(owner_id,room_id,created_at);
