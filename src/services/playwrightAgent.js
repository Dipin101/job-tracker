// src/services/playwrightAgent.js
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

// ─── Human-like helpers ───────────────────────────────────────────────────────

function randomDelay(min = 80, max = 220) {
  return new Promise((r) =>
    setTimeout(r, Math.floor(Math.random() * (max - min) + min)),
  );
}

async function humanType(page, selector, text) {
  if (!text) return; // guard against null/undefined
  const str = String(text); // convert to string just in case
  await page.click(selector);
  await randomDelay(100, 300);
  for (const char of str) {
    await page.keyboard.type(char, {
      delay: Math.floor(Math.random() * 80 + 40),
    });
  }
  await randomDelay(100, 200);
}

async function humanClick(page, selector) {
  const el = await page.$(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  const box = await el.boundingBox();
  if (box) {
    await page.mouse.move(
      box.x + box.width * (0.3 + Math.random() * 0.4),
      box.y + box.height * (0.3 + Math.random() * 0.4),
      { steps: Math.floor(Math.random() * 8 + 4) },
    );
    await randomDelay(80, 180);
  }
  await el.click();
  await randomDelay(200, 400);
}

// ─── CAPTCHA / bot-protection detection ──────────────────────────────────────

async function detectBotProtection(page) {
  const signals = await page.evaluate(() => {
    const bodyText = document.body?.innerText?.toLowerCase() || "";
    const html = document.documentElement?.innerHTML?.toLowerCase() || "";
    return {
      hasCaptchaText:
        bodyText.includes("captcha") ||
        bodyText.includes("verify you are human") ||
        bodyText.includes("i'm not a robot") ||
        bodyText.includes("prove you are human"),
      hasRecaptcha:
        html.includes("recaptcha") ||
        html.includes("g-recaptcha") ||
        html.includes("grecaptcha"),
      hasHcaptcha: html.includes("hcaptcha"),
      hasCloudflareTurnstile:
        html.includes("turnstile") || html.includes("cf-challenge"),
      hasLoginWall:
        bodyText.includes("sign in to apply") ||
        bodyText.includes("log in to apply") ||
        bodyText.includes("create an account to apply") ||
        bodyText.includes("join to apply") ||
        bodyText.includes("register to apply") ||
        bodyText.includes("sign up to apply") ||
        bodyText.includes("create account") ||
        bodyText.includes("log in") ||
        bodyText.includes("sign in"),
      hasWorkdayOrGreenhouseOrLever:
        html.includes("myworkdayjobs") ||
        html.includes("greenhouse.io") ||
        html.includes("lever.co") ||
        html.includes("ashbyhq.com") ||
        html.includes("icims.com") ||
        html.includes("taleo"),
      hasModalOverlay:
        html.includes("mfp-container") ||
        html.includes("modal-overlay") ||
        html.includes("popup-overlay") ||
        html.includes("mfp-wrap"),
    };
  });

  if (
    signals.hasRecaptcha ||
    signals.hasHcaptcha ||
    signals.hasCloudflareTurnstile
  )
    return {
      detected: true,
      reason: "CAPTCHA detected (reCAPTCHA/hCaptcha/Turnstile)",
    };
  if (signals.hasCaptchaText)
    return { detected: true, reason: "CAPTCHA challenge text found on page" };
  if (signals.hasLoginWall)
    return {
      detected: true,
      reason: "Login/account wall — must sign in to apply",
    };
  if (signals.hasWorkdayOrGreenhouseOrLever)
    return {
      detected: true,
      reason:
        "ATS platform detected (Workday/Greenhouse/Lever/iCIMS/Taleo) — complex form, flagging for manual",
    };
  if (signals.hasModalOverlay)
    return {
      detected: true,
      reason: "Modal/popup overlay blocking form — flagging for manual",
    };

  return { detected: false };
}

// ─── Find form fields intelligently ──────────────────────────────────────────

async function findField(page, hints) {
  for (const hint of hints) {
    const el = await page.$(hint);
    if (el) return hint;
  }
  return null;
}

async function fillApplicationForm(page, applicantData, resumePath) {
  const filled = { fields: [], skipped: [] };

  // First try split first/last name fields
  const firstNameField = await findField(page, [
    'input[name*="first" i]',
    'input[placeholder*="first" i]',
    'input[id*="first" i]',
  ]);
  const lastNameField = await findField(page, [
    'input[name*="last" i]',
    'input[placeholder*="last" i]',
    'input[id*="last" i]',
  ]);

  if (firstNameField && lastNameField) {
    // Form has separate first/last fields — use them
    await humanType(page, firstNameField, applicantData.firstName);
    await humanType(page, lastNameField, applicantData.lastName);
    filled.fields.push("firstName", "lastName");
  } else {
    // Fall back to full name field
    const nameField = await findField(page, [
      'input[name*="name" i]',
      'input[placeholder*="name" i]',
      'input[id*="name" i]',
      'input[aria-label*="name" i]',
    ]);
    if (nameField) {
      await humanType(page, nameField, applicantData.fullName);
      filled.fields.push("name");
    } else {
      filled.skipped.push("name");
    }
  }

  // Email — always uses JOB_EMAIL
  const emailField = await findField(page, [
    'input[type="email"]',
    'input[name*="email" i]',
    'input[placeholder*="email" i]',
    'input[id*="email" i]',
  ]);
  if (emailField) {
    await humanType(page, emailField, applicantData.email);
    filled.fields.push("email");
  } else filled.skipped.push("email");

  // Phone
  const phoneField = await findField(page, [
    'input[type="tel"]',
    'input[name*="phone" i]',
    'input[placeholder*="phone" i]',
    'input[id*="phone" i]',
  ]);
  if (phoneField) {
    await humanType(page, phoneField, applicantData.phone || "");
    filled.fields.push("phone");
  }

  // LinkedIn
  const linkedinField = await findField(page, [
    'input[name*="linkedin" i]',
    'input[placeholder*="linkedin" i]',
    'input[id*="linkedin" i]',
  ]);
  if (linkedinField) {
    await humanType(page, linkedinField, applicantData.linkedin || "");
    filled.fields.push("linkedin");
  }

  // Cover letter textarea
  const coverLetterField = await findField(page, [
    'textarea[name*="cover" i]',
    'textarea[placeholder*="cover" i]',
    'textarea[id*="cover" i]',
    'textarea[name*="message" i]',
    'textarea[placeholder*="message" i]',
  ]);
  if (coverLetterField && applicantData.coverLetter) {
    await page.click(coverLetterField);
    await randomDelay(200, 400);
    const chunks = applicantData.coverLetter.match(/.{1,80}/g) || [];
    for (const chunk of chunks) {
      await page.keyboard.type(chunk, {
        delay: Math.floor(Math.random() * 30 + 20),
      });
      await randomDelay(40, 120);
    }
    filled.fields.push("coverLetter");
  }

  // Resume file upload
  if (resumePath && fs.existsSync(resumePath)) {
    const fileInput = await findField(page, [
      'input[type="file"][name*="resume" i]',
      'input[type="file"][name*="cv" i]',
      'input[type="file"][accept*="pdf" i]',
      'input[type="file"]',
    ]);
    if (fileInput) {
      await page.setInputFiles(fileInput, resumePath);
      await randomDelay(500, 1000);
      filled.fields.push("resume");
    } else filled.skipped.push("resume");
  }

  return filled;
}

// ─── Find and click submit button ────────────────────────────────────────────

async function submitForm(page) {
  // Try standard selectors first
  const standardSelectors = ['button[type="submit"]', 'input[type="submit"]'];

  for (const selector of standardSelectors) {
    const el = await page.$(selector);
    if (el) {
      await humanClick(page, selector);
      await randomDelay(1500, 3000);
      return;
    }
  }

  // Try text-based selectors using getByRole
  const buttonTexts = ["Submit", "Apply", "Send Application", "Apply Now"];
  for (const text of buttonTexts) {
    const btn = page.getByRole("button", { name: text, exact: false });
    if ((await btn.count()) > 0) {
      await btn.first().click();
      await randomDelay(1500, 3000);
      return;
    }
  }

  throw new Error("Submit button not found");
}

// ─── Detect success after submit ─────────────────────────────────────────────

async function detectSuccess(page) {
  const result = await page.evaluate(() => {
    const text = document.body?.innerText?.toLowerCase() || "";
    return (
      text.includes("application submitted") ||
      text.includes("thank you for applying") ||
      text.includes("thanks for applying") ||
      text.includes("application received") ||
      text.includes("successfully applied") ||
      text.includes("we received your application") ||
      text.includes("you've applied") ||
      text.includes("your response has been recorded") ||
      text.includes("thank you for completing") ||
      text.includes("successfully submitted") ||
      text.includes("form submitted")
    );
  });
  return result;
}

// ─── Main apply function ──────────────────────────────────────────────────────

/**
 * @param {object} job        - job record from DB { id, title, company, url, ... }
 * @param {object} user       - user record { full_name, phone, linkedin_url, ... }
 * @param {string} coverLetter - AI-generated cover letter text
 * @param {string} resumePath  - absolute path to generated PDF resume
 * @returns {{ status: 'auto_applied' | 'manual_required', reason?: string, fields?: string[] }}
 */
async function applyToJob(job, user, coverLetter, resumePath) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
    locale: "en-CA",
    timezoneId: "America/Toronto",
  });

  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  try {
    console.log(`[Playwright] Navigating to: ${job.url}`);
    await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await randomDelay(1000, 2000);

    console.log(`[Playwright] Landed on: ${page.url()}`);

    // ── Step 1: Check for bot protection ──
    const botCheck = await detectBotProtection(page);
    console.log(`[Playwright] Bot check: ${JSON.stringify(botCheck)}`);
    if (botCheck.detected) {
      console.log(`[Playwright] 🚫 Bot protection: ${botCheck.reason}`);
      await browser.close();
      return { status: "manual_required", reason: botCheck.reason };
    }
    // ── Step 1.5: Find and click Apply button if present ──
    const applyButton = await page.$(
      'a[href*="apply"], button:has-text("Apply"), a:has-text("Apply Now"), a:has-text("Direct Apply"), button:has-text("Apply Now")',
    );
    if (applyButton) {
      console.log("[Playwright] Found apply button — clicking...");
      await applyButton.click();
      await page.waitForLoadState("domcontentloaded");
      await randomDelay(1500, 2500);

      const botCheckAfterApply = await detectBotProtection(page);
      if (botCheckAfterApply.detected) {
        console.log(
          `[Playwright] 🚫 Bot protection after apply click: ${botCheckAfterApply.reason}`,
        );
        await browser.close();
        return { status: "manual_required", reason: botCheckAfterApply.reason };
      }
    } else {
      console.log(
        "[Playwright] No apply button found — form should already be visible",
      );
    }

    // ── Step 2: Build applicant data ──
    const nameParts = (user.full_name || "").trim().split(" ");
    const applicantData = {
      fullName: user.full_name || "",
      firstName: nameParts[0] || "",
      lastName: nameParts.slice(1).join(" ") || "",
      email: process.env.JOB_EMAIL,
      phone: user.phone || "",
      linkedin: user.linkedin_url || "",
      coverLetter,
    };

    // ── Step 3: Fill the form ──
    const filled = await fillApplicationForm(page, applicantData, resumePath);
    console.log(`[Playwright] Filled fields: ${filled.fields.join(", ")}`);
    if (filled.skipped.length)
      console.log(`[Playwright] Skipped: ${filled.skipped.join(", ")}`);

    // ── Step 4: Re-check for captcha/modal after interaction ──
    const botCheckAfterFill = await detectBotProtection(page);
    if (botCheckAfterFill.detected) {
      console.log(
        `[Playwright] 🚫 Bot protection appeared after fill: ${botCheckAfterFill.reason}`,
      );
      await browser.close();
      return { status: "manual_required", reason: botCheckAfterFill.reason };
    }

    // ── Step 5: Submit ──
    await submitForm(page);

    // ── Step 6: Confirm success ──
    const success = await detectSuccess(page);
    await browser.close();

    if (success) {
      console.log(
        `[Playwright] ✅ Successfully applied: ${job.title} @ ${job.company}`,
      );
      return { status: "auto_applied", fields: filled.fields };
    } else {
      console.log(
        `[Playwright] ⚠️  Submitted but no success confirmation — flagging manual`,
      );
      return {
        status: "manual_required",
        reason: "Form submitted but no success confirmation detected",
      };
    }
  } catch (err) {
    await browser.close();
    console.error(
      `[Playwright] ❌ Error applying to ${job.title}:`,
      err.message,
    );
    return { status: "manual_required", reason: `Apply error: ${err.message}` };
  }
}

module.exports = { applyToJob };
