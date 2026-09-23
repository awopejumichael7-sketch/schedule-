// recurrence.service.js
//
// Pure, dependency-free recurrence expansion engine (§17, §50).
//
// Design choice: dates are handled as {year, month, day} civil calendar
// values combined with an IANA timezone string, and converted to an actual
// instant (UTC Date) only via Intl-based resolution — never by naive
// "add 24h * n" arithmetic, which breaks across DST transitions. Time math
// itself (adding days/months/years to a calendar date) is done on calendar
// fields, not on epoch milliseconds, which is what makes this leap-year
// and month-length safe (§50).

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Parse "YYYY-MM-DD" into {y,m,d} (m is 1-12). */
function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function toISODate({ y, m, d }) {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y, m) {
  // m is 1-12. Using day 0 of next month trick, safe for leap years.
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addDaysCalendar({ y, m, d }, days) {
  // Do the addition using a UTC epoch as a *calendar* calculator only
  // (never used to derive a real instant/timezone-aware time).
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return { y: utc.getUTCFullYear(), m: utc.getUTCMonth() + 1, d: utc.getUTCDate() };
}

function addMonthsCalendar({ y, m, d }, months) {
  const total = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const clampedDay = Math.min(d, daysInMonth(ny, nm));
  return { y: ny, m: nm, d: clampedDay };
}

function addYearsCalendar({ y, m, d }, years) {
  const ny = y + years;
  // Handle Feb 29 → non-leap year by clamping to Feb 28 (documented, sane
  // behavior — matches Google Calendar's own convention).
  const clampedDay = Math.min(d, daysInMonth(ny, m));
  return { y: ny, m, d: clampedDay };
}

function weekdayCodeOf({ y, m, d }) {
  const utc = new Date(Date.UTC(y, m - 1, d));
  return WEEKDAY_CODES[utc.getUTCDay()];
}

function compareCalendarDates(a, b) {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

/**
 * Resolve a civil date + "HH:mm" local time + IANA timezone into a real
 * UTC Date instant. Uses Intl to correctly account for DST at that
 * specific date (not "now"), which is the part naive implementations get
 * wrong (§50).
 */
export function resolveLocalToUTC(calDate, hhmm, timeZone) {
  const [hh, mi] = (hhmm || "00:00").split(":").map(Number);

  // Binary-search-free approach: format a guess instant in the target tz,
  // measure the offset, and correct. This correctly handles DST because we
  // ask Intl for the offset AT the guessed instant, not at "now".
  let guess = Date.UTC(calDate.y, calDate.m - 1, calDate.d, hh, mi);
  for (let i = 0; i < 2; i++) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(guess), timeZone);
    guess = Date.UTC(calDate.y, calDate.m - 1, calDate.d, hh, mi) - offsetMinutes * 60000;
  }
  return new Date(guess);
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  return (asUTC - date.getTime()) / 60000;
}

/**
 * Expand a schedule's recurrence rule into occurrence dates within
 * [windowStartISO, windowEndISO] inclusive. Returns an array of ISO date
 * strings — cheap, in-memory, no database writes (§17, §59).
 */
