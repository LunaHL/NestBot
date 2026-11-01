// /watch: movie nights. Only the Discord side lives here (options, replies,
// buttons). Logic, rooms and the live clock: src/services/watch.js.
// Buttons work across bot restarts: they're routed here by their customId
// ("watch:…") from events/interactionCreate.js.
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const watch = require('../services/watch');
const tmdb = require('../services/tmdb');
const wl = require('../services/watchlist');
const groups = require('../services/groups');
const { zonedToUtc, discordTime, TZ } = require('../utils/time');

const DEFAULT_TIME = '20:00'; // when only a day is given
const VOTE_CHOICES = [
  { name: '🗳️ Until the movie night starts', value: 'start' },
  { name: '1 hour', value: '1h' },
  { name: '6 hours', value: '6h' },
  { name: '12 hours', value: '12h' },
  { name: '1 day', value: '1d' },
  { name: '3 days', value: '3d' },
  { name: '7 days', value: '7d' },
];

// ---------- Helpers ----------

/** "20:00", "20.00", "8:5", "20" → "20:00", or null */
function parseTime(text) {
  const m = /^(\d{1,2})(?:[:.h](\d{1,2}))?$/.exec(String(text || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function isValidDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text || '')) return false;
  const [y, m, d] = text.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** A timestamp as { date: "YYYY-MM-DD", time: "HH:MM" } in the server time zone. */
function zonedParts(ms) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(ms))
      .map(x => [x.type, x.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
  };
}

const DAY_WORDS = {
  today: 0,
  heute: 0,
  tonight: 0,
  tomorrow: 1,
  morgen: 1,
  tmr: 1,
};
const WEEKDAYS = [
  ['sunday', 'sun', 'sonntag', 'so'],
  ['monday', 'mon', 'montag', 'mo'],
  ['tuesday', 'tue', 'dienstag', 'di'],
  ['wednesday', 'wed', 'mittwoch', 'mi'],
  ['thursday', 'thu', 'donnerstag', 'do'],
  ['friday', 'fri', 'freitag', 'fr'],
  ['saturday', 'sat', 'samstag', 'sa'],
];
const weekdayOf = date => new Date(`${date}T12:00:00Z`).getUTCDay();
const addDays = (date, days) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);

/**
 * "tomorrow 20:00", "friday", "fr 21", "20:30", "6.11. 20:00", "2026-11-06 20:00"
 * → { date, time } in server time, or null. A day without a time means 20:00;
 * a time without a day means today (or tomorrow if it's already past).
 */
