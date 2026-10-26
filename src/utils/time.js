// Date helpers in the server's time zone (TIMEZONE in .env, default Europe/Berlin).
const TZ = process.env.TIMEZONE || 'Europe/Berlin';

/** Current date/time as seen in the server's time zone. */
const nowInTZ = () => new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));

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

module.exports = { TZ, nowInTZ, formatDate, localDate, isHalloween, daysUntilHalloween };
