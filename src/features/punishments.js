import { Events } from 'discord.js';

/** Active punishments memory: Map<guildId, Map<userId, { type, timer, extra }>> */
export const ACTIVE_PUNISHMENTS = new Map();

export function setPunishment(gid, uid, data) {
  if (!ACTIVE_PUNISHMENTS.has(gid)) ACTIVE_PUNISHMENTS.set(gid, new Map());
  ACTIVE_PUNISHMENTS.get(gid).set(uid, data);
}
export function getPunishment(gid, uid) {
  return ACTIVE_PUNISHMENTS.get(gid)?.get(uid);
}
export function clearPunishment(gid, uid) {
  ACTIVE_PUNISHMENTS.get(gid)?.delete(uid);
}

/** Simple emoji-only check */
function isEmojiOnly(text) {
  const stripped = (text || '').replace(/\s+/g, '');
  if (!stripped) return false;
  try { return /^(\p{Extended_Pictographic}|\u200D|\uFE0F)+$/u.test(stripped); }
  catch { return !/[A-Za-z0-9]/.test(stripped); }
}

/** Enforcement for emoji_only & silence */
export function setupPunishmentEnforcement(client) {
  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (!msg.guild || msg.author.bot) return;
      const p = getPunishment(msg.guild.id, msg.author.id);
      if (!p) return;

      if (p.type === 'emoji_only') {
        if (!isEmojiOnly(msg.content)) {
          await msg.delete().catch(()=>{});
          const warn = await msg.channel.send(`${msg.member}, emoji-only is active!`).catch(()=>null);
          if (warn) setTimeout(() => warn.delete().catch(()=>{}), 3000);
        }
      }
      if (p.type === 'silence') {
        await msg.delete().catch(()=>{});
      }
    } catch {}
  });
}
