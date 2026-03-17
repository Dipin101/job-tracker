-- never drop tables as this is a bad practice 
-- if we do have some live data if we drop it we may lose it 
-- best practice is to always alter the table

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS job_search_status VARCHAR(20) DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'ca';