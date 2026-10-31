const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
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
          ? badges.map(a => a.emoji).join(' ') +
            '\nSee `/achievements` for details'
          : 'None yet. See `/achievements`',
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

function tabButtons(userId, active) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`profile:tab:${userId}:overview`)
        .setLabel('Overview')
        .setEmoji('📊')
        .setStyle(
          active === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary,
        ),
      new ButtonBuilder()
        .setCustomId(`profile:tab:${userId}:movies`)
        .setLabel('Movies')
        .setEmoji('🎬')
        .setStyle(
          active === 'movies' ? ButtonStyle.Primary : ButtonStyle.Secondary,
        ),
    ),
  ];
}

/** Tab buttons. The movies tab with personal settings is only shown privately. */
async function handleComponent(interaction) {
  const [, , userId, tab] = interaction.customId.split(':');
  const guildId = interaction.guildId;
  const user = await interaction.client.users.fetch(userId).catch(() => null);
  if (!user)
    return interaction.reply({ content: 'User not found.', flags: 64 });
  const member = await interaction.guild.members
    .fetch(userId)
    .catch(() => null);
  if (tab === 'movies') {
    // Own profile → private view with settings; someone else's → public stats
    const own = interaction.user.id === userId;
    const embed = moviesEmbed(
      guildId,
      user,
      member,
      interaction.user.id,
      interaction.locale,
    );
    if (own) return interaction.reply({ embeds: [embed], flags: 64 });
    return interaction.update({
      embeds: [embed],
      components: tabButtons(userId, 'movies'),
      allowedMentions: { parse: [] },
    });
  }
  return interaction.update({
    embeds: [overviewEmbed(guildId, user, member)],
    components: tabButtons(userId, 'overview'),
    allowedMentions: { parse: [] },
  });
}

module.exports = {
  handleComponent,
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription("Shows a user's profile and stats.")
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('The user to view the profile of (defaults to you)'),
    ),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = interaction.options.getMember('user') || interaction.member;
    const embed = overviewEmbed(interaction.guildId, targetUser, member);
    await interaction.reply({
      embeds: [embed],
      components: tabButtons(targetUser.id, 'overview'),
      allowedMentions: { parse: [] },
    });
  },
};
