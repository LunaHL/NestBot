import { Events, EmbedBuilder } from 'discord.js';

export function setupWelcome(client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      const channel =
        member.guild.systemChannel ||
        member.guild.channels.cache.find(c => c.name?.toLowerCase?.().includes('welcome'));

      const embed = new EmbedBuilder()
        .setTitle('Welcome to the Nest 🪺')
        .setDescription([
          `Hi ${member}, we’re happy you’re here!`,
          '',
          `• Grab a role if a role panel exists.`,
          `• Read the rules & channel descriptions.`,
          `• Be kind, keep it playful, and stay within theme.`
        ].join('\n'))
        .setColor(0xF1C40F);

      if (channel?.isTextBased()) await channel.send({ embeds: [embed] });
    } catch {}
  });
}
