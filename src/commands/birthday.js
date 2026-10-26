const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/db');
const nestcoins = require('../services/nestcoins');

const TZ = process.env.TIMEZONE || 'Europe/Berlin';
function getLocalDayMonth() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}


async function checkBirthdays(client) {
  const today = getLocalDayMonth();
  let shouldCheck = true;

  db.perform(data => {
    shouldCheck = data.birthdayLastChecked != today;
  });

  if (!shouldCheck) return;

  let guildsToProcess = [];
  db.perform(data => {
    if (data.birthdays) {
      for (const guildId of Object.keys(data.birthdays)) {
        guildsToProcess.push({
          guildId: guildId,
          channelId: data.birthdayChannels?.[guildId],
          entries: data.birthdays[guildId]
        });
      }
    }
  });

  for (const g of guildsToProcess) {
    if (!g.channelId) continue;

    try {
      const channel = await client.channels.fetch(g.channelId);
      if (!channel) continue;

      for (const entry of Object.values(g.entries)) {
        if (entry.date === today) {
          if (entry.userId) {
            nestcoins.addCoins(g.guildId, entry.userId, 200);
            await channel.send(`🎉 Happy Birthday <@${entry.userId}>! 🎂 You received **200 NestCoins**!`);
          } else {
            await channel.send(`🎉 Happy Birthday **${entry.name}**! 🎂`);
          }
        }
      }
    } catch (error) {
      console.error(`Error generating the automatic announcement:`, error);
    }
  }

  db.perform(data => {
    data.birthdayLastChecked = today;
  });
}

