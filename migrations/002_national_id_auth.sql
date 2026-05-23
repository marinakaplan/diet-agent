-- ============================================
-- National ID + PIN authentication
-- ============================================
-- Adds login via Israeli national ID (תעודת זהות) + 4-digit PIN.
-- Both values are stored hashed (SHA-256). Plaintext never touches the DB.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS national_id_hash TEXT,
    ADD COLUMN IF NOT EXISTS pin_hash         TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_national_id
    ON users(national_id_hash)
    WHERE national_id_hash IS NOT NULL;