export function expandOccurrences(schedule, windowStartISO, windowEndISO) {
  const { recurrence, startDate } = schedule;
  const windowStart = parseISODate(windowStartISO);
  const windowEnd = parseISODate(windowEndISO);
  const scheduleStart = parseISODate(startDate);
  const scheduleEnd = recurrence.endType === "onDate" && recurrence.endDate
    ? parseISODate(recurrence.endDate)
    : null;

  const effectiveStart = compareCalendarDates(scheduleStart, windowStart) > 0 ? scheduleStart : windowStart;
  const effectiveEndCandidate = scheduleEnd && compareCalendarDates(scheduleEnd, windowEnd) < 0 ? scheduleEnd : windowEnd;

  const results = [];
  const interval = Math.max(1, recurrence.interval || 1);
  let occurrencesEmitted = 0;
  const maxOccurrences = recurrence.endType === "afterCount" ? recurrence.occurrenceCount : Infinity;

  switch (recurrence.frequency) {
    case "once": {
      if (
        compareCalendarDates(scheduleStart, effectiveStart) >= 0 &&
        compareCalendarDates(scheduleStart, effectiveEndCandidate) <= 0
      ) {
        results.push(toISODate(scheduleStart));
      }
      break;
    }

    case "daily": {
      let cursor = scheduleStart;
      let n = 0;
      while (compareCalendarDates(cursor, effectiveEndCandidate) <= 0 && occurrencesEmitted < maxOccurrences) {
        if (n % interval === 0 && compareCalendarDates(cursor, effectiveStart) >= 0) {
          results.push(toISODate(cursor));
          occurrencesEmitted++;
        }
        cursor = addDaysCalendar(cursor, 1);
        n++;
      }
      break;
    }

    case "weekly": {
      const byDay = recurrence.byDay && recurrence.byDay.length ? recurrence.byDay : [weekdayCodeOf(scheduleStart)];
      // Walk week by week from the schedule's start week.
      let weekCursor = addDaysCalendar(scheduleStart, -((new Date(Date.UTC(scheduleStart.y, scheduleStart.m - 1, scheduleStart.d)).getUTCDay())));
      let weekIndex = 0;
      while (compareCalendarDates(weekCursor, effectiveEndCandidate) <= 0 && occurrencesEmitted < maxOccurrences) {
        if (weekIndex % interval === 0) {
          for (const code of byDay) {
            const dayOffset = WEEKDAY_CODES.indexOf(code);
            if (dayOffset < 0) continue;
            const candidate = addDaysCalendar(weekCursor, dayOffset);
            if (
              compareCalendarDates(candidate, scheduleStart) >= 0 &&
              compareCalendarDates(candidate, effectiveStart) >= 0 &&
              compareCalendarDates(candidate, effectiveEndCandidate) <= 0
            ) {
              results.push(toISODate(candidate));
              occurrencesEmitted++;
            }
          }
        }
        weekCursor = addDaysCalendar(weekCursor, 7);
        weekIndex++;
      }
      results.sort();
      break;
    }

    case "monthly": {
      let n = 0;
      let cursor = scheduleStart;
      while (compareCalendarDates(cursor, effectiveEndCandidate) <= 0 && occurrencesEmitted < maxOccurrences) {
        if (n % interval === 0) {
          let candidate;
          if (recurrence.byMonthPosition) {
            candidate = resolveMonthPosition(cursor.y, cursor.m, recurrence.byMonthPosition);
          } else {
            const day = recurrence.byMonthDay || scheduleStart.d;
            candidate = { y: cursor.y, m: cursor.m, d: Math.min(day, daysInMonth(cursor.y, cursor.m)) };
          }
          if (
            compareCalendarDates(candidate, scheduleStart) >= 0 &&
            compareCalendarDates(candidate, effectiveStart) >= 0 &&
            compareCalendarDates(candidate, effectiveEndCandidate) <= 0
          ) {
            results.push(toISODate(candidate));
            occurrencesEmitted++;
          }
        }
        cursor = addMonthsCalendar(cursor, 1);
        n++;
      }
      break;
    }

    case "yearly": {
      let n = 0;
      let cursor = scheduleStart;
      while (compareCalendarDates(cursor, effectiveEndCandidate) <= 0 && occurrencesEmitted < maxOccurrences) {
        if (n % interval === 0) {
          const candidate = { y: cursor.y, m: scheduleStart.m, d: Math.min(scheduleStart.d, daysInMonth(cursor.y, scheduleStart.m)) };
          if (
            compareCalendarDates(candidate, effectiveStart) >= 0 &&
            compareCalendarDates(candidate, effectiveEndCandidate) <= 0
          ) {
            results.push(toISODate(candidate));
            occurrencesEmitted++;
          }
        }
        cursor = { y: cursor.y + 1, m: cursor.m, d: cursor.d };
        n++;
      }
      break;
    }

    case "custom": {
      // Custom is expressed the same way as weekly/monthly with explicit
      // byDay/byMonthDay/byMonthPosition + interval; reuse weekly/monthly
      // logic based on which fields are populated.
      if (recurrence.byDay && recurrence.byDay.length) {
        return expandOccurrences({ ...schedule, recurrence: { ...recurrence, frequency: "weekly" } }, windowStartISO, windowEndISO);
      }
      if (recurrence.byMonthDay || recurrence.byMonthPosition) {
        return expandOccurrences({ ...schedule, recurrence: { ...recurrence, frequency: "monthly" } }, windowStartISO, windowEndISO);
      }
      return expandOccurrences({ ...schedule, recurrence: { ...recurrence, frequency: "daily" } }, windowStartISO, windowEndISO);
    }

    default:
      break;
  }

  return results;
}

function resolveMonthPosition(y, m, { week, day }) {
  const targetWeekday = WEEKDAY_CODES.indexOf(day);
  if (week > 0) {
    // Nth weekday of the month (e.g. first Monday)
    let d = 1;
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    let offset = (targetWeekday - first + 7) % 7;
    d = 1 + offset + (week - 1) * 7;
    return { y, m, d: Math.min(d, daysInMonth(y, m)) };
  }
  // Last weekday of the month
  const last = daysInMonth(y, m);
  const lastWeekday = new Date(Date.UTC(y, m - 1, last)).getUTCDay();
  const backOffset = (lastWeekday - targetWeekday + 7) % 7;
  return { y, m, d: last - backOffset };
}

/** Human-readable recurrence summary for the UI, e.g. "Every Mon, Wed, Fri at 7:00 PM". */
export function describeRecurrence(recurrence) {
  const dayNames = { SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat" };
  switch (recurrence.frequency) {
    case "once": return "One time";
    case "daily": return recurrence.interval > 1 ? `Every ${recurrence.interval} days` : "Every day";
    case "weekly": {
      const days = (recurrence.byDay || []).map((d) => dayNames[d]).join(", ");
      return recurrence.interval > 1 ? `Every ${recurrence.interval} weeks on ${days}` : `Every ${days}`;
    }
    case "monthly": {
      if (recurrence.byMonthPosition) {
        const pos = recurrence.byMonthPosition.week === -1 ? "Last" : ["", "First", "Second", "Third", "Fourth"][recurrence.byMonthPosition.week];
        return `${pos} ${dayNames[recurrence.byMonthPosition.day]} of every month`;
      }
      return `Every month on day ${recurrence.byMonthDay}`;
    }
    case "yearly": return "Every year";
    case "custom": return "Custom recurrence";
    default: return "";
  }
}
