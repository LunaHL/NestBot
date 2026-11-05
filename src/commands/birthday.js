// /birthday: save your birthday (typed however you like: "24.12.", "Dec 24"),
// see who's next, remove it. Admins (/admin birthday) can add outside names
// and announce now. The daily announcement, wishes, coins and role live in
// src/services/birthdays.js; settings in /settings birthdays.
const { SlashCommandBuilder } = require('discord.js');
const birthdays = require('../services/birthdays');
const { isAdmin, denyNonAdmin } = require('../utils/permissions');
const ui = require('../utils/ui');

const dateOption = o =>
  o
    .setName('date')
    .setDescription('e.g. 24.12. or Dec 24 (start typing)')
    .setRequired(true)
    .setAutocomplete(true);
const yearOption = o =>
  o
    .setName('year')
    .setDescription('Birth year, only to say “turns 25” (optional)')
    .setMinValue(1900)
    .setMaxValue(new Date().getFullYear());

function when(days) {
  if (days === 0) return '🎂 **today!**';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

async function handleComponent(interaction) {
  const [, action, entryId, day] = interaction.customId.split(':');
  if (action !== 'wish') return interaction.reply(ui.fail('Unknown button.'));
  const r = birthdays.wish(
    interaction.guildId,
    entryId,
    day,
    interaction.user.id,
  );
  if (r.error === 'self')
    return interaction.reply(ui.info('🥳 That’s your own birthday! Enjoy it.'));
  if (r.error === 'already')
    return interaction.reply(ui.info('🎉 You already sent your wishes.'));
  if (r.error)
    return interaction.reply(ui.info('🎂 This birthday card is gone.'));
  const { content, ...rest } = r.payload; // don't ping again
  return interaction.update(rest);
}

module.exports = {
  handleComponent,

  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('🎂 Your birthday, and who’s next')
    .addSubcommand(s =>
      s
        .setName('set')
        .setDescription('Save your birthday')
        .addStringOption(dateOption)
        .addIntegerOption(yearOption),
    )
    .addSubcommand(s => s.setName('list').setDescription('Upcoming birthdays'))
    .addSubcommand(s =>
      s.setName('remove').setDescription('Remove your birthday'),
    )
    .addSubcommand(s =>
      s
        .setName('add-for')
        .setDescription('Add a birthday for someone (admins)')
        .addStringOption(dateOption)
        .addUserOption(o => o.setName('user').setDescription('A member'))
        .addStringOption(o =>
          o
            .setName('name')
            .setDescription('Or a name (someone not on the server)')
            .setMaxLength(50),
        )
        .addIntegerOption(yearOption),
    )
    .addSubcommand(s =>
      s
        .setName('remove-for')
        .setDescription('Remove someone’s birthday (admins)')
        .addUserOption(o => o.setName('user').setDescription('A member'))
        .addStringOption(o =>
          o
            .setName('name')
            .setDescription('Or a name (start typing)')
            .setAutocomplete(true),
        ),
    )
    .addSubcommand(s =>
      s
        .setName('announce')
        .setDescription('Announce today’s birthdays now (admins)'),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const q = String(focused.value || '').trim();
    if (focused.name === 'name') {
      return interaction.respond(
        birthdays
          .all(interaction.guildId)
          .filter(
            e =>
              !e.userId &&
              (!q || e.name.toLowerCase().includes(q.toLowerCase())),
          )
          .slice(0, 25)
          .map(e => ({
            name: `${e.name} · ${birthdays.pretty(e.date)}`.slice(0, 100),
            value: e.name,
          })),
      );
    }
    const p = birthdays.parse(q);
    return interaction.respond(
      p
        ? [
            {
              name: `📅 ${birthdays.pretty(p.date)}${p.year ? ` ${p.year}` : ''}`,
              value: q.slice(0, 100),
            },
          ]
        : q
          ? [
              {
                name: '❓ Type it like 24.12. or Dec 24',
                value: q.slice(0, 100),
              },
            ]
          : [],
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const o = interaction.options;
    const me = interaction.user;

    if (sub === 'set') {
      const p = birthdays.parse(o.getString('date'));
      if (!p)
        return interaction.reply(
          ui.fail('I didn’t get that date. Try `24.12.` or `Dec 24`.'),
        );
      const year = o.getInteger('year') || p.year;
      birthdays.set(guildId, {
        userId: me.id,
        name: interaction.member?.displayName || me.username,
        date: p.date,
        year,
      });
      const days = birthdays.daysUntil(p.date);
      return interaction.reply(
        ui.ok(
          `Saved: **${birthdays.pretty(p.date)}**${year ? ` (${year})` : ''}. That’s ${when(days)}. 🎂 On the day you get coins and everyone can send you wishes.`,
        ),
      );
    }

    if (sub === 'list') {
      const list = birthdays.upcoming(guildId);
      if (!list.length)
        return interaction.reply(
          ui.info('🎂 No birthdays yet. Add yours with `/birthday set`!'),
        );
      const mine = list.find(e => e.userId === me.id);
      return interaction.reply({
        embeds: [
          ui.card({
            title: '🎂 Upcoming birthdays',
            color: birthdays.COLOR,
            text: list
              .slice(0, 20)
              .map(
                e =>
                  `${e.days === 0 ? '🎂' : '▫️'} **${birthdays.pretty(e.date)}** · ${e.userId ? `<@${e.userId}>` : e.name} · ${when(e.days)}`,
              )
              .join('\n'),
            footer: `${list.length} birthday${list.length === 1 ? '' : 's'}${mine ? '' : ' · add yours: /birthday set'}`,
          }),
        ],
        allowedMentions: { parse: [] },
      });
    }

    if (sub === 'remove') {
      const removed = birthdays.remove(guildId, { userId: me.id });
      return interaction.reply(
        removed
          ? ui.ok('Your birthday is removed.')
          : ui.info('You didn’t have a birthday saved.'),
      );
    }

    // ---------- Admins (shown under /admin birthday) ----------
    if (!isAdmin(interaction)) return denyNonAdmin(interaction);

    if (sub === 'add-for') {
      const p = birthdays.parse(o.getString('date'));
      if (!p)
        return interaction.reply(
          ui.fail('I didn’t get that date. Try `24.12.` or `Dec 24`.'),
        );
      const user = o.getUser('user');
      const name = o.getString('name');
      if (!user && !name)
        return interaction.reply(ui.fail('Pick a member or type a name.'));
      const member = user ? o.getMember('user') : null;
      birthdays.set(guildId, {
        userId: user?.id || null,
        name: user ? member?.displayName || user.username : name,
        date: p.date,
        year: o.getInteger('year') || p.year,
      });
      return interaction.reply(
        ui.ok(
          `Saved ${user ? `<@${user.id}>` : `**${name}**`}: **${birthdays.pretty(p.date)}**.`,
        ),
      );
    }

    if (sub === 'remove-for') {
      const user = o.getUser('user');
      const name = o.getString('name');
      const removed = birthdays.remove(
        guildId,
        user ? { userId: user.id } : { name },
      );
      return interaction.reply(
        removed
          ? ui.ok(`Removed **${removed.name}**.`)
          : ui.fail('No birthday found for that.'),
      );
    }

    if (sub === 'announce') {
      await interaction.deferReply({ flags: 64 });
      const n = await birthdays.announce(
        interaction.client,
        interaction.guild,
        { force: true },
      );
      return interaction.editReply(
        n
          ? `🎂 Announced ${n} birthday${n === 1 ? '' : 's'}.`
          : '🎂 No birthdays today.',
      );
    }
  },
};

// Admin-only subcommands live under /admin (see utils/adminSplit.js)
Object.assign(
  module.exports,
  require('../utils/adminSplit').splitAdmin(module.exports.data, [
    'add-for',
    'remove-for',
    'announce',
  ]),
);