function parseWhen(text, now = Date.now()) {
  const raw = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+at\s+|\s+um\s+/g, ' ')
    .replace(/,/g, ' ');
  if (!raw) return null;
  const today = zonedParts(now);
  let date = null;
  let rest = raw;
  let m;
  if ((m = /^(\d{4}-\d{2}-\d{2})\s*(.*)$/.exec(raw))) {
    date = m[1];
    rest = m[2];
  }
  if (!date && (m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})?\s*(.*)$/.exec(raw))) {
    const year = m[3]
      ? m[3].length === 2
        ? 2000 + Number(m[3])
        : Number(m[3])
      : Number(today.date.slice(0, 4));
    date = `${year}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    if (!m[3] && date < today.date) date = `${year + 1}${date.slice(4)}`;
    rest = m[4];
  }
  let weekday = null;
  if (!date) {
    const [first, ...others] = raw.split(' ');
    if (Object.hasOwn(DAY_WORDS, first)) {
      date = addDays(today.date, DAY_WORDS[first]);
      rest = others.join(' ');
    } else {
      weekday = WEEKDAYS.findIndex(names => names.includes(first));
      if (weekday >= 0) rest = others.join(' ');
      else weekday = null;
    }
  }
  const time = rest.trim()
    ? parseTime(rest.trim().replace(/\s*(uhr|h)$/, ''))
    : date || weekday !== null
      ? DEFAULT_TIME
      : null;
  if (!time) return null;
  if (weekday !== null) {
    let offset = (weekday - weekdayOf(today.date) + 7) % 7;
    if (offset === 0 && time <= today.time) offset = 7;
    date = addDays(today.date, offset);
  }
  if (!date) date = time > today.time ? today.date : addDays(today.date, 1);
  return isValidDate(date) ? { date, time } : null;
}

/** "Friday, Nov 7 · 20:00" */
function prettyWhen({ date, time }) {
  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  return `${label} · ${time}`;
}

/** Suggestions for the "when" option: what was typed, plus the next days at 20:00. */
function whenChoices(q) {
  const today = zonedParts(Date.now()).date;
  const choices = [];
  const typed = q ? parseWhen(q) : null;
  if (typed)
    choices.push({
      name: `📅 ${prettyWhen(typed)}`,
      value: `${typed.date} ${typed.time}`,
    });
  for (let i = 0; i < 14; i++) {
    const w = { date: addDays(today, i), time: typed?.time || DEFAULT_TIME };
    if (i === 0 && zonedToUtc(w.date, w.time) < Date.now()) continue;
    const tag = i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : '';
    const value = `${w.date} ${w.time}`;
    if (choices.some(c => c.value === value)) continue;
    choices.push({ name: `${prettyWhen(w)}${tag}`, value });
  }
  return choices.slice(0, 25);
}

const titleOption = (opt, required = true) =>
  opt
    .setName('title')
    .setDescription('Movie, series or anime (start typing to search)')
    .setRequired(required)
    .setAutocomplete(true);

const seriesOptions = sub =>
  sub
    .addIntegerOption(o =>
      o
        .setName('season')
        .setDescription('Series: season (default 1)')
        .setMinValue(1),
    )
    .addIntegerOption(o =>
      o
        .setName('episode')
        .setDescription('Series: episode (default 1)')
        .setMinValue(1),
    )
    .addIntegerOption(o =>
      o
        .setName('episodes')
        .setDescription('Series: how many episodes in a row (default 1)')
        .setMinValue(1)
        .setMaxValue(30),
    )
    .addIntegerOption(o =>
      o
        .setName('absolute')
        .setDescription(
          'Long anime: episode number counted through all seasons, e.g. 1050',
        )
        .setMinValue(1),
    )
    .addIntegerOption(o =>
      o
        .setName('length')
        .setDescription(
          'Length in minutes (only if the info is missing or wrong)',
        )
        .setMinValue(1)
        .setMaxValue(600),
    );

const ephemeral = content => ({ content, flags: 64 });

function seriesValues(options) {
  return {
    season: options.getInteger('season'),
    episode: options.getInteger('episode'),
    episodes: options.getInteger('episodes'),
    length: options.getInteger('length'),
    absolute: options.getInteger('absolute'),
  };
}

// ---------- Panels: ⚙️ Manage, 🔄 sync, 💡 suggest, history, top ----------

const button = (customId, label, emoji, style = ButtonStyle.Secondary) =>
  new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setEmoji(emoji)
    .setStyle(style);

/** A small form with text fields: [{ id, label, value, placeholder, required }]. */
function form(customId, title, fields) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title.slice(0, 45))
    .addComponents(
      fields.map(f => {
        const input = new TextInputBuilder()
          .setCustomId(f.id)
          .setLabel(f.label.slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setRequired(f.required !== false)
          .setMaxLength(100);
        if (f.value) input.setValue(String(f.value).slice(0, 100));
        if (f.placeholder)
          input.setPlaceholder(String(f.placeholder).slice(0, 100));
        return new ActionRowBuilder().addComponents(input);
      }),
    );
}

/** Typed text → the best TMDB match ("movie:27205"), or the text itself. */
async function bestMatch(text) {
  const t = String(text || '').trim();
  if (!t || /^(movie|tv):\d+$/.test(t) || !tmdb.isEnabled()) return t;
  const [first] = await tmdb.search(t).catch(() => []);
  return first ? `${first.type}:${first.id}` : t;
}

function managePanel(n) {
  const row = [];
  if (n.status === 'planned')
    row.push(button(`watch:editform:${n.id}`, 'Change time or title', '✏️'));
  if (
    ['planned', 'open'].includes(n.status) &&
    n.session.phase === 'waiting' &&
    !n.vote?.open
  )
    row.push(button(`watch:votestart:${n.id}`, 'Start a vote', '🗳️'));
  if (n.status !== 'planned')
    row.push(button(`watch:endnow:${n.id}`, 'End', '🏁', ButtonStyle.Primary));
  row.push(
    button(`watch:cancelask:${n.id}`, 'Cancel', '❌', ButtonStyle.Danger),
  );
  return {
    content: `⚙️ **${watch.fullTitle(n)}** · ${discordTime(n.startAt, 'F')}`,
    components: [new ActionRowBuilder().addComponents(row)],
    flags: 64,
  };
}

function historyView(guildId, pageWanted) {
  const past = watch.pastNights(guildId);
  if (!past.length)
    return {
      content: '📭 No movie nights yet. Plan one with `/watch plan`!',
      embeds: [],
      components: [],
    };
  const pages = Math.ceil(past.length / 10);
  const page = Math.min(Math.max(1, pageWanted), pages);
  const lines = past.slice((page - 1) * 10, page * 10).map(n => {
    const avg = watch.averageRating(n);
    return (
      `**${discordTime(n.startAt, 'd')}** · ${watch.emojiOf(n)} ${watch.fullTitle(n)} · 👥 ${watch.watchers(n).length}` +
      (avg ? ` · ⭐ ${avg.toFixed(1)}` : '')
    );
  });
  const nav = [];
  if (page > 1)
    nav.push(button(`watch:historypage:${page - 1}`, 'Newer', '◀️'));
  if (page < pages)
    nav.push(button(`watch:historypage:${page + 1}`, 'Older', '▶️'));
  return {
    content: '',
    embeds: [
      new EmbedBuilder()
        .setColor(0xe50914)
        .setTitle(`🎞️ Movie night history (${past.length})`)
        .setDescription(lines.join('\n'))
        .setFooter({
          text: `Page ${page}/${pages} · ⭐ = average rating of the people who watched`,
        }),
    ],
    components: nav.length ? [new ActionRowBuilder().addComponents(nav)] : [],
    allowedMentions: { parse: [] },
  };
}

function topEmbed(guildId) {
  const top = wl.topRated(guildId, { min: 2, limit: 10 });
  const medals = ['🥇', '🥈', '🥉'];
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🏆 Nest Top 10')
    .setDescription(
      top.length
        ? top
            .map(
              (t, i) =>
                `${medals[i] || `**${i + 1}.**`} ${tmdb.kindEmoji(t.type, t.anime)} **${t.title}**${t.year ? ` (${t.year})` : ''} · ⭐ ${t.avg.toFixed(1)} (${t.n} ratings)`,
            )
            .join('\n')
        : 'Not enough ratings yet. A title needs at least 2 ratings: rate with the ⭐ buttons after a movie night or in `/watchlist show`.',
    );
}

const PANEL_ACTIONS = [
  'history',
  'historypage',
  'top',
  'manage',
  'editform',
  'edit',
  'votestart',
  'voteduration',
  'cancelask',
  'cancelno',
  'cancelyes',
  'endnow',
  'sync',
  'syncform',
  'suggest',
  'suggestform',
];

/** Buttons and forms that replace the old subcommands (actions in PANEL_ACTIONS). */
async function panelAction(interaction, guild, action, id, idText) {
  const member = interaction.member;
  const guildId = guild.id;

  if (action === 'history')
    return interaction.reply({
      ...historyView(guildId, Number(idText) || 1),
      flags: 64,
    });
  if (action === 'historypage')
    return interaction.update(historyView(guildId, Number(idText) || 1));
  if (action === 'top')
    return interaction.reply({ embeds: [topEmbed(guildId)], flags: 64 });

  if (action === 'cancelno')
    return interaction.update({
      content: '👍 Nothing cancelled.',
      components: [],
    });

  const n = watch.getNight(guildId, id);
  if (!n || !['planned', 'open', 'live'].includes(n.status))
    return interaction.reply(ephemeral('❌ This movie night is over.'));

  // 🔄 "I'm at…": anyone in the room
  if (action === 'sync') {
    return interaction.showModal(
      form(`watch:syncform:${n.id}`, 'Where are you in the movie?', [
        {
          id: 'pos',
          label: 'Your player shows… (e.g. 41:50 or 1:12:05)',
          placeholder: '41:50',
        },
      ]),
    );
  }
  if (action === 'syncform') {
    const given = watch.parsePos(interaction.fields.getTextInputValue('pos'));
    if (given === null)
      return interaction.reply(
        ephemeral('❌ Write your time like `41:50` or `1:12:05`.'),
      );
    if (!['playing', 'paused'].includes(n.session.phase))
      return interaction.reply(
        ephemeral('⏳ The movie isn’t running right now.'),
      );
    const { expected, diff } = watch.syncInfo(n, given);
    const secs = Math.round(Math.abs(diff) / 1000);
    const amount =
      secs >= 60 ? `${Math.floor(secs / 60)} min ${secs % 60} s` : `${secs} s`;
    let text;
    if (secs <= 3)
      text = `✅ You're perfectly in sync (**${watch.fmtPos(expected)}**).`;
    else if (diff > 0)
      text = `⏪ You're **${amount} behind**: skip forward to **${watch.fmtPos(expected)}**.`;
    else
      text = `⏩ You're **${amount} ahead**: go back to **${watch.fmtPos(expected)}**.`;
    if (n.session.phase === 'paused') text += '\n⏸️ (It’s paused right now.)';
    return interaction.reply(ephemeral(text));
  }

  // 💡 Suggest for the vote: anyone in the room
  if (action === 'suggest') {
    if (!n.vote?.open)
      return interaction.reply(ephemeral('❌ The vote is over.'));
    return interaction.showModal(
      form(`watch:suggestform:${n.id}`, 'Suggest a title', [
        {
          id: 'title',
          label: 'Movie, series or anime',
          placeholder: 'e.g. Inception, or Dune 2021',
        },
      ]),
    );
  }
  if (action === 'suggestform') {
    await interaction.deferReply({ flags: 64 });
    const ref = await bestMatch(interaction.fields.getTextInputValue('title'));
    const r = await watch.suggest(guild, n.id, interaction.user.id, ref);
    const msg = {
      closed: '❌ The vote is over.',
      'not-member': '❌ Enter the room first.',
      exists: `👍 **${r.option?.title}** is already an option. Vote for it in the menu!`,
      full: '❌ The vote is full (25 options).',
    };
    return interaction.editReply(
      r.error
        ? msg[r.error]
        : `💡 Added **${r.option.title}** to the vote. Wrong one? Suggest again with the year, e.g. “Dune 2021”.`,
    );
  }

  // Everything below: planner or admins only
  if (!watch.canManage(member, n))
    return interaction.reply(
      ephemeral('❌ Only the planner or an admin can manage this movie night.'),
    );

  if (action === 'manage') return interaction.reply(managePanel(n));

  if (action === 'editform') {
    const cur = zonedParts(n.startAt);
    return interaction.showModal(
      form(`watch:edit:${n.id}`, 'Change movie night', [
        {
          id: 'when',
          label: 'When (e.g. tomorrow 20:00, fri 21:00)',
          value: `${cur.date} ${cur.time}`,
        },
        {
          id: 'title',
          label: 'New title (leave empty to keep it)',
          required: false,
          placeholder: watch.fullTitle(n),
        },
      ]),
    );
  }
  if (action === 'edit') {
    if (n.status !== 'planned')
      return interaction.reply(
        ephemeral('❌ It already started, so it can’t be changed anymore.'),
      );
    const when = parseWhen(interaction.fields.getTextInputValue('when'));
    if (!when)
      return interaction.reply(
        ephemeral(
          '❌ I didn’t understand the time. Try `tomorrow 20:00`, `friday 21:00` or `2026-11-06 20:00`.',
        ),
      );
    const startAt = zonedToUtc(when.date, when.time);
    if (startAt < Date.now() - 60000)
      return interaction.reply(ephemeral('❌ That time is in the past.'));
    await interaction.deferReply({ flags: 64 });
    const changes = { startAt };
    const newTitle = interaction.fields.getTextInputValue('title')?.trim();
    if (newTitle) {
      Object.assign(
        changes,
        await watch.resolveTitle(await bestMatch(newTitle), {
          guildId,
          scope: n.groupId || 'server',
        }),
      );
    }
    const updated = await watch.editNight(guild, n.id, changes);
    return interaction.editReply(
      `✅ Updated: **${watch.fullTitle(updated)}** on ${discordTime(updated.startAt, 'F')}. Everyone signed up was notified.`,
    );
  }

  if (action === 'votestart') {
    return interaction.update({
      content: `🗳️ How long should people vote on **${watch.fullTitle(n)}**? (The current title is one of the options.)`,
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`watch:voteduration:${n.id}`)
            .setPlaceholder('⏱️ Vote duration…')
            .addOptions(
              VOTE_CHOICES.map(c => ({
                label: c.name.replace('🗳️ ', ''),
                value: c.value,
              })),
            ),
        ),
      ],
    });
  }
  if (action === 'voteduration') {
    if (n.vote?.open)
      return interaction.update({
        content: `🗳️ There's already a vote in <#${n.roomId}>.`,
        components: [],
      });
    await interaction.deferUpdate();
    const updated = await watch.startVote(
      guild,
      n.id,
      interaction.values?.[0] || 'start',
    );
    return interaction.editReply({
      content: `🗳️ Vote started in <#${updated.roomId}>.`,
      components: [],
    });
  }

  if (action === 'cancelask') {
    return interaction.update({
      content: `❌ Really cancel **${watch.fullTitle(n)}**? Everyone signed up gets told.`,
      components: [
        new ActionRowBuilder().addComponents(
          button(
            `watch:cancelyes:${n.id}`,
            'Yes, cancel it',
            '❌',
            ButtonStyle.Danger,
          ),
          button(`watch:cancelno:${n.id}`, 'No', '↩️'),
        ),
      ],
    });
  }
  if (action === 'cancelyes') {
    await interaction.deferUpdate();
    await watch.cancelNight(guild, n.id, interaction.user.id);
    return interaction
      .editReply({
        content: `❌ **${watch.fullTitle(n)}** was cancelled. Everyone signed up was notified.`,
        components: [],
      })
      .catch(() => {});
  }

  if (action === 'endnow') {
    const inRoom = n.roomId === interaction.channelId;
    await interaction.reply(
      ephemeral(
        inRoom
          ? '🎬 Closing this room in 5 seconds…'
          : `🎬 **${watch.fullTitle(n)}** ended.`,
      ),
    );
    if (inRoom) await new Promise(r => setTimeout(r, 5000));
    await watch.endNight(guild, n.id, { by: interaction.user.tag });
  }
}

