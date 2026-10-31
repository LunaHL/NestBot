// /wheel: the punishment wheel. Logic: src/services/wheel.js; effects (gag,
// nickname): src/services/effects.js. The spin button ("wheel:…") keeps
// working after restarts.
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const wheel = require('../services/wheel');
const nestcoins = require('../services/nestcoins');
const achievements = require('../services/achievements');
const { EFFECT_CHOICES, describe } = require('../services/effects');
const { isAdmin, denyNonAdmin } = require('../utils/permissions');
const ui = require('../utils/ui');

const spinning = new Set(); // message ids being spun right now (no double spins)
const wait = ms => new Promise(r => setTimeout(r, ms));

const entryLine = e =>
  `\`#${e.id}\` ${e.text}${e.effect ? ` · ${describe(e.effect).split(' ')[0]}` : ''}`;

function listCard(guildId, title = '🎡 The Punishment Wheel') {
  const entries = wheel.getEntries(guildId);
  return ui.card({
    title,
    color: ui.COLORS.wheel,
    text: entries.length
      ? entries.map(entryLine).join('\n').slice(0, 4000)
      : 'The wheel is empty. Admins add entries with `/wheel add`.',
    footer: entries.length
      ? `${entries.length} entries · 🔇 gag · 🏷️ nickname`
      : null,
  });
}

async function handleComponent(interaction) {
  const [, action, issuerId, targetId] = interaction.customId.split(':');
  if (action !== 'spin') return interaction.reply(ui.fail('Unknown button.'));
  if (interaction.user.id !== issuerId)
    return interaction.reply(
      ui.fail('Only the person who opened the wheel can spin it.'),
    );
  const msgId = interaction.message?.id;
  if (spinning.has(msgId)) return interaction.deferUpdate().catch(() => {});
  spinning.add(msgId);

  try {
    const guild = interaction.guild;
    const entries = wheel.getEntries(guild.id);
    if (!entries.length)
      return interaction.update({
        embeds: [listCard(guild.id)],
        components: [],
      });

    // Spinning for someone else costs coins
    const targeted = targetId !== issuerId;
    let paid = 0;
    if (targeted) {
      const payment = nestcoins.pay(
        guild.id,
        issuerId,
        wheel.PRICE_TARGETED_SPIN,
      );
      if (!payment.ok) {
        spinning.delete(msgId);
        return interaction.reply(
          ui.fail(
            `A spin for someone else costs ${wheel.PRICE_TARGETED_SPIN} coins, you have ${payment.balance}.`,
          ),
        );
      }
      paid = payment.paid;
    }

    // A little animation: three random entries flash by
    const frame = (n, text) =>
      ui.card({
        title: `🎡 Spinning${'.'.repeat(n)}`,
        color: ui.COLORS.wheel,
        text: `▶ **${text}** ◀`,
        footer: `For: ${targeted ? 'someone else' : 'yourself'}`,
      });
    const pick = () => entries[Math.floor(Math.random() * entries.length)].text;
    await interaction.update({ embeds: [frame(1, pick())], components: [] });
    for (const n of [2, 3]) {
      await wait(700);
      await interaction
        .editReply({ embeds: [frame(n, pick())] })
        .catch(() => {});
    }
    await wait(700);

    const r = await wheel.spin(guild, issuerId, targetId);
    const result = ui.card({
      title: '🎯 The wheel has spoken!',
      color: ui.COLORS.wheel,
      text: `<@${targetId}>: **${r.entry.text}**${r.effectText ? `\n\n${r.effectText}` : ''}`,
      footer: paid
        ? `Spun by someone else for ${paid} coins`
        : targeted
          ? 'Spun by someone else (free)'
          : 'Self spin (free)',
    });
    await interaction
      .editReply({
        embeds: [result],
        components: [],
        allowedMentions: { users: [targetId] },
      })
      .catch(() => {});
    await achievements.announce(interaction, [issuerId, targetId]);
  } finally {
    spinning.delete(msgId);
  }
}

