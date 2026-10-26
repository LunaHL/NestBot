const { PermissionFlagsBits } = require('discord.js');

/** True if the person running the command is a server admin. */
function isAdmin(interaction) {
  return !!interaction.memberPermissions?.has(
    PermissionFlagsBits.Administrator,
  );
}

/** Standard reply for admin-only commands. Use: `if (!isAdmin(i)) return denyNonAdmin(i);` */
function denyNonAdmin(interaction) {
  return interaction.reply({
    content: '❌ Only admins can do that.',
    flags: 64,
  });
}

module.exports = { isAdmin, denyNonAdmin };
