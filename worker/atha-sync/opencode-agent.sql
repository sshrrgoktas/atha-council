-- Additive, room-scoped, opt-in local OpenCode companion keys.
-- Only a public Ed25519 key is stored on Cloudflare; the private key remains on the PC.
CREATE TABLE IF NOT EXISTS atha_opencode_agents (
 agent_id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL,
 room_id TEXT NOT NULL,
 public_key TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 FOREIGN KEY(owner_id,room_id) REFERENCES atha_sync_rooms(owner_id,room_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS atha_opencode_agents_owner_room
 ON atha_opencode_agents(owner_id,room_id,enabled);
