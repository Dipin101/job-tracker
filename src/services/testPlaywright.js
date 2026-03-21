require("dotenv").config();
process.env.JOB_EMAIL = "your-actual-email@gmail.com"; // override for testing
const { applyToJob } = require("./playwrightAgent");
const notificationService = require("./notificationService");

const fakeJob = {
  id: "test-123",
  user_id: "your-actual-user-id",
  title: "Junior Full Stack Developer",
  company: "Test Company",
  location: "Toronto, ON",
  url: "https://form.jotform.com/dipinkhatri11/job-application-form-",
  match_score: 78,
};

const fakeUser = {
  full_name: "John Doe",
  phone: "6471234567",
  linkedin_url: "https://linkedin.com/in/yourprofile",
};

async function test() {
  console.log("Running Playwright apply test...");
  const result = await applyToJob(fakeJob, fakeUser, "Test cover letter", null);
  console.log("Result:", result);

  if (result.status === "auto_applied") {
    console.log("Sending auto applied email...");
    await notificationService.sendAppliedEmail(fakeJob);
    console.log("Email sent — check your inbox");
  }
  if (result.status === "manual_required") {
    console.log("Sending manual required email...");
    await notificationService.sendManualRequiredEmail(fakeJob, result.reason);
    console.log("Email sent — check your inbox");
  }
}

test().catch(console.error);
