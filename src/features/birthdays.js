import { Events, PermissionFlagsBits } from 'discord.js';
import { cfg, setBirthdayChannel } from '../config.js';
import { gstore, ustore, save } from '../store.js';

/* ---------- registrar: upsert /birthday as guild command ----------- */
function ensureBirthdaySlashCommands(client) {
  client.once('ready', async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        const definition = {
          name: 'birthday',
          description: 'Birthday tools',
          options: [
            {
              type: 1, // SUB_COMMAND
              name: 'set',
              description: 'Set your own birthday',
              options: [
                { type: 3, name: 'date', description: 'YYYY-MM-DD, DD.MM, or MM-DD', required: true }
              ]
            },
            { type: 1, name: 'remove', description: 'Remove your stored birthday' },
            {
              type: 1,
              name: 'show',
              description: 'Show a user’s stored birthday',
              options: [{ type: 6, name: 'user', description: 'User (optional)' }] // USER
            },
            {
              type: 1,
              name: 'set-for',
              description: 'Set a birthday for another member (Mistress/Admin only)',
              options: [
                { type: 6, name: 'user', description: 'Member', required: true }, // USER
                { type: 3, name: 'date', description: 'YYYY-MM-DD, DD.MM, or MM-DD', required: true }
              ]
            },
            {
              type: 1,
              name: 'add-external',
              description: 'Add a birthday for someone not on Discord (Mistress/Admin only)',
              options: [
                { type: 3, name: 'name', description: 'Name to show', required: true },
                { type: 3, name: 'date', description: 'YYYY-MM-DD, DD.MM, or MM-DD', required: true },
                { type: 4, name: 'year', description: 'Optional year, e.g., 1995' }, // INTEGER
                { type: 3, name: 'note', description: 'Optional note' }
              ]
            },
            {
              type: 1,
              name: 'remove-external',
              description: 'Remove an external birthday by name (Mistress/Admin only)',
              options: [{ type: 3, name: 'name', description: 'Exact name used when adding', required: true }]
            },
            { type: 1, name: 'list', description: 'List all saved birthdays (Discord + external)' }
          ]
        };

        const existing = await guild.commands.fetch().then(col => col.find(c => c.name === 'birthday'));
        if (existing) {
          await guild.commands.edit(existing.id, definition);
          console.log(`[birthdays] Updated /birthday in ${guild.name} (${guild.id})`);
        } else {
          await guild.commands.create(definition);
          console.log(`[birthdays] Created /birthday in ${guild.name} (${guild.id})`);
        }
      } catch (e) {
        console.error(`[birthdays] Failed to upsert /birthday in ${guild.name} (${guild.id}):`, e?.code || '', e?.message || e);
      }
    }
  });
}

/* ------------------------- time helpers ---------------------------- */
function berlinNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
}
function berlinTodayKey() {
  const d = berlinNow();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return { md: `${mm}-${dd}`, iso: `${d.getFullYear()}-${mm}-${dd}`, hour: d.getHours(), minute: d.getMinutes() };
}

/* ---------------------- parsing / formatting ----------------------- */
function parseBirthdayInput(str) {
  const s = (str || '').trim();

  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[2]}-${m[3]}`;

  // DD.MM or DD/MM
  m = s.match(/^(\d{1,2})[./](\d{1,2})$/);
  if (m) {
    const dd = String(Number(m[1])).padStart(2, '0');
    const mm = String(Number(m[2])).padStart(2, '0');
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
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(dd).padStart(2,'0')} ${names[mm - 1]}`;
}

/* ----------------------- permission helper ------------------------ */
function isMistressOrAdmin(interaction) {
  const guild = interaction.guild;
  if (!guild) return false;
  const hasAdmin = interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator);
  const isOwner = guild.ownerId === interaction.user.id;
  const mistressRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'mistress');
  const hasMistress = mistressRole && interaction.member?.roles?.cache?.has(mistressRole.id);
  return Boolean(hasMistress || hasAdmin || isOwner);
}

