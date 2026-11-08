// lib/keyboards.js — reply + inline keyboards.
// Callback_data order (house rule): kind|id|sub|value — never kind|sub|id|value.
import { CATEGORIES } from './reminder_service.js';
import { FA_WEEKDAYS } from './jalali.js';

export const btn = (text, data) => ({ text, callback_data: data });
export const backBtn = () => btn('🔙 بازگشت', 'cf|back');
export const inlineKb = (rows) => ({ inline_keyboard: rows });

export const MENU_LABELS = {
  NEW: '➕ یادآور جدید',
  LIST: '📋 یادآورهای من',
  CAR: '🚗 خودرو',
  SETTINGS: '⚙️ تنظیمات',
};

export function mainKb() {
  return {
    keyboard: [
      [{ text: MENU_LABELS.NEW }],
      [{ text: MENU_LABELS.LIST }, { text: MENU_LABELS.CAR }],
      [{ text: MENU_LABELS.SETTINGS }],
    ],
    resize_keyboard: true,
  };
}

export function categoryKb() {
  const rows = [];
  const entries = Object.entries(CATEGORIES);
  for (let i = 0; i < entries.length; i += 2) {
    rows.push(entries.slice(i, i + 2).map(([id, label]) => btn(label, `cat|${id}`)));
  }
  rows.push([backBtn()]);
  rows.push([btn('❌ لغو', 'cf|cancel')]);
  return inlineKb(rows);
}

export function typeKb() {
  return inlineKb([
    [btn('📅 تک‌باره (تاریخ و ساعت مشخص)', 'typ|ONE_OFF')],
    [btn('🔁 دوره‌ای — هر چند ساعت/روز/هفته/ماه', 'typ|INTERVAL_DAYS')],
    [btn('🗓 دوره‌ای — تقویمی (ماهانه/هفتگی)', 'typ|CRON_SCHEDULE')],
    [btn('🚗 سنجه‌محور — کیلومتر خودرو', 'typ|METRIC_THRESHOLD')],
    [btn('📝 یادآور ثبت کیلومتر خودرو', 'typ|KM_LOG')],
    [backBtn()],
    [btn('❌ لغو', 'cf|cancel')],
  ]);
}

// Time-only types (used after the car-kind picker picks «زمانی»).
export function typeKbTime() {
  return inlineKb([
    [btn('📅 تک‌باره (تاریخ و ساعت مشخص)', 'typ|ONE_OFF')],
    [btn('🔁 دوره‌ای — هر چند ساعت/روز/هفته/ماه', 'typ|INTERVAL_DAYS')],
    [btn('🗓 دوره‌ای — تقویمی (ماهانه/هفتگی)', 'typ|CRON_SCHEDULE')],
    [backBtn()],
    [btn('❌ لغو', 'cf|cancel')],
  ]);
}

// Car-kind picker (2026-11-07): زمانی / کیلومتری / ثبت کیلومتر / هردو.
export function carKindKb() {
  return inlineKb([
    [btn('⏰ زمانی', 'car|time'), btn('🚗 کیلومتری', 'car|km')],
    [btn('📝 ثبت کیلومتر', 'car|kmlog')],
    [btn('🔀 هردو — زمان یا کیلومتر، هرکدام زودتر', 'car|both')],
    [backBtn()],
    [btn('❌ لغو', 'cf|cancel')],
  ]);
}

// Repeat-unit picker (create flow): rep|HOUR | rep|DAY | rep|WEEK | rep|MONTH.
export function repeatUnitKb() {
  return inlineKb([
    [btn('🕐 ساعت', 'rep|HOUR'), btn('📅 روز', 'rep|DAY')],
    [btn('📆 هفته', 'rep|WEEK'), btn('🗓 ماه', 'rep|MONTH')],
    [backBtn()],
    [btn('❌ لغو', 'cf|cancel')],
  ]);
}

// «نامحدود» button for the repeat-count step (rep|inf).
export function unlimitedKb() {
  return inlineKb([
    [btn('♾ نامحدود', 'rep|inf'), btn('❌ لغو', 'cf|cancel')],
    [backBtn()],
  ]);
}

// Profile picker (create flow): prof|<id>, plus «new profile» (prof|new).
export function profilePickKb(profiles) {
  const rows = (profiles || []).map((p) => [btn(`🚗 ${p.name}`, `prof|${p.id}`)]);
  rows.push([btn('➕ پروفایل جدید', 'prof|new')]);
  rows.push([backBtn()]);
  rows.push([btn('❌ لغو', 'cf|cancel')]);
  return inlineKb(rows);
}

