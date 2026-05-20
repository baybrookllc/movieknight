-- Device auth codes for TV QR sign-in
CREATE TABLE IF NOT EXISTS device_auth_codes (
  code        text PRIMARY KEY,
  status      text NOT NULL DEFAULT 'pending',   -- 'pending' | 'claimed'
  access_token  text,
  refresh_token text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

-- Auto-delete expired codes
CREATE INDEX IF NOT EXISTS idx_device_auth_expires ON device_auth_codes (expires_at);

-- Only the service role can insert/update; anon can read their own code by PK
ALTER TABLE device_auth_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon can read code by pk" ON device_auth_codes
  FOR SELECT USING (true);
