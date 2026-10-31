const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const ui = require('../utils/ui');
const drinks = require('../services/drinks');
const {
  CATEGORIES: DRINK_CATEGORIES,
  TOTAL_LIMIT,
  CAFFEINE_LIMIT,
  ALCOHOL_LIMIT,
} = require('../config/drinksMenu');
const nickname = require('../services/nickname');
const { discordTime } = require('../utils/time');
const gag = require('../services/gag');
const db = require('../utils/db');
const { getUserStats } = require('../services/stats');
const achievements = require('../services/achievements');
const watchlist = require('../services/watchlist');
const tmdb = require('../services/tmdb');

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function getBirthday(guildId, userId) {
  const birthdays = db.read(d => d.birthdays?.[guildId] || {});
  for (const entry of Object.values(birthdays)) {
    if (entry.userId === userId) {
      const [month, day] = entry.date.split('-');
      return `${MONTHS[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`;
    }
  }
  return 'Not set';
}

/** The 📊 Overview tab. */
function overviewEmbed(guildId, targetUser, member) {
  const userId = targetUser.id;
  // Award anything already earned before showing the badges
  const fresh = achievements.checkAchievements(guildId, userId);
  const s = getUserStats(guildId, userId);
  const gagMs = gag.getRemainingMs(guildId, userId);

  const have = achievements.getUnlocked(guildId, userId);
  const badges = achievements.ACHIEVEMENTS.filter(a => have[a.id]);
  const total = achievements.ACHIEVEMENTS.length;

  const embed = new EmbedBuilder()
    .setTitle(`Profile for ${member?.displayName || targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL())
    .setColor('#5865F2')
    .addFields(
      { name: '💰 NestCoins', value: `**${s.balance}**`, inline: true },
      {
        name: '🏆 Rank',
        value: s.rank ? `**#${s.rank}** / ${s.rankedCount}` : 'Unranked',
        inline: true,
      },
      {
        name: '🎂 Birthday',
        value: getBirthday(guildId, userId),
        inline: true,
      },
      {
        name: '🧩 Puzzles',
        value: `Solved **${s.puzzle.solved}** / ${s.puzzle.total}\n🔥 Streak **${s.puzzle.streak}** (best ${s.puzzle.best})`,
        inline: true,
      },
      {
        name: '🟩 NestWord',
        value:
          `Solved **${s.nestword.solved}** / ${s.nestword.played} played (${s.nestword.winRate}%)\n` +
          `Avg. tries: **${s.nestword.avgTries}**\n🔥 Streak **${s.nestword.streak}** (best ${s.nestword.best})`,
        inline: true,
      },
      {
        name: '⚔️ Tournaments & Duels',
        value:
          `Tournaments: joined **${s.events.joined}**, won **${s.events.won}**\n` +
          `Duels: **${s.duels.wins}**W / ${s.duels.losses}L`,
        inline: true,
      },
      {
        name: '🍹 Drinks',
        value: s.drinks.total
          ? `**${s.drinks.total}** drinks (${s.drinks.today} today)\n🔥 Streak **${s.drinks.streak}**` +
            (s.drinks.favorite ? `\n❤️ ${s.drinks.favorite.name}` : '')
          : 'No drinks yet',
        inline: true,
      },
      {
        name: '🟩 Wordle app',
        value: s.wordle.played
          ? `**${s.wordle.played}** played · ⌀ ${s.wordle.average}\n👑 ${s.wordle.crowns} · 🔥 ${s.wordle.streak}`
          : 'Not played yet',
        inline: true,
      },
      {
        name: '🍿 Movie nights',
        value:
          s.movies.attended || s.movies.watchedMovies
            ? `Watched **${s.movies.attended}** · 🎞️ ${s.movies.watchedMovies} movies\nMore: 🎬 Movies tab`
            : 'None yet',
        inline: true,
      },
      {
        name: '📸 Pictures this week',
        value: `**${s.pictures}**`,
        inline: true,
      },
      {
        name: `🏅 Achievements (${badges.length}/${total})`,
        value: badges.length
          ? badges.map(a => a.emoji).join(' ') + '\nMore: 🏅 Achievements tab'
          : 'None yet. See the 🏅 Achievements tab',
      },
    )
    .setTimestamp();

  const nick = nickname.getActive(guildId, userId);
  const nickStats = nickname.getStats(guildId, userId);
  if (nick) {
    embed.addFields({
      name: '🏷️ Paid nickname',
      value: `**${nick.name}** (by <@${nick.by}>)\nback to normal ${discordTime(nick.until, 'R')}`,
      inline: true,
    });
  }
  if (nickStats.given || nickStats.received) {
    embed.addFields({
      name: '🏷️ Nicknames',
      value: `Renamed others **${nickStats.given}**×\nGot renamed **${nickStats.received}**×`,
      inline: true,
    });
  }
  if (gagMs > 0) {
    embed.addFields({
      name: '🔇 Gagged',
      value: `~${Math.ceil(gagMs / 60000)} min left`,
      inline: true,
    });
  }
  if (fresh.length) {
    embed.setDescription(
      `✨ Just unlocked: ${fresh.map(a => `${a.emoji} ${a.name}`).join(', ')} ` +
        `(+${fresh.reduce((sum, a) => sum + a.reward, 0)} coins)`,
    );
  }

  return embed;
}

