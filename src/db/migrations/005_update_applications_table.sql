ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS matched_skills TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS missing_skills TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS match_reasoning TEXT,
  DROP COLUMN IF EXISTS ai_resume_id,
  DROP COLUMN IF EXISTS cover_letter_id;