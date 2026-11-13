CREATE TABLE IF NOT EXISTS rooms (
 id TEXT PRIMARY KEY, invite TEXT NOT NULL UNIQUE,
 owner_id TEXT NOT NULL, round INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
 id TEXT PRIMARY KEY, room_id TEXT NOT NULL,
 name TEXT NOT NULL, seat INTEGER NOT NULL,
 token_hash TEXT NOT NULL UNIQUE, joined_at INTEGER NOT NULL,
 UNIQUE(room_id,seat)
);
CREATE INDEX IF NOT EXISTS idx_members_room ON members(room_id);
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY, room_id TEXT NOT NULL, sender_id TEXT NOT NULL,
 kind TEXT NOT NULL, content TEXT, object_key TEXT, mime TEXT,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id,created_at DESC);
CREATE TABLE IF NOT EXISTS answers (
 room_id TEXT NOT NULL, member_id TEXT NOT NULL,
 challenge TEXT NOT NULL, choice INTEGER NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(room_id,member_id,challenge)
);
CREATE INDEX IF NOT EXISTS idx_answers_room ON answers(room_id);


-- Auto-created by the API when first requested. Keep for fresh deployments.
CREATE TABLE IF NOT EXISTS chat_presence (
 room_id TEXT NOT NULL, member_id TEXT NOT NULL,
 last_read_at INTEGER NOT NULL DEFAULT 0,
 typing_until INTEGER NOT NULL DEFAULT 0,
 last_seen_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(room_id,member_id)
);
