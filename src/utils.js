import { cfg } from './config.js';

export const CURRENCIES = {
  coins: { label: 'NestCoins', emoji: '🪙' },
  paws:  { label: 'PawPoints', emoji: '🐾'  },
  pain:  { label: 'PainTokens', emoji: '🔒' }
};

export function fmtBalances(u) {
  return [
    `${CURRENCIES.coins.emoji} **${u.coins}** ${CURRENCIES.coins.label}`,
    `${CURRENCIES.paws.emoji} **${u.paws}** ${CURRENCIES.paws.label}`,
    `${CURRENCIES.pain.emoji} **${u.pain}** ${CURRENCIES.pain.label}`
  ].join('\n');
}

export function isEmojiOnly(text) {
  const stripped = (text || '').replace(/\s+/g, '');
  if (!stripped) return false;
  try { return /^(\p{Extended_Pictographic}|\u200D|\uFE0F)+$/u.test(stripped); }
  catch { return !/[A-Za-z0-9]/.test(stripped); }
}

/* ---------- Sass helpers ---------- */
export function roll(pct) { return Math.random() * 100 < pct; }
const SASS = {
  endrule: [
    "Mercy already? Mistress barely warmed up 😏",
    "Aww… couldn’t last, could you?",
    "Fine. But the Kennel remembers… 🔒"
  ],
  zeroBalance: [
    "Broke AND needy? Iconic.",
    "Your wallet is emptier than your obedience meter 🪙💀",
    "Try `/daily` before begging next time."
  ],
  punishment: [
    "Squeal louder so the Nest can hear 🐾",
    "Next time, ask for seconds.",
    "Crawl. Lower. Good pet."
  ],
  complain: [
    "Cry harder, maybe the coins will pity you.",
    "Unfair? Mistress spells it: F‑U‑N.",
    "If you can type, you can endure."
  ]
};
export function maybeSass(iOrMsg, key) {
  const gid = iOrMsg.guildId ?? iOrMsg.guild?.id;
  if (!gid) return;
  const c = cfg(gid);
  if (!c.sassEnabled || !roll(c.sassChance)) return;
  const lines = SASS[key]; if (!lines?.length) return;
  const line = lines[Math.floor(Math.random() * lines.length)];
  const channel = iOrMsg.channel ?? (iOrMsg.channelId && iOrMsg.client.channels.cache.get(iOrMsg.channelId));
  if (channel?.isTextBased()) channel.send(line).catch(()=>{});
}

/* ---------- Fuzzy call‑out ---------- */
export const CALLOUT_COOLDOWN_MS = 15_000;
export const CALLOUT_LAST = new Map();
export function normalizeForIntent(s='') {
  let t = s.toLowerCase();
  t = t.replace(/[0]/g,'o').replace(/[1!|]/g,'i').replace(/[3]/g,'e').replace(/[4@]/g,'a').replace(/[5]/g,'s').replace(/[7]/g,'t');
  t = t.replace(/[^a-z\s]/g,' ').replace(/([a-z])\1{1,}/g,'$1').replace(/\s+/g,' ').trim();
  return t;
}
export function looksLikeCallout(raw) {
  const t = normalizeForIntent(raw);
  const hasRobot = /(robot|bot|nest ?bot)/.test(t);
  const hasSay   = /(say|speak|talk|words?)/.test(t);
  const hasYouGot = /(you got|you have|ya got|u got|got something|got anything)/.test(t);
  const patterns = [
    /you (got|have).*(something|anything).*(say|speak|talk)/,
    /(got|have).*(something|anything).*(say|speak|talk).*(robot|bot)/,
    /(eh|hey|oi|yo).*(robot|bot).*(say|speak|talk)/
  ];
  return ((hasRobot && hasSay && hasYouGot) || patterns.some(p => p.test(t)));
}

/* ---------- Wordle scoring (🟩🟨⬛) ---------- */
export function scoreWordle(guess, answer) {
  // both lower-case 5 letters assumed
  const res = Array(5).fill('⬛');
  const ans = answer.split('');
  const used = Array(5).fill(false);

  // greens
  for (let i=0;i<5;i++){
    if (guess[i] === ans[i]) { res[i] = '🟩'; used[i] = true; }
  }
  // yellows
  for (let i=0;i<5;i++){
    if (res[i] === '🟩') continue;
    const idx = ans.findIndex((ch, j) => !used[j] && ch === guess[i]);
    if (idx !== -1) { res[i] = '🟨'; used[idx] = true; }
  }
  return res.join('');
}

/* ---------- Shop helpers ---------- */
// Built-in item types (examples):
// - coupon_skip: skip a future wheel result
// - coupon_reroll: reroll a wheel result
// - coupon_reverse: reverse a future punishment to picker/other
// - role_cosmetic: grant a role for N hours
export function describeItem(it) {
  const price = `${it.price}${it.priceCurrency === 'paws' ? '🐾' : it.priceCurrency === 'pain' ? '🔒' : '🪙'}`;
  return `\`${it.id}\` — **${it.name}** — ${price} — *${it.type}*`;
}
