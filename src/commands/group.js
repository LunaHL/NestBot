// /group: fixed watch groups and couples with their own private channel and
// shared watchlist. Logic: src/services/groups.js. Buttons ("group:…") are
// routed here by events/interactionCreate.js.
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const groups = require('../services/groups');
const wl = require('../services/watchlist');
const tmdb = require('../services/tmdb');

const ephemeral = content => ({ content, flags: 64 });
const label = i =>
  `${tmdb.kindEmoji(i.type, i.anime)} ${i.title}${i.year ? ` (${i.year})` : ''}`;
const MEMBER_OPTIONS = ['member1', 'member2', 'member3', 'member4', 'member5'];

/** The group this command is about: the `group` option, or the channel it's used in. */
function resolveGroup(interaction) {
  const id = interaction.options.getString?.('group');
  if (id) return groups.getGroup(interaction.guildId, Number(id));
  return groups.groupByChannel(interaction.guildId, interaction.channelId);
}

const groupOption = o =>
  o
    .setName('group')
    .setDescription('Which group (default: the group channel you are in)')
    .setAutocomplete(true);

async function fieldsFor(value) {
  const m = /^(movie|tv):(\d+)$/.exec(String(value || ''));
  const info = m ? await tmdb.details(m[1], Number(m[2])) : null;
  return wl.titleFields(info, String(value).slice(0, 100));
}

function listView(group) {
  const items = groups.listItems(group);
  const open = items.filter(i => i.status !== 'watched');
  const done = items.filter(i => i.status === 'watched');
  const embed = new EmbedBuilder()
    .setColor(0xff69b4)
    .setTitle(`💞 ${group.name}: shared watchlist`)
    .setDescription(
      (open.length
        ? open
            .map(
              (i, n) =>
                `${n === 0 ? '⭐' : '▫️'} **${label(i)}** · 👍 ${i.votes.length}`,
            )
            .join('\n')
        : 'Nothing on the list yet. Add something with `/group watchlist add`!') +
        (done.length
          ? `\n\n✅ **Watched:** ${done
              .slice(0, 10)
              .map(i => i.title)
              .join(', ')}`
          : ''),
    )
    .setFooter({
      text: '⭐ = up next (most 👍) · use the menus to vote or start watching',
    });
  const components = [];
  if (open.length) {
    const options = open
      .slice(0, 25)
      .map(i => ({
        label: `${i.title}${i.year ? ` (${i.year})` : ''}`.slice(0, 100),
        value: i.key,
        emoji: tmdb.kindEmoji(i.type, i.anime),
      }));
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`group:vote:${group.id}`)
          .setPlaceholder('👍 Vote for (or un-vote)…')
          .addOptions(options),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`group:watchnow:${group.id}`)
          .setPlaceholder('🎬 Watch this now…')
          .addOptions(options),
      ),
    );
  }
  return { embeds: [embed], components };
}

// ---------- Buttons and menus ----------

async function handleComponent(interaction) {
  const [, action, idText, answer] = interaction.customId.split(':');
  const guild = interaction.guild;
  const id = Number(idText);
  const group = groups.getGroup(guild.id, id);
  if (!group) return interaction.reply(ephemeral('This group is gone.'));
  const userId = interaction.user.id;
  const isMember = group.members.includes(userId);

  if (action === 'delete') {
    if (!groups.canManage(group, interaction.member))
      return interaction.reply(
        ephemeral('❌ Only the owner or an admin can delete this group.'),
      );
    if (answer !== 'yes')
      return interaction.update({ content: '👍 Not deleted.', components: [] });
    await interaction.update({
      content: `🗑️ Deleting **${group.name}**…`,
      components: [],
    });
    await groups.deleteGroup(guild, id);
    return;
  }

  if (!isMember)
    return interaction.reply(ephemeral('❌ You are not in this group.'));

  if (action === 'vote') {
    const item = groups.toggleVote(
      guild.id,
      id,
      interaction.values[0],
      userId,
    )?.result;
    if (!item) return interaction.reply(ephemeral('That title is gone.'));
    await interaction
      .update(listView(groups.getGroup(guild.id, id)))
      .catch(() => {});
    return interaction.followUp(
      ephemeral(
        item.votes.includes(userId)
          ? `👍 Voted for **${item.title}**.`
          : `👎 Took back your vote for **${item.title}**.`,
      ),
    );
  }

  if (action === 'watchnow') {
    const item = group.watchlist[interaction.values[0]];
    if (!item) return interaction.reply(ephemeral('That title is gone.'));
    await interaction.deferReply({ flags: 64 });
    const watch = require('../services/watch');
    const ref = item.tmdbId ? `${item.type}:${item.tmdbId}` : item.title;
    const details = await watch.resolveTitle(ref, {
      guildId: guild.id,
      scope: group.id,
    });
    const n = await watch.createNight(
      guild,
      interaction.member,
      details,
      Date.now(),
      { now: true, groupId: group.id },
    );
    return interaction.editReply(
      `🍿 **${watch.fullTitle(n)}** starts now! Check in above.`,
    );
  }

  return interaction.reply(ephemeral('🤔 Unknown button.'));
}

