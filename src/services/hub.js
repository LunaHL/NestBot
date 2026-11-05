// The hub channel (/settings hub): a pinned menu with buttons, so nobody
// has to know any command, plus a weekly "💡 Did you know?" post.
// Menu buttons run the normal commands; the answer is only shown to whoever
// clicked. Buttons ("hub:…") are routed here by events/interactionCreate.js.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/db');
const { getSetting, setSetting } = require('./settings');
const { runEvery } = require('../utils/schedule');
const { nowInTZ, localDate } = require('../utils/time');
const guide = require('./guide');
const ui = require('../utils/ui');

const WEEKLY_DAY = 1; // Monday
const WEEKLY_HOUR = 18; // from 18:00 server time

// label, emoji, what it runs: [command, subcommand, options]
const BUTTONS = [
  ['daily', 'Daily coins', '💰', ['daily']],
  ['profile', 'My profile', '📊', ['profile']],
  ['leaderboard', 'Leaderboards', '🏆', ['leaderboard']],
  ['shop', 'Shop', '🛍️', ['shop', 'browse']],
  ['drinks', 'Drinks menu', '🍹', ['drinks', 'menu']],
  ['puzzle', 'Today’s puzzle', '🧩', ['puzzle', 'info']],
  ['nestword', 'NestWord', '🟩', ['nestword', 'info']],
  ['movies', 'Movie nights', '🍿', null],
  ['watchlist', 'My watchlist', '📝', ['watchlist', 'show']],
  ['help', 'Everything else', '❓', ['help']],
  ['birthdays', 'Birthdays', '🎂', ['birthday', 'list']],
  ['remind', 'Reminders', '⏰', ['remind']],
  ['suggest', 'Suggest an idea', '💡', null],
];

function menuMessage() {
  const buttons = BUTTONS.map(([id, label, emoji], i) =>
    new ButtonBuilder()
      .setCustomId(`hub:${id}`)
      .setLabel(label)
      .setEmoji(emoji)
      .setStyle(i === 0 ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
  return {
    embeds: [
      ui.card({
        title: '🪺 NestBot',
        text:
          'Hi! Press a button, no commands needed. Only you see the answer.\n\n' +
          '💬 Questions? Just ask **@NestBot**, e.g. *“@NestBot how do movie nights work?”*\n' +
          '🖱️ Right-click someone → **Apps**: profile, gift a drink, duel, rename, blindfold',
        color: ui.COLORS.primary,
        footer: 'Every Monday there’s a “💡 Did you know?” here',
      }),
    ],
    components: [0, 5, 10]
      .map(i => new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)))
      .filter(r => r.components.length),
  };
}

/** Post the menu in the hub channel (or update it), and pin it. */
async function postMenu(guild) {
  const channelId = getSetting(guild.id, 'hubChannelId');
  if (!channelId) return null;
  const channel = await guild.client.channels
    .fetch(channelId)
    .catch(() => null);
  if (!channel) return null;
  const oldId = getSetting(guild.id, 'hubMessageId');
  const old = oldId
    ? await channel.messages.fetch(oldId).catch(() => null)
    : null;
  if (old) {
    await old.edit(menuMessage()).catch(() => {});
    return old;
  }
  const msg = await channel.send(menuMessage());
  setSetting(guild.id, 'hubMessageId', msg.id);
  await msg.pin?.().catch(() => {});
  return msg;
}

const { runAs } = require('../utils/runAs');

async function handleComponent(interaction) {
  const id = interaction.customId.split(':')[1];
  const button = BUTTONS.find(b => b[0] === id);
  if (!button)
    return interaction.reply({ content: '🤔 Unknown button.', flags: 64 });
  if (id === 'suggest')
    return interaction.showModal(require('../commands/suggest').ideaForm());
  if (id === 'movies') {
    const watch = require('./watch');
    return interaction.reply({
      embeds: [watch.calendarEmbed(interaction.guildId)],
      components: watch.calendarComponents(interaction.guildId),
      content:
        'Plan one with `/watch plan when:friday 21:00`, or start right away with `/watch now`.',
      flags: 64,
    });
  }
  return runAs(interaction, button[3]);
}

// ---------- Weekly "Did you know?" ----------

/** Monday's date this week, as the key for "already posted this week". */
function weekKey() {
  const day = nowInTZ().getDay();
  return localDate(-((day + 6) % 7));
}

async function postWeekly(client, guildId) {
  const channelId = getSetting(guildId, 'hubChannelId');
  const channel =
    channelId && (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return false;
  const item = guide.nextWeekly(guildId);
  if (!item) return false;
  await channel.send({
    embeds: [
      ui.card({
        title: `💡 Did you know? ${item.title}`,
        text: item.text,
        color: ui.COLORS.warning,
        footer: `${item.cat.emoji} ${item.cat.name} · Questions? Ask @NestBot`,
      }),
    ],
    allowedMentions: { parse: [] },
  });
  return true;
}

async function weeklyTick(client) {
  const now = nowInTZ();
  if (now.getDay() !== WEEKLY_DAY || now.getHours() < WEEKLY_HOUR) return;
  const week = weekKey();
  for (const guild of client.guilds.cache.values()) {
    if (
      !getSetting(guild.id, 'hubChannelId') ||
      getSetting(guild.id, 'hubWeekly') === false
    )
      continue;
    if (db.read(d => d.guide?.[guild.id]?.lastWeekly) === week) continue;
    db.perform(d => {
      d.guide ||= {};
      d.guide[guild.id] ||= {};
      d.guide[guild.id].lastWeekly = week;
    });
    await postWeekly(client, guild.id).catch(e =>
      console.error('[Hub] weekly post failed:', e.message),
    );
  }
}

/** On startup: refresh the menus (new buttons after updates), then the weekly job. */
function startHub(client) {
  for (const guild of client.guilds.cache.values()) {
    if (getSetting(guild.id, 'hubChannelId')) postMenu(guild).catch(() => {});
  }
  runEvery('Hub', 30, () => weeklyTick(client));
}

module.exports = {
  BUTTONS,
  menuMessage,
  postMenu,
  runAs,
  handleComponent,
  postWeekly,
  weeklyTick,
  weekKey,
  startHub,
};
