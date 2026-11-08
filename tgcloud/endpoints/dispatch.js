// endpoints/dispatch.js — due-reminder dispatcher.
// Invoked by an external trigger (Muse cron) via:
//   tgcloud run endpoints/dispatch '{}'
// Sends due reminders directly with api.sendMessage (no Mini App involved).
// Retry-safe: a row is claimed (dispatching=1) before sending, so a retried
// run never double-sends; a claim older than 10 min is treated as stale.
// Rate-limit / network errors never crash the run: per-reminder catch,
// counts returned as { sent, failed, skipped, prompted }.
// Repeat accounting: dispatch owns the count — a fire increments repeatDone
// once (snoozed re-fires do not count again) and deactivates the reminder
// when repeatDone reaches repeatTotal.
import { api, db, BotApiError } from 'sdk';
import { eq, and, or, lt, lte, gte } from 'sdk/db';
import { reminders, reminderLogs, vehicleProfiles, kmLogs } from '../schema.js';
import { advanceAfterFire, DAY_MS } from '../lib/reminder_service.js';
import { shouldSkipKmPrompt } from '../lib/metric_service.js';
import { dispatchKb, kmPromptKb, btn, inlineKb } from '../lib/keyboards.js';
import { formatJalali, tehranDayStartMs, tehranParts } from '../lib/jalali.js';
import { faSep } from '../lib/text.js';

const STALE_CLAIM_MS = 10 * 60 * 1000;
const KM_PROMPT_INTERVAL_MS = 10 * DAY_MS;

async function releaseClaim(id) {
  await db.update(reminders).set({ dispatching: 0, dispatchingAt: null })
    .where(eq(reminders.id, id)).run();
}

async function profileName(profileId) {
  if (!profileId) return null;
  const p = await db.select().from(vehicleProfiles).where(eq(vehicleProfiles.id, profileId)).get();
  return p ? p.name : null;
}

