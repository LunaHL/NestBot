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

    // Verlängern, falls schon gagged
    const baseUntil = cur?.until && cur.until > _now() ? cur.until : _now();
    g[targetId] = {
      until: Math.max(until, baseUntil + durationSec * 1000),
      by: byUserId,
      updatedAt: _now(),
    };
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
  let info = null;
  db.perform(data => {
    const g = data.gags?.[guildId] || {};
    info = g[targetId] || null;

    // Auto-cleanup wenn abgelaufen
    if (info?.until && info.until <= _now()) {
      delete g[targetId];
      info = null;
    }
  });
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

function cleanupGuild(guildId) {
  db.perform(data => {
    const g = data.gags?.[guildId];
    if (!g) return;
    for (const [uid, info] of Object.entries(g)) {
      if (!info?.until || info.until <= _now()) delete g[uid];
    }
  });
}

// Simple “gagged speech”
function garble(text) {
  if (!text) return text;

  // Protect segments we do NOT want to garble:
  // *actions* and (ooc)
  const protectRe = /(\*[^*\n]+\*)|(\([^)\n]+\))/g;

  let out = '';
  let last = 0;

  const garblePlain = (plain) => {
    if (!plain) return plain;

    const tokens = plain.split(/(\s+)/);

    return tokens.map(tok => {
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

        if (code > 127) { s += ch; continue; } // emoji etc.
        if (/[a-z]/.test(ch)) s += 'm';
        else if (/[A-Z]/.test(ch)) s += 'M';
        else if (/\d/.test(ch)) s += ch;
        else s += ch;
      }

      s = s.replace(/m{4,}/g, m => m.slice(0, Math.max(2, m.length - 1)) + 'ph');
      s = s.replace(/M{4,}/g, m => m.slice(0, Math.max(2, m.length - 1)) + 'PH');
      return s;
    }).join('');
  };

  for (const match of text.matchAll(protectRe)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;

    out += garblePlain(text.slice(last, start));

    // Make protected segments more obvious:
    // match[1] = *action*, match[2] = (ooc)
    if (match[1]) {
      out += `**${match[1]}**`;      // actions pop (bold)
    } else if (match[2]) {
      out += `\`${match[2]}\``;      // OOC looks like OOC (code style)
    } else {
      out += match[0];
    }

    last = end;
  }

  out += garblePlain(text.slice(last));
  return out;
}



module.exports = {
  gagUser,
  ungagUser,
  isGagged,
  getRemainingMs,
  cleanupGuild,
  garble,
};
