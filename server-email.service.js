// email.service.js — free email delivery via Gmail SMTP + Nodemailer (§8).
//
// Requires a Gmail "App Password" (NOT your normal Gmail password — Google
// requires 2-Step Verification enabled, then a 16-character App Password
// generated at https://myaccount.google.com/apppasswords). This is free,
// requires no billing account, and stays within Google's documented
// consumer sending limit of ~500 messages/day (see FREE-TIER-LIMITS.md).
//
// Credentials come ONLY from environment variables (GMAIL_USER,
// GMAIL_APP_PASSWORD) — see EMAIL.md. Never hard-coded, never logged.

import nodemailer from "nodemailer";

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD not set — see EMAIL.md.");
  }
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return transporter;
}

function renderReminderEmail({ userName, scheduleTitle, date, time, description, priority }) {
  const subject = `Reminder: ${scheduleTitle}`;
  const text =
`Hello ${userName},

This is a reminder that:

${scheduleTitle}

Date:
${date}

Time:
${time}

Description:
${description || "—"}

Priority:
${priority}

You can open SSAS to mark this activity as completed.

Regards,
SSAS`;
  return { subject, text };
}

export async function sendReminderEmail(toEmail, fields) {
  const { subject, text } = renderReminderEmail(fields);
  return sendRaw(toEmail, subject, text);
}

export async function sendAccountabilityEmail(toEmail, userName, question, summaryLines) {
  const subject = "SSAS — Accountability check-in";
  const text = `Hello ${userName},\n\n${question}\n\n${summaryLines.join("\n")}\n\nOpen SSAS to update your activities.\n\nRegards,\nSSAS`;
  return sendRaw(toEmail, subject, text);
}

export async function sendDigestEmail(toEmail, userName, period, summary) {
  const subject = `SSAS — Your ${period} summary`;
  const text = `Hello ${userName},\n\nHere is your ${period} summary:\n\n${summary}\n\nRegards,\nSSAS`;
  return sendRaw(toEmail, subject, text);
}

async function sendRaw(toEmail, subject, text) {
  const t = getTransporter();
  const from = process.env.GMAIL_USER;
  try {
    const info = await t.sendMail({ from: `SSAS <${from}>`, to: toEmail, subject, text });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
