const db = require('../utils/db');

function _now() {
  return Date.now();
}

function _getGuildMap(data, guildId) {
  if (!data.gags) data.gags = {};
  if (!data.gags[guildId]) data.gags[guildId] = {};
  return data.gags[guildId];
}

function gagUser(guildId, targetId, durationSec, byUserId) {
  const until = _now() + durationSec * 1000;

  db.perform(data => {
    const g = _getGuildMap(data, guildId);
    const cur = g[targetId];

    // Extend if already gagged
    const baseUntil = cur?.until && cur.until > _now() ? cur.until : _now();
    g[targetId] = {
      until: Math.max(until, baseUntil + durationSec * 1000),
      by: byUserId,
      updatedAt: _now(),
    };

    // Lifetime counters (for achievements). Self-gags count as received only.
    data.gagStats ||= {};
    const stats = (data.gagStats[guildId] ||= {});
    (stats[targetId] ||= { received: 0, given: 0 }).received++;
    if (byUserId && byUserId !== targetId) {
      (stats[byUserId] ||= { received: 0, given: 0 }).given++;
    }
  });

  return getGagInfo(guildId, targetId);
}

function ungagUser(guildId, targetId) {
  db.perform(data => {
    if (!data.gags?.[guildId]) return;
    delete data.gags[guildId][targetId];
  });
}

function getGagInfo(guildId, targetId) {
  // Read-only on the hot path (runs for every message); only save when
  // an expired gag actually needs removing.
  const info = db.read(data => data.gags?.[guildId]?.[targetId] || null);

  if (info?.until && info.until <= _now()) {
    db.perform(data => {
      delete data.gags?.[guildId]?.[targetId];
    });
    return null;
  }
  return info;
}

function isGagged(guildId, targetId) {
  const info = getGagInfo(guildId, targetId);
  return !!info;
}

function getRemainingMs(guildId, targetId) {
  const info = getGagInfo(guildId, targetId);
  if (!info) return 0;
  return Math.max(0, info.until - _now());
}

function doubleRemaining(guildId, targetId) {
  let doubled = false;
  let newUntil = null;

  db.perform(data => {
    const g = data.gags?.[guildId];
    if (!g?.[targetId]?.until) return;

    const now = Date.now();
    const curUntil = g[targetId].until;

    if (curUntil <= now) {
      // expired -> cleanup
      delete g[targetId];
      return;
    }

    const remaining = curUntil - now;
    g[targetId].until = now + remaining * 2;

    doubled = true;
    newUntil = g[targetId].until;
  });

  return doubled ? { until: newUntil } : null;
}

// Simple “gagged speech”
function garble(text) {
  if (!text) return text;

  // Protect segments we do NOT want to garble:
  // *actions* and (ooc)
  const protectRe = /(\*[^*\n]+\*)|(\([^)\n]+\))/g;

  let out = '';
  let last = 0;

  const garblePlain = plain => {
    if (!plain) return plain;

    const tokens = plain.split(/(\s+)/);

    return tokens
      .map(tok => {
        if (/^\s+$/.test(tok)) return tok;

        // Mentions/channels/roles
        if (/^<@!?(\d+)>$/.test(tok)) return tok;
        if (/^<@&(\d+)>$/.test(tok)) return tok;
        if (/^<#(\d+)>$/.test(tok)) return tok;

        // Custom emojis
        if (/^<a?:\w+:\d+>$/.test(tok)) return tok;

        // Links
        if (/^https?:\/\/\S+$/i.test(tok)) return tok;

        // Garble ASCII letters; preserve digits/punct/non-ascii (emoji)
        let s = '';
        for (const ch of tok) {
          const code = ch.codePointAt(0);

          if (code > 127) {
            s += ch;
            continue;
          } // emoji etc.
          if (/[a-z]/.test(ch)) s += 'm';
          else if (/[A-Z]/.test(ch)) s += 'M';
          else if (/\d/.test(ch)) s += ch;
          else s += ch;
        }

        s = s.replace(
          /m{4,}/g,
          m => m.slice(0, Math.max(2, m.length - 1)) + 'ph',
        );
        s = s.replace(
          /M{4,}/g,
          m => m.slice(0, Math.max(2, m.length - 1)) + 'PH',
        );
        return s;
      })
      .join('');
  };

  for (const match of text.matchAll(protectRe)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;

    out += garblePlain(text.slice(last, start));

    // Make protected segments more obvious:
    // match[1] = *action*, match[2] = (ooc)
    if (match[1]) {
      out += `**${match[1]}**`; // actions pop (bold)
    } else if (match[2]) {
      out += `\`${match[2]}\``; // OOC looks like OOC (code style)
    } else {
      out += match[0];
    }

    last = end;
  }

  out += garblePlain(text.slice(last));
  return out;
}

// ==========================================
// Message handling for gagged members
// ==========================================

const REPOST_COOLDOWN_MS = 1200; // repost a gagged member's message at most every 1.2s
const SPAM_NOTICE_EVERY = 8; // every 8 dropped messages: double the gag + notice
const repostLimiter = new Map(); // "guildId:userId" -> { lastPost, dropped, punishedAt }

/**
 * Called for every message. If the author is gagged: delete the message and
 * repost it garbled (rate-limited; spamming doubles the gag).
 * Returns true if the message was handled (nothing else should react to it).
 */
async function handleGaggedMessage(message) {
  const guildId = message.guild.id;
  const userId = message.author.id;
  if (!isGagged(guildId, userId)) return false;

  const name = message.member?.displayName || message.author.username;

  // Delete the readable original if we can; otherwise mark it
  const canDelete = message.guild.members.me
    ?.permissionsIn(message.channel)
    ?.has('ManageMessages');
  if (canDelete) await message.delete().catch(() => {});
  else await message.react('🔇').catch(() => {});

  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const state = repostLimiter.get(key) || {
    lastPost: 0,
    dropped: 0,
    punishedAt: 0,
  };
  repostLimiter.set(key, state);

  // Too fast: drop the repost, and punish spam
  if (now - state.lastPost < REPOST_COOLDOWN_MS) {
    state.dropped++;
    if (state.dropped % SPAM_NOTICE_EVERY === 0) {
      // At most one doubling every 5 seconds, so it can't escalate endlessly
      if (now - state.punishedAt > 5000 && doubleRemaining(guildId, userId))
        state.punishedAt = now;
      const remainingMin = Math.ceil(getRemainingMs(guildId, userId) / 60000);
      await message.channel
        .send({
          content: `⛓️🔇 **${name}** spam detected. Gag time doubled. **~${remainingMin} min** left.`,
          allowedMentions: { parse: [] },
        })
        .catch(() => {});
    }
    return true;
  }

  state.lastPost = now;
  const garbled = garble(message.content);
  if (garbled && garbled.trim()) {
    const remainingSec = Math.ceil(getRemainingMs(guildId, userId) / 1000);
    await message.channel
      .send({
        content: `🔇 **${name}**: ${garbled}\n*(gagged • ${remainingSec}s left)*`,
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
  }
  return true;
}

module.exports = {
  handleGaggedMessage,
  gagUser,
  ungagUser,
  isGagged,
  getRemainingMs,
  garble,
  doubleRemaining,
};
