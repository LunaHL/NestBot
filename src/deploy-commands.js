// Registers all slash commands with Discord for your server (GUILD_ID).
// Runs automatically on every start; `npm run commands` runs it on its own.
// Seasonal commands (`season()` in the command file, e.g. /trickortreat) are
// only registered while their season is on; startSeasons() re-registers
// when a season starts or ends.
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { loadCommands } = require('./utils/commands');

const inSeason = c => !c.season || c.season();
/** Which seasonal commands are on right now, e.g. "trickortreat". */
const seasonKey = () =>
  loadCommands()
    .filter(c => c.season && c.season())
    .map(c => c.data.name)
    .join(',');
let deployedKey = null;

async function deployCommands() {
  deployedKey = seasonKey();
  const commands = loadCommands()
    .filter(inSeason)
    .map(c => c.data.toJSON());
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

/** Every 30 minutes: did a season start or end? Then register again. */
function startSeasons() {
  const { runEvery } = require('./utils/schedule');
  runEvery('Seasonal commands', 30, async () => {
    if (deployedKey !== null && seasonKey() !== deployedKey)
      await deployCommands();
  });
}

if (require.main === module) deployCommands();

module.exports = { deployCommands, startSeasons, inSeason };
