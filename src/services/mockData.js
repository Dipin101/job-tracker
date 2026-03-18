// Mock job data for NODE_ENV=development
// Saves real API calls during local development

const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

const MOCK_JOBS = [
  {
    external_id: "mock-adzuna-001",
    source: "adzuna",
    title: "Senior Backend Engineer",
    company: "Stripe",
    location: "Remote",
    country: "ca",
    description:
      "We are looking for a Senior Backend Engineer to join our payments infrastructure team. " +
      "You will work with Node.js, PostgreSQL, Redis, and distributed systems at scale. " +
      "Strong experience with REST APIs, microservices, and cloud infrastructure (AWS/GCP) required. " +
      "Experience with TypeScript, Docker, and Kubernetes is a plus.",
    url: "https://example.com/jobs/mock-001",
    salary_min: 90000,
    salary_max: 130000,
    experience_level: "senior",
    skills_required: ["Node.js", "PostgreSQL", "Redis", "AWS", "Docker"],
    posted_at: hoursAgo(6),
  },
  {
    external_id: "mock-adzuna-002",
    source: "adzuna",
    title: "Full Stack Developer",
    company: "Monzo",
    location: "London, UK",
    country: "ca",
    description:
      "Join Monzo as a Full Stack Developer building the future of banking. " +
      "You will own features end-to-end across React frontend and Node.js backend. " +
      "Experience with React, TypeScript, Node.js, and SQL databases required.",
    url: "https://example.com/jobs/mock-002",
    salary_min: 75000,
    salary_max: 105000,
    experience_level: "mid",
    skills_required: ["React", "TypeScript", "Node.js", "SQL"],
    posted_at: hoursAgo(12),
  },
  {
    external_id: "mock-adzuna-003",
    source: "adzuna",
    title: "Junior Software Engineer",
    company: "Thoughtworks",
    location: "Manchester, UK",
    country: "ca",
    description:
      "We are hiring a Junior Software Engineer to join our growing consultancy team. " +
      "You will work across a variety of client projects using modern web technologies. " +
      "Strong fundamentals in JavaScript and at least one backend language required.",
    url: "https://example.com/jobs/mock-003",
    salary_min: 35000,
    salary_max: 50000,
    experience_level: "entry",
    skills_required: ["JavaScript", "HTML", "CSS", "Git"],
    posted_at: hoursAgo(20),
  },
  {
    external_id: "mock-indeed-001",
    source: "indeed_rss",
    title: "Backend Engineer (Node.js)",
    company: "Revolut",
    location: "Remote",
    country: "ca",
    description:
      "Revolut is looking for a Backend Engineer to scale our core financial platform. " +
      "You will design and build high-throughput APIs used by millions of users daily. " +
      "Required: Node.js, PostgreSQL, Redis, Kafka or similar message queue experience.",
    url: "https://example.com/jobs/mock-004",
    salary_min: 80000,
    salary_max: 120000,
    experience_level: "mid",
    skills_required: ["Node.js", "PostgreSQL", "Redis", "Kafka"],
    posted_at: hoursAgo(3),
  },
  {
    external_id: "mock-indeed-002",
    source: "indeed_rss",
    title: "React Frontend Developer",
    company: "Deliveroo",
    location: "London, UK",
    country: "ca",
    description:
      "Deliveroo is hiring a React Frontend Developer to build world-class consumer experiences. " +
      "Strong React, TypeScript, and performance optimisation skills required. " +
      "Experience with Next.js and GraphQL is a strong plus.",
    url: "https://example.com/jobs/mock-005",
    salary_min: 65000,
    salary_max: 95000,
    experience_level: "mid",
    skills_required: ["React", "TypeScript", "Next.js", "GraphQL"],
    posted_at: hoursAgo(18),
  },
  {
    external_id: "mock-indeed-003",
    source: "indeed_rss",
    title: "DevOps Engineer",
    company: "Wise",
    location: "Remote",
    country: "ca",
    description:
      "Wise is looking for a DevOps Engineer to help us scale our global infrastructure. " +
      "You will manage Kubernetes clusters, CI/CD pipelines, and cloud cost optimisation. " +
      "Required: Kubernetes, Terraform, AWS or GCP, Docker, and strong Linux skills.",
    url: "https://example.com/jobs/mock-006",
    salary_min: 85000,
    salary_max: 115000,
    experience_level: "senior",
    skills_required: ["Kubernetes", "Terraform", "AWS", "Docker", "Linux"],
    posted_at: hoursAgo(20),
  },
];

module.exports = { MOCK_JOBS };
