-- Explicit owner opt-in to one ChatGPT connection for every synced room.
-- Existing per-room grants remain restricted until this preference is enabled.
CREATE TABLE IF NOT EXISTS atha_mcp_account_access (
 owner_id TEXT PRIMARY KEY,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS atha_mcp_account_subscriptions (
 subscription_id TEXT PRIMARY KEY,
 FOREIGN KEY(subscription_id) REFERENCES atha_mcp_subscriptions(subscription_id) ON DELETE CASCADE
);
