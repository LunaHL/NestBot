// /help: explains all features. The texts are in src/config/help.js; the
// subcommands and options are read live from the commands themselves.
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const { CATEGORIES, COMMANDS } = require('../config/help');

const COLOR = 0x5865f2;
const MENU_TIMEOUT_MS = 10 * 60 * 1000;

// ---------- Reading the live command definitions ----------

/** All loaded commands as JSON, by name. */
function allCommands(client) {
  const map = new Map();
  for (const cmd of client.commands?.values() || []) {
    const json = cmd.data.toJSON();
    map.set(json.name, json);
  }
  return map;
}

function subcommandsOf(json) {
  return (json.options || []).filter(o => o.type === 1);
}

/** Is this whole command (or this subcommand) admin-only? */
function isAdminOnly(json, sub) {
  if (json.default_member_permissions) return true;
  const admin = COMMANDS[json.name]?.admin || [];
  return admin.includes('*') || (sub && admin.includes(sub));
}

/** "/drinks gift <user> <drink> [note]" */
function usage(name, sub, options = []) {
  const args = options
    .filter(o => o.type !== 1 && o.type !== 2)
    .map(o => (o.required ? `<${o.name}>` : `[${o.name}]`));
  return ['/' + name, sub, ...args].filter(Boolean).join(' ');
}

/** Categories from the help config, plus "Other" for unlisted commands. */
function categoriesWithOther(commands) {
  const listed = new Set(CATEGORIES.flatMap(c => c.commands));
  const unlisted = [...commands.keys()].filter(n => !listed.has(n));
  const cats = CATEGORIES.map(c => ({
    ...c,
    commands: c.commands.filter(n => commands.has(n)),
  }));
  if (unlisted.length) {
    cats.push({
      id: 'other',
      emoji: '📦',
      name: 'Other',
      intro: 'Commands without a help text yet.',
      commands: unlisted,
    });
  }
  return cats;
}

// ---------- Embeds ----------

function overviewEmbed(cats) {
  const embed = new EmbedBuilder()
    .setTitle('🪺 NestBot Help')
    .setDescription(
      'Everything NestBot can do. Pick a category below, or look up one command with `/help command:`.\n' +
        '🔒 = admins only',
    )
    .setColor(COLOR);
  for (const c of cats) {
    embed.addFields({
      name: `${c.emoji} ${c.name}`,
      value: c.commands.map(n => `\`/${n}\``).join(' ') || '–',
    });
  }
  return embed;
}

function categoryEmbed(cat, commands, guildId) {
  const embed = new EmbedBuilder()
    .setTitle(`${cat.emoji} ${cat.name}`)
    .setDescription(cat.intro || null)
    .setColor(COLOR);

  for (const name of cat.commands) {
    const json = commands.get(name);
    const explain = COMMANDS[name]?.explain || json.description;
    const subs = subcommandsOf(json);
    const subList = subs.length
      ? '\n' +
        subs
          .map(s => `\`${s.name}\`${isAdminOnly(json, s.name) ? ' 🔒' : ''}`)
          .join(' · ')
      : '';
    embed.addFields({
      name: `/${name}${isAdminOnly(json) ? ' 🔒' : ''}`,
      value: clip(`${explain}${subList}`, 1024),
    });
  }
  for (const f of cat.features || []) {
    const text = typeof f.text === 'function' ? f.text(guildId) : f.text;
    embed.addFields({ name: f.name, value: clip(text, 1024) });
  }
  embed.setFooter({ text: 'Details for one command: /help command:<name>' });
  return embed;
}

function commandEmbed(json) {
  const info = COMMANDS[json.name] || {};
  const cat = CATEGORIES.find(c => c.commands.includes(json.name));
  const embed = new EmbedBuilder()
    .setTitle(`/${json.name}${isAdminOnly(json) ? ' 🔒' : ''}`)
    .setDescription(info.explain || json.description)
    .setColor(COLOR);
  if (cat) embed.setAuthor({ name: `${cat.emoji} ${cat.name}` });

  const subs = subcommandsOf(json);
  const entries = subs.length
    ? subs.map(s => ({
        sub: s.name,
        desc: s.description,
        options: s.options || [],
      }))
    : [{ sub: null, desc: json.description, options: json.options || [] }];

  for (const e of entries.slice(0, 24)) {
    const lock = e.sub && isAdminOnly(json, e.sub) ? ' 🔒' : '';
    const opts = e.options
      .map(
        o =>
          `• \`${o.name}\`${o.required ? '' : ' (optional)'}: ${o.description}`,
      )
      .join('\n');
    embed.addFields({
      name: `\`${usage(json.name, e.sub, e.options)}\`${lock}`,
      value: clip(`${e.desc}${opts ? '\n' + opts : ''}`, 1024),
    });
  }
  if (info.tips)
    embed.addFields({ name: '💡 Tip', value: clip(info.tips, 1024) });
  return embed;
}

