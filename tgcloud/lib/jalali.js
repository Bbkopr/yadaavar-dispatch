// lib/jalali.js — Jalali calendar + Tehran wall-clock helpers (pure JS, no SDK).
// Algorithm from jalaali-js (MIT), same as booking-bot lib/clinics.js.
// Iran is UTC+3:30 year-round (no DST since 2022), so Tehran wall-clock is
// derived manually from UTC. All stored times are UTC epoch ms.
import { faNum } from './text.js';

export const TEHRAN_OFFSET_MS = 3.5 * 3600 * 1000;

export const FA_WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
export const FA_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

function div(a, b) { return ~~(a / b); }
function mod(a, b) { return a - ~~(a / b) * b; }

function jalCal(jy) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const bl = breaks.length, gy = jy + 621;
  let leapJ = -14, jp = breaks[0], jm, jump, leap, leapG, march, n, i;
  for (i = 1; i < bl; i += 1) {
    jm = breaks[i]; jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(r.gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1; k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

export function toJalaali(gy, gm, gd) {
  return d2j(g2d(gy, gm, gd));
}

export function jalaaliToGregorian(jy, jm, jd) {
  return d2g(j2d(jy, jm, jd));
}

// jalaali-js convention: jalCal(jy).leap === 0 means jy IS a leap year (Esfand 30 days).
export function isJalaliLeap(jy) {
  return jalCal(jy).leap === 0;
}

export function jalaaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeap(jy) ? 30 : 29;
}

// Tehran wall-clock parts for a UTC epoch-ms instant. weekdayNum: JS getUTCDay
// of the Tehran-shifted date (0=یکشنبه .. 6=شنبه).
export function tehranParts(ms = Date.now()) {
  const t = new Date(ms + TEHRAN_OFFSET_MS);
  const gy = t.getUTCFullYear(), gm = t.getUTCMonth() + 1, gd = t.getUTCDate();
  const j = toJalaali(gy, gm, gd);
  return {
    gy, gm, gd,
    jy: j.jy, jm: j.jm, jd: j.jd,
    weekdayNum: t.getUTCDay(),
    weekday: FA_WEEKDAYS[t.getUTCDay()],
    greg: `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`,
    hm: `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`,
  };
}

// UTC epoch ms for a Tehran wall-clock moment (Gregorian).
export function epochMsFromTehran(gy, gm, gd, hh = 0, mm = 0) {
  return Date.UTC(gy, gm - 1, gd, hh, mm) - TEHRAN_OFFSET_MS;
}

// UTC epoch ms for a Tehran wall-clock moment (Jalali date + HH:MM).
export function jalaliToEpochMs(jy, jm, jd, hh = 0, mm = 0) {
  const g = jalaaliToGregorian(jy, jm, jd);
  return epochMsFromTehran(g.gy, g.gm, g.gd, hh, mm);
}

// Add N Jalali months to a Tehran wall-clock instant, keeping the time of
// day; the day clamps to the target month's length (31 Shahrivar + 1mo = 30 Mehr).
export function addJalaliMonths(ms, months) {
  const p = tehranParts(ms);
  let y = p.jy, m = p.jm + months;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  const d = Math.min(p.jd, jalaaliMonthLength(y, m));
  const [hh, mm] = p.hm.split(':').map(Number);
  return jalaliToEpochMs(y, m, d, hh, mm);
}

// UTC epoch ms of the start of the Tehran calendar day containing ms (00:00 Tehran).
export function tehranDayStartMs(ms = Date.now()) {
  const p = tehranParts(ms);
  return jalaliToEpochMs(p.jy, p.jm, p.jd, 0, 0);
}

// «شنبه ۲۰ آبان ۱۴۰۵» — withTime adds «، ساعت ۰۹:۳۰» (Persian digits).
export function formatJalali(ms, withTime = false) {
  const p = tehranParts(ms);
  let s = `${p.weekday} ${faNum(p.jd)} ${FA_MONTHS[p.jm - 1]} ${faNum(p.jy)}`;
  if (withTime) s += `، ساعت ${faNum(p.hm)}`;
  return s;
}

export function formatJalaliShort(ms) {
  const p = tehranParts(ms);
  return `${faNum(p.jd)} ${FA_MONTHS[p.jm - 1]} ${faNum(p.jy)}`;
}

// Minutes from now until ms, rounded; negative if past.
export function minutesUntil(ms, nowMs = Date.now()) {
  return Math.round((ms - nowMs) / 60000);
}
