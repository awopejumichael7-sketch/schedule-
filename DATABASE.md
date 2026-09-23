# DATABASE.md — Firestore Schema

All user data lives under `users/{uid}`. There is no top-level collection
that spans users (see ARCHITECTURE.md §5) — this is the core scalability
and security decision.

```
users/{uid}
  ├─ profile fields (see below)
  │
  ├─ schedules/{scheduleId}
  ├─ scheduleOccurrences/{occurrenceId}      // {scheduleId}_{isoDate}
  ├─ completionRecords/{recordId}
  ├─ notifications/{idempotencyKey}
  ├─ notificationPreferences/settings         // single doc
  ├─ calendarConnections/{connectionId}        // "google" doc
  ├─ telegramConnections/{connectionId}        // "primary" doc
  ├─ devices/{deviceId}                         // FCM tokens
  ├─ categories/{categoryId}
  ├─ reports/{reportId}                          // cached daily/weekly/monthly/yearly rollups
  └─ auditLog/{entryId}

admin/{configId}          // admin-only, minimal (system-wide feature flags, invite codes)
```

## `users/{uid}` (document fields)

```ts
{
  uid: string,
  name: string,
  email: string,
  role: "USER" | "ADMIN",
  timezone: string,              // IANA, e.g. "Africa/Lagos"
  theme: "light" | "dark" | "system",
  accountability: {
    firstCheckEnabled: boolean,
    firstCheckTime: string,      // "20:45" 24h local
    secondCheckEnabled: boolean,
    secondCheckTime: string,     // "22:15"
    firstCheckQuestion: string,
    secondCheckQuestion: string,
  },
  onboardingComplete: boolean,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  disabled: boolean,             // admin can disable without deleting
}
```

## `users/{uid}/schedules/{scheduleId}`

```ts
{
  id: string,
  title: string,
  description: string,
  category: string,              // categoryId, or free text for built-ins
  priority: "low" | "normal" | "high" | "urgent",
  color: string,                 // hex
  location: string,
  timezone: string,               // usually inherits user's timezone
  startDate: string,               // ISO date "YYYY-MM-DD"
  startTime: string,               // "HH:mm"
  endTime: string | null,
  durationMinutes: number | null,
  recurrence: {
    frequency: "once" | "daily" | "weekly" | "monthly" | "yearly" | "custom",
    interval: number,                        // every N units
    byDay: string[] | null,                  // ["MO","WE","FR"]
    byMonthDay: number | null,               // 15
    byMonthPosition: { week: number, day: string } | null, // "first Monday" = {week:1, day:"MO"}, last = {week:-1,...}
    endType: "never" | "onDate" | "afterCount",
    endDate: string | null,
    occurrenceCount: number | null,
  },
  reminders: [
    { offsetMinutes: number, channels: ("push"|"email"|"telegram"|"googleCalendar")[] }
  ],
  googleCalendarEnabled: boolean,
  googleCalendarId: string | null,     // which of the user's calendars
  notes: string,
  sharedWith: string[],                 // reserved for future shared-schedule feature, empty in v1
  status: "active" | "cancelled",
  createdAt: Timestamp,
  updatedAt: Timestamp,
}
```

## `users/{uid}/scheduleOccurrences/{occurrenceId}`

Materialized **only** when an occurrence's state diverges from "scheduled,
untouched" (see ARCHITECTURE.md §6). `occurrenceId = {scheduleId}_{isoDate}`.

```ts
{
  id: string,
  scheduleId: string,
  occurrenceDate: string,        // ISO date this instance belongs to
  scheduledStart: Timestamp,      // resolved to UTC using the schedule's timezone
  status: "scheduled" | "in_progress" | "completed" | "pending" |
          "snoozed" | "rescheduled" | "skipped" | "cancelled" | "missed",
  notes: string,                  // e.g. "why not completed"
  rescheduleDate: string | null,
  rescheduleTime: string | null,
  snoozedUntil: Timestamp | null,
  googleEventId: string | null,   // maps to Google Calendar event for THIS occurrence
  createdAt: Timestamp,
  updatedAt: Timestamp,
  completedAt: Timestamp | null,
}
```

## `users/{uid}/notifications/{idempotencyKey}`

`idempotencyKey = {occurrenceId}:{offsetMinutes}:{channel}` — guarantees
exactly-once delivery per channel per reminder (§67).

```ts
{
  occurrenceId: string,
  scheduleId: string,
  channel: "push" | "email" | "telegram" | "googleCalendar" | "accountability",
  scheduledFor: Timestamp,
  status: "queued" | "sent" | "failed" | "skipped_stale",
  sentAt: Timestamp | null,
  failedAt: Timestamp | null,
  failureReason: string | null,
  attempt: number,
}
```

## `users/{uid}/notificationPreferences/settings` (single doc)

```ts
{
  push: boolean, email: boolean, telegram: boolean, googleCalendar: boolean,
  dailyEmailDigest: boolean, weeklyEmailDigest: boolean, monthlyEmailDigest: boolean,
}
```

## `users/{uid}/calendarConnections/{connectionId}` (`connectionId = "google"`)

```ts
{
  provider: "google",
  connected: boolean,
  googleAccountEmail: string,
  refreshToken: string,          // encrypted at rest is NOT possible client-side;
                                  // see SECURITY.md — this doc is NEVER written from
                                  // client code, only via the OAuth token exchange
                                  // handled server-side (see GOOGLE-CALENDAR.md)
  accessTokenExpiresAt: Timestamp,
  selectedCalendarId: string,
  lastSyncedAt: Timestamp | null,
  syncStatus: "ok" | "needs_attention" | "never_synced",
}
```

## `users/{uid}/telegramConnections/{connectionId}` (`connectionId = "primary"`)

```ts
{
  chatId: string,               // set only by the bot backend after verified linking
  linked: boolean,
  linkedAt: Timestamp,
  linkCode: string | null,      // short-lived code shown to user, consumed on link
  linkCodeExpiresAt: Timestamp | null,
}
```

## `users/{uid}/devices/{deviceId}`

```ts
{ fcmToken: string, platform: "web" | "android" | "ios" | "desktop", createdAt: Timestamp, lastSeenAt: Timestamp }
```

## `users/{uid}/categories/{categoryId}`

```ts
{ name: string, color: string, isDefault: boolean }
```

## `users/{uid}/reports/{reportId}`

`reportId` examples: `daily_2026-08-10`, `weekly_2026-W32`, `monthly_2026-08`, `yearly_2026`.
Cached rollups, regenerated by the reminder/accountability engine and on
demand from the client, to avoid recomputing full-history aggregates on
every dashboard load (§58 performance).

## `users/{uid}/auditLog/{entryId}`

```ts
{ event: string, at: Timestamp, meta: object }  // no sensitive payloads (§68)
```

## `admin/{configId}`

Only `role: "ADMIN"` users may read/write. Stores system-wide, non-personal
config: feature flags, invitation codes, aggregate (not per-user-content)
usage counters for the Cost Safety Dashboard.

## Indexes

See `firestore.indexes.json`. The main composite indexes needed:

- `scheduleOccurrences`: `(status ASC, scheduledStart ASC)` — for "today's pending"
- `schedules`: `(status ASC, startDate ASC)` — for calendar range queries
- `notifications`: `(status ASC, scheduledFor ASC)` — for the reminder engine's "due now" query

## Future (not implemented in v1, schema-compatible)

- ICS export: derivable entirely from `schedules` + `scheduleOccurrences`
  client-side; no schema change needed.
- Shared schedules: `sharedWith` already reserved; a future
  `sharedSchedules/{id}` top-level collection with its own rules would be
  additive.
