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
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const groups = require('../services/groups');
const wl = require('../services/watchlist');
const tmdb = require('../services/tmdb');

const ephemeral = content => ({ content, flags: 64 });
const label = i =>
  `${tmdb.kindEmoji(i.type, i.anime)} ${i.title}${i.year ? ` (${i.year})` : ''}`;
const MEMBER_OPTIONS = ['member1', 'member2', 'member3', 'member4', 'member5'];

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
        : 'Nothing on the list yet. Add something with ➕ **Add a title** in the pinned panel!') +
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
    const options = open.slice(0, 25).map(i => ({
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
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`group:seen:${group.id}`)
          .setPlaceholder('✅ We watched it already…')
          .addOptions(options),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`group:remove:${group.id}`)
          .setPlaceholder('🗑️ Remove from the list…')
          .addOptions(options),
      ),
    );
  }
  return { embeds: [embed], components };
}

// ---------- The pinned panel: buttons, menus and forms ----------

function form(customId, title, fields) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title.slice(0, 45))
    .addComponents(
      fields.map(f => {
        const input = new TextInputBuilder()
          .setCustomId(f.id)
          .setLabel(f.label.slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setRequired(f.required !== false)
          .setMaxLength(f.max || 100);
        if (f.value) input.setValue(String(f.value));
        if (f.placeholder)
          input.setPlaceholder(String(f.placeholder).slice(0, 100));
        return new ActionRowBuilder().addComponents(input);
      }),
    );
}

const refresh = (guild, id) => groups.postPanel(guild, id).catch(() => {});

/** Start a movie night in the group channel (now, or at `when`). */
async function startNight(interaction, group, ref, when) {
  const watchCmd = require('./watch');
  const watch = require('../services/watch');
  const guild = interaction.guild;
  let startAt = Date.now();
  if (when) {
    const w = watchCmd.parseWhen(when);
    if (!w)
      return interaction.editReply(
        '❌ I didn’t understand when. Try `tomorrow 20:00`, `friday` or leave it empty for now.',
      );
    startAt = require('../utils/time').zonedToUtc(w.date, w.time);
    if (startAt < Date.now() - 60000)
      return interaction.editReply('❌ That time is in the past.');
  }
  const details = await watch.resolveTitle(ref, {
    guildId: guild.id,
    scope: group.id,
  });
  const n = await watch.createNight(
    guild,
    interaction.member,
    details,
    startAt,
    { now: !when, groupId: group.id },
  );
  const { discordTime } = require('../utils/time');
  return interaction.editReply(
    when
      ? `🗓️ Planned **${watch.fullTitle(n)}** for ${discordTime(n.startAt, 'F')}. You'll get a ping here before it starts.`
      : `🍿 **${watch.fullTitle(n)}** starts now! Check in below.`,
  );
}

