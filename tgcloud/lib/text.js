// lib/text.js — Persian text helpers (pure JS, no SDK — testable with plain node).
// Bidi hard rule: every Latin token in user-facing text goes through lat();
// never start a paragraph with bare Latin.

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function faNum(s) {
  return String(s).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

// Thousands separator with Persian digits: 12500 -> «۱۲٬۵۰۰»
export function faSep(n) {
  const s = String(Math.round(Number(n) || 0));
  return faNum(s.replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));
}

// Wrap a Latin token so it never breaks RTL layout: lat('km').
// FSI U+2068 .. PDI U+2069 isolate.
export const lat = (s) => '\u2068' + s + '\u2069';

// Persian + Arabic-Indic digits -> Latin digits. Also normalizes ی/ک and ZWNJ variants.
export function faToEnDigits(s) {
  return String(s || '')
    .replace(/[۰-۹]/g, (ch) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)))
    .replace(/[٠-٩]/g, (ch) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)));
}

export function normalizeFa(s) {
  return faToEnDigits(String(s || '').trim())
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ');
}
