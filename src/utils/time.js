// Date helpers in the server's time zone (TIMEZONE in .env, default Europe/Berlin).
const TZ = process.env.TIMEZONE || 'Europe/Berlin';

/** Current date/time as seen in the server's time zone. */
const nowInTZ = () =>
  new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));

/** Format a Date as "YYYY-MM-DD". */
function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" for today (offsetDays = -1 for yesterday, etc.). */
function localDate(offsetDays = 0) {
  const d = nowInTZ();
  d.setDate(d.getDate() + offsetDays);
  return formatDate(d);
}

/** True on October 31 in the server's time zone. FORCE_HALLOWEEN=true in .env to test. */
function isHalloween() {
  if (String(process.env.FORCE_HALLOWEEN).toLowerCase() === 'true') return true;
  const d = nowInTZ();
  return d.getMonth() === 9 && d.getDate() === 31;
}

/** Days until the next October 31 (0 on Halloween). */
function daysUntilHalloween() {
  const now = nowInTZ();
  now.setHours(0, 0, 0, 0);
  let target = new Date(now.getFullYear(), 9, 31);
  if (target < now) target = new Date(now.getFullYear() + 1, 9, 31);
  return Math.round((target - now) / 86400000);
}

/** How far the server time zone is ahead of UTC at a moment, in ms. */
function tzOffsetMs(utcMs) {
  const at = new Date(utcMs);
  const local = new Date(at.toLocaleString('en-US', { timeZone: TZ }));
  const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  return local - utc;
}

/**
 * A date + time in the server time zone ("2026-11-06", "20:00") as a
 * timestamp. Handles summer/winter time.
 */
function zonedToUtc(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wall;
  for (let i = 0; i < 3; i++) guess = wall - tzOffsetMs(guess);
  return guess;
}

/**
 * Discord timestamp: every viewer sees it in their own time zone.
 * style: 'F' = full date and time, 'f' = short, 't' = time, 'R' = "in 2 hours"
 */
function discordTime(ms, style = 'f') {
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

module.exports = {
  tzOffsetMs,
  zonedToUtc,
  discordTime,
  TZ,
  nowInTZ,
  formatDate,
  localDate,
  isHalloween,
  daysUntilHalloween,
};
