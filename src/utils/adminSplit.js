// Moves admin-only subcommands out of a normal command, so regular members
// don't see them in Discord's command list. They show up under /admin
// instead (src/commands/admin.js), which Discord only shows to admins.
// The command's own execute() still handles them: /admin just passes the
// interaction on, and getSubcommand() returns the same name.

/**
 * splitAdmin(builder, ['add', 'remove']) →
 *   { data: what Discord shows everyone, adminSubcommands: [the moved ones] }
 */
function splitAdmin(builder, adminSubs) {
  const json = builder.toJSON();
  const isAdminSub = o => o.type === 1 && adminSubs.includes(o.name);
  const userJson = {
    ...json,
    options: (json.options || []).filter(o => !isAdminSub(o)),
  };
  return {
    data: { name: json.name, toJSON: () => userJson },
    adminSubcommands: (json.options || []).filter(isAdminSub),
  };
}

module.exports = { splitAdmin };