// ---------- Buttons and menus ----------

async function handleComponent(interaction) {
  const [, action, idText, ...rest] = interaction.customId.split(':');
  // In DMs (watchlist notifications) the server id is part of the button id
  const guild =
    interaction.guild || interaction.client.guilds.cache.get(rest[0]);
  if (!guild)
    return interaction.reply(ephemeral('This server is not available.'));
  const userId = interaction.user.id;
  const id = Number(action === 'signupmenu' ? interaction.values?.[0] : idText);

  // Checkpoint votes update their own message
  if (action === 'cp') {
    const [index, choice] = rest;
    const n = watch.voteCheckpoint(guild.id, id, index, userId, choice);
    if (!n) return interaction.reply(ephemeral('This movie night is over.'));
    return interaction.update(
      watch.checkpointMessage(n, Number(index), n.session.checkpoints[index]),
    );
  }

  // Pause / resume post their own messages in the room
  if (action === 'pause' || action === 'resume') {
    const r =
      action === 'pause'
        ? await watch.pause(interaction.client, guild.id, id, userId)
        : await watch.resume(interaction.client, guild.id, id, userId);
    if (r.error) {
      const why =
        r.error === 'not-member'
          ? 'You are not part of this movie night.'
          : 'That doesn’t work right now.';
      return interaction.reply(ephemeral(`❌ ${why}`));
    }
    return interaction.deferUpdate().catch(() => {});
  }

  if (action === 'vote') {
    const n = watch.castVote(guild.id, id, userId, interaction.values || []);
    if (!n?.vote?.open)
      return interaction.reply(ephemeral('❌ This vote is over.'));
    if (!n.members.includes(userId))
      return interaction.reply(ephemeral('❌ Enter the room first.'));
    await interaction.update({ embeds: [watch.voteEmbed(n)] }).catch(() => {});
    watch.refreshAll(interaction.client, n).catch(() => {}); // vote count on the card
    const mine = n.vote.votes[userId] || [];
    const titles = n.vote.options
      .filter(op => mine.includes(op.key))
      .map(op => op.title);
    return interaction.followUp(
      ephemeral(
        titles.length
          ? `🗳️ Your votes: **${titles.join('**, **')}**`
          : '🗳️ Your votes were removed.',
      ),
    );
  }

  // ⚙️ Manage, 🔄 sync, 💡 suggest, history, top: buttons instead of commands
  if (PANEL_ACTIONS.includes(action)) {
    await panelAction(interaction, guild, action, id, idText);
    return;
  }

  if (action === 'next' || action === 'stop') {
    const marker = rest[0];
    await interaction.deferReply({ flags: 64 });
    const r =
      action === 'next'
        ? await watch.goNext(interaction.client, guild.id, id, userId, marker)
        : await watch.stopSeries(
            interaction.client,
            guild.id,
            id,
            userId,
            marker,
          );
    const errors = {
      gone: 'Someone already did that.',
      'not-member': '❌ You are not part of this movie night.',
      last: '🎉 That was the last episode!',
    };
    if (r.error) return interaction.editReply(errors[r.error]);
    await interaction.message?.edit({ components: [] }).catch(() => {});
    return interaction.editReply(
      action === 'next'
        ? `⏭️ On to **${watch.fullTitle(r.night)}**! Check in above.`
        : '🛑 Stopped.',
    );
  }

  if (action === 'wladd') {
    await interaction.deferReply({ flags: 64 });
    const key = wl.decodeKey(rest[0]);
    const m = /^(movie|tv):(\d+)$/.exec(key);
    const info = m ? await tmdb.details(m[1], Number(m[2])) : null;
    if (!info) return interaction.editReply('❌ Couldn’t find that title.');
    const r = wl.addItem(guild.id, userId, wl.titleFields(info));
    return interaction.editReply(
      r.existed
        ? `📌 **${info.title}** is already on your watchlist.`
        : `📌 Added **${info.title}** to your watchlist.`,
    );
  }

  if (action === 'missed') {
    const n = watch.getNight(guild.id, id);
    if (!n?.members.includes(userId))
      return interaction.reply(
        ephemeral('❌ You are not part of this movie night.'),
      );
    watch.markMissed(guild.id, id, userId);
    return interaction.reply(
      ephemeral(
        "⚠️ Noted: you missed part of it, so it won't be marked as watched for you.",
      ),
    );
  }

  if (action === 'pos') {
    const n = watch.getNight(guild.id, id);
    if (!n) return interaction.reply(ephemeral('This movie night is over.'));
    const phase = n.session.phase;
    const text =
      phase === 'paused'
        ? `⏸️ Paused at **${watch.fmtPos(watch.position(n))}**. Pause there too!`
        : phase === 'playing'
          ? `🕐 Right now you should be at **${watch.fmtPos(watch.position(n))}**.`
          : `🕐 The movie hasn't started yet${phase === 'finished' ? ' (or it’s already over)' : ''}.`;
    return interaction.reply(ephemeral(text));
  }

  // Everything else may take a moment (Discord gives us 3 seconds)
  await interaction.deferReply({ flags: 64 });

  if (action === 'signup' || action === 'signupmenu') {
    const r = await watch.toggleSignup(guild, id, userId);
    if (r.error === 'private')
      return interaction.editReply('🔒 This is a private group movie night.');
    if (r.error)
      return interaction.editReply(
        '❌ This movie night is no longer available.',
      );
    const n = r.night;
    const s = watch.settingsOf(guild.id);
    if (!r.joined)
      return interaction.editReply(`👋 You left **${watch.fullTitle(n)}**.`);
    const room = n.roomId
      ? `\n🚪 The room is open: <#${n.roomId}>`
      : `\n🚪 The room opens ${s.opensMin} minutes before the start. You'll get a ping.`;
    return interaction.editReply(
      `✅ You're signed up for **${watch.fullTitle(n)}** (${discordTime(n.startAt, 'f')}).${room}`,
    );
  }

  if (action === 'enter') {
    const r = await watch.enterRoom(guild, id, userId);
    if (r.error === 'private')
      return interaction.editReply('🔒 This is a private group movie night.');
    if (r.error) return interaction.editReply('❌ This room is closed.');
    return interaction.editReply(
      `🚪 ${r.already ? "You're already in" : "You're in"}: <#${r.night.roomId}>`,
    );
  }

  if (action === 'where') {
    const n = watch.getNight(guild.id, id);
    if (!n?.info)
      return interaction.editReply('📺 No streaming info for this one.');
    // Your own country and services (from /watchlist settings)
    const mine = wl.getList(guild.id, userId).settings;
    const region = mine.region || tmdb.regionFromLocale(interaction.locale);
    const p = await tmdb.providers(n.info.type, n.info.id, region);
    if (
      !p ||
      (!p.stream.length && !p.free.length && !p.rent.length && !p.buy.length)
    ) {
      return interaction.editReply(
        `📺 No streaming info for **${region}** yet. (Change your country with \`/watchlist settings region:\`.)`,
      );
    }
    const norm = x => x.toLowerCase().replace(/[^a-z0-9]/g, '');
    const have = name =>
      (mine.services || []).some(s => norm(s) === norm(name));
    const fmt = list =>
      list.map(x => (have(x) ? `**${x}** (you have it ✅)` : x)).join(', ');
    const lines = [];
    if (p.stream.length) lines.push(`📺 **Stream:** ${fmt(p.stream)}`);
    if (p.free.length) lines.push(`🆓 **Free:** ${fmt(p.free)}`);
    if (p.rent.length) lines.push(`💶 **Rent:** ${p.rent.join(', ')}`);
    if (p.buy.length) lines.push(`🛒 **Buy:** ${p.buy.join(', ')}`);
    return interaction.editReply(
      `📺 **${n.title}** in **${region}**:\n${lines.join('\n')}` +
        (p.link ? `\n[More info](<${p.link}>)` : '') +
        (mine.services?.length
          ? ''
          : '\n💡 Tell me your services with `/watchlist settings services:`') +
        `\n-# ${tmdb.ATTRIBUTION} · Streaming data by JustWatch`,
    );
  }

  if (action === 'wl') {
    const n = watch.getNight(guild.id, id);
    if (!n) return interaction.editReply('This movie night is gone.');
    const r = wl.addItem(guild.id, userId, watch.nightFields(n));
    return interaction.editReply(
      r.existed
        ? `📌 **${n.title}** is already on your watchlist.`
        : `📌 Added **${n.title}** to your watchlist.`,
    );
  }

  if (action === 'ready') {
    const r = await watch.markReady(interaction.client, guild.id, id, userId);
    if (r.error === 'not-member')
      return interaction.editReply('❌ Enter the room first.');
    if (r.error)
      return interaction.editReply('⏳ Nothing to be ready for right now.');
    return interaction.editReply(
      (r.allReady
        ? '✅ Everyone is ready. Here we go!'
        : "✅ You're ready! Waiting for the others…") +
        (r.coins ? ` (+${r.coins} coins for checking in)` : ''),
    );
  }

  if (action === 'force') {
    const r = await watch.forceStart(
      interaction.client,
      interaction.member,
      id,
    );
    if (r.error === 'not-allowed') {
      return interaction.editReply(
        '❌ Only the planner, the person who paused, or an admin can start without everyone.',
      );
    }
    if (r.error) return interaction.editReply('⏳ Nothing to start right now.');
    return interaction.editReply('▶️ Starting!');
  }

  return interaction.editReply('🤔 Unknown button.');
}

