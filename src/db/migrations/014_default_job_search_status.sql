ALTER TABLE users ALTER COLUMN job_search_status SET DEFAULT 'paused';
UPDATE users SET job_search_status = 'paused' WHERE job_search_status IS NULL;