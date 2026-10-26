// Loads every slash command from src/commands/. A command file must export
// `data` (the SlashCommandBuilder) and `execute(interaction)`; it can also
// export `schedule(client)` for a background job that starts with the bot.
const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

/** @returns {Array} all valid command modules */
function loadCommands() {
  const commands = [];
  for (const file of fs
    .readdirSync(COMMANDS_DIR)
    .filter(f => f.endsWith('.js'))) {
    const command = require(path.join(COMMANDS_DIR, file));
    if ('data' in command && 'execute' in command) commands.push(command);
    else
      console.log(
        `[⚠️] Skipping ${file}: it doesn't export "data" and "execute"`,
      );
  }
  return commands;
}

module.exports = { loadCommands };
