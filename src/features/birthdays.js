import { Events, PermissionFlagsBits } from 'discord.js';
import { cfg, setBirthdayChannel } from '../config.js';
import { gstore, ustore, save } from '../store.js';

// --- Time helpers (Europe/Berlin) ---
function berlinNow() {
  // Convert current time to Europe/Berlin without extra deps
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
}
function berlinTodayKey() {
  const d = berlinNow();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return { md: `${mm}-${dd}`, iso: `${d.getFullYear()}-${mm}-${dd}`, hour: d.getHours(), minute: d.getMinutes() };
}

// --- Parse input date strings ---
function parseBirthdayInput(str) {
  // Accept: YYYY-MM-DD, DD.MM, DD/MM, MM-DD, MM/DD
  const s = (str || '').trim();

  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[2]}-${m[3]}`;

  // DD.MM or DD/MM
  m = s.match(/^(\d{1,2})[./](\d{1,2})$/);
  if (m) {
    const dd = String(Number(m[1])).padStart(2, '0');
    const mm = String(Number(m[2])).padStart(2, '0');
    // If user gave DD.MM, convert to MM-DD (store as month-day)
    // Heuristik: Wenn erster Teil > 12, ist es sicher DD.MM
    if (Number(m[1]) > 12) return `${mm}-${dd}`;
    // Sonst: Ambig — nehmen wir an DD.MM, wie im DACH üblich
    return `${mm}-${dd}`;
  }

  // MM-DD or MM/DD
  m = s.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const mm = String(Number(m[1])).padStart(2, '0');
    const dd = String(Number(m[2])).padStart(2, '0');
    return `${mm}-${dd}`;
  }

  return null;
}

function prettyMD(md) {
  const [mm, dd] = md.split('-').map(n => Number(n));
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(dd).padStart(2,'0')} ${monthNames[mm-1]}`;
}

// --- Daily announcer ---
function startBirthdayTicker(client) {
  setInterval(async () => {
    try {
      const { md, iso, hour } = berlinTodayKey();

      // Announce once per day per guild, at or after configured hour
      for (const [gid, guild] of client.guilds.cache) {
        const c = cfg(gid);
        const bconf = c.birthdays || {};
        if (!bconf.channelId) continue;
        if (hour < (bconf.hour ?? 9)) continue; // wait until configured hour
        if (bconf.lastAnnounced === iso) continue; // already announced today

        // Find all users with matching birthday (MM-DD)
        const g = gstore(gid);
        const matches = [];
        for (const uid of Object.keys(g.users || {})) {
          const u = g.users[uid];
          if (u?.birthday === md) matches.push(uid);
        }
        if (matches.length === 0) {
          // Mark as done to avoid spamming later the same day
          bconf.lastAnnounced = iso; save();
          continue;
        }

        // Send announcement
        const ch = guild.channels.cache.get(bconf.channelId);
        if (!ch?.isTextBased()) continue;

        // Bot needs "Mention Everyone" permission in that channel to ping @everyone
        const content = `@everyone 🎂 **Happy Birthday** to ${matches.map(id => `<@${id}>`).join(', ')} — make a wish! 🎉`;
        await ch.send({ content, allowedMentions: { parse: ['everyone', 'users'] } }).catch(() => {});
        bconf.lastAnnounced = iso; save();
      }
    } catch (_) { /* ignore */ }
  }, 60 * 1000); // check every minute
}

export function setupBirthdays(client) {
  // Slash handlers
  client.on(Events.InteractionCreate, async (i) => {
    if (!i.isChatInputCommand()) return;

    if (i.commandName === 'setbirthdaychannel') {
      if (!i.memberPermissions.has(PermissionFlagsBits.ManageGuild))
        return i.reply({ content: 'Missing permission: Manage Server', ephemeral: true });

      const ch = i.options.getChannel('channel');
      const conf = setBirthdayChannel(i.guildId, ch.id);
      return i.reply({
        content: `Birthday channel set to ${ch}. Announce hour: **${conf.hour}:00** Europe/Berlin.`,
        ephemeral: true
      });
    }

    if (i.commandName === 'birthday') {
      const sub = i.options.getSubcommand();

      if (sub === 'set') {
        const input = i.options.getString('date');
        const md = parseBirthdayInput(input);
        if (!md) return i.reply({ content: 'Invalid date. Use **YYYY-MM-DD**, **DD.MM**, or **MM-DD**.', ephemeral: true });

        const u = ustore(i.guildId, i.user.id);
        u.birthday = md; save();
        return i.reply({ content: `Saved your birthday as **${prettyMD(md)}**. 🎂`, ephemeral: true });
      }

      if (sub === 'remove') {
        const u = ustore(i.guildId, i.user.id);
        delete u.birthday; save();
        return i.reply({ content: 'Removed your stored birthday.', ephemeral: true });
      }

      if (sub === 'show') {
        const user = i.options.getUser('user') ?? i.user;
        const u = ustore(i.guildId, user.id);
        if (!u.birthday) return i.reply({ content: `${user} has no birthday stored.`, ephemeral: true });

        // Days until next
        const [mm, dd] = u.birthday.split('-').map(n => Number(n));
        const now = berlinNow();
        let next = new Date(now.getFullYear(), mm - 1, dd);
        if (next < now) next = new Date(now.getFullYear() + 1, mm - 1, dd);
        const days = Math.ceil((next - now) / (1000*60*60*24));

        return i.reply({ content: `🎉 **${user.username}** → ${prettyMD(u.birthday)} (${days} day(s) to go)`, ephemeral: true });
      }
    }
  });

  // Start ticker
  startBirthdayTicker(client);
}
