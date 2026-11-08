// lib/metric_service.js — car-km averaging + service prediction (pure JS, no SDK).
import { faNum, faSep } from './text.js';

export const DAY_MS = 86400000;

// Mean daily driving from km log points [{ km, at }] (epoch ms).
// Needs ≥2 points spanning ≥1 day with a positive total delta; otherwise null.
export function dailyAverageKm(points) {
  if (!points || points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.at - b.at);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days = (last.at - first.at) / DAY_MS;
  const delta = last.km - first.km;
  if (days < 1 || delta <= 0) return null;
  return delta / days;
}

// Days until the service threshold, from the current km reading.
// { due: true } when already at/past it; { days: null } when no average exists.
export function predictDaysUntilService(currentKm, baseKm, deltaKm, avgPerDay) {
  const remaining = (baseKm + deltaKm) - currentKm;
  if (remaining <= 0) return { due: true, days: 0, remaining: 0 };
  if (!avgPerDay || avgPerDay <= 0) return { due: false, days: null, remaining };
  return { due: false, days: Math.ceil(remaining / avgPerDay), remaining };
}

export function predictionText(currentKm, baseKm, deltaKm, avgPerDay) {
  const pred = predictDaysUntilService(currentKm, baseKm, deltaKm, avgPerDay);
  if (pred.due) return 'موعد سرویس رسیده است.';
  const avgPart = avgPerDay
    ? `با میانگین پیمایش شما (${faSep(avgPerDay)} کیلومتر در روز)، `
    : '';
  if (pred.days == null) {
    return `${avgPart}هنوز میانگین پیمایش قابل‌محاسبه نیست؛ برای پیش‌بینی، حداقل دو ثبت کیلومتر در روزهای متفاوت لازم است.`;
  }
  return `${avgPart}حدود ${faNum(pred.days)} روز دیگر موعد سرویس می‌رسد.`;
}

// Build the averaging points for one profile: the metric reminder's base
// point (creation) plus every km log of the profile, oldest first.
// kmLogs: [{ km, loggedAt }] (epoch ms).
export function mergeKmPoints(baseKm, baseAtMs, kmLogs) {
  const points = [];
  if (baseKm != null) points.push({ km: baseKm, at: baseAtMs || 0 });
  for (const l of kmLogs || []) {
    if (l.km != null) points.push({ km: l.km, at: l.loggedAt });
  }
  points.sort((a, b) => a.at - b.at);
  return points;
}

// Should the automatic 10-day «کیلومتر؟» prompt be SKIPPED for a profile?
// Skip when: prompted within the last 10 days, OR a km was already logged
// today (Tehran day), OR a km-log reminder already fired today for it.
export function shouldSkipKmPrompt({ lastPromptAt, nowMs, kmLoggedToday, kmReminderFiredToday }) {
  if (lastPromptAt && lastPromptAt > nowMs - 10 * DAY_MS) return true;
  if (kmLoggedToday) return true;
  if (kmReminderFiredToday) return true;
  return false;
}
