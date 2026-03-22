# AI Job Automation Tool

A full-stack semi automated job application system that uses Anthropic Claude AI to find, match, and apply to jobs on your behalf.

## What it does

- Fetches real job listings from Adzuna and OpenWebNinja (LinkedIn, Indeed, Glassdoor, Google Jobs)
- Scores each job against your skills, experience and preferences using a weighted 6-dimension scoring system combined with Claude AI semantic analysis
- Generates a tailored resume and cover letter for every matched job using a two-pass self-correcting PDF system
- Auto-applies via Playwright browser automation — flags manual review if CAPTCHA or bot protection is detected
- Sends email notifications via Resend — immediate alert for manual required, weekly digest for everything else
- Runs automatically on a cron schedule (weekdays 8am/10am/1pm/3pm, weekends 9am — Toronto timezone)

## Tech Stack

| Layer              | Technology                                  |
| ------------------ | ------------------------------------------- |
| Backend            | Node.js + Express                           |
| Database           | PostgreSQL + Redis (Docker)                 |
| AI                 | Anthropic Claude (claude-sonnet-4-20250514) |
| Auth               | JWT + bcrypt + refresh tokens               |
| PDF                | pdf-parse + PDFKit                          |
| Email              | Resend                                      |
| Browser Automation | Playwright                                  |
| Scheduler          | node-cron                                   |
| Frontend           | React + Vite + Tailwind                     |

## Prerequisites

- Node.js
- Docker Desktop
- API keys: Anthropic, Adzuna, OpenWebNinja, Resend

## Environment Variables

```env
DB_USER=
DB_PASSWORD=
DB_NAME=
DATABASE_URL=
REDIS_URL=
PORT=
JWT_SECRET=
JWT_REFRESH_SECRET=
ANTHROPIC_API=
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
OPENWEBNINJA_KEY=
RESEND_API_KEY=
PERSONAL_EMAIL=
JOB_EMAIL=
CLIENT_URL=
NODE_ENV=
```

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/Dipin101/job-tracker

# 2. Install dependencies
npm install

# 3. Start Docker (PostgreSQL + Redis)
docker compose up -d

# 4. Run migrations
node src/db/migrate.js

# 5. Start the backend
npm run dev

# 6. Start the frontend
cd client && npm install && npm run dev
```

## How it works

1. Upload your CV and connect your GitHub profile
2. The system extracts your skills automatically using Claude AI
3. Set your job preferences, experience level and target titles in your profile
4. Run the pipeline manually or let the cron job run it on schedule
5. Jobs are fetched, scored and matched against your profile
6. Tailored resume and cover letter are generated for each matched job
7. Playwright attempts to auto-apply — manual required jobs land in your inbox with documents attached

## Documentation

Full technical documentation including architecture, service breakdown, API routes, database schema and key design decisions is available in:

```
Document/AI Automation Tool docs.docx
```

## Project Structure

```
src/
├── controllers/     # Request handlers
├── services/        # Business logic
├── routes/          # API endpoints
├── middleware/       # Auth + rate limiting
├── db/              # Migrations + connection pool
├── config/          # Redis + logger
├── jobs/            # Cron scheduler
├── scripts/         # Job fetch script
client/              # React frontend
```

## Known Limitations

- Playwright auto-apply success rate is limited due to CAPTCHA, login walls and ATS platforms on most job sites
- Modal overlays are flagged as bot protection — these always require manual apply
