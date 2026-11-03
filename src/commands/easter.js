// /easter: your egg basket, egg painting and giving eggs away. Only shown
// in Discord from Good Friday to Easter Monday (or in test mode). The egg hunt
// itself happens in the chat (eggs hide under messages), the 🐰 Bunny Girl
// outfit is in /shop. Logic: src/services/easter.js. Buttons ("easter:…").
const { SlashCommandBuilder } = require('discord.js');
const easter = require('../services/easter');
const seasons = require('../services/seasons');
const achievements = require('../services/achievements');
const ui = require('../utils/ui');

async function handleComponent(interaction) {
  const [, action, id] = interaction.customId.split(':');
  if (action !== 'egg') return interaction.reply(ui.fail('Unknown button.'));
  const r = await easter.grabEgg(interaction.guild, interaction.member, id);
  if (r.error === 'taken')
    return interaction.reply(ui.info('🐣 Too slow, someone grabbed it first!'));
  if (r.error) return interaction.reply(ui.info('🐣 This egg rolled away.'));
  await interaction.update({
    content: r.text,
    components: [],
    allowedMentions: { parse: [] },
  });
  return achievements.announce(interaction, [interaction.user.id]);
}

module.exports = {
  handleComponent,
  // Only shown in Discord at Easter (see deploy-commands.js)
  season: () => seasons.active('easter'),

  data: new SlashCommandBuilder()
    .setName('easter')
    .setDescription('🐣 Easter: your egg basket, egg painting')
    .addSubcommand(s =>
      s
        .setName('basket')
        .setDescription('🧺 Eggs you found and painted')
        .addUserOption(o =>
          o.setName('user').setDescription('Whose basket (default: yours)'),
        ),
    )
    .addSubcommand(s =>
      s
        .setName('paint')
        .setDescription(
          '🎨 Paint today’s egg (once a day), collect all patterns',
        ),
    )
    .addSubcommand(s =>
      s
        .setName('gift')
        .setDescription('🎁 Give one of your painted eggs to someone')
        .addUserOption(o =>
          o.setName('user').setDescription('Who gets it').setRequired(true),
        )
        .addStringOption(o =>
          o
            .setName('egg')
            .setDescription('Which egg (start typing)')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),

  async autocomplete(interaction) {
    const q = String(interaction.options.getFocused() || '').toLowerCase();
    const mine = seasons.statsOf(
      interaction.guildId,
      interaction.user.id,
    ).patterns;
    return interaction.respond(
      mine
        .filter(e => !q || e.toLowerCase().includes(q))
        .slice(0, 25)
        .map(e => ({ name: e.slice(0, 100), value: e.slice(0, 100) })),
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const me = interaction.user.id;
    const o = interaction.options;
    if (!seasons.active('easter'))
      return interaction.reply(ui.info('🐣 Easter isn’t here yet!'));

    if (sub === 'basket') {
      const user = o.getUser('user') || interaction.user;
      const b = easter.basket(guildId, user.id);
      const painted = seasons.statsOf(guildId, user.id).patterns;
      const rank = easter
        .hunters(guildId, 100)
        .findIndex(([id]) => id === user.id);
      return interaction.reply({
        embeds: [
          ui.card({
            title: `🧺 ${user.id === me ? 'Your' : `${user.username}’s`} Easter basket`,
            color: easter.COLOR,
            fields: [
              {
                name: '🥚 Found in the hunt',
                value:
                  `**${easter.eggCount(b)}** eggs${rank >= 0 ? ` (#${rank + 1} this Easter)` : ''}\n` +
                  `🥚 ${b.normal} · 🌈 ${b.painted} · 🥇 ${b.golden} · 💣 ${b.prank} · 🐰 ${b.bunny}\n💰 ${b.coins} coins`,
              },
              {
                name: `🎨 Painted eggs (${painted.length}/${easter.ARTIST_GOAL} for 🎨 Egg Artist)`,
                value: painted.length
                  ? painted.slice(-15).join('\n')
                  : 'None yet: `/easter paint`',
              },
            ],
            footer:
              'Eggs hide under chat messages. Be quick: they roll away after 2 minutes!',
          }),
        ],
        allowedMentions: { parse: [] },
      });
    }

    if (sub === 'paint') {
      const r = easter.paintEgg(guildId, me);
      if (r.error)
        return interaction.reply(
          ui.info('🎨 Your paint is still drying. Paint another egg tomorrow!'),
        );
      await interaction.reply({
        embeds: [
          ui.card({
            title: '🎨 Fresh paint!',
            color: easter.COLOR,
            text: `<@${me}> painted a **${r.egg}**!${r.isNew ? ' ✨ New in your collection!' : ' (You already had one like it.)'}`,
            footer: `${r.total} different eggs · ${easter.ARTIST_GOAL} → 🎨 Egg Artist`,
          }),
        ],
        allowedMentions: { parse: [] },
      });
      return achievements.announce(interaction, [me]);
    }

    if (sub === 'gift') {
      const target = o.getUser('user');
      if (target.bot || target.id === me)
        return interaction.reply(ui.fail('Pick someone else.'));
      const egg = o.getString('egg');
      if (!easter.giveEgg(guildId, me, target.id, egg))
        return interaction.reply(
          ui.fail(
            'You don’t have that egg. Pick one from the list while typing.',
          ),
        );
      await interaction.reply({
        content: `🎁 <@${me}> gave <@${target.id}> a **${egg}**! 🐣`,
        allowedMentions: { users: [target.id] },
      });
      return achievements.announce(interaction, [target.id]);
    }
  },
};
