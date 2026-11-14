-- Run once in the existing love-radar-db D1 console.
-- This does not delete or modify existing couples or messages.
CREATE TABLE IF NOT EXISTS push_subscriptions (
 id TEXT PRIMARY KEY,
 room_id TEXT NOT NULL,
 member_id TEXT NOT NULL,
 endpoint TEXT NOT NULL UNIQUE,
 p256dh TEXT NOT NULL,
 auth TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_member ON push_subscriptions(member_id);
CREATE INDEX IF NOT EXISTS idx_push_room ON push_subscriptions(room_id);