/** The 🎬 Movies tab. Settings are only shown to the person themselves. */
function moviesEmbed(guildId, targetUser, member, viewerId, locale) {
  const userId = targetUser.id;
  const m = getUserStats(guildId, userId).movies;
  const own = viewerId === userId;
  const list = watchlist.getList(guildId, userId);
  const visible = watchlist.items(guildId, userId, { publicOnly: !own });
  const want = visible.filter(i => i.status === 'want').length;
  const watching = visible.filter(i => i.status === 'watching').length;
  const favorites = Object.values(list.items)
    .filter(i => i.rating >= 4 && (own || watchlist.isPublic(i, list.settings)))
    .sort(
      (a, b) => b.rating - a.rating || (b.watchedAt || 0) - (a.watchedAt || 0),
    )
    .slice(0, 3);

  const embed = new EmbedBuilder()
    .setTitle(`🎬 Movie profile: ${member?.displayName || targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL())
    .setColor(0xe50914)
    .addFields(
      {
        name: '🎞️ Watched',
        value: `**${m.watchedMovies}** movies · **${m.watchedSeries}** series\n🎌 **${m.watchedAnime}** anime · ⏱️ ${Math.round(m.minutes / 60)} h of movies`,
        inline: true,
      },
      {
        name: '🍿 Movie nights',
        value: `Watched **${m.attended}** · hosted **${m.hosted}**\n📺 Most episodes in a night: **${m.maxEpisodes}**`,
        inline: true,
      },
      {
        name: '📝 Watchlist',
        value: `📌 **${want}** to watch · ▶️ **${watching}** watching${own ? '' : ' (public)'}\n⭐ **${m.ratings}** ratings`,
        inline: true,
      },
      { name: '🎭 Favorite genre', value: m.favGenre || '–', inline: true },
      { name: '💞 Groups', value: `${m.groups}`, inline: true },
      {
        name: '❤️ Favorites',
        value: favorites.length
          ? favorites
              .map(
                i =>
                  `${tmdb.kindEmoji(i.type, i.anime)} ${i.title} ${'⭐'.repeat(i.rating)}`,
              )
              .join('\n')
          : '–',
      },
    );
  if (m.lastWatched) {
    embed.addFields({
      name: '🕐 Last movie night',
      value: `${m.lastWatched.title} · <t:${Math.floor(m.lastWatched.startAt / 1000)}:d>`,
      inline: true,
    });
  }
  if (own) {
    const st = list.settings;
    embed.addFields({
      name: '⚙️ Your settings (only shown to you)',
      value:
        `Watchlist: ${st.visibility === 'public' ? '🌐 public' : '🔒 private'} · ` +
        `Country: ${st.region || `${tmdb.regionFromLocale(locale)} (guessed)`} · ` +
        `DM when planned: ${st.notify ? '🔔 on' : '🔕 off'}\n` +
        `Services: ${st.services?.length ? st.services.join(', ') : 'none'}\n` +
        'Change with `/watchlist settings`',
    });
  }
  return embed;
}

// ---------- More tabs (they replace /wordle stats, /drinks stats, /duel stats, /achievements) ----------

const nameOf = (user, member) => member?.displayName || user.username;

/** 🎮 Games: Puzzle, NestWord and the Wordle app in detail. */
function gamesEmbed(guildId, user, member) {
  const s = getUserStats(guildId, user.id);
  const w = s.wordle;
  const embed = ui.card({
    title: `🎮 Games: ${nameOf(user, member)}`,
    color: 0x9b59b6,
    thumbnail: user.displayAvatarURL(),
    fields: [
      {
        name: '🧩 Puzzle',
        value: `Solved **${s.puzzle.solved}** / ${s.puzzle.total}\n🔥 Streak **${s.puzzle.streak}** (best ${s.puzzle.best})`,
        inline: true,
      },
      {
        name: '🟩 NestWord',
        value:
          `Solved **${s.nestword.solved}** / ${s.nestword.played} (${s.nestword.winRate}%)\n` +
          `⌀ **${s.nestword.avgTries}** tries\n🔥 Streak **${s.nestword.streak}** (best ${s.nestword.best})`,
        inline: true,
      },
    ],
    footer: 'Rankings: /leaderboard · rewards: /help',
  });
  if (w.played) {
    const max = Math.max(...Object.values(w.dist), 1);
    const bars = ['1', '2', '3', '4', '5', '6', 'X']
      .map(
        k =>
          `\`${k}\` ${'🟩'.repeat(Math.round(((w.dist[k] || 0) / max) * 8)) || '▫️'} ${w.dist[k] || 0}`,
      )
      .join('\n');
    embed.addFields(
      {
        name: '🟩 Wordle app',
        value:
          `Played **${w.played}** (${w.winRate}% solved) · ⌀ **${w.average}**\n` +
          `👑 **${w.crowns}** crowns · 🔥 **${w.streak}** (best ${w.bestStreak}) · 💰 ${w.coins} earned`,
      },
      { name: 'Wordle results', value: bars },
    );
  } else {
    embed.addFields({
      name: '🟩 Wordle app',
      value: 'Not played yet. Play the Wordle app in the Wordle channel!',
    });
  }
  return embed;
}

