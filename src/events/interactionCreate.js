// Runs every slash command: finds the command by name and calls its execute().
// Also answers "autocomplete" requests (suggestions while typing an option),
// for commands that export an autocomplete() function, like /help.
module.exports = async function onInteraction(interaction) {
  if (interaction.isAutocomplete?.()) {
    const command = interaction.client.commands.get(interaction.commandName);
    try {
      await command?.autocomplete?.(interaction);
    } catch (e) {
      console.error(
        `❌ Autocomplete for /${interaction.commandName} failed:`,
        e,
      );
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);
  if (!command)
    return console.error(`❌ Unknown command: ${interaction.commandName}`);

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ /${interaction.commandName} failed:`, error);
    // If the command already replied, reply() would throw again
    const msg = { content: '❌ Error executing this command.', flags: 64 };
    try {
      if (interaction.replied || interaction.deferred)
        await interaction.followUp(msg);
      else await interaction.reply(msg);
    } catch (e) {
      console.error('Failed to send error message:', e);
    }
  }
};
