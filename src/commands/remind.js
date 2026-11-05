// /remind: sign up for a DM at a time you pick, only if you haven't done
// today's puzzle / NestWord / daily coins yet. Logic: src/services/reminders.js.
// Menus ("remind:…") are routed here.
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const reminders = require('../services/reminders');
const ui = require('../utils/ui');
const { localDate } = require('../utils/time');

const DMS_CLOSED =
  'Discord didn’t let me DM you. Turn on **Direct messages from server members** for this server: click the server name → **Privacy Settings**.';

/** What happened last time, in words. */
function lastText(last) {
  const when = `${last.date === localDate(0) ? 'Today' : last.date} at ${last.at}`;
  if (last.result === 'sent') return `📨 ${when}: reminder sent ✅`;
  if (last.result === 'done')
    return `💤 ${when}: nothing to remind, all done 🎉`;
  return `⚠️ ${when}: ${last.error === 'dms-closed' ? DMS_CLOSED : `couldn’t send the DM (${last.error})`}`;
}

function panel(guildId, userId, note = '') {
  const r = reminders.get(guildId, userId);
  const lines = Object.entries(reminders.activeTasks()).map(
    ([key, t]) =>
      `${t.emoji} **${t.label}:** ${r[key] ? `⏰ ${r[key]}` : 'off'}`,
  );
  return {
    embeds: [
      ui.card({
        title: '⏰ Your reminders',
        color: ui.COLORS.primary,
        text:
          `${note ? `${note}\n\n` : ''}${lines.join('\n')}\n\nYou get a DM at that time **only if it’s not done yet**. Times are server time.` +
          (r.last ? `\n\n**Last time:** ${lastText(r.last)}` : ''),
        footer: 'Pick a time below, or “Off”',
      }),
    ],
    components: Object.entries(reminders.activeTasks())
      .map(([key, t]) =>
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`remind:set:${key}`)
            .setPlaceholder(`${t.label}: ${r[key] || 'off'}`)
            .addOptions(
              { label: 'Off', value: 'off', emoji: '🔕', default: !r[key] },
              ...reminders.TIMES.map(time => ({
                label: time,
                value: time,
                emoji: t.emoji,
                default: r[key] === time,
              })),
            ),
        ),
      )
      .concat(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('remind:test')
            .setLabel('Send me a test DM')
            .setEmoji('📨')
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
    flags: 64,
  };
}

async function handleComponent(interaction) {
  const [, action, task] = interaction.customId.split(':');
  if (action === 'test') {
    const r = await reminders.sendDM(
      interaction.client,
      interaction.user.id,
      '📨 Test from NestBot: DMs work! Your reminders will arrive here. ⏰',
    );
    return interaction.reply(
      ui.info(
        r.ok
          ? '✅ Sent! Check your DMs. Reminders arrive the same way.'
          : `❌ ${r.error === 'dms-closed' ? DMS_CLOSED : `That didn’t work: ${r.error}`}`,
      ),
    );
  }
  if (action !== 'set' || !reminders.TASKS[task])
    return interaction.reply(ui.fail('Unknown menu.'));
  const value = interaction.values[0];
  reminders.set(
    interaction.guildId,
    interaction.user.id,
    task,
    value === 'off' ? null : value,
  );
  const t = reminders.TASKS[task];
  return interaction.update(
    panel(
      interaction.guildId,
      interaction.user.id,
      value === 'off'
        ? `🔕 ${t.label}: no more reminders.`
        : `✅ ${t.label}: I’ll DM you at **${value}** if it’s not done.`,
    ),
  );
}

module.exports = {
  handleComponent,
  panel,

  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription(
      '⏰ Get a DM if you haven’t done today’s puzzle, NestWord or daily coins',
    ),

  async execute(interaction) {
    return interaction.reply(panel(interaction.guildId, interaction.user.id));
  },
};