function schedule(client) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 1, 0, 0);
  const msUntilMidnight = nextMidnight - now;

  checkBirthdays(client);

  setTimeout(() => {
    checkBirthdays(client);
    setInterval(() => checkBirthdays(client), 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Birthday manager')
    .addSubcommand(sub =>
      sub.setName('list').setDescription('List all birthdays'),
    )
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Add or update a birthday')
        .addStringOption(opt =>
          opt
            .setName('date')
            .setDescription('Birthday date in MM-DD format')
            .setRequired(true),
        )
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('User to add birthday for (admins only)'),
        )
        .addStringOption(opt =>
          opt.setName('name').setDescription('External name (admins only)'),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a birthday')
        .addIntegerOption(opt =>
          opt
            .setName('id')
            .setDescription('The ID of the birthday entry to remove')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('channel')
        .setDescription('Set the channel for birthday announcements')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('The channel to post birthday messages in')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('announce')
        .setDescription('Manually check and announce today\'s birthdays (Admins only)')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'list') {
      db.perform(data => {
        const birthdays = data.birthdays?.[guildId] || {};
        const entries = Object.values(birthdays);

        if (entries.length === 0) {
          return interaction.reply({
            content: 'No birthdays set yet.',
            flags: 64,
          });
        }

        // helper: Month names
        const monthNames = [
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ];
        const formatDate = md => {
          const [mm, dd] = md.split('-');
          return `${dd} ${monthNames[parseInt(mm) - 1]}`;
        };
        const sortKey = md => {
          const [mm, dd] = md.split('-');
          return parseInt(mm) * 100 + parseInt(dd);
        };

        // sort
        entries.sort((a, b) => sortKey(a.date) - sortKey(b.date));

        let memberLines = [];
        let externalLines = [];

        for (const entry of entries) {
          const line = entry.userId
            ? `• ${formatDate(entry.date)} — <@${entry.userId}>`
            : `• ${formatDate(entry.date)} — ${entry.name}`;
          if (entry.userId) {
            memberLines.push(line);
          } else {
            externalLines.push(line);
          }
        }

        let message = '';
        if (memberLines.length) {
          message +=
            '🎂 **Discord Members**\n' + memberLines.join('\n') + '\n\n';
        }
        if (externalLines.length) {
          message += '👥 **External Birthdays**\n' + externalLines.join('\n');
        }

        return interaction.reply({ content: message.trim() });
      });
    }

    if (sub === 'add') {
      const optUser = interaction.options.getUser('user');
      const optName = interaction.options.getString('name');
      const date = interaction.options.getString('date');

      const isAdmin = interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator,
      );

      let entryName;
      let userId = null;

      if (!isAdmin) {
        // Normal users → only themselves
        entryName = interaction.user.username;
        userId = interaction.user.id;
      } else {
        if (optUser) {
          entryName = optUser.username;
          userId = optUser.id;
        } else if (optName) {
          entryName = optName;
          userId = null;
        } else {
          entryName = interaction.user.username;
          userId = interaction.user.id;
        }
      }

      db.perform(data => {
        if (!data.birthdays) data.birthdays = {};
        if (!data.birthdays[guildId]) data.birthdays[guildId] = {};

        // Check if there is already an entry for this user/name
        let existingId = null;
        for (const [id, entry] of Object.entries(data.birthdays[guildId])) {
          if (
            (userId && entry.userId === userId) ||
            (!userId && entry.name === entryName)
          ) {
            existingId = id;
            break;
          }
        }

        if (existingId) {
          // Update existing entry
          data.birthdays[guildId][existingId] = {
            name: entryName,
            date,
            userId,
          };
        } else {
          // New entry
          const nextId = Object.keys(data.birthdays[guildId]).length + 1;
          data.birthdays[guildId][nextId] = { name: entryName, date, userId };
        }
      });

      return interaction.reply({
        content: `✅ Birthday set for **${entryName}** on ${date}`,
        flags: 64,
      });
    }

    if (sub === 'remove') {
      const id = interaction.options.getInteger('id');
      const isAdmin = interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator,
      );
      const userId = interaction.user.id;

      let removedName = null;

      db.perform(data => {
        const guildBirthdays = data.birthdays?.[guildId] || {};
        const entry = guildBirthdays[id];

        if (!entry) {
          return interaction.reply({
            content: `❌ Birthday #${id} does not exist.`,
            flags: 64,
          });
        }

        if (!isAdmin && entry.userId !== userId) {
          return interaction.reply({
            content: '❌ You can only remove your own birthday.',
            flags: 64,
          });
        }

        removedName = entry.name;
        delete guildBirthdays[id];

        // Renumber IDs
        const items = Object.values(guildBirthdays);
        data.birthdays[guildId] = {};
        items.forEach((item, index) => {
          const newId = index + 1;
          data.birthdays[guildId][newId] = item;
        });
      });

      if (removedName) {
        return interaction.reply({
          content: `✅ Removed birthday entry: **${removedName}**`,
          flags: 64,
        });
      }
    }

    if (sub === 'channel') {
      const isAdmin = interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator,
      );
      if (!isAdmin) {
        return interaction.reply({
          content: "You don't have permission to use this subcommand.",
          flags: 64,
        });
      }

      const channel = interaction.options.getChannel('channel');

      db.perform(data => {
        if (!data.birthdayChannels) data.birthdayChannels = {};
        data.birthdayChannels[guildId] = channel.id;
      });

      return interaction.reply({
        content: `✅ Birthday channel set to ${channel}`,
        flags: 64,
      });
    }
    if (sub === 'announce') {
      const isAdmin = interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator,
      );
      
      if (!isAdmin) {
        return interaction.reply({
          content: '❌ You need to be an administrator to use this subcommand.',
          flags: 64,
        });
      }

      const today = getLocalDayMonth();
      let announcedCount = 0;

      db.perform(data => {
        const channelId = data.birthdayChannels?.[guildId];
        if (!channelId) {
          return interaction.reply({
            content: '❌ No birthday channel set! Use `/birthday channel` first.',
            flags: 64,
          });
        }

        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel) {
          return interaction.reply({
            content: '❌ Birthday channel not found or deleted.',
            flags: 64,
          });
        }

        const guildBirthdays = data.birthdays?.[guildId] || {};
        
        for (const entry of Object.values(guildBirthdays)) {
          if (entry.date === today) {
            if (entry.userId) {
              // Hinweis: Ich habe die NestCoins hier absichtlich weggelassen, 
              // damit man durch mehrfaches "manuelles Announcen" kein Geld farmen kann.
              // Wenn du das möchtest, entferne die // vor der nächsten Zeile:
              // nestcoins.addCoins(guildId, entry.userId, 200);
              
              channel.send(`🎉 Happy Birthday <@${entry.userId}>! 🎂 (Manual Announcement)`);
            } else {
              channel.send(`🎉 Happy Birthday **${entry.name}**! 🎂 (Manual Announcement)`);
            }
            announcedCount++;
          }
        }

        if (announcedCount === 0) {
          return interaction.reply({
            content: `🤷‍♂️ Nobody has a birthday today (${today}).`,
            flags: 64,
          });
        } else {
          return interaction.reply({
            content: `✅ Successfully announced ${announcedCount} birthday(s) for today!`,
            flags: 64,
          });
        }
      });
      return;
    }
  },
  schedule: schedule,
};
