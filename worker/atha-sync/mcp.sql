-- Additive migration. Existing rooms, replies, events, OAuth cookies remain intact.
CREATE TABLE IF NOT EXISTS atha_mcp_clients (
 client_id TEXT PRIMARY KEY, redirect_uris TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS atha_mcp_grants (
 grant_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, room_id TEXT NOT NULL,
 client_id TEXT NOT NULL, expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY(owner_id,room_id) REFERENCES atha_sync_rooms(owner_id,room_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS atha_mcp_codes (
 code_hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL, challenge TEXT NOT NULL,
 redirect_uri TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY(grant_id) REFERENCES atha_mcp_grants(grant_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS atha_mcp_tokens (
 token_hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL, kind TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 FOREIGN KEY(grant_id) REFERENCES atha_mcp_grants(grant_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS atha_mcp_subscriptions (
 subscription_id TEXT PRIMARY KEY, grant_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 room_id TEXT NOT NULL, callback_url TEXT NOT NULL, secret_cipher TEXT NOT NULL,
 expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1,
 verified_at INTEGER NOT NULL, last_delivery_at INTEGER, last_error TEXT,
 previous_secret_cipher TEXT, rotation_until INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY(grant_id) REFERENCES atha_mcp_grants(grant_id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,room_id) REFERENCES atha_sync_rooms(owner_id,room_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS atha_mcp_delivery (
 subscription_id TEXT NOT NULL, event_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 room_id TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(subscription_id,event_id),
 FOREIGN KEY(subscription_id) REFERENCES atha_mcp_subscriptions(subscription_id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,room_id,event_id) REFERENCES atha_sync_events(owner_id,room_id,event_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS atha_mcp_delivery_due ON atha_mcp_delivery(state,next_at);
CREATE TABLE IF NOT EXISTS atha_mcp_participation (
 owner_id TEXT NOT NULL, room_id TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'mentions',
 updated_at INTEGER NOT NULL, PRIMARY KEY(owner_id,room_id),
 FOREIGN KEY(owner_id,room_id) REFERENCES atha_sync_rooms(owner_id,room_id) ON DELETE CASCADE
);
