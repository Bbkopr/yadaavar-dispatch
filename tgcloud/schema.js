import { table, integer, text, real, boolean, sql, index } from 'sdk/db';

// Telegram Omni-Reminder & Lifecycle Bot — tgcloud serverless adaptation.
// No foreign keys (platform rule): integrity is enforced in application code.
// Times are UTC epoch milliseconds (integer). Display is Tehran + Jalali.

export const users = table('users', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  tgId:      integer('tg_id').unique().notNull(),
  username:  text('username'),
  firstName: text('first_name'),
  isOwner:   boolean('is_owner').default(false),
  createdAt: integer('created_at').default(sql`(unixepoch())`),
});

export const userState = table('user_state', {
  userId:    integer('user_id').primaryKey(),
  step:      text('step'),
  data:      text('data'), // JSON string: the in-progress reminder draft / flow context
  updatedAt: integer('updated_at'),
});

// Vehicle profiles — one row per car (2026-11-07). All car-related data
// (metric reminders, km logs, km prompts) belongs to exactly one profile
// via profile_id; integrity enforced in code (no FKs).
export const vehicleProfiles = table('vehicle_profiles', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  userId:       integer('user_id').notNull(),
  name:         text('name').notNull(), // e.g. «پراید سفید»
  model:        text('model'),
  plate:        text('plate'),
  lastKm:       real('last_km'),
  lastKmAt:     integer('last_km_at'),       // UTC epoch ms of the last km log
  lastKmPromptAt: integer('last_km_prompt_at'), // UTC epoch ms of the last «کیلومتر؟» prompt
  createdAt:    integer('created_at').default(sql`(unixepoch())`),
}, (t) => ({
  userIdx: index('idx_profiles_user').on(t.userId),
}));

// Per-profile odometer readings (2026-11-07). source: manual | prompt |
// km_reminder | service. reminderId links the log to the reminder that
// produced it (nullable — manual logs from the car screen have none).
export const kmLogs = table('km_logs', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  profileId:  integer('profile_id').notNull(),
  userId:     integer('user_id').notNull(),
  km:         real('km').notNull(),
  loggedAt:   integer('logged_at').notNull(), // UTC epoch ms
  source:     text('source'),
  reminderId: integer('reminder_id'),
}, (t) => ({
  profileIdx: index('idx_kmlogs_profile').on(t.profileId, t.loggedAt),
}));

// One reminder. recurrence_type: ONE_OFF | INTERVAL_DAYS | CRON_SCHEDULE | METRIC_THRESHOLD | KM_LOG | COMBINED
// KM_LOG (2026-11-07): time-based reminder that asks for the car's km; the
// reply is recorded as a km log for its profile.
// COMBINED (2026-11-07): a service reminder with BOTH a time leg (interval
// + next_trigger_at) and a km leg (target_metric_delta + metric_base_value).
// Whichever leg fires first announces the service and re-arms both legs.
// cron_expression is a JSON string:
//   monthly: {"kind":"monthly","day":28,"time":"09:00"}
//   weekly:  {"kind":"weekly","days":[6,1,3],"time":"09:00"}  (days = JS getUTCDay in Tehran: 0=یکشنبه..6=شنبه)
// Repeat model (2026-11-07): repeatEvery × repeatUnit (HOUR | DAY | WEEK |
// MONTH) is the step between fires; repeatTotal is how many fires in total
// (NULL = unlimited); repeatDone counts fires so far. When repeatDone reaches
// repeatTotal the reminder deactivates (status done). ONE_OFF rows carry
// repeatTotal = 1. Legacy INTERVAL_DAYS rows are backfilled to
// repeatEvery = intervalDays, repeatUnit = 'DAY', repeatTotal = NULL.
// status: active | paused | done   (delete = hard delete in code, children logs deleted first)
export const reminders = table('reminders', {
  id:                 integer('id').primaryKey({ autoIncrement: true }),
  userId:             integer('user_id').notNull(),
  title:              text('title').notNull(),
  category:           text('category').notNull().default('GENERAL'), // HOME | FINANCE | CAR | HEALTH | GENERAL
  recurrenceType:     text('recurrence_type').notNull(),
  intervalDays:       integer('interval_days'),
  cronExpression:     text('cron_expression'),
  targetMetricDelta:  real('target_metric_delta'),   // km until next service (metric reminders)
  metricBaseValue:    real('metric_base_value'),     // km at creation / last service
  lastMetricValue:    real('last_metric_value'),     // last logged km
  profileId:          integer('profile_id'),         // vehicle_profiles.id (car reminders + km-log reminders)
  repeatEvery:        integer('repeat_every'),       // repeat step size (e.g. 3)
  repeatUnit:         text('repeat_unit'),           // HOUR | DAY | WEEK | MONTH
  repeatTotal:        integer('repeat_total'),       // total fires (NULL = unlimited; ONE_OFF = 1)
  repeatDone:         integer('repeat_done').default(0), // fires so far
  nextTriggerAt:      integer('next_trigger_at'),    // UTC epoch ms; null for metric reminders
  lastKmPromptAt:     integer('last_km_prompt_at'),  // UTC epoch ms of last «کیلومتر؟» prompt
  dispatching:        integer('dispatching').default(0), // 1 while a dispatch run owns this row
  dispatchingAt:      integer('dispatching_at'),     // UTC epoch ms of the claim (stale after 10 min)
  snoozeBase:         integer('snooze_base'),        // pre-snooze next_trigger_at: snooze never shifts the base pattern
  status:             text('status').notNull().default('active'),
  createdAt:          integer('created_at').default(sql`(unixepoch())`),
}, (t) => ({
  userStatusIdx: index('idx_reminders_user_status').on(t.userId, t.status),
  dueIdx:        index('idx_reminders_due').on(t.nextTriggerAt, t.status),
}));

// History + user actions. action_status: PENDING | DONE | SNOOZED | CANCELLED
export const reminderLogs = table('reminder_logs', {
  id:                integer('id').primaryKey({ autoIncrement: true }),
  reminderId:        integer('reminder_id').notNull(),
  triggeredAt:       integer('triggered_at').notNull(), // UTC epoch ms
  actionStatus:      text('action_status').notNull().default('PENDING'),
  resolvedAt:        integer('resolved_at'),
  loggedMetricValue: real('logged_metric_value'),
  note:              text('note'),
}, (t) => ({
  reminderIdx: index('idx_logs_reminder').on(t.reminderId, t.triggeredAt),
}));

export const config = table('config', {
  key:   text('key').primaryKey(),
  value: text('value'),
});
