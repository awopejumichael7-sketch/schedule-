import test from "node:test";
import assert from "node:assert/strict";
import { validateScheduleInput, sanitizePlainText } from "./app-validation.utils.js";

function validInput(overrides = {}) {
  return {
    title: "Study Physics",
    startDate: "2026-08-10",
    startTime: "19:00",
    priority: "normal",
    recurrence: { frequency: "once" },
    description: "",
    ...overrides,
  };
}

test("accepts a well-formed schedule", () => {
  assert.deepEqual(validateScheduleInput(validInput()), []);
});

test("rejects an empty title", () => {
  const errors = validateScheduleInput(validInput({ title: "  " }));
  assert.ok(errors.some((e) => e.includes("Title")));
});

test("rejects a malformed date", () => {
  const errors = validateScheduleInput(validInput({ startDate: "10/08/2026" }));
  assert.ok(errors.some((e) => e.includes("date")));
});

test("rejects a malformed time", () => {
  const errors = validateScheduleInput(validInput({ startTime: "7pm" }));
  assert.ok(errors.some((e) => e.includes("time")));
});

test("rejects an invalid priority", () => {
  const errors = validateScheduleInput(validInput({ priority: "super-urgent" }));
  assert.ok(errors.some((e) => e.includes("priority")));
});

test("rejects an invalid recurrence frequency", () => {
  const errors = validateScheduleInput(validInput({ recurrence: { frequency: "biweekly-ish" } }));
  assert.ok(errors.some((e) => e.includes("recurrence")));
});

test("sanitizePlainText truncates overly long input", () => {
  const long = "x".repeat(3000);
  assert.equal(sanitizePlainText(long).length, 2000);
});

test("sanitizePlainText handles null/undefined safely", () => {
  assert.equal(sanitizePlainText(null), "");
  assert.equal(sanitizePlainText(undefined), "");
});
