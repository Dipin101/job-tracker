-- Add new values to the existing enum type
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'auto_applied';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'manual_required';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'manually_applied';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'interviewing';

-- Add new tracking columns to applications table
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS apply_method        TEXT,
  ADD COLUMN IF NOT EXISTS apply_attempted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS apply_error         TEXT,
  ADD COLUMN IF NOT EXISTS notification_sent   BOOLEAN DEFAULT FALSE;