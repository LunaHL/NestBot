// Runs every slash command: finds the command by name and calls its execute().
// Also answers "autocomplete" requests (suggestions while typing an option),
// for commands that export an autocomplete() function, like /help.
const guide = require('../services/guide');

// Buttons that don't belong to a command ("hub:…" = the hub menu)
const EXTRA_HANDLERS = {
  get hub() {
    return require('../services/hub');
  },
  get usermenu() {
    return require('../commands/userMenu');
  },
};
// …and the feature they belong to (/settings features)
const EXTRA_FEATURES = { hub: 'hub', usermenu: 'usermenu' };

const features = () => require('../services/features');
const maintainer = () => require('../services/maintainer');
// "by Luna in #general", for error DMs
const where = i =>
  `by ${i.user?.username || '?'}${i.channel?.name ? ` in #${i.channel.name}` : ''}`;
const switchedOff = interaction =>
  interaction
    .reply({ content: '🔒 That’s switched off right now.', flags: 64 })
    .catch(() => {});

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
  // Buttons, menus and forms whose customId starts with a command name ("watch:…")
  // go to that command's handleComponent(). Works after restarts too.
  // (Other buttons, e.g. duels, are handled by short-lived collectors.)
  if (
    interaction.isButton?.() ||
    interaction.isStringSelectMenu?.() ||
    interaction.isUserSelectMenu?.() ||
    interaction.isModalSubmit?.()
  ) {
    const prefix = String(interaction.customId).split(':')[0];
    const fromCommand = interaction.client.commands.get(prefix);
    const command = fromCommand || EXTRA_HANDLERS[prefix];
    if (!command?.handleComponent) return;
    // Old buttons of a switched-off feature (seasonal ones keep working)
    const feature = fromCommand ? fromCommand.feature : EXTRA_FEATURES[prefix];
    if (!features().check(feature)) return switchedOff(interaction);
    try {
      await command.handleComponent(interaction);
    } catch (e) {
      console.error(`❌ Button ${interaction.customId} failed:`, e);
      maintainer().reportError(
        `Button ${String(interaction.customId).split(':').slice(0, 2).join(':')} failed (${where(interaction)})`,
        e,
      );
      const msg = {
        content: '❌ That didn’t work. Please try again.',
        flags: 64,
      };
      if (interaction.replied || interaction.deferred)
        await interaction.followUp(msg).catch(() => {});
      else await interaction.reply(msg).catch(() => {});
    }
    return;
  }
  // Slash commands and right-click entries (Apps → …)
  if (
    !interaction.isChatInputCommand() &&
    !interaction.isUserContextMenuCommand?.()
  )
    return;

  const command = interaction.client.commands.get(interaction.commandName);
  if (!command)
    return console.error(`❌ Unknown command: ${interaction.commandName}`);
  // Switched off, but still in someone's (old) command list
  if (!features().interactionOn(command, interaction))
    return switchedOff(interaction);

  try {
    await command.execute(interaction);
    // Now and then a short private tip about a related feature
    await guide.maybeTip(interaction);
  } catch (error) {
    console.error(`❌ /${interaction.commandName} failed:`, error);
    maintainer().reportError(
      `/${interaction.commandName} failed (${where(interaction)})`,
      error,
    );
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
