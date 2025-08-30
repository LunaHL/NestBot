const cooldowns = new Map();
export function hitCooldown(key, ms) {
  const now = Date.now();
  const until = cooldowns.get(key) ?? 0;
  if (until > now) return true;
  cooldowns.set(key, now + ms);
  return false;
}