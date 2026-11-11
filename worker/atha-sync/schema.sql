-- Explicitly opted-in Atha Council rooms only. No data is uploaded until the user enables a room.
-- Reads/writes are always scoped to authenticated GitHub owner_id and room_id.
CREATE TABLE IF NOT EXISTS atha_sync_rooms (
  owner_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  title TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, room_id)
);
CREATE INDEX IF NOT EXISTS idx_atha_sync_rooms_owner_updated
  ON atha_sync_rooms(owner_id, updated_at DESC);