export default async function (input) {
  const dry = !!(input && input.dry);
  const now = Date.now();
  // Km prompts are unscheduled nudges: only send them in daytime (08:00-22:00
  // Tehran). A prompt that becomes due overnight waits for the morning run
  // instead of waking the user (2026-11-08: one fired at 01:15).
  const kmPromptDaytime = (() => { const h = tehranParts(now).hh; return h >= 8 && h < 22; })();
  const staleBefore = now - STALE_CLAIM_MS;
  const counts = { sent: 0, failed: 0, skipped: 0, prompted: 0, dry };

  // --- due time-based reminders ---
  const due = await db.select().from(reminders)
    .where(and(eq(reminders.status, 'active'), lte(reminders.nextTriggerAt, now)))
    .all();
  for (const rem of due) {
    if (rem.recurrenceType === 'METRIC_THRESHOLD' || rem.nextTriggerAt == null) continue;
    if (rem.dispatching && rem.dispatchingAt && rem.dispatchingAt >= staleBefore) {
      counts.skipped += 1;
      continue;
    }
    // Claim the row first (atomic-ish: only one runner wins).
    const claimed = await db.update(reminders)
      .set({ dispatching: 1, dispatchingAt: now })
      .where(and(
        eq(reminders.id, rem.id),
        or(eq(reminders.dispatching, 0), lt(reminders.dispatchingAt, staleBefore)),
      )).run();
    if (!claimed.rowsAffected) { counts.skipped += 1; continue; }

    if (dry) {
      await releaseClaim(rem.id);
      counts.sent += 1; // would-send
      continue;
    }

    // A snoozed re-fire was already counted at its first fire.
    const counted = rem.snoozeBase == null;
    const base = rem.snoozeBase ?? rem.nextTriggerAt;
    const adv = advanceAfterFire(rem, base, { count: counted, nowMs: now });

    let text;
    if (rem.recurrenceType === 'KM_LOG') {
      const pname = await profileName(rem.profileId);
      text = `📝 یادآور ثبت کیلومتر: کیلومتر فعلی خودرو${pname ? ` «${pname}»` : ''} را وارد کنید.`;
    } else if (rem.recurrenceType === 'COMBINED') {
      text = `🚗 موعد سرویس «${rem.title}» رسید (بر اساس زمان).\nبرای ثبت انجام سرویس، کیلومتر فعلی را وارد کن.`;
    } else {
      text = `⏰ یادآور: ${rem.title}\nموعد: ${formatJalali(rem.nextTriggerAt, true)}`;
    }
    if (adv.finished && rem.recurrenceType !== 'ONE_OFF') text += '\n(آخرین تکرار)';

    let sentMsg = null;
    try {
      sentMsg = await api.sendMessage({
        chat_id: rem.userId,
        text,
        reply_markup: dispatchKb(rem),
      });
    } catch (e) {
      const code = e instanceof BotApiError ? e.code : 'unknown';
      console.error('dispatch send failed', { id: rem.id, code, desc: e && e.description });
      await releaseClaim(rem.id);
      counts.failed += 1;
      continue;
    }
    void sentMsg;

    try {
      await db.insert(reminderLogs).values({
        reminderId: rem.id, triggeredAt: now, actionStatus: 'PENDING',
      }).run();
      if (adv.finished) {
        await db.update(reminders).set({
          status: 'done', nextTriggerAt: null, snoozeBase: null, repeatDone: adv.repeatDone,
          dispatching: 0, dispatchingAt: null,
        }).where(eq(reminders.id, rem.id)).run();
      } else {
        // COMBINED time leg fired: the service cycle restarts, so the km
        // base restarts from the last logged km too.
        const extra = rem.recurrenceType === 'COMBINED'
          ? { metricBaseValue: rem.lastMetricValue ?? rem.metricBaseValue }
          : {};
        await db.update(reminders).set({
          nextTriggerAt: adv.nextTriggerAt, snoozeBase: null, repeatDone: adv.repeatDone,
          dispatching: 0, dispatchingAt: null, ...extra,
        }).where(eq(reminders.id, rem.id)).run();
      }
      counts.sent += 1;
    } catch (e) {
      // The message already went out; never lose the row — release the claim
      // so the next run can repair the bookkeeping instead of double-sending.
      console.error('dispatch bookkeeping failed', { id: rem.id, err: String(e) });
      await releaseClaim(rem.id);
      counts.failed += 1;
    }
  }

  // --- 10-day km prompts, one per vehicle profile ---
  // Skip a profile's prompt when: prompted in the last 10 days, OR a km was
  // already logged today (Tehran day), OR a km-log reminder fired today.
  const profiles = await db.select().from(vehicleProfiles).all();
  const dayStart = tehranDayStartMs(now);
  for (const profile of profiles) {
    const kmReminders = await db.select().from(reminders)
      .where(and(
        eq(reminders.profileId, profile.id),
        eq(reminders.recurrenceType, 'KM_LOG'),
      )).all();
    const kmReminderIds = new Set(kmReminders.map((r) => r.id));
    const recentLogs = await db.select().from(reminderLogs)
      .where(gte(reminderLogs.triggeredAt, dayStart)).all();
    const kmReminderFiredToday = recentLogs.some((l) => kmReminderIds.has(l.reminderId));
    const loggedToday = await db.select().from(kmLogs)
      .where(and(eq(kmLogs.profileId, profile.id), gte(kmLogs.loggedAt, dayStart))).all();
    if (shouldSkipKmPrompt({
      lastPromptAt: profile.lastKmPromptAt, nowMs: now,
      kmLoggedToday: loggedToday.length > 0, kmReminderFiredToday,
    })) continue;
    if (!kmPromptDaytime) continue;
    if (dry) { counts.prompted += 1; continue; }
    try {
      await api.sendMessage({
        chat_id: profile.userId,
        text: `🚗 کیلومتر فعلی «${profile.name}» چند است؟`,
        reply_markup: kmPromptKb(profile),
      });
      await db.update(vehicleProfiles).set({ lastKmPromptAt: now })
        .where(eq(vehicleProfiles.id, profile.id)).run();
      counts.prompted += 1;
    } catch (e) {
      const code = e instanceof BotApiError ? e.code : 'unknown';
      console.error('km prompt failed', { profile: profile.id, code, desc: e && e.description });
      counts.failed += 1;
    }
  }

  // --- legacy profile-less metric reminders (pre-profiles data) ---
  const legacyMetrics = await db.select().from(reminders)
    .where(and(eq(reminders.status, 'active'), eq(reminders.recurrenceType, 'METRIC_THRESHOLD')))
    .all();
  for (const rem of legacyMetrics) {
    if (rem.profileId) continue;
    if (rem.lastKmPromptAt && rem.lastKmPromptAt > now - KM_PROMPT_INTERVAL_MS) continue;
    if (!kmPromptDaytime) continue;
    if (dry) { counts.prompted += 1; continue; }
    try {
      await api.sendMessage({
        chat_id: rem.userId,
        text: `🚗 کیلومتر فعلی خودرو را برای «${rem.title}» وارد کنید.\nسرویس بعدی هر ${faSep(rem.targetMetricDelta)} کیلومتر است.`,
        reply_markup: inlineKb([[btn('📊 ثبت کیلومتر', `km|${rem.id}|log`)]]),
      });
      await db.update(reminders).set({ lastKmPromptAt: now })
        .where(eq(reminders.id, rem.id)).run();
      counts.prompted += 1;
    } catch (e) {
      const code = e instanceof BotApiError ? e.code : 'unknown';
      console.error('km prompt failed', { id: rem.id, code, desc: e && e.description });
      counts.failed += 1;
    }
  }

  return { ...counts, at: now };
}
