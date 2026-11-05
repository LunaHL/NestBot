// /suggest: an idea for NestBot (posted with 👍/👎 votes), or without text
// the most liked open ideas. Admins set the status with ⚙️ on the card.
// Logic: src/services/suggestions.js. Buttons and forms ("suggest:…").
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const suggestions = require('../services/suggestions');
const { isAdmin } = require('../utils/permissions');
const ui = require('../utils/ui');

/** Save and post a new idea; answers privately where it went. */
async function submitIdea(interaction, text) {
  if (!String(text || '').trim())
    return interaction.reply(ui.fail('Write your idea first.'));
  const s = suggestions.create(interaction.guildId, interaction.user.id, text);
  const msg = await suggestions.post(
    interaction.client,
    interaction.guildId,
    s,
    interaction.channelId,
  );
  return interaction.reply(
    msg
      ? ui.ok(
          `Thanks! Your idea **#${s.id}** is up for votes in <#${msg.channelId || s.channelId || interaction.channelId}>. 💡`,
        )
      : ui.fail(
          'I couldn’t post it. An admin may need to set `/settings channels suggestions:`.',
        ),
  );
}

/** The 💡 form (from the hub menu). */
const ideaForm = () =>
  new ModalBuilder()
    .setCustomId('suggest:new')
    .setTitle('💡 Your idea for NestBot')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('idea')
          .setLabel('What should NestBot do or do better?')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(suggestions.MAX_LENGTH)
          .setRequired(true),
      ),
    );

async function handleComponent(interaction) {
  const [, action, idText] = interaction.customId.split(':');
  const guildId = interaction.guildId;

  if (action === 'form') return interaction.showModal(ideaForm());
  if (action === 'new')
    return submitIdea(
      interaction,
      interaction.fields.getTextInputValue('idea'),
    );

  const id = Number(idText);
  if (action === 'up' || action === 'down') {
    const s = suggestions.vote(guildId, id, interaction.user.id, action);
    if (!s) return interaction.reply(ui.fail('This idea is gone.'));
    if (s.error)
      return interaction.reply(ui.info('🗳️ Voting on this idea is closed.'));
    return interaction.update(suggestions.card(s));
  }

  if (action === 'admin') {
    if (!isAdmin(interaction))
      return interaction.reply(ui.fail('Only admins can change the status.'));
    const s = suggestions.get(guildId, id);
    if (!s) return interaction.reply(ui.fail('This idea is gone.'));
    return interaction.reply({
      content: `⚙️ Status of idea **#${id}**:`,
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`suggest:status:${id}`)
            .setPlaceholder('Pick a status…')
            .addOptions(
              Object.entries(suggestions.STATUS).map(([value, st]) => ({
                label: st.label,
                value,
                emoji: st.emoji,
                default: value === s.status,
              })),
            ),
        ),
      ],
      flags: 64,
    });
  }

  if (action === 'status') {
    if (!isAdmin(interaction))
      return interaction.reply(ui.fail('Only admins can change the status.'));
    const status = interaction.values[0];
    const s = suggestions.setStatus(guildId, id, status, interaction.user.id);
    if (!s)
      return interaction.update({
        content: '❌ This idea is gone.',
        components: [],
      });
    await suggestions.refresh(interaction.client, guildId, id);
    const st = suggestions.STATUS[status];
    // Tell the person who had the idea
    const author = await interaction.client.users.fetch(s.by).catch(() => null);
    if (author && s.by !== interaction.user.id) {
      await author
        .send(
          `💡 Your idea **#${s.id}** for NestBot is now **${st.emoji} ${st.label}**:\n> ${s.text.slice(0, 300)}`,
        )
        .catch(() => {});
    }
    return interaction.update({
      content: `✅ Idea **#${id}** is now ${st.emoji} ${st.label}.`,
      components: [],
    });
  }

  return interaction.reply(ui.fail('Unknown button.'));
}

module.exports = {
  handleComponent,
  ideaForm,

  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription(
      '💡 An idea for NestBot, everyone votes (leave empty to see the top ideas)',
    )
    .addStringOption(o =>
      o
        .setName('idea')
        .setDescription('Your idea')
        .setMaxLength(suggestions.MAX_LENGTH),
    ),

  async execute(interaction) {
    const idea = interaction.options.getString('idea');
    if (idea) return submitIdea(interaction, idea);
    const list = suggestions.top(interaction.guildId, 10);
    const link = s =>
      s.messageId
        ? ` · [open](https://discord.com/channels/${interaction.guildId}/${s.channelId}/${s.messageId})`
        : '';
    return interaction.reply({
      embeds: [
        ui.card({
          title: '💡 Top ideas',
          color: 0xf1c40f,
          text: list.length
            ? list
                .map(
                  (s, i) =>
                    `${ui.rank(i)} **#${s.id}** ${s.text.slice(0, 80)}${s.text.length > 80 ? '…' : ''}\n　👍 ${s.up.length} · 👎 ${s.down.length} · ${suggestions.STATUS[s.status].emoji}${link(s)}`,
                )
                .join('\n')
            : 'No ideas yet. Be the first: `/suggest idea:`',
          footer: 'New idea: /suggest idea: …',
        }),
      ],
      flags: 64,
    });
  },
};
