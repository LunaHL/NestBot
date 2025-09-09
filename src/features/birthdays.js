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
    // If first part > 12, it's definitely DD.MM; otherwise assume DD.MM (DACH habit)
    if (Number(m[1]) > 12) return `${mm}-${dd}`;
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

// --- Permissions helper ---
function isMistressOrAdmin(interaction) {
  const guild = interaction.guild;
  if (!guild) return false;
  const hasAdmin = interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator);
  const isOwner = guild.ownerId === interaction.user.id;
  const mistressRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'mistress');
  const hasMistress = mistressRole && interaction.member?.roles?.cache?.has(mistressRole.id);
  return Boolean(hasMistress || hasAdmin || isOwner);
}

// --- Daily announcer (includes externals) ---
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

        const g = gstore(gid);

        // Collect matches: Discord users
        const userIds = [];
        for (const uid of Object.keys(g.users || {})) {
          const u = g.users[uid];
          if (u?.birthday === md) userIds.push(uid);
        }

        // Collect matches: External birthdays
        const externals = (g.externalBirthdays || []).filter(e => e?.md === md && e?.name);

        if (userIds.length === 0 && externals.length === 0) {
          // Mark as done to avoid spamming later the same day
          bconf.lastAnnounced = iso; save();
          continue;
        }

        // Send announcement
        const ch = guild.channels.cache.get(bconf.channelId);
        if (!ch?.isTextBased()) continue;

        const parts = [];
        if (userIds.length) parts.push(userIds.map(id => `<@${id}>`).join(', '));
        if (externals.length) parts.push(externals.map(e => `**${e.name}**`).join(', '));

        const content = `@everyone 🎂 **Happy Birthday** to ${parts.join(' and ')} — make a wish! 🎉`;
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

      // User self-set
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

      // Admin/Mistress: set birthday for another member
      if (sub === 'set-for') {
        if (!isMistressOrAdmin(i)) {
          return i.reply({ content: 'Only Mistress/Admin may set birthdays for others.', ephemeral: true });
        }
        const target = i.options.getMember('user');
        const input = i.options.getString('date');
        const md = parseBirthdayInput(input);
        if (!md) return i.reply({ content: 'Invalid date. Use YYYY-MM-DD, DD.MM, or MM-DD.', ephemeral: true });

        const u = ustore(i.guildId, target.id);
        u.birthday = md; save();
        return i.reply({ content: `Saved **${prettyMD(md)}** for ${target}.`, ephemeral: false });
      }

      // Admin/Mistress: add an external (non-Discord) birthday
      if (sub === 'add-external') {
        if (!isMistressOrAdmin(i)) {
          return i.reply({ content: 'Only Mistress/Admin may add external birthdays.', ephemeral: true });
        }
        const name = i.options.getString('name')?.trim();
        const input = i.options.getString('date');
        const year = i.options.getInteger('year') ?? null;
        const note = i.options.getString('note') ?? null;

        const md = parseBirthdayInput(input);
        if (!md) {
          return i.reply({ content: 'Invalid date. Use **YYYY-MM-DD**, **DD.MM**, or **MM-DD**.', ephemeral: true });
        }

        const g = gstore(i.guildId);
        if (!g.externalBirthdays) g.externalBirthdays = [];
        g.externalBirthdays.push({ name, md, year, note });
        save();

        return i.reply({ content: `Added external: **${name}** — **${prettyMD(md)}**${note ? ` (${note})` : ''}.` });
      }

      // Admin/Mistress: remove an external by name
      if (sub === 'remove-external') {
        if (!isMistressOrAdmin(i)) {
          return i.reply({ content: 'Only Mistress/Admin may remove external birthdays.', ephemeral: true });
        }
        const name = (i.options.getString('name') || '').trim().toLowerCase();
        const g = gstore(i.guildId);
        const before = (g.externalBirthdays || []).length;
        g.externalBirthdays = (g.externalBirthdays || []).filter(e => (e.name || '').toLowerCase() !== name);
        save();
        const removed = before - g.externalBirthdays.length;
        return i.reply({
          content: removed
            ? `Removed ${removed} entr${removed > 1 ? 'ies' : 'y'} for "${name}".`
            : `No entries found for "${name}".`
        });
      }

      // List all Birthdays (Discord + external)
      if (sub === 'list') {
        const g = gstore(i.guildId);

        // Discord users with birthdays
        const users = Object.entries(g.users || {})
          .filter(([, u]) => u.birthday)
          .map(([uid, u]) => ({ uid, md: u.birthday }));

        // External birthdays
        const externals = (g.externalBirthdays || []).filter(e => e?.md && e?.name)
          .map(e => ({ name: e.name, md: e.md, note: e.note ?? null }));

        if (users.length === 0 && externals.length === 0) {
          return i.reply({ content: 'No birthdays saved yet. Use `/birthday set` or `/birthday add-external`.', ephemeral: true });
        }

        // Sort calendar order
        const key = (s) => { const [m, d] = s.split('-').map(n => parseInt(n, 10)); return m * 100 + d; };
        users.sort((a, b) => key(a.md) - key(b.md));
        externals.sort((a, b) => key(a.md) - key(b.md));

        const lines = [];
        if (users.length) {
          lines.push('🎂 **Discord Members**');
          for (const { uid, md } of users) lines.push(`• ${prettyMD(md)} — <@${uid}>`);
        }
        if (externals.length) {
          if (users.length) lines.push(''); // spacer
          lines.push('👥 **External Birthdays**');
          for (const { name, md, note } of externals) {
            lines.push(`• ${prettyMD(md)} — ${name}${note ? ` (${note})` : ''}`);
          }
        }

        return i.reply({ content: lines.join('\n') });
      }
    }
  });

  // Start ticker
  startBirthdayTicker(client);
}