// ---------- Command ----------

module.exports = {
  handleComponent,

  data: new SlashCommandBuilder()
    .setName('group')
    .setDescription(
      'Watch groups: your own private channel and shared watchlist',
    )
    .addSubcommand(s => {
      s.setName('create')
        .setDescription('Create a watch group with its own private channel')
        .addStringOption(o =>
          o
            .setName('name')
            .setDescription('Group name')
            .setRequired(true)
            .setMaxLength(50),
        );
      for (const k of MEMBER_OPTIONS)
        s.addUserOption(o => o.setName(k).setDescription('Member'));
      return s;
    })
    .addSubcommand(s =>
      s
        .setName('add')
        .setDescription('Add someone (owner)')
        .addUserOption(o =>
          o.setName('member').setDescription('Who').setRequired(true),
        )
        .addStringOption(o => groupOption(o)),
    )
    .addSubcommand(s =>
      s
        .setName('kick')
        .setDescription('Remove someone (owner)')
        .addUserOption(o =>
          o.setName('member').setDescription('Who').setRequired(true),
        )
        .addStringOption(o => groupOption(o)),
    )
    .addSubcommand(s =>
      s
        .setName('leave')
        .setDescription('Leave a group')
        .addStringOption(o => groupOption(o)),
    )
    .addSubcommand(s =>
      s
        .setName('delete')
        .setDescription('Delete a group and its channel (owner or admins)')
        .addStringOption(o => groupOption(o)),
    )
    .addSubcommand(s => s.setName('list').setDescription('Your groups'))
    .addSubcommand(s =>
      s
        .setName('rename')
        .setDescription('Rename a group (owner)')
        .addStringOption(o =>
          o
            .setName('name')
            .setDescription('New name')
            .setRequired(true)
            .setMaxLength(50),
        )
        .addStringOption(o => groupOption(o)),
    )
    .addSubcommand(s =>
      s
        .setName('calendar')
        .setDescription(
          'Show this group’s movie nights in the public calendar (owner)',
        )
        .addBooleanOption(o =>
          o
            .setName('show')
            .setDescription('true = public, false = private')
            .setRequired(true),
        )
        .addStringOption(o => groupOption(o)),
    )
    .addSubcommandGroup(g =>
      g
        .setName('watchlist')
        .setDescription('The group’s shared watchlist')
        .addSubcommand(s =>
          s
            .setName('add')
            .setDescription('Add a title to the shared list')
            .addStringOption(o =>
              o
                .setName('title')
                .setDescription('Movie, series or anime (start typing)')
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addStringOption(o => groupOption(o)),
        )
        .addSubcommand(s =>
          s
            .setName('remove')
            .setDescription('Remove a title')
            .addStringOption(o =>
              o
                .setName('title')
                .setDescription('From the shared list (start typing)')
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addStringOption(o => groupOption(o)),
        )
        .addSubcommand(s =>
          s
            .setName('show')
            .setDescription('Show the shared list, vote 👍 and start watching')
            .addStringOption(o => groupOption(o)),
        )
        .addSubcommand(s =>
          s
            .setName('seen')
            .setDescription('Mark a title as watched by the group')
            .addStringOption(o =>
              o
                .setName('title')
                .setDescription('From the shared list (start typing)')
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addStringOption(o => groupOption(o)),
        )
        .addSubcommand(s =>
          s
            .setName('next')
            .setDescription('What’s up next (most 👍)?')
            .addStringOption(o => groupOption(o)),
        ),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const q = String(focused.value || '').toLowerCase();
    const userId = interaction.user.id;

    if (focused.name === 'group') {
      return interaction.respond(
        groups
          .groupsOf(interaction.guildId, userId)
          .filter(g => !q || g.name.toLowerCase().includes(q))
          .slice(0, 25)
          .map(g => ({
            name: `💞 ${g.name} (${g.members.length})`,
            value: String(g.id),
          })),
      );
    }

    // title: from the shared list (remove/seen) or TMDB (add)
    const sub = interaction.options.getSubcommand();
    const group =
      resolveGroup(interaction) ||
      groups.groupsOf(interaction.guildId, userId)[0];
    if (sub !== 'add') {
      const items = group ? groups.listItems(group) : [];
      return interaction.respond(
        items
          .filter(i => !q || i.title.toLowerCase().includes(q))
          .slice(0, 25)
          .map(i => ({
            name: `${i.status === 'watched' ? '✅' : '📌'} ${label(i)}`.slice(
              0,
              100,
            ),
            value: i.key,
          })),
      );
    }
    const found = tmdb.isEnabled() ? await tmdb.search(q) : [];
    const choices = found.map(r => ({
      name: `${tmdb.kindEmoji(r.type, r.anime)} ${r.title}${r.year ? ` (${r.year})` : ''}`.slice(
        0,
        100,
      ),
      value: `${r.type}:${r.id}`,
    }));
    if (q && choices.length < 25)
      choices.push({
        name: `✏️ Use “${focused.value}”`.slice(0, 100),
        value: String(focused.value).slice(0, 100),
      });
    return interaction.respond(choices.slice(0, 25));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const subGroup = interaction.options.getSubcommandGroup?.(false);
    const guild = interaction.guild;
    const userId = interaction.user.id;
    const o = interaction.options;

    // ---------- create ----------
    if (sub === 'create' && !subGroup) {
      const members = MEMBER_OPTIONS.map(k => o.getUser(k))
        .filter(u => u && !u.bot)
        .map(u => u.id);
      await interaction.deferReply({ flags: 64 });
      const r = await groups.createGroup(
        guild,
        interaction.member,
        o.getString('name'),
        members,
      );
      if (r.error === 'limit')
        return interaction.editReply(
          `❌ You can own at most ${r.max} group${r.max === 1 ? '' : 's'}.`,
        );
      if (r.error)
        return interaction.editReply(
          '❌ I couldn’t create the channel. Check that I may manage channels.',
        );
      return interaction.editReply(
        `💞 Created **${r.group.name}**: <#${r.group.channelId}>`,
      );
    }

    // ---------- list ----------
    if (sub === 'list' && !subGroup) {
      const mine = groups.groupsOf(interaction.guildId, userId);
      return interaction.reply(
        ephemeral(
          mine.length
            ? mine
                .map(
                  g =>
                    `💞 **${g.name}** · <#${g.channelId}> · ${g.members.length} members${g.ownerId === userId ? ' · 👑 yours' : ''}`,
                )
                .join('\n')
            : 'You are not in any group yet. Create one with `/group create`!',
        ),
      );
    }

    const group = resolveGroup(interaction);
    if (!group)
      return interaction.reply(
        ephemeral('❌ Pick a group, or use this inside a group channel.'),
      );
    const member = group.members.includes(userId);
    const owner = groups.isOwner(group, userId);

    // ---------- shared watchlist ----------
    if (subGroup === 'watchlist') {
      if (!member)
        return interaction.reply(ephemeral('❌ You are not in this group.'));
      if (sub === 'add') {
        await interaction.deferReply();
        const fields = await fieldsFor(o.getString('title'));
        const r = groups.addItem(
          interaction.guildId,
          group.id,
          userId,
          fields,
        ).result;
        return interaction.editReply(
          r.existed
            ? `📌 **${label(r.item)}** is already on the list.`
            : `📌 <@${userId}> added **${label(r.item)}** to the shared list.`,
        );
      }
      if (sub === 'remove') {
        const item = groups.removeItem(
          interaction.guildId,
          group.id,
          o.getString('title'),
        ).result;
        return interaction.reply(
          item
            ? `🗑️ Removed **${label(item)}** from the shared list.`
            : ephemeral("❓ That's not on the list."),
        );
      }
      if (sub === 'seen') {
        const item = groups.markWatched(
          interaction.guildId,
          group.id,
          o.getString('title'),
        )?.result;
        return interaction.reply(
          item
            ? `✅ **${label(item)}** is marked as watched by the group.`
            : ephemeral("❓ That's not on the list."),
        );
      }
      if (sub === 'next') {
        const next = groups.upNext(group);
        return interaction.reply(
          next
            ? `⭐ Up next for **${group.name}**: **${label(next)}** (👍 ${next.votes.length})`
            : ephemeral(
                'The list is empty. Add something with `/group watchlist add`!',
              ),
        );
      }
      if (sub === 'show')
        return interaction.reply({
          ...listView(group),
          allowedMentions: { parse: [] },
        });
    }

    // ---------- members ----------
    if (sub === 'add') {
      if (!owner)
        return interaction.reply(
          ephemeral('❌ Only the owner can add people.'),
        );
      const target = o.getUser('member');
      if (target.bot)
        return interaction.reply(ephemeral('🤖 Bots can’t join.'));
      const r = await groups.addMember(guild, group.id, target.id);
      return interaction.reply(
        r.result === 'already'
          ? ephemeral('They are already in the group.')
          : {
              content: `👋 Welcome <@${target.id}> to **${group.name}**!`,
              allowedMentions: { users: [target.id] },
            },
      );
    }
    if (sub === 'kick') {
      if (!owner)
        return interaction.reply(
          ephemeral('❌ Only the owner can remove people.'),
        );
      const target = o.getUser('member');
      if (target.id === userId)
        return interaction.reply(
          ephemeral('Use `/group leave` to leave (or `/group delete`).'),
        );
      const r = await groups.removeMember(guild, group.id, target.id);
      return interaction.reply(
        ephemeral(
          r?.result === 'not-member'
            ? 'They are not in the group.'
            : `👋 Removed <@${target.id}>.`,
        ),
      );
    }
    if (sub === 'leave') {
      if (!member)
        return interaction.reply(ephemeral('You are not in this group.'));
      await interaction.reply(ephemeral(`👋 You left **${group.name}**.`));
      const r = await groups.removeMember(guild, group.id, userId);
      if (r?.group && owner && r.group.members.length) {
        const ch = await guild.client.channels
          .fetch(group.channelId)
          .catch(() => null);
        await ch
          ?.send({
            content: `👑 <@${r.group.ownerId}> is the new owner.`,
            allowedMentions: { users: [r.group.ownerId] },
          })
          .catch(() => {});
      }
      return;
    }
    if (sub === 'delete') {
      if (!groups.canManage(group, interaction.member))
        return interaction.reply(
          ephemeral('❌ Only the owner or an admin can delete this group.'),
        );
      return interaction.reply({
        content: `⚠️ Really delete **${group.name}**? The channel and the shared watchlist will be gone for everyone.`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`group:delete:${group.id}:yes`)
              .setLabel('Yes, delete')
              .setEmoji('🗑️')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`group:delete:${group.id}:no`)
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
        flags: 64,
      });
    }
    if (sub === 'rename') {
      if (!owner)
        return interaction.reply(
          ephemeral('❌ Only the owner can rename the group.'),
        );
      const g = groups.rename(
        interaction.guildId,
        group.id,
        o.getString('name'),
      );
      return interaction.reply(`✏️ The group is now called **${g.name}**.`);
    }
    if (sub === 'calendar') {
      if (!owner)
        return interaction.reply(
          ephemeral('❌ Only the owner can change this.'),
        );
      const g = groups.setShowInCalendar(
        interaction.guildId,
        group.id,
        o.getBoolean('show'),
      );
      return interaction.reply(
        ephemeral(
          g.showInCalendar
            ? '🗓️ This group’s movie nights now show in the public calendar (only members can join).'
            : '🔒 This group’s movie nights stay private.',
        ),
      );
    }
  },
};
