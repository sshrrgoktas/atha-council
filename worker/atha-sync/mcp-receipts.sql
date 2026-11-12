-- Additive, repeatable metadata migration. Run BEFORE the receipt-aware Worker.
-- No callbacks, event replay, OAuth, snapshots, replies or APK changes.
CREATE TABLE IF NOT EXISTS atha_mcp_receipts (
 owner_id TEXT NOT NULL, room_id TEXT NOT NULL, event_id TEXT NOT NULL,
 accepted_at INTEGER, reply_saved_at INTEGER, last_http_status INTEGER,
 PRIMARY KEY(owner_id,room_id,event_id),
 FOREIGN KEY(owner_id,room_id,event_id)
  REFERENCES atha_sync_events(owner_id,room_id,event_id) ON DELETE CASCADE
);
-- Deliberately no UPDATE of legacy 'delivered' rows: no historical replay.
