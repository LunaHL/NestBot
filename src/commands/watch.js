// /watch: movie nights. Only the Discord side lives here (options, replies,
// buttons). Logic, rooms and the live clock: src/services/watch.js.
// Buttons work across bot restarts: they're routed here by their customId
// ("watch:…") from events/interactionCreate.js.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const watch = require('../services/watch');
const tmdb = require('../services/tmdb');
const wl = require('../services/watchlist');
const { zonedToUtc, discordTime, TZ } = require('../utils/time');

const DATE_SUGGESTIONS = 21; // days offered in the date autocomplete
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

const nightOption = (opt, required = true) =>
  opt
    .setName('night')
    .setDescription('Which movie night (start typing)')
    .setRequired(required)
    .setAutocomplete(true);

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

  if (action === 'suggest') {
    return interaction.reply(
      ephemeral(
        '💡 Type `/watch suggest title:` here in the room and pick a title from the list.',
      ),
    );
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
              .setName('date')
              .setDescription('Day (start typing, or YYYY-MM-DD)')
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addStringOption(o =>
            o
              .setName('time')
              .setDescription('Start time, e.g. 20:00 (server time)')
              .setRequired(true),
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
    )
    .addSubcommand(sub =>
      seriesOptions(
        sub
          .setName('edit')
          .setDescription('Change a planned movie night (planner or admins)')
          .addStringOption(o => nightOption(o))
          .addStringOption(o => titleOption(o, false))
          .addStringOption(o =>
            o.setName('date').setDescription('New day').setAutocomplete(true),
          )
          .addStringOption(o =>
            o.setName('time').setDescription('New start time, e.g. 20:30'),
          ),
      ),
    )
    .addSubcommand(sub =>
      sub
        .setName('cancel')
        .setDescription('Cancel a movie night (planner or admins)')
        .addStringOption(o => nightOption(o)),
    )
    .addSubcommand(sub =>
      sub
        .setName('vote')
        .setDescription(
          'Start a vote on what to watch for a planned night (planner or admins)',
        )
        .addStringOption(o => nightOption(o))
        .addStringOption(o =>
          o
            .setName('duration')
            .setDescription('How long the vote runs')
            .addChoices(...VOTE_CHOICES),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('suggest')
        .setDescription(
          'Suggest a title for a running vote (use it in the room)',
        )
        .addStringOption(o => titleOption(o)),
    )
    .addSubcommand(sub =>
      sub
        .setName('calendar')
        .setDescription('Upcoming movie nights, sign up with a click'),
    )
    .addSubcommand(sub =>
      sub
        .setName('history')
        .setDescription('Past movie nights')
        .addIntegerOption(o =>
          o.setName('page').setDescription('Page').setMinValue(1),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('top')
        .setDescription('🏆 Nest Top 10: best rated movies and series'),
    )
    .addSubcommand(sub =>
      sub
        .setName('sync')
        .setDescription(
          'Am I in sync? Enter where you are, e.g. 41:50 or 1:12:05',
        )
        .addStringOption(o =>
          o
            .setName('time')
            .setDescription('Your position in the movie')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('end')
        .setDescription(
          'End a movie night and close its room (planner or admins)',
        )
        .addStringOption(o => nightOption(o, false)),
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

    if (focused.name === 'date') {
      const choices = [];
      for (let i = 0; i < DATE_SUGGESTIONS; i++) {
        const ms = Date.now() + i * 86400000;
        const date = new Intl.DateTimeFormat('en-CA', {
          timeZone: TZ,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(ms);
        const label =
          new Date(ms).toLocaleDateString('en-US', {
            timeZone: TZ,
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          }) + (i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : '');
        if (
          !q ||
          label.toLowerCase().includes(q.toLowerCase()) ||
          date.includes(q)
        )
          choices.push({ name: label, value: date });
      }
      return interaction.respond(choices.slice(0, 25));
    }

    if (focused.name === 'night') {
      const choices = watch
        .upcoming(interaction.guildId)
        .filter(n => !q || n.title.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 25)
        .map(n => ({
          name: `${new Date(n.startAt).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} · ${watch.fullTitle(n)}`.slice(
            0,
            100,
          ),
          value: String(n.id),
        }));
      return interaction.respond(choices);
    }
    return interaction.respond([]);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const member = interaction.member;
    const s = watch.settingsOf(interaction.guildId);
    const o = interaction.options;

    // ---------- history ----------
    if (sub === 'history') {
      const past = watch.pastNights(interaction.guildId);
      if (!past.length)
        return interaction.reply(
          ephemeral('📭 No movie nights yet. Plan one with `/watch plan`!'),
        );
      const pages = Math.ceil(past.length / 10);
      const page = Math.min(o.getInteger('page') || 1, pages);
      const lines = past.slice((page - 1) * 10, page * 10).map(n => {
        const avg = watch.averageRating(n);
        return (
          `**${discordTime(n.startAt, 'd')}** · ${watch.emojiOf(n)} ${watch.fullTitle(n)} · 👥 ${watch.watchers(n).length}` +
          (avg ? ` · ⭐ ${avg.toFixed(1)}` : '')
        );
      });
      const embed = new EmbedBuilder()
        .setColor(0xe50914)
        .setTitle(`🎞️ Movie night history (${past.length})`)
        .setDescription(lines.join('\n'))
        .setFooter({
          text: `Page ${page}/${pages} · ⭐ = average rating of the people who watched`,
        });
      return interaction.reply({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
    }

    // ---------- top ----------
    if (sub === 'top') {
      const top = wl.topRated(interaction.guildId, { min: 2, limit: 10 });
      const medals = ['🥇', '🥈', '🥉'];
      const embed = new EmbedBuilder()
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
            : 'Not enough ratings yet. A title needs at least 2 ratings. Rate with the ⭐ buttons after a movie night or `/watchlist rate`.',
        );
      return interaction.reply({ embeds: [embed] });
    }

    // ---------- calendar ----------
    if (sub === 'calendar') {
      return interaction.reply({
        embeds: [watch.calendarEmbed(interaction.guildId)],
        components: watch.calendarComponents(interaction.guildId),
        flags: 64,
      });
    }

    // ---------- sync ----------
    if (sub === 'sync') {
      const n = watch.nightByRoom(interaction.guildId, interaction.channelId);
      if (!n)
        return interaction.reply(
          ephemeral('❌ Use this in a movie night room.'),
        );
      const given = watch.parsePos(o.getString('time'));
      if (given === null)
        return interaction.reply(
          ephemeral('❌ Write your time like `41:50` or `1:12:05`.'),
        );
      if (!['playing', 'paused'].includes(n.session.phase)) {
        return interaction.reply(
          ephemeral('⏳ The movie isn’t running right now.'),
        );
      }
      const { expected, diff } = watch.syncInfo(n, given);
      const secs = Math.round(Math.abs(diff) / 1000);
      const amount =
        secs >= 60
          ? `${Math.floor(secs / 60)} min ${secs % 60} s`
          : `${secs} s`;
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

    // ---------- end ----------
    if (sub === 'end') {
      const id = o.getString('night');
      const n = id
        ? watch.getNight(interaction.guildId, Number(id))
        : watch.nightByRoom(interaction.guildId, interaction.channelId);
      if (!n || !['open', 'live', 'planned'].includes(n.status)) {
        return interaction.reply(
          ephemeral('❌ Pick a movie night, or use this inside its room.'),
        );
      }
      if (!watch.canManage(member, n))
        return interaction.reply(
          ephemeral(
            '❌ Only the planner or an admin can end this movie night.',
          ),
        );
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
      return;
    }

    // ---------- cancel ----------
    if (sub === 'cancel') {
      const n = watch.getNight(
        interaction.guildId,
        Number(o.getString('night')),
      );
      if (!n || !['planned', 'open', 'live'].includes(n.status))
        return interaction.reply(ephemeral('❌ Movie night not found.'));
      if (!watch.canManage(member, n))
        return interaction.reply(
          ephemeral('❌ Only the planner or an admin can cancel this.'),
        );
      await interaction.deferReply({ flags: 64 });
      await watch.cancelNight(guild, n.id, interaction.user.id);
      return interaction.editReply(
        `❌ **${watch.fullTitle(n)}** was cancelled. Everyone signed up was notified.`,
      );
    }

    // ---------- vote ----------
    if (sub === 'vote') {
      const n = watch.getNight(
        interaction.guildId,
        Number(o.getString('night')),
      );
      if (
        !n ||
        !['planned', 'open'].includes(n.status) ||
        n.session.phase !== 'waiting'
      ) {
        return interaction.reply(
          ephemeral(
            '❌ Only movie nights that haven’t started can get a vote.',
          ),
        );
      }
      if (n.vote?.open)
        return interaction.reply(
          ephemeral(`🗳️ There's already a vote running in <#${n.roomId}>.`),
        );
      if (!watch.canManage(member, n))
        return interaction.reply(
          ephemeral('❌ Only the planner or an admin can start a vote.'),
        );
      await interaction.deferReply({ flags: 64 });
      const updated = await watch.startVote(
        guild,
        n.id,
        o.getString('duration') || 'start',
      );
      return interaction.editReply(
        `🗳️ Vote started in <#${updated.roomId}>. The current title is one of the options.`,
      );
    }

    // ---------- suggest ----------
    if (sub === 'suggest') {
      const n = watch.nightByRoom(interaction.guildId, interaction.channelId);
      if (!n?.vote?.open)
        return interaction.reply(
          ephemeral(
            '❌ Use this in a movie night room while a vote is running.',
          ),
        );
      await interaction.deferReply({ flags: 64 });
      const r = await watch.suggest(
        guild,
        n.id,
        interaction.user.id,
        o.getString('title'),
      );
      const msg = {
        closed: '❌ The vote is over.',
        'not-member': '❌ Enter the room first.',
        exists: `👍 **${r.option?.title}** is already an option. Vote for it in the menu!`,
        full: '❌ The vote is full (25 options).',
      };
      return interaction.editReply(
        r.error
          ? msg[r.error]
          : `💡 Added **${r.option.title}** to the vote. Don't forget to vote for it!`,
      );
    }

    // Planning needs the #movies channel
    if (!s.channelId) {
      return interaction.reply(
        ephemeral(
          '⚙️ Movie nights aren’t set up yet. An admin needs to set the #movies channel with `/settings watch channel:`.',
        ),
      );
    }

    // ---------- plan / now ----------
    if (sub === 'plan' || sub === 'now') {
      if (!watch.canPlan(member, interaction.guildId)) {
        return interaction.reply(
          ephemeral('❌ You’re not allowed to plan movie nights here.'),
        );
      }
      let startAt = Date.now();
      if (sub === 'plan') {
        const date = o.getString('date');
        const time = parseTime(o.getString('time'));
        if (!isValidDate(date))
          return interaction.reply(
            ephemeral(
              '❌ Pick a day from the list, or write it like `2026-11-06`.',
            ),
          );
        if (!time)
          return interaction.reply(
            ephemeral('❌ Write the time like `20:00`.'),
          );
        startAt = zonedToUtc(date, time);
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
      });
      if (voteFor) {
        n = await watch.startVote(guild, n.id, voteFor);
        return interaction.editReply(
          `🗳️ Movie night planned for ${discordTime(n.startAt, 'F')}, **vote is open** in <#${n.roomId}> ` +
            `(ends ${n.vote.mode === 'start' ? 'when it starts' : discordTime(n.vote.endsAt, 'R')}).\n` +
            `Everyone who signs up can vote; their watchlists add options automatically. Suggest more with \`/watch suggest\`.`,
        );
      }
      if (sub === 'now') {
        return interaction.editReply(
          n.roomId
            ? `🍿 **${watch.fullTitle(n)}** starts now! Your room: <#${n.roomId}>. Others can join from <#${s.channelId}>.`
            : '❌ I couldn’t create the room. Check that I may manage channels.',
        );
      }
      return interaction.editReply(
        (details.continued ? `▶️ Continuing where you left off.\n` : '') +
          `✅ Planned ${watch.emojiOf(n)} **${watch.fullTitle(n)}** for ${discordTime(n.startAt, 'F')}.\n` +
          `The card is in <#${s.channelId}>; the room opens ${s.opensMin} minutes before the start.` +
          (n.info || !tmdb.isEnabled()
            ? ''
            : '\n💡 Tip: pick the title from the list to get poster, length and streaming info.'),
      );
    }

    // ---------- edit ----------
    if (sub === 'edit') {
      const n = watch.getNight(
        interaction.guildId,
        Number(o.getString('night')),
      );
      if (!n || n.status !== 'planned')
        return interaction.reply(
          ephemeral(
            '❌ Only planned (not yet started) movie nights can be edited.',
          ),
        );
      if (!watch.canManage(member, n))
        return interaction.reply(
          ephemeral('❌ Only the planner or an admin can edit this.'),
        );

      const changes = {};
      const dateIn = o.getString('date');
      const timeIn = o.getString('time');
      if (dateIn || timeIn) {
        const cur = zonedParts(n.startAt);
        const date = dateIn || cur.date;
        const time = timeIn ? parseTime(timeIn) : cur.time;
        if (!isValidDate(date))
          return interaction.reply(
            ephemeral(
              '❌ Pick a day from the list, or write it like `2026-11-06`.',
            ),
          );
        if (!time)
          return interaction.reply(
            ephemeral('❌ Write the time like `20:00`.'),
          );
        changes.startAt = zonedToUtc(date, time);
        if (changes.startAt < Date.now() - 60000)
          return interaction.reply(ephemeral('❌ That time is in the past.'));
      }

      const series = seriesValues(o);
      const newTitle = o.getString('title');
      await interaction.deferReply({ flags: 64 });
      if (newTitle || Object.values(series).some(v => v !== null)) {
        const ref =
          newTitle || (n.info ? `${n.info.type}:${n.info.id}` : n.title);
        const keep = newTitle
          ? {}
          : { season: n.season, episode: n.episode, episodes: n.episodes };
        const merged = Object.fromEntries(
          Object.entries({ ...keep, ...series }).map(([k, v]) => [
            k,
            v ?? keep[k] ?? null,
          ]),
        );
        Object.assign(changes, await watch.resolveTitle(ref, merged));
      }
      if (!Object.keys(changes).length)
        return interaction.editReply(
          '🤔 Nothing to change. Pick a new title, date or time.',
        );
      const updated = await watch.editNight(guild, n.id, changes);
      return interaction.editReply(
        `✅ Updated: **${watch.fullTitle(updated)}** on ${discordTime(updated.startAt, 'F')}. Everyone signed up was notified.`,
      );
    }
  },
};

// Exported for tests
module.exports.parseTime = parseTime;
module.exports.zonedParts = zonedParts;
