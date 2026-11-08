// lib/reminder_service.js — next-trigger math + display helpers (pure JS, no SDK).
// All times are UTC epoch ms; all user-facing dates are Tehran + Jalali.
import { faNum, faSep } from './text.js';
import {
  FA_WEEKDAYS, jalaaliMonthLength, jalaliToEpochMs, tehranParts, formatJalali,
  addJalaliMonths,
} from './jalali.js';

export const DAY_MS = 86400000;
export const SNOOZE_MS = 2 * 3600 * 1000;

export const REPEAT_UNITS = {
  HOUR: 'ساعت',
  DAY: 'روز',
  WEEK: 'هفته',
  MONTH: 'ماه',
};

export const CATEGORIES = {
  HOME: '🏠 خانه',
  FINANCE: '💰 مالی',
  CAR: '🚗 خودرو',
  HEALTH: '🩺 سلامت',
  GENERAL: '📌 عمومی',
};

export const RECURRENCE_LABELS = {
  ONE_OFF: 'تک‌باره',
  INTERVAL_DAYS: 'دوره‌ای (بازه‌ای)',
  CRON_SCHEDULE: 'دوره‌ای (تقویمی)',
  METRIC_THRESHOLD: 'سنجه‌محور (کیلومتر)',
  KM_LOG: 'یادآور ثبت کیلومتر',
  COMBINED: 'ترکیبی (زمان یا کیلومتر — هرکدام زودتر)',
};

// One repeat step forward from a Tehran wall-clock instant. Tehran has no DST,
// so HOUR/DAY/WEEK steps are fixed ms; MONTH steps through the Jalali calendar.
export function addRepeatStep(fromMs, every, unit) {
  if (unit === 'HOUR') return fromMs + every * 3600 * 1000;
  if (unit === 'DAY') return fromMs + every * DAY_MS;
  if (unit === 'WEEK') return fromMs + every * 7 * DAY_MS;
  if (unit === 'MONTH') return addJalaliMonths(fromMs, every);
  return null;
}

export function parseCron(expr) {
  if (!expr) return null;
  try { return JSON.parse(expr); } catch { return null; }
}

