import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

const currencyChoices = [
  { name: 'NestCoins', value: 'coins' },
  { name: 'PawPoints', value: 'paws' },
  { name: 'PainTokens', value: 'pain' },
];

const commands = [
  // Wheel + endrule
  new SlashCommandBuilder()
    .setName('wheel')
    .setDescription('Spin the punishment wheel.')
    .addUserOption(o => o.setName('target').setDescription('Who gets the punishment? (optional)'))
    .addStringOption(o => o.setName('custom').setDescription('Comma-separated custom entries to override the default wheel')),
  new SlashCommandBuilder()
    .setName('endrule')
    .setDescription('End an active punishment early.')
    .addUserOption(o => o.setName('target').setDescription('Whose punishment to end?').setRequired(true)),

  // Economy rooms
  new SlashCommandBuilder()
    .setName('setrooms')
    .setDescription('Set/update economy rooms (channels).')
    .addChannelOption(o => o.setName('bank').setDescription('Bank channel'))
    .addChannelOption(o => o.setName('obedience').setDescription('Obedience Hall channel'))
    .addChannelOption(o => o.setName('kennel').setDescription('Kennel channel'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Economy basics
  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Show balance for you or someone else.')
    .addUserOption(o => o.setName('user').setDescription('User to check (optional)'))
    .addStringOption(o => o.setName('currency').setDescription('Optional: one currency only').addChoices(...currencyChoices)),
  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily NestCoins (Bank only).'),
  new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfer currency to someone else (Bank only).')
    .addUserOption(o => o.setName('to').setDescription('Receiver').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount (>=1)').setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName('currency').setDescription('Which currency').setRequired(true).addChoices(...currencyChoices)),

  // Staff economy
  new SlashCommandBuilder()
    .setName('grant')
    .setDescription('Grant currency (room-aware; staff only).')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount (>=1)').setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName('currency').setDescription('Currency').setRequired(true).addChoices(...currencyChoices))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('deduct')
    .setDescription('Deduct currency (room-aware; staff only).')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount (>=1)').setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName('currency').setDescription('Currency').setRequired(true).addChoices(...currencyChoices))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('burnpain')
    .setDescription('Burn PainTokens in the Kennel to reduce your debt.')
    .addIntegerOption(o => o.setName('amount').setDescription('Amount (>=1)').setRequired(true).setMinValue(1)),

  // Sass toggle
  new SlashCommandBuilder()
    .setName('sass')
    .setDescription('Toggle/tune Sassy Bot Mode (server-wide).')
    .addStringOption(o => o.setName('mode').setDescription('On/Off')
      .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' }))
    .addIntegerOption(o => o.setName('chance').setDescription('Sass chance in %, 0–100 (default 25)').setMinValue(0).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Wordle
  new SlashCommandBuilder()
    .setName('wordle')
    .setDescription('Play daily Wordle for bonus coins.')
    .addSubcommand(sc =>
      sc.setName('guess')
        .setDescription('Guess today’s 5-letter word.')
        .addStringOption(o => o.setName('word').setDescription('Your guess (5 letters)').setRequired(true))
    ),

  // Shop
  new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Show the shop.'),
  new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy an item from the shop.')
    .addStringOption(o => o.setName('item').setDescription('Item id').setRequired(true)),
  new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your inventory.'),
  new SlashCommandBuilder()
    .setName('use')
    .setDescription('Use an item from your inventory.')
    .addStringOption(o => o.setName('item').setDescription('Item id').setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    if (!process.env.GUILD_ID) throw new Error('Missing GUILD_ID in .env');
    console.log(`Registering guild commands for ${process.env.GUILD_ID}…`);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Guild slash commands registered ✓');
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exit(1);
  }
})();
