// recurrence.test.js — unit tests for the pure recurrence engine (§56).
// Run with: node --test tests/  (Node 18+, no extra dependencies needed).

import test from "node:test";
import assert from "node:assert/strict";
import { expandOccurrences, resolveLocalToUTC, describeRecurrence } from "./app-recurrence.service.js";

function baseSchedule(overrides = {}) {
  return {
    startDate: "2026-08-10",
    startTime: "19:00",
    timezone: "Africa/Lagos",
    recurrence: {
      frequency: "once",
      interval: 1,
      byDay: null,
      byMonthDay: null,
      byMonthPosition: null,
      endType: "never",
      endDate: null,
      occurrenceCount: null,
    },
    ...overrides,
  };
}

test("once: emits exactly one occurrence on its start date", () => {
  const s = baseSchedule();
  const dates = expandOccurrences(s, "2026-08-01", "2026-08-31");
  assert.deepEqual(dates, ["2026-08-10"]);
});

test("once: emits nothing outside the window", () => {
  const s = baseSchedule();
  const dates = expandOccurrences(s, "2026-09-01", "2026-09-30");
  assert.deepEqual(dates, []);
});

test("daily: every day within window", () => {
  const s = baseSchedule({ recurrence: { ...baseSchedule().recurrence, frequency: "daily", interval: 1 } });
  const dates = expandOccurrences(s, "2026-08-10", "2026-08-14");
  assert.deepEqual(dates, ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"]);
});

test("daily: interval of 2 skips alternate days", () => {
  const s = baseSchedule({ recurrence: { ...baseSchedule().recurrence, frequency: "daily", interval: 2 } });
  const dates = expandOccurrences(s, "2026-08-10", "2026-08-16");
  assert.deepEqual(dates, ["2026-08-10", "2026-08-12", "2026-08-14", "2026-08-16"]);
});

test("weekly: Mon/Wed/Fri matches the §80 acceptance scenario", () => {
  // 2026-08-10 is a Monday.
  const s = baseSchedule({
    recurrence: { ...baseSchedule().recurrence, frequency: "weekly", interval: 1, byDay: ["MO", "WE", "FR"] },
  });
  const dates = expandOccurrences(s, "2026-08-10", "2026-08-21");
  assert.deepEqual(dates, [
    "2026-08-10", "2026-08-12", "2026-08-14", // week 1: Mon, Wed, Fri
    "2026-08-17", "2026-08-19", "2026-08-21", // week 2
  ]);
});

test("weekly: interval of 2 (every other week)", () => {
  const s = baseSchedule({
    recurrence: { ...baseSchedule().recurrence, frequency: "weekly", interval: 2, byDay: ["MO"] },
  });
  const dates = expandOccurrences(s, "2026-08-10", "2026-09-07");
  assert.deepEqual(dates, ["2026-08-10", "2026-08-24", "2026-09-07"]);
});

test("monthly: fixed day-of-month, clamped for short months", () => {
  const s = baseSchedule({
    startDate: "2026-01-31",
    recurrence: { ...baseSchedule().recurrence, frequency: "monthly", interval: 1, byMonthDay: 31 },
  });
  const dates = expandOccurrences(s, "2026-01-01", "2026-04-30");
  // Feb has 28 days in 2026 (not a leap year), April has 30 — both clamp.
  assert.deepEqual(dates, ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
});

test("monthly: 'first Monday of every month'", () => {
  const s = baseSchedule({
    startDate: "2026-08-03", // first Monday of August 2026
    recurrence: {
      ...baseSchedule().recurrence, frequency: "monthly", interval: 1,
      byMonthPosition: { week: 1, day: "MO" },
    },
  });
  const dates = expandOccurrences(s, "2026-08-01", "2026-10-31");
  assert.deepEqual(dates, ["2026-08-03", "2026-09-07", "2026-10-05"]);
});

test("monthly: 'last Friday of every month'", () => {
  const s = baseSchedule({
    startDate: "2026-08-28", // last Friday of August 2026
    recurrence: {
      ...baseSchedule().recurrence, frequency: "monthly", interval: 1,
      byMonthPosition: { week: -1, day: "FR" },
    },
  });
  const dates = expandOccurrences(s, "2026-08-01", "2026-10-31");
  assert.deepEqual(dates, ["2026-08-28", "2026-09-25", "2026-10-30"]);
});

test("yearly: leap-year Feb 29 clamps to Feb 28 on non-leap years", () => {
  const s = baseSchedule({
    startDate: "2024-02-29", // 2024 is a leap year
    recurrence: { ...baseSchedule().recurrence, frequency: "yearly", interval: 1 },
  });
  const dates = expandOccurrences(s, "2024-01-01", "2027-12-31");
  assert.deepEqual(dates, ["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28"]);
});

test("endType 'onDate' stops emitting after the end date", () => {
  const s = baseSchedule({
    recurrence: { ...baseSchedule().recurrence, frequency: "daily", interval: 1, endType: "onDate", endDate: "2026-08-12" },
  });
  const dates = expandOccurrences(s, "2026-08-10", "2026-08-20");
  assert.deepEqual(dates, ["2026-08-10", "2026-08-11", "2026-08-12"]);
});

test("endType 'afterCount' stops after N occurrences", () => {
  const s = baseSchedule({
    recurrence: { ...baseSchedule().recurrence, frequency: "daily", interval: 1, endType: "afterCount", occurrenceCount: 3 },
  });
  const dates = expandOccurrences(s, "2026-08-10", "2026-08-31");
  assert.deepEqual(dates, ["2026-08-10", "2026-08-11", "2026-08-12"]);
});

test("resolveLocalToUTC: Africa/Lagos (UTC+1, no DST) is stable year-round", () => {
  const winter = resolveLocalToUTC({ y: 2026, m: 1, d: 15 }, "19:00", "Africa/Lagos");
  const summer = resolveLocalToUTC({ y: 2026, m: 7, d: 15 }, "19:00", "Africa/Lagos");
  assert.equal(winter.getUTCHours(), 18); // 19:00 WAT = 18:00 UTC
  assert.equal(summer.getUTCHours(), 18); // still UTC+1, no DST shift
});

test("resolveLocalToUTC: America/New_York correctly shifts across DST", () => {
  // Jan 15 is EST (UTC-5); Jul 15 is EDT (UTC-4). A naive implementation
  // that ignores DST would get one of these wrong.
  const winter = resolveLocalToUTC({ y: 2026, m: 1, d: 15 }, "19:00", "America/New_York");
  const summer = resolveLocalToUTC({ y: 2026, m: 7, d: 15 }, "19:00", "America/New_York");
  assert.equal(winter.getUTCHours(), 0); // 19:00 EST -> next day 00:00 UTC
  assert.equal(winter.getUTCDate(), 16);
  assert.equal(summer.getUTCHours(), 23); // 19:00 EDT -> 23:00 UTC same day
  assert.equal(summer.getUTCDate(), 15);
});

test("describeRecurrence produces a human-readable summary", () => {
  assert.equal(describeRecurrence({ frequency: "once" }), "One time");
  assert.equal(
    describeRecurrence({ frequency: "weekly", interval: 1, byDay: ["MO", "WE", "FR"] }),
    "Every Mon, Wed, Fri"
  );
});