// Next monthly occurrence of Jalali day-of-month `day` at HH:MM, strictly after fromMs.
// A day past the month's length clamps to the month's last day.
export function nextCronMonthly(cron, fromMs) {
  const [hh, mm] = String(cron.time || '09:00').split(':').map(Number);
  const now = tehranParts(fromMs);
  let y = now.jy, m = now.jm;
  for (let i = 0; i < 25; i += 1) {
    const day = Math.min(cron.day, jalaaliMonthLength(y, m));
    const cand = jalaliToEpochMs(y, m, day, hh, mm);
    if (cand > fromMs) return cand;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return null;
}

// Next weekly occurrence: `days` = Tehran weekdayNums (0=یکشنبه..6=شنبه) at HH:MM.
export function nextCronWeekly(cron, fromMs) {
  const [hh, mm] = String(cron.time || '09:00').split(':').map(Number);
  const days = new Set(cron.days || []);
  for (let i = 0; i < 8; i += 1) {
    const p = tehranParts(fromMs + i * DAY_MS);
    if (!days.has(p.weekdayNum)) continue;
    const cand = jalaliToEpochMs(p.jy, p.jm, p.jd, hh, mm);
    if (cand > fromMs) return cand;
  }
  return null;
}

export function nextCronOccurrence(cron, fromMs) {
  if (!cron) return null;
  if (cron.kind === 'monthly') return nextCronMonthly(cron, fromMs);
  if (cron.kind === 'weekly') return nextCronWeekly(cron, fromMs);
  return null;
}

// Recompute next_trigger_at for a recurring reminder whose trigger fired.
// `firedAtMs` is the trigger that fired (snoozeBase ?? nextTriggerAt).
// Returns the new epoch ms, or null when the reminder is finished (one-off).
// The step comes from the repeat columns when present (repeatEvery × repeatUnit);
// legacy INTERVAL_DAYS rows fall back to intervalDays × DAY.
// Anchor rule (decision #3: snooze never shifts the base pattern): the roll
// starts from the FIRED trigger, not from the snooze time, and advances until
// strictly after `nowMs` — so a snoozed fire lands on the original schedule
// and a long pause skips missed cycles instead of re-firing them.
export function computeNextTrigger(rem, firedAtMs, nowMs = Date.now()) {
  if (rem.recurrenceType === 'ONE_OFF') return null;
  if (rem.recurrenceType === 'INTERVAL_DAYS' || rem.recurrenceType === 'KM_LOG'
    || rem.recurrenceType === 'COMBINED') {
    // COMBINED shares the interval math for its time leg; its km leg is
    // checked on km logs, not here.
    const every = rem.repeatEvery || rem.intervalDays || 1;
    const unit = rem.repeatUnit || (rem.intervalDays ? 'DAY' : 'DAY');
    let next = firedAtMs;
    let guard = 0;
    while (next <= nowMs && guard < 10000) {
      next = addRepeatStep(next, every, unit);
      guard += 1;
    }
    return next;
  }
  if (rem.recurrenceType === 'CRON_SCHEDULE') {
    return nextCronOccurrence(parseCron(rem.cronExpression), nowMs);
  }
  return null; // METRIC_THRESHOLD is not time-driven
}

// Advance a reminder that just fired at `firedAtMs`.
// Returns { nextTriggerAt, repeatDone, finished }.
// Counting rule: a fire counts once. A snoozed re-fire must pass
// { count: false } — the occurrence was already counted at its first fire.
// ONE_OFF always finishes; a recurring reminder finishes when repeatDone
// reaches repeatTotal (NULL total = unlimited).
export function advanceAfterFire(rem, firedAtMs, opts = {}) {
  const count = opts.count !== false;
  const nowMs = opts.nowMs || Date.now();
  if (rem.recurrenceType === 'METRIC_THRESHOLD') return null;
  if (rem.recurrenceType === 'ONE_OFF') {
    return { nextTriggerAt: null, repeatDone: 1, finished: true };
  }
  const done = (rem.repeatDone || 0) + (count ? 1 : 0);
  const total = rem.repeatTotal ?? null;
  if (total != null && done >= total) {
    return { nextTriggerAt: null, repeatDone: done, finished: true };
  }
  return { nextTriggerAt: computeNextTrigger(rem, firedAtMs, nowMs), repeatDone: done, finished: false };
}

export function snoozeUntil(nowMs = Date.now()) {
  return nowMs + SNOOZE_MS;
}

// First trigger for «every N days at HH:MM»: today if still ahead, else tomorrow.
export function firstIntervalTrigger(time, nowMs) {
  const [hh, mm] = String(time).split(':').map(Number);
  const p = tehranParts(nowMs);
  let cand = jalaliToEpochMs(p.jy, p.jm, p.jd, hh, mm);
  if (cand <= nowMs) cand += DAY_MS;
  return cand;
}

export function cronSummary(cron) {
  if (!cron) return '';
  const time = faNum(cron.time || '09:00');
  if (cron.kind === 'monthly') return `روز ${faNum(cron.day)} هر ماه، ساعت ${time}`;
  if (cron.kind === 'weekly') {
    const names = (cron.days || []).map((d) => FA_WEEKDAYS[d]).join('، ');
    return `${names}، ساعت ${time}`;
  }
  return '';
}

export function repeatEveryText(rem) {
  const every = rem.repeatEvery || rem.intervalDays;
  const unit = rem.repeatUnit || (rem.intervalDays ? 'DAY' : null);
  if (!every || !unit || !REPEAT_UNITS[unit]) return null;
  return `هر ${faNum(every)} ${REPEAT_UNITS[unit]}`;
}

// «، ۴ از ۱۰ تکرار» — empty for unlimited; «تکرارها تمام شد» when finished.
export function repeatProgressText(rem) {
  if (rem.repeatTotal == null) return '';
  if (rem.status === 'done') return ' — تکرارها تمام شد';
  return `، ${faNum(rem.repeatDone || 0)} از ${faNum(rem.repeatTotal)} تکرار`;
}

export function typeSummary(rem) {
  if (rem.recurrenceType === 'ONE_OFF') return 'تک‌باره';
  if (rem.recurrenceType === 'INTERVAL_DAYS') {
    return repeatEveryText(rem) || `هر ${faNum(rem.intervalDays)} روز`;
  }
  if (rem.recurrenceType === 'CRON_SCHEDULE') return cronSummary(parseCron(rem.cronExpression));
  if (rem.recurrenceType === 'METRIC_THRESHOLD') {
    return `هر ${faSep(rem.targetMetricDelta)} کیلومتر`;
  }
  if (rem.recurrenceType === 'KM_LOG') {
    const step = repeatEveryText(rem);
    return step ? `ثبت کیلومتر، ${step}` : 'ثبت کیلومتر';
  }
  if (rem.recurrenceType === 'COMBINED') {
    const step = repeatEveryText(rem) || '';
    const km = rem.targetMetricDelta ? `هر ${faSep(rem.targetMetricDelta)} کیلومتر` : '';
    return [km, step].filter(Boolean).join(' یا ') + ' — هرکدام زودتر';
  }
  return '';
}

// One-line display for lists: title + category + next trigger (Jalali) or km state.
export function reminderLine(rem) {
  const cat = CATEGORIES[rem.category] || rem.category;
  const progress = repeatProgressText(rem);
  let when = '';
  if (rem.recurrenceType === 'METRIC_THRESHOLD') {
    const base = rem.lastMetricValue ?? rem.metricBaseValue;
    const remain = base != null && rem.targetMetricDelta
      ? Math.max(0, (rem.metricBaseValue + rem.targetMetricDelta) - base)
      : null;
    when = remain != null
      ? ` — ${faSep(remain)} کیلومتر تا سرویس بعدی`
      : ' — کیلومتر ثبت نشده';
  } else if (rem.recurrenceType === 'COMBINED') {
    const base = rem.lastMetricValue ?? rem.metricBaseValue;
    const remain = base != null && rem.targetMetricDelta
      ? Math.max(0, (rem.metricBaseValue + rem.targetMetricDelta) - base)
      : null;
    const kmPart = remain != null
      ? `${faSep(remain)} کیلومتر تا سرویس`
      : 'کیلومتر ثبت نشده';
    when = rem.nextTriggerAt
      ? ` — ${kmPart} یا ${formatJalali(rem.nextTriggerAt, true)}`
      : ` — ${kmPart}`;
  } else if (rem.nextTriggerAt) {
    when = ` — ${formatJalali(rem.nextTriggerAt, true)}`;
  }
  const paused = rem.status === 'paused' ? ' ⏸ متوقف' : '';
  const done = rem.status === 'done' ? ' ✅ انجام‌شده' : '';
  return `${cat} ${rem.title} (${typeSummary(rem)}${progress})${when}${paused}${done}`;
}