/** 🍹 Drinks: what /drinks stats used to show. */
function drinksEmbed(guildId, user, member) {
  const s = drinks.getDrinksSummary(guildId, user.id);
  if (!s || !s.total) {
    return ui.card({
      title: `🍹 Drinks: ${nameOf(user, member)}`,
      color: 0x6f4e37,
      text: 'No drinks yet. Order one with `/drinks order`!',
    });
  }
  const perCategory = Object.entries(DRINK_CATEGORIES)
    .filter(([k]) => s.byCategory[k])
    .map(([k, c]) => `${c.emoji} ${s.byCategory[k]}`)
    .join(' · ');
  const rounds = db.read(d => d.coffee?.[guildId]?.[user.id]?.rounds) || 0;
  return ui.card({
    title: `🍹 Drinks: ${nameOf(user, member)}`,
    color: 0x6f4e37,
    thumbnail: user.displayAvatarURL(),
    fields: [
      {
        name: 'Today',
        value: `**${s.today}** / ${TOTAL_LIMIT} drinks\n⚡ ${s.todayCaffeine} / ${CAFFEINE_LIMIT} caffeine\n🍺 ${s.todayAlcohol} / ${ALCOHOL_LIMIT} alcohol`,
        inline: true,
      },
      {
        name: 'All time',
        value: `**${s.total}** drinks\n${perCategory || '–'}`,
        inline: true,
      },
      {
        name: '🔥 Streak',
        value: `**${s.streak}** days (best ${s.bestStreak})`,
        inline: true,
      },
      {
        name: '❤️ Favorite',
        value: s.favorite
          ? `${s.favorite.emoji} ${s.favorite.name} (${s.favorite.count}×)`
          : '–',
        inline: true,
      },
      {
        name: '🎁 Gifted / received',
        value: `${s.given} / ${s.received}${rounds ? `\n🍻 ${rounds} rounds bought` : ''}`,
        inline: true,
      },
      { name: '💸 Coins spent', value: `${s.spent}`, inline: true },
    ],
  });
}

/** ⚔️ Duels & fun: duels, tournaments, gags, nicknames, Halloween. */
function funEmbed(guildId, user, member) {
  const s = getUserStats(guildId, user.id);
  const d = s.duels;
  const played = d.wins + d.losses;
  const nickStats = nickname.getStats(guildId, user.id);
  const nick = nickname.getActive(guildId, user.id);
  const gagMs = gag.getRemainingMs(guildId, user.id);
  return ui.card({
    title: `⚔️ Duels & fun: ${nameOf(user, member)}`,
    color: 0xe74c3c,
    thumbnail: user.displayAvatarURL(),
    fields: [
      {
        name: '🤺 Duels',
        value: `**${d.wins}**W / ${d.losses}L / ${d.ties || 0} draws${played ? ` (${Math.round((d.wins / played) * 100)}%)` : ''}\n💰 Coins won: **${d.coinsWon || 0}**`,
        inline: true,
      },
      {
        name: '🏆 Tournaments',
        value: `Joined **${s.events.joined}** · won **${s.events.won}**`,
        inline: true,
      },
      {
        name: '🔇 Gags',
        value:
          `Gagged others **${s.gags.given}**× · got gagged **${s.gags.received}**×` +
          (gagMs > 0
            ? `\nGagged now: ~${Math.ceil(gagMs / 60000)} min left`
            : ''),
        inline: true,
      },
      {
        name: '🏷️ Nicknames',
        value:
          `Renamed others **${nickStats.given}**× · got renamed **${nickStats.received}**×` +
          (nick
            ? `\nNow: **${nick.name}** (by <@${nick.by}>) until ${discordTime(nick.until, 'R')}`
            : ''),
        inline: true,
      },
      {
        name: '🎃 Halloween',
        value: `🍬 ${s.halloween.treats} treats · 👻 ${s.halloween.tricks} tricks`,
        inline: true,
      },
    ],
  });
}

