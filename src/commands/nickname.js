// /nickname: pay coins to give someone a nickname for a while. More coins,
// more time. The renamed person can buy themselves out for the same price.
// Logic: src/services/nickname.js. Admins switch it off with
// /settings nicknames.
const { SlashCommandBuilder } = require('discord.js');
const nickname = require('../services/nickname');
const nestcoins = require('../services/nestcoins');
const achievements = require('../services/achievements');
const { isAdmin } = require('../utils/permissions');
const { discordTime } = require('../utils/time');
const ui = require('../utils/ui');
const db = require('../utils/db');

const DURATIONS = Object.entries(nickname.PRICES).map(([min, price]) => ({
  min: Number(min),
  price,
}));

const ERRORS = {
  disabled: 'Paid nicknames are switched off on this server.',
  empty: 'That nickname is empty.',
  'not-found': 'That person isn’t on this server.',
  cannot: 'I can’t rename them (server owner, or their role is above mine).',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nickname')
    .setDescription('Give someone a nickname for a while 🏷️ (costs coins)')
    .addSubcommand(s =>
      s
        .setName('set')
        .setDescription('Rename someone for a while. More coins = longer')
        .addUserOption(o =>
          o
            .setName('user')
            .setDescription('Who gets the nickname')
            .setRequired(true),
        )
        .addStringOption(o =>
          o
            .setName('name')
            .setDescription('The new nickname')
            .setRequired(true)
            .setMaxLength(nickname.MAX_LENGTH),
        )
        .addStringOption(o =>
          o
            .setName('time')
            .setDescription('How long (and what it costs)')
            .setRequired(true)
            .addChoices(
              ...DURATIONS.map(d => ({
                name: `${ui.duration(d.min * 60)} · ${d.price} coins`,
                value: String(d.min),
              })),
            ),
        ),
    )
    .addSubcommand(s =>
      s
        .setName('status')
        .setDescription('Who renamed whom, and until when')
        .addUserOption(o =>
          o.setName('user').setDescription('Only this person'),
        ),
    )
    .addSubcommand(s =>
      s
        .setName('buyout')
        .setDescription(
          'Pay to get your own name back early (same price it cost)',
        ),
    )
    .addSubcommand(s =>
      s
        .setName('reset')
        .setDescription(
          'End a paid nickname now (admins, or whoever paid for it)',
        )
        .addUserOption(o =>
          o.setName('user').setDescription('Whose nickname').setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const guildId = interaction.guildId;
    const me = interaction.user.id;

    if (sub === 'set') {
      if (!nickname.enabled(guildId))
        return interaction.reply(ui.fail(ERRORS.disabled));
      const target = interaction.options.getUser('user');
      if (target.bot)
        return interaction.reply(ui.fail('Bots keep their names.'));
      const active = nickname.getActive(guildId, target.id);
      if (active) {
        return interaction.reply(
          ui.fail(
            `<@${target.id}> is already called **${active.name}** until ${discordTime(active.until, 't')} (${discordTime(active.until, 'R')}).`,
          ),
        );
      }
      const minutes = Number(interaction.options.getString('time'));
      const price = nickname.PRICES[minutes];
      const name = nickname.clean(interaction.options.getString('name'));
      if (!name) return interaction.reply(ui.fail(ERRORS.empty));

      const payment = nestcoins.pay(guildId, me, price);
      if (!payment.ok)
        return interaction.reply(
          ui.fail(`That costs ${price} coins, you have ${payment.balance}.`),
        );
      const r = await nickname.apply(
        guild,
        target.id,
        name,
        minutes,
        me,
        payment.paid,
      );
      if (r.error) {
        if (payment.paid) nestcoins.addCoins(guildId, me, payment.paid); // refund
        return interaction.reply(ui.fail(ERRORS[r.error]));
      }
      await interaction.reply({
        embeds: [
          ui.card({
            title: '🏷️ New name!',
            text: `<@${me}> renamed <@${target.id}> to **${r.name}** until ${discordTime(r.until, 't')} (${discordTime(r.until, 'R')}).`,
            color: ui.COLORS.nickname,
            footer: `${payment.paid ? `Paid ${payment.paid} coins` : 'Free'} · Get out early: /nickname buyout`,
          }),
        ],
        allowedMentions: { users: [target.id] },
      });
      return achievements.announce(interaction, [me, target.id]);
    }

    if (sub === 'status') {
      const only = interaction.options.getUser('user');
      const all = only
        ? [[only.id, nickname.getActive(guildId, only.id)]].filter(([, r]) => r)
        : Object.keys(db.read(d => d.nicknames?.[guildId]) || {})
            .map(id => [id, nickname.getActive(guildId, id)])
            .filter(([, r]) => r);
      const text = all.length
        ? all
            .map(
              ([id, r]) =>
                `🏷️ <@${id}> is **${r.name}** (by <@${r.by}>) until ${discordTime(r.until, 'R')}`,
            )
            .join('\n')
        : only
          ? `<@${only.id}> has no paid nickname right now.`
          : 'Nobody has a paid nickname right now.';
      return interaction.reply({
        embeds: [
          ui.card({
            title: '🏷️ Paid nicknames',
            text,
            color: ui.COLORS.nickname,
            footer: nickname.enabled(guildId)
              ? 'Rename someone: /nickname set'
              : 'Switched off on this server',
          }),
        ],
        allowedMentions: { parse: [] },
      });
    }

    if (sub === 'buyout') {
      const active = nickname.getActive(guildId, me);
      if (!active)
        return interaction.reply(
          ui.info('You don’t have a paid nickname right now. 🎉'),
        );
      const payment = nestcoins.pay(guildId, me, active.price || 0);
      if (!payment.ok)
        return interaction.reply(
          ui.fail(
            `Buying out costs ${active.price} coins, you have ${payment.balance}.`,
          ),
        );
      await nickname.restore(guild, me);
      return interaction.reply({
        embeds: [
          ui.card({
            title: '🏷️ Bought out!',
            text: `<@${me}> paid to get rid of **${active.name}**.`,
            color: ui.COLORS.nickname,
            footer: payment.paid ? `Paid ${payment.paid} coins` : 'Free',
          }),
        ],
        allowedMentions: { parse: [] },
      });
    }

    if (sub === 'reset') {
      const target = interaction.options.getUser('user');
      const active = nickname.getActive(guildId, target.id);
      if (!active)
        return interaction.reply(
          ui.fail(`<@${target.id}> has no paid nickname.`),
        );
      if (!isAdmin(interaction) && active.by !== me) {
        return interaction.reply(
          ui.fail(
            'Only admins or whoever paid for it can end it early. The renamed person can use `/nickname buyout`.',
          ),
        );
      }
      await nickname.restore(guild, target.id);
      return interaction.reply(
        ui.ok(`<@${target.id}> has their old name back.`),
      );
    }
  },
};