const clip = (text, max) =>
  text.length > max ? text.slice(0, max - 1) + '…' : text;

function categoryMenu(cats, selected) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('help:category')
    .setPlaceholder('Choose a category…')
    .addOptions(
      {
        label: 'Overview',
        value: 'overview',
        emoji: '🪺',
        default: selected === 'overview',
      },
      ...cats.map(c => ({
        label: c.name,
        value: c.id,
        emoji: c.emoji,
        description: clip(c.intro || '', 100) || undefined,
        default: selected === c.id,
      })),
    );
  return [new ActionRowBuilder().addComponents(menu)];
}

// ---------- Search (autocomplete for the command option) ----------

function searchCommands(client, query) {
  const q = query.toLowerCase().replace(/^\//, '').trim();
  const results = [];
  for (const [name, json] of allCommands(client)) {
    const text = [
      name,
      json.description,
      COMMANDS[name]?.explain || '',
      ...subcommandsOf(json).map(s => `${s.name} ${s.description}`),
    ]
      .join(' ')
      .toLowerCase();
    if (!q) results.push({ name, score: 0 });
    else if (name.startsWith(q)) results.push({ name, score: 3 });
    else if (name.includes(q)) results.push({ name, score: 2 });
    else if (text.includes(q)) results.push({ name, score: 1 });
  }
  return results
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 25)
    .map(r => ({
      name: clip(
        `/${r.name} — ${allCommands(client).get(r.name).description}`,
        100,
      ),
      value: r.name,
    }));
}

// ---------- Command ----------

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('All NestBot features explained')
    .addStringOption(opt =>
      opt
        .setName('category')
        .setDescription('Show one category')
        .addChoices(
          ...CATEGORIES.map(c => ({
            name: `${c.emoji} ${c.name}`,
            value: c.id,
          })),
        ),
    )
    .addStringOption(opt =>
      opt
        .setName('command')
        .setDescription('Explain one command (start typing to search)')
        .setAutocomplete(true),
    ),

  // Suggestions while typing in the `command` option
  async autocomplete(interaction) {
    const query = interaction.options.getFocused();
    await interaction.respond(searchCommands(interaction.client, query));
  },

  async execute(interaction) {
    const commands = allCommands(interaction.client);
    const cats = categoriesWithOther(commands);
    const commandName = interaction.options.getString('command');
    const categoryId = interaction.options.getString('category');

    // One command in detail
    if (commandName) {
      const name = commandName.replace(/^\//, '').split(' ')[0].toLowerCase();
      const json = commands.get(name);
      if (!json) {
        const suggestions = searchCommands(interaction.client, name).slice(
          0,
          5,
        );
        return interaction.reply({
          content:
            `❓ There's no \`/${name}\`.` +
            (suggestions.length
              ? ` Did you mean: ${suggestions.map(s => `\`/${s.value}\``).join(', ')}?`
              : ' Try `/help` for the overview.'),
          flags: 64,
        });
      }
      return interaction.reply({ embeds: [commandEmbed(json)], flags: 64 });
    }

    // Overview or one category, with a dropdown to switch
    const startCat = cats.find(c => c.id === categoryId);
    const response = await interaction.reply({
      embeds: [
        startCat
          ? categoryEmbed(startCat, commands, interaction.guildId)
          : overviewEmbed(cats),
      ],
      components: categoryMenu(cats, startCat ? startCat.id : 'overview'),
      flags: 64,
    });

    const collector = response.createMessageComponentCollector({
      time: MENU_TIMEOUT_MS,
    });
    collector.on('collect', async i => {
      const picked = i.values?.[0];
      const cat = cats.find(c => c.id === picked);
      await i
        .update({
          embeds: [
            cat
              ? categoryEmbed(cat, commands, interaction.guildId)
              : overviewEmbed(cats),
          ],
          components: categoryMenu(cats, cat ? cat.id : 'overview'),
        })
        .catch(() => {});
    });
    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