async function handleComponent(interaction) {
  const [, action, idText, answer] = interaction.customId.split(':');
  const guild = interaction.guild;
  const id = Number(idText);
  const group = groups.getGroup(guild.id, id);
  if (!group) return interaction.reply(ephemeral('This group is gone.'));
  const userId = interaction.user.id;
  const isMember = group.members.includes(userId);
  const owner = groups.isOwner(group, userId);

  if (action === 'delete') {
    if (!groups.canManage(group, interaction.member))
      return interaction.reply(
        ephemeral('❌ Only the owner or an admin can delete this group.'),
      );
    if (answer === 'ask') {
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
  const ownerOnly = [
    'invite',
    'invitepick',
    'kickpick',
    'kick',
    'renameform',
    'rename',
    'caltoggle',
  ];
  if (ownerOnly.includes(action) && !owner)
    return interaction.reply(ephemeral('❌ Only the owner 👑 can do that.'));

  // 📝 Shared watchlist
  if (action === 'list')
    return interaction.reply({
      ...listView(group),
      flags: 64,
      allowedMentions: { parse: [] },
    });

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
    await refresh(guild, id);
    return interaction.followUp(
      ephemeral(
        item.votes.includes(userId)
          ? `👍 Voted for **${item.title}**.`
          : `👎 Took back your vote for **${item.title}**.`,
      ),
    );
  }

  if (action === 'seen' || action === 'remove') {
    const r =
      action === 'seen'
        ? groups.markWatched(guild.id, id, interaction.values[0])
        : groups.removeItem(guild.id, id, interaction.values[0]);
    const item = r?.result;
    if (!item) return interaction.reply(ephemeral('That title is gone.'));
    await interaction
      .update(listView(groups.getGroup(guild.id, id)))
      .catch(() => {});
    await refresh(guild, id);
    return interaction.followUp(
      ephemeral(
        action === 'seen'
          ? `✅ **${label(item)}** is marked as watched.`
          : `🗑️ Removed **${label(item)}**.`,
      ),
    );
  }

  if (action === 'watchnow') {
    const item = group.watchlist[interaction.values[0]];
    if (!item) return interaction.reply(ephemeral('That title is gone.'));
    await interaction.deferReply({ flags: 64 });
    return startNight(
      interaction,
      group,
      item.tmdbId ? `${item.type}:${item.tmdbId}` : item.title,
      null,
    );
  }

  if (action === 'addform') {
    return interaction.showModal(
      form(`group:add:${group.id}`, 'Add to the shared watchlist', [
        {
          id: 'title',
          label: 'Movie, series or anime',
          placeholder: 'e.g. Inception, or Dune 2021',
        },
      ]),
    );
  }
  if (action === 'add') {
    await interaction.deferReply();
    const ref = await require('./watch').bestMatch(
      interaction.fields.getTextInputValue('title'),
    );
    const r = groups.addItem(guild.id, id, userId, await fieldsFor(ref)).result;
    await refresh(guild, id);
    return interaction.editReply({
      content: r.existed
        ? `📌 **${label(r.item)}** is already on the list.`
        : `📌 <@${userId}> added **${label(r.item)}** to the shared list.`,
      allowedMentions: { parse: [] },
    });
  }

  if (action === 'planform') {
    const next = groups.upNext(group);
    return interaction.showModal(
      form(`group:plan:${group.id}`, 'Watch together', [
        {
          id: 'title',
          label: 'What? (empty = up next from your list)',
          required: false,
          placeholder: next ? next.title : 'e.g. Inception',
        },
        {
          id: 'when',
          label: 'When? (empty = right now)',
          required: false,
          placeholder: 'e.g. tomorrow 20:00, friday 21:00',
        },
      ]),
    );
  }
  if (action === 'plan') {
    await interaction.deferReply({ flags: 64 });
    const typed = interaction.fields.getTextInputValue('title')?.trim();
    const next = groups.upNext(group);
    if (!typed && !next)
      return interaction.editReply(
        '📝 Your list is empty. Type a title, or add one with ➕ **Add a title**.',
      );
    const ref = typed
      ? await require('./watch').bestMatch(typed)
      : next.tmdbId
        ? `${next.type}:${next.tmdbId}`
        : next.title;
    return startNight(
      interaction,
      group,
      ref,
      interaction.fields.getTextInputValue('when')?.trim() || null,
    );
  }

  // 👥 Members
  if (action === 'invite') {
    return interaction.reply({
      content: '➕ Who should join?',
      components: [
        new ActionRowBuilder().addComponents(
          new UserSelectMenuBuilder()
            .setCustomId(`group:invitepick:${group.id}`)
            .setPlaceholder('👤 Pick someone…'),
        ),
      ],
      flags: 64,
    });
  }
  if (action === 'invitepick') {
    const targetId = interaction.values[0];
    const user = await interaction.client.users
      .fetch(targetId)
      .catch(() => null);
    if (!user || user.bot)
      return interaction.update({
        content: '🤖 Bots can’t join.',
        components: [],
      });
    const r = await groups.addMember(guild, id, targetId);
    if (r?.result === 'already')
      return interaction.update({
        content: 'They are already in the group.',
        components: [],
      });
    await interaction.update({ content: '✅ Added!', components: [] });
    await refresh(guild, id);
    const ch = await interaction.client.channels
      .fetch(group.channelId)
      .catch(() => null);
    await ch
      ?.send({
        content: `👋 Welcome <@${targetId}> to **${group.name}**!`,
        allowedMentions: { users: [targetId] },
      })
      .catch(() => {});
    return;
  }
  if (action === 'kickpick') {
    const others = group.members.filter(u => u !== userId);
    if (!others.length)
      return interaction.reply(ephemeral('You are the only one here.'));
    const names = await Promise.all(
      others.map(u =>
        guild.members
          .fetch(u)
          .then(m => m.displayName)
          .catch(() => u),
      ),
    );
    return interaction.reply({
      content: '👢 Who should leave the group?',
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`group:kick:${group.id}`)
            .setPlaceholder('👤 Pick someone…')
            .addOptions(
              others.slice(0, 25).map((u, i) => ({
                label: String(names[i]).slice(0, 100),
                value: u,
              })),
            ),
        ),
      ],
      flags: 64,
    });
  }
  if (action === 'kick') {
    const targetId = interaction.values[0];
    const r = await groups.removeMember(guild, id, targetId);
    await refresh(guild, id);
    return interaction.update({
      content:
        r?.result === 'not-member'
          ? 'They are not in the group.'
          : `👋 Removed <@${targetId}>.`,
      components: [],
      allowedMentions: { parse: [] },
    });
  }
  if (action === 'leaveask') {
    return interaction.reply({
      content: `👋 Really leave **${group.name}**?${owner && group.members.length > 1 ? ' Someone else becomes the owner.' : owner ? ' You are the last one, so the group gets deleted.' : ''}`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`group:leave:${group.id}`)
            .setLabel('Yes, leave')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`group:cancel:${group.id}`)
            .setLabel('Stay')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
      flags: 64,
    });
  }
  if (action === 'cancel')
    return interaction.update({ content: '👍 Okay.', components: [] });
  if (action === 'leave') {
    await interaction.update({
      content: `👋 You left **${group.name}**.`,
      components: [],
    });
    const r = await groups.removeMember(guild, id, userId);
    if (r?.group?.members.length) {
      await refresh(guild, id);
      if (owner) {
        const ch = await interaction.client.channels
          .fetch(group.channelId)
          .catch(() => null);
        await ch
          ?.send({
            content: `👑 <@${r.group.ownerId}> is the new owner.`,
            allowedMentions: { users: [r.group.ownerId] },
          })
          .catch(() => {});
      }
    }
    return;
  }

  // ✏️ Rename, 🗓️ calendar
  if (action === 'renameform') {
    return interaction.showModal(
      form(`group:rename:${group.id}`, 'Rename the group', [
        { id: 'name', label: 'New name', value: group.name, max: 50 },
      ]),
    );
  }
  if (action === 'rename') {
    const g = groups.rename(
      guild.id,
      id,
      interaction.fields.getTextInputValue('name'),
    );
    await refresh(guild, id);
    return interaction.reply(`✏️ The group is now called **${g.name}**.`);
  }
  if (action === 'caltoggle') {
    const g = groups.setShowInCalendar(guild.id, id, !group.showInCalendar);
    await refresh(guild, id);
    return interaction.reply(
      ephemeral(
        g.showInCalendar
          ? '🗓️ This group’s movie nights now show in the public calendar (only members can join).'
          : '🔒 This group’s movie nights stay private.',
      ),
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
    .addSubcommand(s => s.setName('list').setDescription('Your groups')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const userId = interaction.user.id;
    const o = interaction.options;

    if (sub === 'create') {
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
        `💞 Created **${r.group.name}**: <#${r.group.channelId}>. Everything else is in the pinned panel there.`,
      );
    }

    if (sub === 'list') {
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
  },
};
