-- Atha Council private per-room event outbox.
-- A message event is created only for newly appended HUMAN messages in a room
-- whose owner explicitly opted into private sync. No model calls or network
-- deliveries are performed by this migration.
CREATE TABLE IF NOT EXISTS atha_sync_events (
  owner_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  message_excerpt TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK(state IN ('pending','delivered','ignored')),
  PRIMARY KEY(owner_id,room_id,event_id),
  FOREIGN KEY(owner_id,room_id)
    REFERENCES atha_sync_rooms(owner_id,room_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_atha_sync_events_pending
 ON atha_sync_events(state,created_at);

-- Scheduler heartbeat: tracks the last *successful* one-minute tick.
-- No conversation text, tokens, or personal content are stored here.
CREATE TABLE IF NOT EXISTS atha_sync_monitor (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  last_tick_at INTEGER NOT NULL,
  pending_event_count INTEGER NOT NULL DEFAULT 0
);
