-- Allow anon key to read/write pairing_codes (same posture as other app tables)
ALTER TABLE pairing_codes DISABLE ROW LEVEL SECURITY;
