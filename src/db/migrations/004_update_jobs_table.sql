-- Drop old jobs table and recreate with proper multi-source schema
-- Cascade handles ai_resumes, cover_letters, applications foreign keys

DROP TABLE IF EXISTS applications CASCADE;
DROP TABLE IF EXISTS cover_letters CASCADE;
DROP TABLE IF EXISTS ai_resumes CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(255) UNIQUE NOT NULL,
  source VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  location VARCHAR(255),
  country VARCHAR(10),
  description TEXT,
  url VARCHAR(255),
  salary_min INTEGER,
  salary_max INTEGER,
  experience_level experience_level DEFAULT 'mid',
  skills_required TEXT[] DEFAULT '{}',
  posted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_resumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_resume_id UUID NOT NULL REFERENCES base_resumes(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  file_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cover_letters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  ai_resume_id UUID NOT NULL REFERENCES ai_resumes(id) ON DELETE CASCADE,
  cover_letter_id UUID NOT NULL REFERENCES cover_letters(id) ON DELETE CASCADE,
  match_score INTEGER NOT NULL,
  is_favourite BOOLEAN DEFAULT false,
  status application_status DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMP,
  applied_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, job_id)
);