/** 🏅 Achievements: what /achievements used to show. */
function achievementsEmbed(guildId, user, member) {
  const fresh = achievements.checkAchievements(guildId, user.id);
  const have = achievements.getUnlocked(guildId, user.id);
  const embed = ui.card({
    title: `🏅 Achievements: ${nameOf(user, member)}`,
    color: 0xf1c40f,
    thumbnail: user.displayAvatarURL(),
  });
  for (const [cat, title] of Object.entries(achievements.CATEGORIES)) {
    const lines = achievements.ACHIEVEMENTS.filter(a => a.cat === cat).map(a =>
      have[a.id]
        ? `${a.emoji} **${a.name}** · ${a.desc}`
        : a.secret
          ? '❓ *Secret achievement*'
          : `🔒 ${a.name} · ${a.desc} (+${a.reward})`,
    );
    if (lines.length)
      embed.addFields({ name: title, value: lines.join('\n').slice(0, 1024) });
  }
  const count = achievements.ACHIEVEMENTS.filter(a => have[a.id]).length;
  embed.setDescription(
    `**${count} / ${achievements.ACHIEVEMENTS.length}** unlocked` +
      (fresh.length
        ? `\n✨ Just unlocked: ${fresh.map(a => `${a.emoji} ${a.name}`).join(', ')} (+${fresh.reduce((n, a) => n + a.reward, 0)} coins)`
        : ''),
  );
  return embed;
}

// ---------- Tabs ----------

const TABS = {
  overview: {
    label: 'Overview',
    emoji: '📊',
    build: (g, u, m) => overviewEmbed(g, u, m),
  },
  games: { label: 'Games', emoji: '🎮', build: gamesEmbed },
  drinks: { label: 'Drinks', emoji: '🍹', build: drinksEmbed },
  fun: { label: 'Duels & fun', emoji: '⚔️', build: funEmbed },
  movies: {
    label: 'Movies',
    emoji: '🎬',
    build: (g, u, m, viewer, locale) => moviesEmbed(g, u, m, viewer, locale),
  },
  achievements: {
    label: 'Achievements',
    emoji: '🏅',
    build: achievementsEmbed,
  },
};

function tabMenu(userId, active) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`profile:tab:${userId}`)
        .setPlaceholder('Switch tab…')
        .addOptions(
          Object.entries(TABS).map(([value, t]) => ({
            label: t.label,
            value,
            emoji: t.emoji,
            default: value === active,
          })),
        ),
    ),
  ];
}

/** Tab menu (and the old tab buttons). The own Movies tab (with settings) is shown privately. */
async function handleComponent(interaction) {
  const [, , userId, buttonTab] = interaction.customId.split(':');
  const tab = TABS[interaction.values?.[0]]
    ? interaction.values[0]
    : TABS[buttonTab]
      ? buttonTab
      : 'overview';
  const guildId = interaction.guildId;
  const user = await interaction.client.users.fetch(userId).catch(() => null);
  if (!user) return interaction.reply(ui.fail('User not found.'));
  const member = await interaction.guild.members
    .fetch(userId)
    .catch(() => null);
  const embed = TABS[tab].build(
    guildId,
    user,
    member,
    interaction.user.id,
    interaction.locale,
  );
  if (tab === 'movies' && interaction.user.id === userId) {
    return interaction.reply({ embeds: [embed], flags: 64 });
  }
  return interaction.update({
    embeds: [embed],
    components: tabMenu(userId, tab),
    allowedMentions: { parse: [] },
  });
}

module.exports = {
  handleComponent,
  TABS,
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription(
      'Profile and all stats: games, drinks, duels, movies, achievements',
    )
    .addUserOption(opt =>
      opt.setName('user').setDescription('Whose profile (default: you)'),
    )
    .addStringOption(opt =>
      opt
        .setName('tab')
        .setDescription('Open a tab directly (default: overview)')
        .addChoices(
          ...Object.entries(TABS).map(([value, t]) => ({
            name: `${t.emoji} ${t.label}`,
            value,
          })),
        ),
    ),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = interaction.options.getMember('user') || interaction.member;
    const tab = interaction.options.getString('tab') || 'overview';
    const own = targetUser.id === interaction.user.id;
    const embed = TABS[tab].build(
      interaction.guildId,
      targetUser,
      member,
      interaction.user.id,
      interaction.locale,
    );
    await interaction.reply({
      embeds: [embed],
      components: tabMenu(targetUser.id, tab),
      allowedMentions: { parse: [] },
      // The own Movies tab shows private settings
      ...(tab === 'movies' && own ? { flags: 64 } : {}),
    });
  },
};
