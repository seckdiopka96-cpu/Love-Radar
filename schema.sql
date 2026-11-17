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
 last_delivered_at INTEGER NOT NULL DEFAULT 0,
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

-- Only call metadata (no audio) is kept for the private chat call history.
CREATE TABLE IF NOT EXISTS voice_call_history (
 call_id TEXT PRIMARY KEY,room_id TEXT NOT NULL,
 connected_at INTEGER,ended_at INTEGER,outcome TEXT
);
CREATE INDEX IF NOT EXISTS idx_voice_call_history_room ON voice_call_history(room_id);
CREATE TABLE IF NOT EXISTS voice_call_modes (
 call_id TEXT PRIMARY KEY,
 room_id TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('audio','video'))
);
CREATE INDEX IF NOT EXISTS idx_voice_call_modes_room ON voice_call_modes(room_id);

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

-- One-time partner-assisted account recovery: only hashes and E2EE envelopes,
-- never plaintext access tokens or original private conversation keys.
CREATE TABLE IF NOT EXISTS partner_recovery (
 id TEXT PRIMARY KEY,
 room_id TEXT NOT NULL, sponsor_id TEXT NOT NULL, target_id TEXT NOT NULL,
 grant_hash TEXT NOT NULL UNIQUE, claim_hash TEXT, candidate_hash TEXT,
 ephemeral_public TEXT, check_code TEXT, status TEXT NOT NULL, envelope TEXT,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_partner_recovery_sponsor ON partner_recovery(sponsor_id,status,expires_at);

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

-- Room-isolated, server-authoritative quick quiz and action/truth games.
-- No private answers or raw auth tokens are stored here.
CREATE TABLE IF NOT EXISTS couple_party_games (
 room_id TEXT NOT NULL,
 mode TEXT NOT NULL,
 game_id TEXT NOT NULL,
 version INTEGER NOT NULL,
 round INTEGER NOT NULL,
 phase TEXT NOT NULL,
 question_index INTEGER NOT NULL,
 prompt_kind TEXT,
 turn INTEGER NOT NULL,
 picked_0 INTEGER,
 picked_1 INTEGER,
 score_0 INTEGER NOT NULL DEFAULT 0,
 score_1 INTEGER NOT NULL DEFAULT 0,
 winner INTEGER,
 started_at INTEGER NOT NULL,
 deadline_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 last_invite_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(room_id,mode)
);

-- Native iOS PushKit VoIP tokens (never Apple signing keys). Each record is
-- linked to an authenticated room member and physical installation.
CREATE TABLE IF NOT EXISTS native_voip_devices (
 member_id TEXT NOT NULL,
 room_id TEXT NOT NULL,
 device_id TEXT NOT NULL,
 voip_token TEXT NOT NULL UNIQUE,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(member_id,device_id)
);
CREATE INDEX IF NOT EXISTS idx_native_voip_room ON native_voip_devices(room_id,member_id);

-- Voluntary private couple-care signals and opt-in prayer reminders.
-- Period notices expire after 48 hours; do not record menstrual cycles.
CREATE TABLE IF NOT EXISTS care_notices (
 id TEXT PRIMARY KEY,room_id TEXT NOT NULL,sender_id TEXT NOT NULL,
 recipient_id TEXT NOT NULL,kind TEXT NOT NULL,label TEXT,
 created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,read_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_care_notice_inbox ON care_notices(recipient_id,expires_at);
-- Period support is a per-member opt-in. No gender or medical data is inferred.
CREATE TABLE IF NOT EXISTS care_period_preferences (
 member_id TEXT PRIMARY KEY,room_id TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_care_period_room ON care_period_preferences(room_id);
CREATE TABLE IF NOT EXISTS care_share_throttle (
 member_id TEXT NOT NULL,kind TEXT NOT NULL,last_at INTEGER NOT NULL,
 PRIMARY KEY(member_id,kind)
);
CREATE TABLE IF NOT EXISTS care_prayer_settings (
 member_id TEXT PRIMARY KEY,room_id TEXT NOT NULL,
 latitude REAL NOT NULL,longitude REAL NOT NULL,timezone TEXT NOT NULL,
 method INTEGER NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_care_prayer_room ON care_prayer_settings(room_id);
CREATE TABLE IF NOT EXISTS care_prayer_cache (
 member_id TEXT NOT NULL,room_id TEXT NOT NULL,day TEXT NOT NULL,
 times_json TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(member_id,day)
);
CREATE TABLE IF NOT EXISTS care_prayer_sent (
 member_id TEXT NOT NULL,room_id TEXT NOT NULL,day TEXT NOT NULL,
 prayer TEXT NOT NULL,sent_at INTEGER NOT NULL,PRIMARY KEY(member_id,day,prayer)
);

-- Screenshot alerts are metadata, not screenshot files. Shared only inside one
-- authenticated couple room and retained for up to 30 days.
CREATE TABLE IF NOT EXISTS screenshot_events (
 id TEXT PRIMARY KEY,room_id TEXT NOT NULL,
 member_id TEXT NOT NULL,created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_screenshot_room_created
 ON screenshot_events(room_id,created_at DESC);
CREATE TABLE IF NOT EXISTS screenshot_throttle (
 member_id TEXT PRIMARY KEY,last_at INTEGER NOT NULL
);
