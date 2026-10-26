// Registers all slash commands with Discord for your server (GUILD_ID).
// Runs automatically on every start; `npm run commands` runs it on its own.
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { loadCommands } = require('./utils/commands');

async function deployCommands() {
  const commands = loadCommands().map(c => c.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID,
      ),
      { body: commands },
    );
    console.log(`Registered ${commands.length} slash commands.`);
  } catch (error) {
    console.error('Registering slash commands failed:', error);
  }
}

if (require.main === module) deployCommands();

module.exports = { deployCommands };
