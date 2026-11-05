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
        )
        .addChannelOption(o =>
          o
            .setName('suggestions')
            .setDescription('💡 Where /suggest ideas are posted for votes')
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
              {
                name: '🎅 Secret Santa: draw the names now',
                value: 'santa-draw',
              },
              {
                name: '🎅 Secret Santa: open the presents now',
                value: 'santa-reveal',
              },
              {
                name: '🎆 New Year: post the New Year message now',
                value: 'newyear-post',
              },
              {
                name: '🧺 Easter: post the best egg hunters now',
                value: 'easter-results',
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
        .setName('features')
        .setDescription(
          'Switch whole features on or off (off = invisible, data kept). Empty = show',
        )
        .addBooleanOption(o =>
          o
            .setName('nestword')
            .setDescription(
              '🟩 NestWord (the Wordle app does the same; default off)',
            ),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('birthdays')
        .setDescription(
          '🎂 Birthday channel, time, coins, role, reminder. Empty = show',
        )
        .addChannelOption(o =>
          o
            .setName('channel')
            .setDescription('Where birthday cards are posted')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addIntegerOption(o =>
          o
            .setName('hour')
            .setDescription('From what hour (server time), default 9')
            .setMinValue(0)
            .setMaxValue(23),
        )
        .addIntegerOption(o =>
          o
            .setName('coins')
            .setDescription('Coins for the birthday person, default 200')
            .setMinValue(0)
            .setMaxValue(5000),
        )
        .addRoleOption(o =>
          o
            .setName('role')
            .setDescription('A role the birthday person gets for the day'),
        )
        .addBooleanOption(o =>
          o.setName('no-role').setDescription('True = no birthday role'),
        )
        .addBooleanOption(o =>
          o
            .setName('reminder')
            .setDescription(
              '“Tomorrow is X’s birthday” the day before (default on)',
            ),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('holidays')
        .setDescription(
          '🎄 Christmas & 🐣 Easter: on/off, channel, egg hunt, bunny, test mode. Empty = show',
        )
        .addBooleanOption(o =>
          o
            .setName('enabled')
            .setDescription(
              'Christmas / New Year / Easter start by themselves on their dates (default OFF)',
            ),
        )
        .addChannelOption(o =>
          o
            .setName('channel')
            .setDescription(
              'Secret Santa, the tree, New Year, Easter results (default: the hub channel)',
            )
            .addChannelTypes(ChannelType.GuildText),
        )
        .addBooleanOption(o =>
          o
            .setName('eggs')
            .setDescription('Easter egg hunt in the chat (default on)'),
        )
        .addBooleanOption(o =>
          o
            .setName('bunny')
            .setDescription('🐰 Bunny Girl outfit (default on)'),
        )
        .addStringOption(o =>
          o
            .setName('test')
            .setDescription(
              'Pretend it’s a holiday now, to try everything (all servers!)',
            )
            .addChoices(
              { name: '🎄 Christmas', value: 'christmas' },
              { name: '🐣 Easter', value: 'easter' },
              { name: '🎆 New Year', value: 'newyear' },
              { name: '❌ Off (real dates)', value: 'off' },
            ),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('hub')
        .setDescription(
          'Menu channel, weekly "Did you know?" and tips after commands. Empty = show',
        )
        .addChannelOption(o =>
          o
            .setName('channel')
            .setDescription(
              'Where the pinned NestBot menu and the weekly tip go',
            )
            .addChannelTypes(ChannelType.GuildText),
        )
        .addBooleanOption(o =>
          o
            .setName('weekly')
            .setDescription(
              'Weekly "💡 Did you know?" in that channel (default on)',
            ),
        )
        .addStringOption(o =>
          o
            .setName('tips')
            .setDescription(
              'How often a short private tip comes after a command',
            )
            .addChoices(
              { name: 'Off', value: 'off' },
              { name: 'Rarely (about 1 in 10)', value: 'rare' },
              { name: 'Sometimes (about 1 in 5)', value: 'sometimes' },
              { name: 'Often (about 1 in 3)', value: 'often' },
            ),
        )
        .addBooleanOption(o =>
          o
            .setName('post-now')
            .setDescription('Post a "Did you know?" right now (to try it)'),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('blindfold')
        .setDescription(
          '🙈 Blindfolds: set up, give, take off. Empty = show status',
        )
        .addBooleanOption(o =>
          o
            .setName('enabled')
            .setDescription(
              'On = create the role + dark channel and hide all channels from it. Off = remove all of it',
            ),
        )
        .addUserOption(o =>
          o.setName('give').setDescription('Blindfold this person'),
        )
        .addIntegerOption(o =>
          o
            .setName('minutes')
            .setDescription('How long for "give" (default 10)')
            .setMinValue(1)
            .setMaxValue(180),
        )
        .addUserOption(o =>
          o
            .setName('end-for')
            .setDescription('Take this person’s blindfold off now'),
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
      if (o.getChannel('suggestions'))
        setSetting(
          guildId,
          'suggestionChannelId',
          o.getChannel('suggestions').id,
        );
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
            name: '💡 Ideas',
            value: show(getSetting(guildId, 'suggestionChannelId')),
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
      if (action === 'santa-draw') {
        const r = await require('../services/christmas').santaDraw(
          interaction.client,
          guildId,
        );
        return interaction.reply({
          content: r.error
            ? `❌ Only ${r.count} signed up; Secret Santa needs at least 2.`
            : `🎅 Drew the names for ${r.count} people and sent the DMs.`,
          flags: 64,
        });
      }
      if (action === 'santa-reveal') {
        const r = await require('../services/christmas').santaReveal(
          interaction.client,
          guildId,
        );
        return interaction.reply({
          content: r.error
            ? '❌ Nothing to open (names not drawn yet, or already opened).'
            : `🎁 Opened ${r.count} presents in the holiday channel.`,
          flags: 64,
        });
      }
      if (action === 'newyear-post') {
        const yr =
          new Date().getFullYear() + (new Date().getMonth() === 11 ? 1 : 0);
        const ok = await require('../services/christmas').postNewYear(
          interaction.client,
          guildId,
          yr,
          'newyear',
        );
        return interaction.reply({
          content: ok
            ? '🎆 Posted.'
            : '❌ Set a channel first: `/settings holidays channel:` (or a hub channel).',
          flags: 64,
        });
      }
      if (action === 'easter-results') {
        const ok = await require('../services/easter').postResults(
          interaction.client,
          guildId,
        );
        return interaction.reply({
          content: ok
            ? '🧺 Posted.'
            : '❌ No eggs found yet, or no channel set.',
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

    if (sub === 'features') {
      const features = require('../services/features');
      let changed = false;
      for (const name of Object.keys(features.FEATURES)) {
        const v = interaction.options.getBoolean(name);
        if (v !== null) {
          features.set(name, v);
          changed = true;
        }
      }
      if (changed) {
        await interaction.deferReply({ flags: 64 });
        await require('../deploy-commands').deployCommands(); // show / hide the commands
        await require('../services/hub')
          .postMenu(interaction.guild)
          .catch(() => {});
      }
      const embed = new EmbedBuilder()
        .setTitle('🧩 Features')
        .setColor(0x5865f2)
        .setDescription(
          Object.entries(features.FEATURES)
            .map(
              ([name, f]) =>
                `${f.emoji} **${f.label}:** ${features.on(name) ? '✅ on' : '🔒 off (invisible, data kept)'}`,
            )
            .join('\n') +
            (changed
              ? '\n\nDiscord’s command list updates in a moment (Ctrl+R helps).'
              : ''),
        )
        .setFooter({ text: 'Change with /settings features nestword:' });
      return changed
        ? interaction.editReply({ embeds: [embed] })
        : interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (sub === 'birthdays') {
      const o = interaction.options;
      if (o.getChannel('channel')) {
        db.perform(d => {
          d.birthdayChannels ||= {};
          d.birthdayChannels[guildId] = o.getChannel('channel').id;
        });
      }
      if (o.getInteger('hour') !== null)
        setSetting(guildId, 'birthdayHour', o.getInteger('hour'));
      if (o.getInteger('coins') !== null)
        setSetting(guildId, 'birthdayCoins', o.getInteger('coins'));
      if (o.getRole('role'))
        setSetting(guildId, 'birthdayRoleId', o.getRole('role').id);
      if (o.getBoolean('no-role')) setSetting(guildId, 'birthdayRoleId', null);
      if (o.getBoolean('reminder') !== null)
        setSetting(guildId, 'birthdayReminder', o.getBoolean('reminder'));
      const ch = db.read(d => d.birthdayChannels?.[guildId]);
      const role = getSetting(guildId, 'birthdayRoleId');
      const embed = new EmbedBuilder()
        .setTitle('🎂 Birthdays')
        .setColor(0xff9ff3)
        .addFields(
          {
            name: '📣 Channel',
            value: ch ? `<#${ch}>` : '– not set (no cards!)',
            inline: true,
          },
          {
            name: '🕘 From',
            value: `${getSetting(guildId, 'birthdayHour')}:00`,
            inline: true,
          },
          {
            name: '💰 Coins',
            value: `${getSetting(guildId, 'birthdayCoins')} (+5 per 🎉 wish)`,
            inline: true,
          },
          {
            name: '🎀 Role for the day',
            value: role ? `<@&${role}>` : 'None',
            inline: true,
          },
          {
            name: '🎈 Reminder the day before',
            value:
              getSetting(guildId, 'birthdayReminder') === false ? 'Off' : 'On',
            inline: true,
          },
        )
        .setFooter({
          text: 'Change with /settings birthdays channel: hour: coins: role: reminder:',
        });
      return interaction.reply({
        embeds: [embed],
        flags: 64,
        allowedMentions: { parse: [] },
      });
    }

    if (sub === 'holidays') {
      const o = interaction.options;
      const seasons = require('../services/seasons');
      const notes = [];
      if (o.getChannel('channel'))
        setSetting(guildId, 'holidayChannelId', o.getChannel('channel').id);
      if (o.getBoolean('eggs') !== null)
        setSetting(guildId, 'easterEnabled', o.getBoolean('eggs'));
      if (o.getBoolean('bunny') !== null)
        setSetting(guildId, 'bunnyEnabled', o.getBoolean('bunny'));
      const test = o.getString('test');
      const enabled = o.getBoolean('enabled');
      if (enabled !== null) {
        seasons.setEnabled(enabled);
        notes.push(
          enabled
            ? '✅ Holidays are **on**: Christmas, New Year and Easter start by themselves on their dates.'
            : '🔒 Holidays are **off**: nothing of Christmas, New Year or Easter shows up (Halloween is separate).',
        );
      }
      if (test || enabled !== null) {
        await interaction.deferReply({ flags: 64 });
        if (test) seasons.setTest(test === 'off' ? null : test);
        await require('../deploy-commands').deployCommands(); // show / hide /christmas and /easter
      }
      if (test) {
        notes.push(
          test === 'off'
            ? '✅ Test mode off: holidays follow the real dates again.'
            : `🧪 Test mode: it’s **${test}** now (on every server).${test === 'newyear' ? ' Try `/settings tools action:New Year`.' : ` \`/${test}\` shows up in a moment (Ctrl+R helps).`} Turn it off with \`test:off\`.`,
        );
      }
      const on = name => (seasons.active(name) ? '🟢 on now' : '⚪ not now');
      const ch =
        getSetting(guildId, 'holidayChannelId') ||
        getSetting(guildId, 'hubChannelId');
      const embed = new EmbedBuilder()
        .setTitle('🎄 Holidays')
        .setColor(0xc0392b)
        .addFields(
          {
            name: '🔌 Holidays',
            value: seasons.isEnabled()
              ? '✅ On (start by themselves)'
              : '🔒 Off (nothing shows up)',
            inline: true,
          },
          {
            name: '🎄 Christmas (Dec 1–26)',
            value: on('christmas'),
            inline: true,
          },
          {
            name: '🎆 New Year (Dec 31–Jan 1)',
            value: on('newyear'),
            inline: true,
          },
          {
            name: '🐣 Easter (Good Friday–Monday)',
            value: on('easter'),
            inline: true,
          },
          {
            name: '📣 Channel',
            value: ch ? `<#${ch}>` : '– not set (no Santa/tree/New Year posts)',
            inline: true,
          },
          {
            name: '🥚 Egg hunt',
            value:
              getSetting(guildId, 'easterEnabled') === false
                ? '❌ Off'
                : '✅ On',
            inline: true,
          },
          {
            name: '🐰 Bunny outfit',
            value:
              getSetting(guildId, 'bunnyEnabled') === false
                ? '❌ Off'
                : '✅ On',
            inline: true,
          },
          {
            name: '🧪 Test mode',
            value: seasons.getTest() ? `🧪 ${seasons.getTest()}` : 'Off',
            inline: true,
          },
        )
        .setFooter({
          text: 'Change with /settings holidays enabled: channel: eggs: bunny: test:',
        });
      if (notes.length) embed.setDescription(notes.join('\n'));
      return interaction.deferred || interaction.replied
        ? interaction.editReply({ embeds: [embed] })
        : interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (sub === 'hub') {
      const hub = require('../services/hub');
      const { FREQUENCIES } = require('../services/guide');
      const o = interaction.options;
      const channel = o.getChannel('channel');
      const notes = [];
      await interaction.deferReply({ flags: 64 });
      if (channel) {
        setSetting(guildId, 'hubChannelId', channel.id);
        setSetting(guildId, 'hubMessageId', null);
        const msg = await hub.postMenu(interaction.guild).catch(e => {
          notes.push(`⚠️ I couldn't post there: ${e.message}`);
          return null;
        });
        if (msg) notes.push(`✅ The menu is pinned in <#${channel.id}>.`);
      }
      if (o.getBoolean('weekly') !== null)
        setSetting(guildId, 'hubWeekly', o.getBoolean('weekly'));
      if (o.getString('tips'))
        setSetting(guildId, 'tipFrequency', o.getString('tips'));
      if (o.getBoolean('post-now')) {
        notes.push(
          (await hub.postWeekly(interaction.client, guildId))
            ? '💡 Posted a “Did you know?”.'
            : '❌ Set a hub channel first.',
        );
      }
      const hubId = getSetting(guildId, 'hubChannelId');
      const embed = new EmbedBuilder()
        .setTitle('🪺 Hub & tips')
        .setColor(0x5865f2)
        .addFields(
          {
            name: 'Menu channel',
            value: hubId ? `<#${hubId}>` : '– not set',
            inline: true,
          },
          {
            name: 'Weekly “Did you know?”',
            value:
              getSetting(guildId, 'hubWeekly') === false
                ? '❌ Off'
                : '✅ Mondays, 18:00',
            inline: true,
          },
          {
            name: 'Tips after commands',
            value:
              FREQUENCIES[getSetting(guildId, 'tipFrequency')]?.label ||
              'Rarely',
            inline: true,
          },
        )
        .setFooter({
          text: 'Change with /settings hub channel: weekly: tips:',
        });
      if (notes.length) embed.setDescription(notes.join('\n'));
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'blindfold') {
      const blindfold = require('../services/blindfold');
      const guild = interaction.guild;
      const o = interaction.options;
      const enabled = o.getBoolean('enabled');
      const notes = [];
      await interaction.deferReply({ flags: 64 });

      if (enabled === true) {
        const r = await blindfold.setup(guild);
        notes.push(
          `✅ Set up: <@&${r.role.id}> and <#${r.channel.id}>. Hidden from the role: ${r.hidden} channel(s).`,
        );
        if (r.leaks.length) {
          notes.push(
            `⚠️ These channels explicitly allow other roles, so someone with such a role still sees them while blindfolded: ${r.leaks
              .slice(0, 15)
              .map(c => `<#${c.id}>`)
              .join(', ')}`,
          );
        }
      } else if (enabled === false) {
        await blindfold.teardown(guild);
        notes.push(
          '✅ Blindfolds are off: role, dark channel and all overwrites removed.',
        );
      }
      const giveTo = o.getUser('give');
      if (giveTo) {
        const r = await blindfold.apply(
          guild,
          giveTo.id,
          (o.getInteger('minutes') || 10) * 60,
          interaction.user.id,
        );
        const why = {
          off: 'Set blindfolds up first with `enabled:true`.',
          admin: 'Admins see every channel, so they can’t be blindfolded.',
          bot: 'Bots can’t be blindfolded.',
          'not-found': 'That person isn’t on this server.',
          cannot:
            'I couldn’t give the role (is my role above 🙈 Blindfolded?).',
        };
        notes.push(
          r.error
            ? `❌ ${why[r.error]}`
            : `🙈 <@${giveTo.id}> is blindfolded until <t:${Math.floor(r.until / 1000)}:t>.`,
        );
      }
      const endFor = o.getUser('end-for');
      if (endFor) {
        notes.push(
          (await blindfold.remove(guild, endFor.id))
            ? `✅ <@${endFor.id}> can see again.`
            : `<@${endFor.id}> wasn’t blindfolded.`,
        );
      }

      const { roleId, channelId } = blindfold.config(guildId);
      const active = Object.entries(
        db.read(d => d.blindfolds?.[guildId]) || {},
      ).filter(([, r]) => r.until > Date.now());
      const embed = new EmbedBuilder()
        .setTitle('🙈 Blindfolds')
        .setColor(0x2c2f33)
        .addFields(
          {
            name: 'Status',
            value: roleId
              ? `✅ On · <@&${roleId}> · <#${channelId}>`
              : '❌ Not set up',
            inline: true,
          },
          {
            name: 'In the dark right now',
            value: active.length
              ? active
                  .map(
                    ([id, r]) =>
                      `<@${id}> until <t:${Math.floor(r.until / 1000)}:t>`,
                  )
                  .join('\n')
              : 'Nobody',
            inline: true,
          },
        )
        .setFooter({
          text: 'Shop items and wheel entries can blindfold too (effect: 🙈 Blindfold)',
        });
      if (notes.length) embed.setDescription(notes.join('\n'));
      return interaction.editReply({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
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
