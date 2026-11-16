CREATE TABLE IF NOT EXISTS rooms (
 id TEXT PRIMARY KEY, invite TEXT NOT NULL UNIQUE,
 owner_id TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
 id TEXT PRIMARY KEY, room_id TEXT NOT NULL,
 name TEXT NOT NULL, seat INTEGER NOT NULL,
 token_hash TEXT NOT NULL UNIQUE, joined_at INTEGER NOT NULL,
 UNIQUE(room_id,seat)
);
CREATE INDEX IF NOT EXISTS idx_members_room ON members(room_id);
-- Per-member public E2EE identity (private keys never leave clients).
CREATE TABLE IF NOT EXISTS e2ee_keys (
 member_id TEXT PRIMARY KEY,
 room_id TEXT NOT NULL,
 public_key TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_e2ee_room ON e2ee_keys(room_id);

CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY, room_id TEXT NOT NULL, sender_id TEXT NOT NULL,
 kind TEXT NOT NULL, content TEXT, object_key TEXT, mime TEXT,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id,created_at DESC);


-- Auto-created by the API when first requested. Keep for fresh deployments.
CREATE TABLE IF NOT EXISTS chat_presence (
 room_id TEXT NOT NULL, member_id TEXT NOT NULL,
 last_read_at INTEGER NOT NULL DEFAULT 0,
 typing_until INTEGER NOT NULL DEFAULT 0,
 last_seen_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(room_id,member_id)
);

-- Voice signaling only. Audio streams directly via encrypted WebRTC.
CREATE TABLE IF NOT EXISTS voice_calls (
 id TEXT PRIMARY KEY,room_id TEXT NOT NULL,caller_id TEXT NOT NULL,
 callee_id TEXT NOT NULL,status TEXT NOT NULL,
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voice_calls_room ON voice_calls(room_id,expires_at);
CREATE TABLE IF NOT EXISTS voice_signals (
 id INTEGER PRIMARY KEY AUTOINCREMENT,call_id TEXT NOT NULL,room_id TEXT NOT NULL,
 from_member TEXT NOT NULL,to_member TEXT NOT NULL,kind TEXT NOT NULL,
 payload TEXT NOT NULL,created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voice_signals_next ON voice_signals(call_id,to_member,id);

-- Two-player Ludo, created automatically on first access for existing couples.
CREATE TABLE IF NOT EXISTS ludo_games (
 room_id TEXT PRIMARY KEY,
 game_id TEXT NOT NULL,
 version INTEGER NOT NULL,
 turn INTEGER NOT NULL,
 dice INTEGER,
 positions TEXT NOT NULL,
 status TEXT NOT NULL,
 winner INTEGER,
 streak INTEGER NOT NULL DEFAULT 0,
 last_action TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);

-- Profile images are always accessed by authenticated users from the same room.
CREATE TABLE IF NOT EXISTS profile_photos (
 room_id TEXT NOT NULL,
 member_id TEXT NOT NULL,
 object_key TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY (room_id,member_id)
);

-- Private room revision used by lightweight status polling.
CREATE TABLE IF NOT EXISTS room_revisions (
 room_id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL DEFAULT 0
);

-- Keep recent activity queries room-local as the number of couples grows.
CREATE INDEX IF NOT EXISTS idx_messages_room_sender_time ON messages(room_id,sender_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_room_seat ON members(room_id,seat);

-- Personal lost-phone recovery: secret displayed once, only the digest is stored.
CREATE TABLE IF NOT EXISTS member_recovery (
 member_id TEXT PRIMARY KEY,
 code_hash TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL
);

-- Atomic request limits shared across all Cloudflare edge isolates.
-- IP-based actors are hashed with a randomly generated D1 secret; never store
-- raw IP addresses or recovery codes in these counters.
CREATE TABLE IF NOT EXISTS abuse_salt (
 id INTEGER PRIMARY KEY CHECK(id=1),
 secret TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS abuse_counters (
 scope TEXT NOT NULL,
 actor TEXT NOT NULL,
 hits INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 PRIMARY KEY(scope,actor)
);
CREATE INDEX IF NOT EXISTS idx_abuse_counters_expiry ON abuse_counters(expires_at);
