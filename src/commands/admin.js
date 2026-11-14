// /admin: every admin-only subcommand in one place. Discord only shows this
// command to admins (Administrator permission; can be changed in Server
// Settings → Integrations → NestBot). The subcommands still live in their
// own command files (moved here with utils/adminSplit.js); /admin just passes
// the interaction on to them.
const { PermissionFlagsBits } = require('discord.js');
const { isAdmin, denyNonAdmin } = require('../utils/permissions');

// /admin <group> → the command that handles it
const GROUPS = {
  shop: { command: 'shop', description: 'Shop items: add, edit, remove' },
  wheel: {
    command: 'wheel',
    description: 'Punishment wheel entries: add, remove',
  },
  puzzle: {
    command: 'puzzle',
    description: 'Puzzle of the Day: set, queue, remove',
  },
  nestword: {
    command: 'nestword',
    description: 'NestWord: set a word, manage the word pools',
  },
  coins: { command: 'balance', description: 'Give or take NestCoins' },
  birthday: {
    command: 'birthday',
    description: 'Birthdays: add or remove for others, announce now',
  },
  event: {
    command: 'event',
    description: 'Tournaments: create, results, finish',
  },
};

const target = name => require(`./${GROUPS[name].command}`);
const features = () => require('../services/features');

module.exports = {
  GROUPS,
  data: {
    name: 'admin',
    toJSON: () => ({
      name: 'admin',
      description:
        'Admin tools: shop, wheel, puzzle, NestWord, coins, birthdays, tournaments',
      default_member_permissions: String(PermissionFlagsBits.Administrator),
      dm_permission: false,
      // Tools of switched-off commands (e.g. NestWord) aren't shown either,
      // nor switched-off subcommands (`subFeatures` in the command file)
      options: Object.entries(GROUPS)
        .filter(([name]) => features().commandOn(target(name)))
        .flatMap(([name, g]) => {
          const all = target(name).adminSubcommands || [];
          const subs = all.filter(o => features().subOn(target(name), o.name));
          if (all.length && !subs.length) return []; // every tool switched off
          return [
            {
              type: 2, // subcommand group
              name,
              description: g.description,
              options: subs,
            },
          ];
        }),
    }),
  },

  async autocomplete(interaction) {
    const group = interaction.options.getSubcommandGroup?.(false);
    return GROUPS[group]
      ? target(group).autocomplete?.(interaction)
      : interaction.respond([]);
  },

  async execute(interaction) {
    if (!isAdmin(interaction)) return denyNonAdmin(interaction);
    const group = interaction.options.getSubcommandGroup(false);
    if (!GROUPS[group])
      return interaction.reply({
        content: '❓ Unknown admin tool.',
        flags: 64,
      });
    // Switched off (e.g. an old command list in Discord): same answer as
    // events/interactionCreate.js gives for normal commands
    const tool = target(group);
    if (!features().interactionOn(tool, interaction, { group: false }))
      return interaction.reply({
        content: '🔒 That’s switched off right now.',
        flags: 64,
      });
    return tool.execute(interaction);
  },
};
