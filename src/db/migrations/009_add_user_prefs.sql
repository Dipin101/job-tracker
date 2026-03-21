ALTER TABLE users
  ADD COLUMN IF NOT EXISTS city                TEXT,
  ADD COLUMN IF NOT EXISTS country             TEXT,
  ADD COLUMN IF NOT EXISTS remote_ok           BOOLEAN  DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS preferred_companies TEXT[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS blocked_companies   TEXT[]   DEFAULT '{}';