module.exports = {
  handleComponent,

  data: new SlashCommandBuilder()
    .setName('wheel')
    .setDescription('The Punishment Wheel')
    .addSubcommand(s =>
      s
        .setName('spin')
        .setDescription('Spin the wheel (for someone else it costs coins)')
        .addUserOption(o =>
          o
            .setName('target')
            .setDescription('Who gets the punishment (default: you)'),
        ),
    )
    .addSubcommand(s => s.setName('list').setDescription('All entries'))
    .addSubcommand(s =>
      s
        .setName('add')
        .setDescription('Add an entry (admins)')
        .addStringOption(o =>
          o
            .setName('text')
            .setDescription('What happens, e.g. "Sing a song in voice"')
            .setRequired(true)
            .setMaxLength(200),
        )
        .addStringOption(o =>
          o
            .setName('effect')
            .setDescription('Something NestBot does automatically')
            .addChoices(...EFFECT_CHOICES),
        )
        .addIntegerOption(o =>
          o
            .setName('minutes')
            .setDescription('How long the effect lasts (default 5)')
            .setMinValue(1)
            .setMaxValue(1440),
        )
        .addStringOption(o =>
          o
            .setName('nickname')
            .setDescription('Nickname effect: the name the target gets')
            .setMaxLength(32),
        ),
    )
    .addSubcommand(s =>
      s
        .setName('remove')
        .setDescription('Remove an entry (admins)')
        .addStringOption(o =>
          o
            .setName('entry')
            .setDescription('Which entry (start typing)')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),

  async autocomplete(interaction) {
    const q = String(interaction.options.getFocused() || '').toLowerCase();
    return interaction.respond(
      wheel
        .getEntries(interaction.guildId)
        .filter(
          e => !q || e.text.toLowerCase().includes(q) || String(e.id) === q,
        )
        .slice(0, 25)
        .map(e => ({
          name: `#${e.id} ${e.text}`.slice(0, 100),
          value: String(e.id),
        })),
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const o = interaction.options;

    if (sub === 'list')
      return interaction.reply({ embeds: [listCard(guildId)] });

    if (sub === 'spin') {
      const target = o.getUser('target') || interaction.user;
      if (target.bot)
        return interaction.reply(ui.fail('Bots are immune to the wheel.'));
      const targeted = target.id !== interaction.user.id;
      const cost = !targeted
        ? 'Self spin: free.'
        : nestcoins.isFreeMode(guildId)
          ? 'Spin for someone else: **free** right now 🎉'
          : `Spin for someone else: ${ui.coins(wheel.PRICE_TARGETED_SPIN)}`;
      const card = listCard(guildId, `🎡 Spin for ${target.username}?`);
      card.addFields(
        { name: '🎯 Target', value: `<@${target.id}>`, inline: true },
        { name: '💳 Cost', value: cost, inline: true },
      );
      return interaction.reply({
        embeds: [card],
        components: wheel.getEntries(guildId).length
          ? [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`wheel:spin:${interaction.user.id}:${target.id}`)
                  .setLabel('Spin!')
                  .setEmoji('🎡')
                  .setStyle(ButtonStyle.Primary),
              ),
            ]
          : [],
        allowedMentions: { parse: [] },
      });
    }

    if (!isAdmin(interaction)) return denyNonAdmin(interaction);

    if (sub === 'add') {
      const type = o.getString('effect');
      const effect = type
        ? {
            type,
            durationSec: (o.getInteger('minutes') || 5) * 60,
            text: o.getString('nickname'),
          }
        : null;
      const e = wheel.addEntry(guildId, o.getString('text'), effect);
      return interaction.reply(
        ui.ok(
          `Added \`#${e.id}\` ${e.text}${effect ? `\n${describe(effect)}` : ''}`,
        ),
      );
    }
    if (sub === 'remove') {
      const removed = wheel.removeEntry(guildId, o.getString('entry'));
      return interaction.reply(
        removed
          ? ui.ok(`Removed \`#${removed.id}\` ${removed.text}`)
          : ui.fail('Entry not found.'),
      );
    }
  },
};
