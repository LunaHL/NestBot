// Registers all slash commands with Discord for your server (GUILD_ID).
// Runs automatically on every start; `npm run commands` runs it on its own.
// Only commands that are on right now are registered: switched-off features
// (/settings features, src/config/features.js) and seasonal commands
// (`season()` in the command file, e.g. /trickortreat) out of season are left
// out, and so are switched-off subcommands (`subFeatures`). startSeasons()
// re-registers when that changes.
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { loadCommands } = require('./utils/commands');
const features = require('./services/features');

const inSeason = features.commandOn;
/** What would be registered right now, as JSON for registeredKey(). */
const registered = () =>
  loadCommands().filter(features.commandOn).map(features.commandJson);
/** Command, subcommand and group names, to notice when something changed. */
const registeredKey = (commands = registered()) =>
  JSON.stringify(
    commands.map(c => [
      c.name,
      (c.options || [])
        .filter(o => o.type === 1 || o.type === 2)
        .map(o =>
          o.type === 2
            ? [o.name, (o.options || []).map(x => x.name)]
            : o.name,
        ),
    ]),
  );
let deployedKey = null;

async function deployCommands() {
  const commands = registered();
  deployedKey = registeredKey(commands);
  if (!process.env.BOT_TOKEN) {
    console.warn('Not registering slash commands: BOT_TOKEN is missing.');
    return;
  }
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
    if (deployedKey !== null && registeredKey() !== deployedKey)
      await deployCommands();
  });
}

if (require.main === module) deployCommands();

module.exports = { deployCommands, startSeasons, inSeason };