// ---------- Command ----------

module.exports = {
  handleComponent,

  data: new SlashCommandBuilder()
    .setName('watch')
    .setDescription('Movie nights: watch together, in sync')
    .addSubcommand(sub =>
      seriesOptions(
        sub
          .setName('plan')
          .setDescription(
            'Plan a movie night (leave out the title to let everyone vote)',
          )
          .addStringOption(o =>
            o
              .setName('when')
              .setDescription(
                'e.g. "tomorrow 20:00", "friday", "fr 21:00" (start typing)',
              )
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addStringOption(o => titleOption(o, false))
          .addStringOption(o =>
            o
              .setName('vote')
              .setDescription(
                'Let people vote on what to watch, and for how long',
              )
              .addChoices(...VOTE_CHOICES),
          ),
      ),
    )
    .addSubcommand(sub =>
      seriesOptions(
        sub
          .setName('now')
          .setDescription('Watch something right now')
          .addStringOption(o => titleOption(o)),
      ),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const q = String(focused.value || '').trim();

    if (focused.name === 'title') {
      const results = tmdb.isEnabled() ? await tmdb.search(q) : [];
      const choices = results.map(r => ({
        name: `${tmdb.kindEmoji(r.type, r.anime)} ${r.title}${r.year ? ` (${r.year})` : ''}${r.original && r.original !== r.title ? ` · ${r.original}` : ''}`.slice(
          0,
          100,
        ),
        value: `${r.type}:${r.id}`,
      }));
      if (q && choices.length < 25)
        choices.push({
          name: `✏️ Use “${q}” as the title`.slice(0, 100),
          value: q.slice(0, 100),
        });
      return interaction.respond(choices.slice(0, 25));
    }

    if (focused.name === 'when') return interaction.respond(whenChoices(q));

    return interaction.respond([]);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const member = interaction.member;
    const s = watch.settingsOf(interaction.guildId);
    const o = interaction.options;

    // Used inside a group channel? Then it's a private group movie night
    const group = groups.groupByChannel(
      interaction.guildId,
      interaction.channelId,
    );
    if (group && !group.members.includes(interaction.user.id)) {
      return interaction.reply(ephemeral('❌ You are not in this group.'));
    }

    // Public movie nights need the #movies channel
    if (!group && !s.channelId) {
      return interaction.reply(
        ephemeral(
          '⚙️ Movie nights aren’t set up yet. An admin needs to set the #movies channel with `/settings watch channel:`.',
        ),
      );
    }

    // ---------- plan / now ----------
    if (sub === 'plan' || sub === 'now') {
      if (!group && !watch.canPlan(member, interaction.guildId)) {
        return interaction.reply(
          ephemeral('❌ You’re not allowed to plan movie nights here.'),
        );
      }
      let startAt = Date.now();
      if (sub === 'plan') {
        const when = parseWhen(o.getString('when'));
        if (!when)
          return interaction.reply(
            ephemeral(
              '❌ I didn’t understand when. Try `tomorrow 20:00`, `friday`, `fr 21:00` or pick one from the list.',
            ),
          );
        startAt = zonedToUtc(when.date, when.time);
        if (startAt < Date.now() - 60000)
          return interaction.reply(ephemeral('❌ That time is in the past.'));
      }

      await interaction.deferReply({ flags: 64 });
      const title = o.getString('title');
      const voteFor =
        sub === 'plan' ? o.getString('vote') || (title ? null : 'start') : null;
      const details = title
        ? await watch.resolveTitle(title, {
            ...seriesValues(o),
            guildId: interaction.guildId,
            scope: group ? group.id : 'server',
          })
        : {
            title: watch.VOTE_TITLE,
            kind: 'movie',
            info: null,
            season: null,
            episode: null,
            episodeTitle: null,
            episodes: 1,
            lengthMin: 120,
          };
      let n = await watch.createNight(guild, member, details, startAt, {
        now: sub === 'now',
        groupId: group ? group.id : null,
      });
      if (voteFor) {
        n = await watch.startVote(guild, n.id, voteFor);
        return interaction.editReply(
          `🗳️ Movie night planned for ${discordTime(n.startAt, 'F')}, **vote is open** in <#${n.roomId}> ` +
            `(ends ${n.vote.mode === 'start' ? 'when it starts' : discordTime(n.vote.endsAt, 'R')}).\n` +
            `Everyone who signs up can vote; their watchlists add options automatically. Suggest more with **💡 Suggest** in the room.`,
        );
      }
      if (sub === 'now') {
        return interaction.editReply(
          n.roomId
            ? `🍿 **${watch.fullTitle(n)}** starts now! ${group ? 'Check in above.' : `Your room: <#${n.roomId}>. Others can join from <#${s.channelId}>.`}`
            : '❌ I couldn’t create the room. Check that I may manage channels.',
        );
      }
      return interaction.editReply(
        (details.continued ? `▶️ Continuing where you left off.\n` : '') +
          `✅ Planned ${watch.emojiOf(n)} **${watch.fullTitle(n)}** for ${discordTime(n.startAt, 'F')}.\n` +
          (group
            ? `It runs right here in the group channel; you'll get a ping ${s.opensMin} minutes before.`
            : `The card is in <#${s.channelId}>; the room opens ${s.opensMin} minutes before the start.`) +
          (n.info || !tmdb.isEnabled()
            ? ''
            : '\n💡 Tip: pick the title from the list to get poster, length and streaming info.'),
      );
    }
  },
};

// Exported for tests
module.exports.parseTime = parseTime;
module.exports.zonedParts = zonedParts;
module.exports.parseWhen = parseWhen;
module.exports.bestMatch = bestMatch;