/* ------------------------ daily announcer ------------------------- */
function startBirthdayTicker(client) {
  setInterval(async () => {
    try {
      const { md, iso, hour } = berlinTodayKey();

      for (const [gid, guild] of client.guilds.cache) {
        const c = cfg(gid);
        const bconf = c.birthdays || {};
        if (!bconf.channelId) continue;
        if (hour < (bconf.hour ?? 9)) continue; // announce at configured hour (default 09:00)
        if (bconf.lastAnnounced === iso) continue; // once per day

        const g = gstore(gid);

        // Discord users with today's birthday
        const dcIds = [];
        for (const uid of Object.keys(g.users || {})) {
          const u = g.users[uid];
          if (u?.birthday === md) dcIds.push(uid);
        }

        // External birthdays with today's date
        const ext = (g.externalBirthdays || []).filter(e => e?.md === md && e?.name);

        // Update marker even if none to avoid repeated checks that day
        const ch = guild.channels.cache.get(bconf.channelId);
        if (!ch?.isTextBased()) {
          bconf.lastAnnounced = iso; save();
          continue;
        }

        if (dcIds.length === 0 && ext.length === 0) {
          bconf.lastAnnounced = iso; save();
          continue;
        }

        const parts = [];
        if (dcIds.length) parts.push(dcIds.map(id => `<@${id}>`).join(', '));
        if (ext.length)  parts.push(ext.map(e => `**${e.name}**`).join(', '));

        const content = `@everyone 🎂 **Happy Birthday** to ${parts.join(' and ')} — make a wish! 🎉`;
        await ch.send({ content, allowedMentions: { parse: ['everyone', 'users'] } }).catch(() => {});
        bconf.lastAnnounced = iso; save();
      }
    } catch {
      /* ignore */
    }
  }, 60 * 1000);
}

/* ------------------------- main feature --------------------------- */
export function setupBirthdays(client) {
  ensureBirthdaySlashCommands(client);

  client.on(Events.InteractionCreate, async (i) => {
    if (!i.isChatInputCommand()) return;

    // set channel for announcements
    if (i.commandName === 'setbirthdaychannel') {
      if (!i.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        return i.reply({ content: 'Missing permission: Manage Server', ephemeral: true });
      }
      const ch = i.options.getChannel('channel');
      const conf = setBirthdayChannel(i.guildId, ch.id);
      return i.reply({
        content: `Birthday channel set to ${ch}. Announce hour: **${conf.hour ?? 9}:00** Europe/Berlin.`,
        ephemeral: true
      });
    }

    if (i.commandName !== 'birthday') return;
    const sub = i.options.getSubcommand();

    // user self-set
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

      const [mm, dd] = u.birthday.split('-').map(n => Number(n));
      const now = berlinNow();
      let next = new Date(now.getFullYear(), mm - 1, dd);
      if (next < now) next = new Date(now.getFullYear() + 1, mm - 1, dd);
      const days = Math.ceil((next - now) / (1000 * 60 * 60 * 24));

      return i.reply({ content: `🎉 **${user.username}** → ${prettyMD(u.birthday)} (${days} day(s) to go)`, ephemeral: true });
    }

    // admin/mistress: set for another member
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
      return i.reply({ content: `Saved **${prettyMD(md)}** for ${target}.` });
    }

    // admin/mistress: add external entry
    if (sub === 'add-external') {
      if (!isMistressOrAdmin(i)) {
        return i.reply({ content: 'Only Mistress/Admin may add external birthdays.', ephemeral: true });
      }
      const name = i.options.getString('name')?.trim();
      const input = i.options.getString('date');
      const year = i.options.getInteger('year') ?? null;
      const note = i.options.getString('note') ?? null;

      const md = parseBirthdayInput(input);
      if (!md) return i.reply({ content: 'Invalid date. Use **YYYY-MM-DD**, **DD.MM**, or **MM-DD**.', ephemeral: true });

      const g = gstore(i.guildId);
      if (!g.externalBirthdays) g.externalBirthdays = [];
      g.externalBirthdays.push({ name, md, year, note });
      save();

      return i.reply({ content: `Added external: **${name}** — **${prettyMD(md)}**${note ? ` (${note})` : ''}.` });
    }

    // admin/mistress: remove external entry
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

    // list all (discord + external)
    if (sub === 'list') {
      const g = gstore(i.guildId);

      const users = Object.entries(g.users || {})
        .filter(([, u]) => u.birthday)
        .map(([uid, u]) => ({ uid, md: u.birthday }));

      const externals = (g.externalBirthdays || [])
        .filter(e => e?.md && e?.name)
        .map(e => ({ name: e.name, md: e.md, note: e.note ?? null }));

      if (users.length === 0 && externals.length === 0) {
        return i.reply({ content: 'No birthdays saved yet. Use `/birthday set` or `/birthday add-external`.', ephemeral: true });
      }

      const key = s => { const [m, d] = s.split('-').map(n => parseInt(n, 10)); return m * 100 + d; };
      users.sort((a, b) => key(a.md) - key(b.md));
      externals.sort((a, b) => key(a.md) - key(b.md));

      const lines = [];
      if (users.length) {
        lines.push('🎂 **Discord Members**');
        for (const { uid, md } of users) lines.push(`• ${prettyMD(md)} — <@${uid}>`);
      }
      if (externals.length) {
        if (users.length) lines.push('');
        lines.push('👥 **External Birthdays**');
        for (const { name, md, note } of externals) {
          lines.push(`• ${prettyMD(md)} — ${name}${note ? ` (${note})` : ''}`);
        }
      }

      return i.reply({ content: lines.join('\n') });
    }
  });

  startBirthdayTicker(client);
}
