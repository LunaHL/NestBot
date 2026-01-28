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

  // Preserve links/mentions as-is (damit es nicht völlig kaputt geht)
  const tokens = text.split(/(\s+)/);

  return tokens
    .map(tok => {
      if (/^\s+$/.test(tok)) return tok;
      if (/^https?:\/\//i.test(tok)) return tok;
      if (/^<@!?(\d+)>$/.test(tok)) return tok;
      if (/^<#[0-9]+>$/.test(tok)) return tok;

      // Keep punctuation, garble letters
      let out = '';
      for (const ch of tok) {
        if (/[a-z]/.test(ch)) out += 'm';
        else if (/[A-Z]/.test(ch)) out += 'M';
        else if (/\d/.test(ch)) out += ch; // numbers unchanged
        else out += ch; // punctuation unchanged
      }

      // Add some variation
      // e.g. "mmmm" -> "mmph"
      out = out.replace(/m{4,}/g, m => m.slice(0, Math.max(2, m.length - 1)) + 'ph');
      out = out.replace(/M{4,}/g, m => m.slice(0, Math.max(2, m.length - 1)) + 'PH');

      return out;
    })
    .join('');
}

module.exports = {
  gagUser,
  ungagUser,
  isGagged,
  getRemainingMs,
  cleanupGuild,
  garble,
};
