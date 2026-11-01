// Run a slash command from a button, menu, form or right-click, as if it was
// typed with these options. Used by the hub menu and the right-click menu.
//
// runAs(interaction, ['drinks', 'gift', { user, drink: 'latte' }], {
//   members: { user: member },  // what getMember('user') returns
//   private: true,              // answer only visible to whoever clicked
// })
async function runAs(
  interaction,
  [commandName, sub = null, opts = {}],
  { members = {}, private: priv = true } = {},
) {
  const command = interaction.client.commands.get(commandName);
  if (!command)
    return interaction.reply({
      content: '❌ That isn’t available.',
      flags: 64,
    });
  const withFlags = p => {
    const payload = typeof p === 'string' ? { content: p } : { ...p };
    if (priv) payload.flags = 64;
    return payload;
  };
  const shim = Object.create(interaction);
  Object.assign(shim, {
    commandName,
    options: {
      getSubcommand: () => sub,
      getSubcommandGroup: () => null,
      getString: k => (typeof opts[k] === 'string' ? opts[k] : null),
      getInteger: k => (typeof opts[k] === 'number' ? opts[k] : null),
      getBoolean: k => (typeof opts[k] === 'boolean' ? opts[k] : null),
      getUser: k => (opts[k] && typeof opts[k] === 'object' ? opts[k] : null),
      getMember: k => members[k] ?? null,
      getChannel: () => null,
      getRole: () => null,
      getFocused: () => '',
    },
    inGuild: () => true,
    reply: p => interaction.reply(withFlags(p)),
    deferReply: p =>
      interaction.deferReply(priv ? { ...(p || {}), flags: 64 } : p),
    editReply: p => interaction.editReply(p),
    followUp: p => interaction.followUp(withFlags(p)),
  });
  return command.execute(shim);
}

module.exports = { runAs };
