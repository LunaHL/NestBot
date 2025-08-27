import { gstore, save } from './store.js';

export function cfg(gid) {
  const g = gstore(gid);
  if (g.config.sassEnabled === undefined) g.config.sassEnabled = true;
  if (g.config.sassChance  === undefined) g.config.sassChance  = 25;
  if (!g.config.wordle) g.config.wordle = { date: null, answer: null, bonus: 5, solvedBy: [] };
  if (!g.config.shop)   g.config.shop   = { items: [] };
  return g.config;
}

export function setRooms(gid, { bank, obedience, kennel }) {
  const c = gstore(gid).config;
  if (bank) c.bankChannelId = bank;
  if (obedience) c.obedienceChannelId = obedience;
  if (kennel) c.kennelChannelId = kennel;
  save();
  return c;
}
export function requireRoom(i, type) {
  const c = gstore(i.guildId).config || {};
  const map = { bank: 'bankChannelId', obedience: 'obedienceChannelId', kennel: 'kennelChannelId' };
  const targetId = c[map[type]];
  if (!targetId) return { ok: true };
  if (i.channelId !== targetId) {
    i.reply({ content: `Please use this in <#${targetId}>.`, ephemeral: true }).catch(()=>{});
    return { ok: false };
  }
  return { ok: true };
}

/* ---- Wordle config ---- */
export function setWordle(gid, { answer, bonus, date }) {
  const c = cfg(gid);
  c.wordle.answer = (answer || '').toLowerCase();
  c.wordle.bonus  = Number.isFinite(bonus) ? bonus : c.wordle.bonus;
  c.wordle.date   = date || new Date().toISOString().slice(0,10);
  c.wordle.solvedBy = [];
  save();
  return c.wordle;
}

/* ---- Shop config ---- */
export function setShop(gid, items) {
  const c = cfg(gid);
  c.shop.items = items;
  save();
  return c.shop.items;
}
