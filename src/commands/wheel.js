const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../utils/db');
const nestcoins = require('../services/nestcoins');
const gag = require('../services/gag');

function parseEffectFromText(text) {
  const s = String(text || '');
  const m = s.match(/\[effect:(\w+);duration:(\d+)\]/i);
  if (!m) return null;

  const type = String(m[1]).toLowerCase();
  const durationSec = Number(m[2]);
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;

  return { type, durationSec };
}

function stripEffectMarker(text) {
  return String(text || '').replace(/\s*\[effect:\w+;duration:\d+\]\s*/i, '').trim();
}


// cost in Nestcoins for a targeted spin
const PRICE_TARGETED_SPIN = 15;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wheel')
    .setDescription('Spin the Punishment Wheel!')
    //*sub commands
    .addSubcommand(sub =>
      sub
        .setName('spin')
        .setDescription('Spin the wheel and get a random punishment')
        .addUserOption(option =>
          option
            .setName('target')
            .setDescription('Optionally choose someone to punish'),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Add a new punishment to the wheel')
        .addStringOption(option =>
          option
            .setName('text')
            .setDescription('The punishment to add')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a punishment by its ID')
        .addIntegerOption(option =>
          option
            .setName('id')
            .setDescription('The ID of the punishment to remove')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub.setName('list').setDescription('List all punishments'),
    ),

  //* sub command execution
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'spin') {
      const target = interaction.options.getUser('target') ?? interaction.user;

      // Load the wheel list
      let wheelList = [];
      db.perform(data => {
        if (!data.wheel) data.wheel = [];
        wheelList = data.wheel.slice();
      });

      if (wheelList.length === 0) {
        return interaction.reply({
          content: '🎡 The wheel is empty!',
          flags: 64,
        });
      }

      const lines = wheelList.map((txt, i) => `#${i}: ${txt}`).join('\n');
      const isTargeted = target.id !== interaction.user.id;

      const priceInfo = isTargeted
        ? `This targeted spin will cost **${PRICE_TARGETED_SPIN}** Nestcoins.`
        : `Self spin is free.`;

      const tokenTarget = isTargeted ? target.id : 'self';
      const customId = `wheel:spin:${tokenTarget}:${interaction.user.id}`;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(customId)
          .setLabel('Spin the Wheel')
          .setStyle(ButtonStyle.Primary),
      );

      const message = await interaction.reply({
        content:
          `🎡 **Punishment Wheel**\n` +
          `${lines}\n\n` +
          `🎯 Target: ${isTargeted ? target : interaction.user}\n` +
          `${priceInfo}`,
        components: [row],
        fetchReply: true,
      });

      const filter = i =>
        i.isButton() &&
        i.customId === customId &&
        i.user.id === interaction.user.id;

      const collector = message.createMessageComponentCollector({
        filter,
        time: 7200_000, // 2h window
      });

      collector.on('collect', async i => {
        let currentList = [];
        db.perform(data => {
          if (!data.wheel) data.wheel = [];
          currentList = data.wheel.slice();
        });

        if (currentList.length === 0) {
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(customId)
              .setLabel('Spin the Wheel')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
          );
          await i.update({
            content: '🎡 The wheel is empty!',
            components: [disabledRow],
          });
          return collector.stop('empty');
        }

        const parts = i.customId.split(':');
        const tokenTarget = parts[2];
        const issuerId = parts[3];

        const isTargetedClick = tokenTarget !== 'self';
        const targetId = isTargetedClick ? tokenTarget : issuerId;
        let chargeLine = '';

        // Charge Nestcoins only for targeted spins
        if (isTargetedClick) {
          const newBal = nestcoins.removeCoins(
            i.guildId,
            issuerId,
            PRICE_TARGETED_SPIN,
          );
          if (newBal === null) {
            const current = nestcoins.getBalance(i.guildId, issuerId);
            return i.reply({
              content:
                `💸 Not enough Nestcoins for a targeted spin.\n` +
                `You need **${PRICE_TARGETED_SPIN}**, you have **${current}**. ` +
                `Come back when your wallet isn't echoing.`,
              flags: 64,
            });
          } else {
            chargeLine = `\n💳 Charged **${PRICE_TARGETED_SPIN}** Nestcoins from <@${issuerId}>.`;
          }
        }

        const randomIndex = Math.floor(Math.random() * currentList.length);
        const punishment = currentList[randomIndex];

        const effect = parseEffectFromText(punishment);

        if (effect?.type === 'gag') {
          gag.gagUser(i.guildId, targetId, effect.durationSec, issuerId);
        }

        const visiblePunishment = stripEffectMarker(punishment);


        // Apply effect (e.g., gag)
        if (effect?.type === 'gag') {
          gag.gagUser(i.guildId, targetId, effect.durationSec, issuerId);
        }


        const refreshed = currentList
          .map((txt, idx) => `#${idx}: ${txt}`)
          .join('\n');
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(customId)
            .setLabel('Spin the Wheel')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        );

        const content =
          `🎡 **Punishment Wheel**\n` +
          `${refreshed}\n\n` +
          `🎯 Target: <@${targetId}>\n` +
          `**Result:** ${visiblePunishment}${chargeLine}`;

        await i.update({ content, components: [disabledRow] });
        collector.stop('done');
      });

      collector.on('end', async (_collected, reason) => {
        if (reason === 'done' || reason === 'empty') return;
        try {
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(customId)
              .setLabel('Spin the Wheel')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
          );
          await message.edit({ components: [disabledRow] });
        } catch {}
      });

      return;
    }

    if (sub === 'add') {
      const text = interaction.options.getString('text');
      let id;
      if (
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content: '❌ You need to be an administrator to add punishments.',
          flags: 64,
        });
      }

      db.perform(data => {
        if (!data.wheel) data.wheel = [];
        data.wheel.push(text);
        id = data.wheel.length - 1; // index as ID
      });

      await interaction.reply(`✅ Added new punishment (#${id}): ${text}`);
    }

    if (sub === 'remove') {
      const id = interaction.options.getInteger('id');
      let removed;
      if (
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content: '❌ You need to be an administrator to remove punishments.',
          flags: 64,
        });
      }

      db.perform(data => {
        if (!data.wheel) data.wheel = [];
        if (id >= 0 && id < data.wheel.length) {
          removed = data.wheel.splice(id, 1);
        }
      });

      if (removed) {
        await interaction.reply(`🗑️ Removed punishment #${id}: ${removed}`);
      } else {
        await interaction.reply(`⚠️ No punishment found with ID #${id}`);
      }
    }

    if (sub === 'list') {
      let list = '🎡 **Punishment Wheel List:**\n';
      let count = 0;

      db.perform(data => {
        if (!data.wheel) data.wheel = [];
        data.wheel.forEach((punishment, index) => {
          list += `#${index}: ${punishment}\n`;
          count++;
        });
      });

      if (count === 0) {
        await interaction.reply({ content: '🎡 The wheel is empty!' });
      } else {
        await interaction.reply({ content: list });
      }
    }
  },
};
