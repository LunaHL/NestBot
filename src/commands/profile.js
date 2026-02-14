const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const nestcoins = require('../services/nestcoins');
const db = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription("Shows a user's profile with balance, rank, and birthday.")
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('The user to view the profile of (defaults to you)'),
    ),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const guildId = interaction.guildId;
    const userId = targetUser.id;

    // 1. Get Balance
    const balance = nestcoins.getBalance(guildId, userId);

    // 2. Get Rank
    const allBalances = nestcoins.getAllBalances(guildId);
    const sortedBalances = allBalances.filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);
    const rankIndex = sortedBalances.findIndex(entry => entry[0] === userId);
    const rank = rankIndex !== -1 ? rankIndex + 1 : 'Unranked';
    const totalRanked = sortedBalances.length;

    // 3. Get Birthday
    let birthday = 'Not set';
    const guildBirthdays = db.database.birthdays?.[guildId] || {};
    for (const entry of Object.values(guildBirthdays)) {
      if (entry.userId === userId) {
        const [month, day] = entry.date.split('-');
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        birthday = `${monthNames[parseInt(month, 10) - 1]} ${day}`;
        break;
      }
    }

    // 4. Build Embed
    const embed = new EmbedBuilder()
      .setTitle(`Profile for ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor('#5865F2')
      .addFields(
        { name: '💰 NestCoins', value: `**${balance}**`, inline: true },
        { name: '🏆 Rank', value: rank === 'Unranked' ? 'Unranked' : `**#${rank}** / ${totalRanked}`, inline: true },
        { name: '🎂 Birthday', value: birthday, inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};