// Buttons on one profile card in the car screen. kind|id|sub (vp = vehicle profile).
export function profileCardKb(p) {
  return inlineKb([
    [btn('👁 مشاهده', `vp|${p.id}|view`), btn('📊 ثبت کیلومتر', `vp|${p.id}|kmlog`)],
    [btn('➕ سرویس جدید', `vp|${p.id}|newmetric`), btn('📝 یادآور ثبت کیلومتر', `vp|${p.id}|newkmlog`)],
    [btn('🔀 سرویس ترکیبی (زمان یا کیلومتر)', `vp|${p.id}|newcombined`)],
    [btn('✏️ ویرایش پروفایل', `vp|${p.id}|edit`)],
    [btn('🗑 حذف پروفایل', `vp|${p.id}|del`)],
  ]);
}

export function profileDeleteKb(p) {
  return inlineKb([
    [btn('🗑 بله، حذف شود', `vp|${p.id}|delok`), btn('❌ انصراف', `vp|${p.id}|keep`)],
  ]);
}

export function newProfileKb() {
  return inlineKb([[btn('➕ پروفایل خودرو جدید', 'vp|new')]]);
}

export function cronKindKb() {
  return inlineKb([
    [btn('🗓 ماهانه (مثلاً ۲۸ام هر ماه)', 'cron|monthly')],
    [btn('📆 هفتگی (روزهای مشخص هفته)', 'cron|weekly')],
    [backBtn()],
    [btn('❌ لغو', 'cf|cancel')],
  ]);
}

// Weekday toggle grid. selected = Set of Tehran weekdayNums (0=یکشنبه..6=شنبه).
// Saturday-first order (شنبه..جمعه) matches the Iranian week.
export function weekdayKb(selected) {
  const order = [6, 0, 1, 2, 3, 4, 5];
  const rows = [];
  for (let i = 0; i < order.length; i += 2) {
    rows.push(order.slice(i, i + 2).map((d) => btn(
      `${selected.has(d) ? '✅ ' : ''}${FA_WEEKDAYS[d]}`,
      `cwd|${d}`,
    )));
  }
  rows.push([btn('✅ تأیید روزها', 'cwd|ok'), btn('❌ لغو', 'cf|cancel')]);
  rows.push([backBtn()]);
  return inlineKb(rows);
}

export function confirmKb() {
  return inlineKb([
    [btn('✅ ذخیره', 'cf|save'), btn('❌ لغو', 'cf|cancel')],
    [backBtn()],
  ]);
}

export function cancelKb() {
  return inlineKb([[backBtn(), btn('❌ لغو', 'cf|cancel')]]);
}

// Card buttons under one reminder in the list.
export function reminderCardKb(rem) {
  const rows = [];
  if (rem.status === 'done') {
    rows.push([btn('🗑 حذف', `rm|${rem.id}|del`)]);
    return inlineKb(rows);
  }
  if (rem.recurrenceType === 'METRIC_THRESHOLD' || rem.recurrenceType === 'KM_LOG'
    || rem.recurrenceType === 'COMBINED') {
    rows.push([btn('📊 ثبت کیلومتر', `km|${rem.id}|log`)]);
  }
  if ((rem.recurrenceType === 'ONE_OFF' || rem.recurrenceType === 'KM_LOG'
    || rem.recurrenceType === 'COMBINED') && rem.status === 'active') {
    rows.push([btn('✏️ ویرایش ساعت', `rm|${rem.id}|edtime`)]);
  }
  const toggle = rem.status === 'paused'
    ? btn('▶️ از سرگیری', `rm|${rem.id}|resume`)
    : btn('⏸ توقف موقت', `rm|${rem.id}|pause`);
  rows.push([toggle, btn('🗑 حذف', `rm|${rem.id}|del`)]);
  return inlineKb(rows);
}

export function deleteConfirmKb(rem) {
  return inlineKb([
    [btn('🗑 بله، حذف شود', `rm|${rem.id}|delok`), btn('❌ انصراف', `rm|${rem.id}|keep`)],
  ]);
}

// Buttons on a fired reminder message. kind|id|sub.
// KM_LOG has no «done» button — the km value itself closes the loop.
export function dispatchKb(rem) {
  if (rem.recurrenceType === 'KM_LOG') {
    return inlineKb([[btn('📊 ثبت کیلومتر', `act|${rem.id}|km`), btn('⏱ ۲ ساعت بعد', `act|${rem.id}|snooze`)]]);
  }
  const row = [btn('✅ انجام شد', `act|${rem.id}|done`), btn('⏱ ۲ ساعت بعد', `act|${rem.id}|snooze`)];
  if (rem.recurrenceType === 'METRIC_THRESHOLD' || rem.recurrenceType === 'COMBINED') {
    row.push(btn('📊 ثبت کیلومتر', `act|${rem.id}|km`));
  }
  return inlineKb([row]);
}

// Button on the 10-day «کیلومتر؟» prompt (per profile).
export function kmPromptKb(profile) {
  return inlineKb([[btn('📊 ثبت کیلومتر', `vp|${profile.id}|kmlog`)]]);
}
