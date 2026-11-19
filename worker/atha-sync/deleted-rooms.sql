-- Atha Council private sync: preserve explicit user deletion across devices.
-- Deletions are owner-scoped, retained independently of the room, and prevent re-uploads.
CREATE TABLE IF NOT EXISTS atha_sync_deleted_rooms (
  owner_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id, room_id)
);
CREATE INDEX IF NOT EXISTS idx_atha_deleted_rooms_owner_time
  ON atha_sync_deleted_rooms(owner_id, deleted_at DESC);
