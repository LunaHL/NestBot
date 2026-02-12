const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ai = require('../services/ai');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show bot status and AI health'),
  async execute(interaction) {
    const aiStatus = ai.getStatus();
    const uptime = process.uptime();
    
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor(uptime / 3600) % 24;
    const minutes = Math.floor(uptime / 60) % 60;

    const embed = new EmbedBuilder()
      .setTitle('🤖 NestBot Status')
      .setColor(aiStatus.isRateLimited ? 0xFF0000 : 0x00FF00)
      .addFields(
        { name: '🧠 AI Health', value: aiStatus.isRateLimited ? '🔴 Rate Limited' : '🟢 Operational', inline: true },
        { name: '📚 Models', value: aiStatus.models.join('\n'), inline: true },
        { name: '📉 Requests', value: `${aiStatus.totalRequests} total / ${aiStatus.failedRequests} failed`, inline: true },
        { name: '⏱️ Uptime', value: `${days}d ${hours}h ${minutes}m`, inline: true },
        { name: '📡 Ping', value: `${interaction.client.ws.ping}ms`, inline: true }
      )
      .setTimestamp();

    if (aiStatus.lastRateLimit > 0) {
       const ago = Math.floor((Date.now() - aiStatus.lastRateLimit) / 1000);
       embed.addFields({ name: '⚠️ Last 429', value: `${ago}s ago`, inline: true });
    }

    await interaction.reply({ embeds: [embed] });
  }
};