-- ============================================
-- Telegram bot integration
-- ============================================
-- Adds the ability to pair a diet-agent user with a Telegram chat,
-- so the special-agent bot can read/write on the user's behalf.

-- 1) Link Telegram chat → diet-agent user
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram
    ON users(telegram_user_id)
    WHERE telegram_user_id IS NOT NULL;

-- 2) Short-lived pairing codes the app issues; bot consumes via /connect
CREATE TABLE IF NOT EXISTS pairing_codes (
    code        TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pairing_codes_user ON pairing_codes(user_id);
