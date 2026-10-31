// /settings: server settings for admins. Values are stored per server via
// src/services/settings.js.
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { isAdmin, denyNonAdmin } = require('../utils/permissions');
const db = require('../utils/db');
const {
  getStreakMode,
  getSetting,
  setSetting,
} = require('../services/settings');
const { STREAK_MODES, streakReward } = require('../utils/streak');

// Example table: what a hard puzzle (30 coins) pays on these streak days
const EXAMPLE_BASE = 30;
const EXAMPLE_DAYS = [1, 3, 7, 10, 30];

function comparisonTable() {
  const rows = EXAMPLE_DAYS.map(day => {
    const now = streakReward(EXAMPLE_BASE, day, 'capped').total;
    const old = streakReward(EXAMPLE_BASE, day, 'multiplier').total;
    return `Day ${String(day).padEnd(2)} │ ${String(now).padStart(4)} │ ${String(old).padStart(4)}`;
  });
  return (
    '```\n' +
    'Streak │  New │  Old\n' +
    '───────┼──────┼──────\n' +
    rows.join('\n') +
    '\n```\n' +
    `*Example: a hard puzzle (${EXAMPLE_BASE} coins). Applies to Puzzle and NestWord.*`
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Server settings (admins only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('streak')
        .setDescription('How streaks are rewarded in Puzzle and NestWord')
        .addStringOption(opt =>
          opt
            .setName('mode')
            .setDescription('Leave empty to see the current mode')
            .addChoices(
              ...Object.entries(STREAK_MODES).map(([value, m]) => ({
                name: m.label,
                value,
              })),
            ),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('free')
        .setDescription(
          'Make everything you can buy free (drinks, shop, AI, wheel)',
        )
        .addBooleanOption(opt =>
          opt
            .setName('enabled')
            .setDescription(
              'true = free, false = normal prices. Leave empty to see the current state',
            ),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('channels')
        .setDescription(
          'Where NestBot posts things. Leave everything empty to see the current channels',
        )
        .addChannelOption(o =>
          o
            .setName('puzzle')
            .setDescription('Daily puzzle announcement and solve notices')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addRoleOption(o =>
          o
            .setName('puzzle-ping')
            .setDescription('Role pinged for new puzzles'),
        )
        .addChannelOption(o =>
          o
            .setName('wordle')
            .setDescription('Where the Wordle app posts its daily results')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption(o =>
          o
            .setName('birthdays')
            .setDescription('Birthday announcements')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption(o =>
          o
            .setName('pictures')
            .setDescription('Weekly picture leaderboard')
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('tools')
        .setDescription('One-off admin actions')
        .addStringOption(o =>
          o
            .setName('action')
            .setDescription('What to do')
            .setRequired(true)
            .addChoices(
              {
                name: '🟩 Wordle: pay results NestBot missed',
                value: 'wordle-scan',
              },
              {
                name: '📸 Pictures: reset this week’s count',
                value: 'pictures-reset',
              },
              {
                name: '🏷️ Nicknames: end all paid nicknames now',
                value: 'nicknames-reset',
              },
            ),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('nicknames')
        .setDescription(
          'Paid nicknames and who may change their own nickname. Empty = show',
        )
        .addBooleanOption(o =>
          o
            .setName('paid')
            .setDescription(
              'Allow paid temporary nicknames in /shop. Off = all are reset now',
            ),
        )
        .addBooleanOption(o =>
          o
            .setName('self-change')
            .setDescription(
              'May everyone change their own nickname? (edits the @everyone role)',
            ),
        )
        .addUserOption(o =>
          o
            .setName('end-for')
            .setDescription('End this person’s paid nickname now'),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('watch')
        .setDescription(
          'Movie nights. Leave everything empty to see the current settings',
        )
        .addChannelOption(o =>
          o
            .setName('channel')
            .setDescription('#movies: calendar, movie cards, announcements')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption(o =>
          o
            .setName('category')
            .setDescription('Category for the temporary watch rooms')
            .addChannelTypes(ChannelType.GuildCategory),
        )
        .addRoleOption(o =>
          o
            .setName('mod-role')
            .setDescription(
              'Role that may edit, cancel and end any movie night',
            ),
        )
        .addRoleOption(o =>
          o
            .setName('plan-role')
            .setDescription('Only this role may plan (see everyone-can-plan)'),
        )
        .addBooleanOption(o =>
          o
            .setName('everyone-can-plan')
            .setDescription(
              'True = everyone may plan again (removes plan-role)',
            ),
        )
        .addIntegerOption(o =>
          o
            .setName('room-opens')
            .setDescription(
              'Minutes before the start the room opens (default 60)',
            )
            .setMinValue(0)
            .setMaxValue(1440),
        )
        .addIntegerOption(o =>
          o
            .setName('auto-delete')
            .setDescription(
              'Close forgotten rooms after this many hours (default 24)',
            )
            .setMinValue(1)
            .setMaxValue(168),
        )
        .addIntegerOption(o =>
          o
            .setName('checkpoints')
            .setDescription(
              '"Where are you?" every N minutes, 0 = off (default 30)',
            )
            .setMinValue(0)
            .setMaxValue(180),
        )
        .addIntegerOption(o =>
          o
            .setName('attendance-coins')
            .setDescription('Coins for checking in, 0 = off (default 0)')
            .setMinValue(0)
            .setMaxValue(1000),
        )
        .addBooleanOption(o =>
          o
            .setName('reminders')
            .setDescription('Reminder in #movies one day before (default on)'),
        )
        .addChannelOption(o =>
          o
            .setName('group-category')
            .setDescription(
              'Category for the permanent group channels (/group)',
            )
            .addChannelTypes(ChannelType.GuildCategory),
        )
        .addIntegerOption(o =>
          o
            .setName('max-groups')
            .setDescription(
              'Groups one person may own, 0 = unlimited (default 0)',
            )
            .setMinValue(0)
            .setMaxValue(50),
        )
        .addIntegerOption(o =>
          o
            .setName('vote-max')
            .setDescription('Longest vote in hours (default 168 = 7 days)')
            .setMinValue(1)
            .setMaxValue(720),
        ),
    ),

  async execute(interaction) {
    if (!isAdmin(interaction)) return denyNonAdmin(interaction);
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'streak') {
      const chosen = interaction.options.getString('mode');
      const before = getStreakMode(guildId);
      if (chosen) setSetting(guildId, 'streakMode', chosen);
      const mode = getStreakMode(guildId);

      let title = '🔥 Streak rewards';
      if (chosen && chosen !== before) title = '✅ Streak rewards changed';
      else if (chosen) title = 'ℹ️ Streak rewards (no change)';

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(mode === 'multiplier' ? 0xe67e22 : 0x2ecc71)
        .setDescription(
          `Active: **${STREAK_MODES[mode].label}**\n\n${comparisonTable()}` +
            (mode === 'multiplier'
              ? '\n\n⚠️ The old mode has no limit: long streaks pay huge amounts of coins.'
              : ''),
        )
        .setFooter({ text: 'Switch with /settings streak mode:' });

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (sub === 'free') {
      const chosen = interaction.options.getBoolean('enabled');
      if (chosen !== null) setSetting(guildId, 'freeMode', chosen);
      const free = !!getSetting(guildId, 'freeMode');

      const embed = new EmbedBuilder()
        .setTitle(free ? '🎉 Free mode is ON' : '💰 Free mode is OFF')
        .setColor(free ? 0x2ecc71 : 0x95a5a6)
        .setDescription(
          (free
            ? 'Everything you can buy costs **0 coins**. Coins can still be earned as usual.'
            : 'Everything costs its normal price.') +
            '\n\n**Affected:** 🍹 drinks and rounds, 🛍️ shop items, 🏷️ nicknames, 🤖 AI roast / compliment / poem / mood, 🎡 targeted wheel spins' +
            '\n**Not affected:** 🎲 gamble and 🤺 duel bets (free bets would create coins from nothing), 💸 transfers' +
            (chosen === null
              ? ''
              : '\n\nMenus and prices in Discord show the change right away.'),
        )
        .setFooter({ text: 'Switch with /settings free enabled:' });
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (sub === 'channels') {
      const o = interaction.options;
      const puzzles = require('../services/puzzle');
      const wordle = require('../services/wordle');
      const { getWeekRange } = require('../services/pictracker');
      const set = {
        puzzle: o.getChannel('puzzle'),
        ping: o.getRole('puzzle-ping'),
        wordle: o.getChannel('wordle'),
        birthdays: o.getChannel('birthdays'),
        pictures: o.getChannel('pictures'),
      };
      if (set.puzzle || set.ping) {
        const cur = puzzles.getSettings(guildId);
        const channelId = set.puzzle?.id || cur.channelId;
        if (channelId)
          puzzles.setChannel(guildId, channelId, set.ping?.id ?? cur.roleId);
      }
      if (set.wordle) wordle.setChannel(guildId, set.wordle.id);
      if (set.birthdays || set.pictures) {
        db.perform(d => {
          if (set.birthdays) {
            d.birthdayChannels ||= {};
            d.birthdayChannels[guildId] = set.birthdays.id;
          }
          if (set.pictures) {
            d.pictracker ||= {};
            d.pictracker[guildId] ||= { users: {}, ...getWeekRange() };
            d.pictracker[guildId].channelId = set.pictures.id;
          }
        });
      }
      const show = id => (id ? `<#${id}>` : '– not set');
      const pz = puzzles.getSettings(guildId);
      const embed = new EmbedBuilder()
        .setTitle('📌 Channels')
        .setColor(0x5865f2)
        .addFields(
          {
            name: '🧩 Puzzle',
            value:
              show(pz.channelId) +
              (pz.roleId ? ` · pings <@&${pz.roleId}>` : ''),
            inline: true,
          },
          {
            name: '🟩 Wordle app',
            value: show(wordle.getGuildData(guildId).channelId),
            inline: true,
          },
          {
            name: '🎂 Birthdays',
            value: show(db.read(d => d.birthdayChannels?.[guildId])),
            inline: true,
          },
          {
            name: '📸 Pictures',
            value: show(db.read(d => d.pictracker?.[guildId]?.channelId)),
            inline: true,
          },
          {
            name: '🍿 Movies',
            value: `${show(getSetting(guildId, 'watchChannelId'))} (set with \`/settings watch\`)`,
            inline: true,
          },
        )
        .setFooter({
          text: 'Change with /settings channels puzzle: wordle: birthdays: pictures:',
        });
      if (set.ping && !set.puzzle && !pz.channelId)
        embed.setDescription(
          '⚠️ Set a puzzle channel first, then the ping role.',
        );
      if (set.wordle)
        embed.setDescription(
          'Recent Wordle results there are paid within 30 minutes (or now with `/settings tools action:Wordle`).',
        );
      return interaction.reply({
        embeds: [embed],
        flags: 64,
        allowedMentions: { parse: [] },
      });
    }

    if (sub === 'tools') {
      const action = interaction.options.getString('action');
      if (action === 'wordle-scan') {
        const wordle = require('../services/wordle');
        if (!wordle.getGuildData(guildId).channelId) {
          return interaction.reply({
            content:
              '❌ Set the Wordle channel first with `/settings channels wordle:`.',
            flags: 64,
          });
        }
        await interaction.deferReply({ flags: 64 });
        const count = () =>
          Object.keys(wordle.getGuildData(guildId).days || {}).length;
        const before = count();
        await wordle.catchUp(interaction.client);
        const after = count();
        return interaction.editReply(
          after > before
            ? `✅ Paid ${after - before} missed day(s).`
            : '✅ Nothing missing. Every recent result was already paid.',
        );
      }
      if (action === 'pictures-reset') {
        const { getWeekRange } = require('../services/pictracker');
        db.perform(d => {
          d.pictracker ||= {};
          d.pictracker[guildId] = {
            users: {},
            ...getWeekRange(),
            channelId: d.pictracker[guildId]?.channelId || null,
          };
        });
        return interaction.reply({
          content: '✅ This week’s picture count is reset.',
          flags: 64,
        });
      }
      if (action === 'nicknames-reset') {
        const n = await require('../services/nickname').restoreAll(
          interaction.guild,
        );
        return interaction.reply({
          content: `✅ Ended ${n} paid nickname${n === 1 ? '' : 's'}.`,
          flags: 64,
        });
      }
    }

    if (sub === 'nicknames') {
      const guild = interaction.guild;
      const paid = interaction.options.getBoolean('paid');
      const selfChange = interaction.options.getBoolean('self-change');
      const notes = [];
      const endFor = interaction.options.getUser('end-for');
      if (endFor) {
        const nickname = require('../services/nickname');
        notes.push(
          (await nickname.restore(guild, endFor.id))
            ? `✅ <@${endFor.id}> has their old name back.`
            : `<@${endFor.id}> had no paid nickname.`,
        );
      }

      if (paid !== null) {
        setSetting(guildId, 'nicknamePranks', paid);
        if (!paid) {
          const n = await require('../services/nickname').restoreAll(guild);
          if (n)
            notes.push(
              `Reset ${n} running paid nickname${n === 1 ? '' : 's'}.`,
            );
        }
      }
      const everyone = guild.roles.everyone;
      if (selfChange !== null) {
        const perms = selfChange
          ? everyone.permissions.add(PermissionFlagsBits.ChangeNickname)
          : everyone.permissions.remove(PermissionFlagsBits.ChangeNickname);
        try {
          await everyone.setPermissions(
            perms,
            `/settings nicknames by ${interaction.user.tag}`,
          );
        } catch (e) {
          notes.push(`⚠️ I couldn't edit @everyone: ${e.message}`);
        }
      }
      const canSelf = everyone.permissions.has(
        PermissionFlagsBits.ChangeNickname,
      );
      // Other roles that still let people change their own nickname
      const others = [...guild.roles.cache.values()]
        .filter(
          r =>
            r.id !== everyone.id &&
            !r.managed &&
            r.permissions.has(PermissionFlagsBits.ChangeNickname),
        )
        .map(r => `<@&${r.id}>`);

      const on = !!getSetting(guildId, 'nicknamePranks');
      const embed = new EmbedBuilder()
        .setTitle('🏷️ Nicknames')
        .setColor(0xff79c6)
        .addFields(
          {
            name: 'Paid nicknames (/shop)',
            value: on ? '✅ On: people can rename others for coins' : '❌ Off',
            inline: true,
          },
          {
            name: 'Change own nickname',
            value: canSelf ? '✅ Everyone may' : '🔒 Not for @everyone',
            inline: true,
          },
        )
        .setFooter({
          text: 'Change with /settings nicknames paid: self-change:',
        });
      if (!canSelf && others.length) {
        notes.push(
          `These roles still allow changing your own nickname: ${others.join(', ')} (Server Settings → Roles).`,
        );
      }
      if (on && !interaction.client.privilegedIntents) {
        notes.push(
          'Tip: with the *Server Members* intent on, NestBot puts a paid nickname back if someone changes it early.',
        );
      }
      if (notes.length) embed.setDescription(notes.join('\n'));
      return interaction.reply({
        embeds: [embed],
        flags: 64,
        allowedMentions: { parse: [] },
      });
    }

    if (sub === 'watch') {
      const o = interaction.options;
      const changes = {
        watchChannelId: o.getChannel('channel')?.id,
        watchCategoryId: o.getChannel('category')?.id,
        watchModRoleId: o.getRole('mod-role')?.id,
        watchPlanRoleId: o.getBoolean('everyone-can-plan')
          ? null
          : o.getRole('plan-role')?.id,
        watchRoomOpensMin: o.getInteger('room-opens'),
        watchAutoDeleteH: o.getInteger('auto-delete'),
        watchCheckpointMin: o.getInteger('checkpoints'),
        watchAttendanceCoins: o.getInteger('attendance-coins'),
        watchReminders: o.getBoolean('reminders'),
        watchVoteMaxH: o.getInteger('vote-max'),
        watchGroupCategoryId: o.getChannel('group-category')?.id,
        watchMaxGroups: o.getInteger('max-groups'),
      };
      let changed = 0;
      for (const [key, value] of Object.entries(changes)) {
        const reset =
          key === 'watchPlanRoleId' && o.getBoolean('everyone-can-plan');
        if (value === undefined || (value === null && !reset)) continue;
        setSetting(guildId, key, value);
        changed++;
      }
      // A new #movies channel gets the calendar right away
      if (changes.watchChannelId) {
        await require('../services/watch').refreshCalendar(
          interaction.client,
          guildId,
        );
      }

      const g = key => getSetting(guildId, key);
      const show = (id, kind) =>
        id ? (kind === 'role' ? `<@&${id}>` : `<#${id}>`) : '–';
      const embed = new EmbedBuilder()
        .setTitle(
          changed ? '✅ Movie night settings saved' : '🍿 Movie night settings',
        )
        .setColor(0xe50914)
        .addFields(
          {
            name: '#movies channel',
            value: show(g('watchChannelId')),
            inline: true,
          },
          {
            name: 'Room category',
            value: show(g('watchCategoryId')),
            inline: true,
          },
          {
            name: 'Mod role',
            value: show(g('watchModRoleId'), 'role'),
            inline: true,
          },
          {
            name: 'Who can plan',
            value: g('watchPlanRoleId')
              ? show(g('watchPlanRoleId'), 'role')
              : 'Everyone',
            inline: true,
          },
          {
            name: 'Room opens',
            value: `${g('watchRoomOpensMin')} min before`,
            inline: true,
          },
          {
            name: 'Auto-close',
            value: `after ${g('watchAutoDeleteH')} h`,
            inline: true,
          },
          {
            name: 'Checkpoints',
            value: g('watchCheckpointMin')
              ? `every ${g('watchCheckpointMin')} min`
              : 'off',
            inline: true,
          },
          {
            name: 'Check-in coins',
            value: g('watchAttendanceCoins')
              ? `${g('watchAttendanceCoins')}`
              : 'off',
            inline: true,
          },
          {
            name: 'Reminders',
            value: g('watchReminders') ? 'on (1 day before)' : 'off',
            inline: true,
          },
          {
            name: 'Longest vote',
            value: `${g('watchVoteMaxH')} h`,
            inline: true,
          },
          {
            name: 'Group category',
            value: show(g('watchGroupCategoryId')),
            inline: true,
          },
          {
            name: 'Groups per person',
            value: g('watchMaxGroups') ? `${g('watchMaxGroups')}` : 'unlimited',
            inline: true,
          },
        )
        .setFooter({
          text: g('watchChannelId')
            ? 'Change any value with /settings watch <option>'
            : 'Start by setting the #movies channel: /settings watch channel:',
        });
      return interaction.reply({
        embeds: [embed],
        flags: 64,
        allowedMentions: { parse: [] },
      });
    }
  },
};
