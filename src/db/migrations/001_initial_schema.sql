CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- gives us basically uuid_generate_v4()

-- create type if not exist doesn't happen in postgre the work around is to 
--do $$ begin 
--do $$ --> start an anonymous code block
--begin --> tries this block 
-- creates the enum --> Exception -> if it fails
-- when duplicate object then its set to null and end $$-> ends it
DO $$ BEGIN
  CREATE TYPE experience_level AS ENUM ('entry', 'mid', 'senior');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE application_status AS ENUM ('applied', 'skipped', 'pending', 'job_closed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  location VARCHAR(255),
  position VARCHAR(255),
  experience_level experience_level DEFAULT 'entry',
  match_threshold INTEGER DEFAULT 70,
  favourite_threshold INTEGER DEFAULT 85,
  cv_page_limit INTEGER DEFAULT 2,
  cover_letter_page_limit INTEGER DEFAULT 1,
  salary_min INTEGER,
  reapply_threshold_days INTEGER DEFAULT 60,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Base resumes
CREATE TABLE IF NOT EXISTS base_resumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE, --deleteon cascade means they are foreign key related to parent and if there is no parent delete this child it references
  file_url VARCHAR(255) NOT NULL,
  raw_text TEXT,
  extracted_skills TEXT[] DEFAULT '{}',
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Github profiles
CREATE TABLE IF NOT EXISTS github_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_url VARCHAR(255) NOT NULL,
  analyzed_skills TEXT[] DEFAULT '{}', --{} postgre's way of saying empty array
  last_analyzed_at TIMESTAMP
);

-- Jobs
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  adzuna_job_id VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  description TEXT,
  location VARCHAR(255),
  salary_range VARCHAR(255),
  url VARCHAR(255),
  is_applied BOOLEAN DEFAULT false,
  posted_at TIMESTAMP,
  date_found TIMESTAMP DEFAULT NOW()
);

-- AI resumes
CREATE TABLE IF NOT EXISTS ai_resumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_resume_id UUID NOT NULL REFERENCES base_resumes(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  file_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Cover letters
CREATE TABLE IF NOT EXISTS cover_letters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Applications
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