// validation.js — client-side input validation before any Firestore write
// (SECURITY.md — malformed input mitigation). This is defense-in-depth;
// Firestore's 1 MiB document cap and security rules are the real backstop.
export function validateScheduleInput(input) {
  const errors = [];
  if (!input.title || !input.title.trim()) errors.push("Title is required.");
  if (input.title && input.title.length > 200) errors.push("Title must be under 200 characters.");
  if (!input.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) errors.push("A valid start date is required.");
  if (!input.startTime || !/^\d{2}:\d{2}$/.test(input.startTime)) errors.push("A valid start time is required.");
  if (!["low", "normal", "high", "urgent"].includes(input.priority)) errors.push("Invalid priority.");
  if (!["once", "daily", "weekly", "monthly", "yearly", "custom"].includes(input.recurrence?.frequency)) {
    errors.push("Invalid recurrence frequency.");
  }
  if (input.description && input.description.length > 2000) errors.push("Description must be under 2000 characters.");
  return errors;
}

export function sanitizePlainText(str) {
  return (str || "").toString().slice(0, 2000);
}
