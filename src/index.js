require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./utils/db');
const nestcoins = require('./services/nestcoins');
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 🥳 Birthday Checker
function checkBirthdays(client) {
  const now = new Date();
  const today = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

  db.perform(data => {
    for (const guildId of Object.keys(data.birthdays || {})) {
      const channelId = data.birthdayChannels?.[guildId];
      if (!channelId) continue;

      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;

      const channel = guild.channels.cache.get(channelId);
      if (!channel) continue;

      for (const entry of Object.values(data.birthdays[guildId])) {
        if (entry.date === today) {
          if (entry.userId) {
            nestcoins.addCoins(guildId, entry.userId, 200);
            channel.send(`🎉 Happy Birthday <@${entry.userId}>! 🎂 You received **200 NestCoins**!`);
          } else {
            channel.send(`🎉 Happy Birthday **${entry.name}**! 🎂`);
          }
        }
      }
    }
  });
}

function scheduleBirthdays(client) {
  const now = new Date();
  const nextMidnight = new Date();
  nextMidnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  setTimeout(() => {
    checkBirthdays(client);
    setInterval(() => checkBirthdays(client), 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

// 🧩📊 Scoreboard System
function checkScoreboard(client) {
  db.perform(data => {
    const SCOREBOARD_CHANNEL = process.env.SCOREBOARD_CHANNEL_ID;
    const channel = client.channels.cache.get(SCOREBOARD_CHANNEL);
    if (!channel) return;

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // 🟩 Wordle scoreboard
    const wordle = data.wordles?.[yesterday];
    if (wordle && wordle.stats && Object.keys(wordle.stats).length > 0) {
      const lines = [];
      for (const [userId, tries] of Object.entries(wordle.stats)) {
        const solved = wordle.solvedBy?.includes(userId);
        lines.push(`• <@${userId}> — ${solved ? `✅ ${tries} tries` : `❌ ${tries} tries`}`);
      }

      if (lines.length > 0) {
        const summary = `📊 **NestWord Results for ${wordle.date}**\n${lines.join("\n")}`;
        channel.send(summary);
      }
    }

    // 🧩 Puzzle scoreboard
    const puzzle = data.puzzles?.[yesterday];
    if (puzzle && puzzle.solvedBy && puzzle.solvedBy.length > 0) {
      const lines = puzzle.solvedBy.map(uid => `• <@${uid}> — ✅ solved`);
      const summary = `🧩 **Puzzle Results for ${yesterday}**\n${lines.join("\n")}`;
      channel.send(summary);
    }

    // 🔥 Clean old entries (keep 7 days)
    const cutoff = Date.now() - 7 * 86400000;
    for (const [key] of Object.entries(data.wordles || {})) {
      if (new Date(key).getTime() < cutoff) delete data.wordles[key];
    }
    for (const [key] of Object.entries(data.puzzles || {})) {
      if (new Date(key).getTime() < cutoff) delete data.puzzles[key];
    }
  });
}

function scheduleScoreboard(client) {
  const now = new Date();
  const nextMidnight = new Date();
  nextMidnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  setTimeout(() => {
    checkScoreboard(client);
    setInterval(() => checkScoreboard(client), 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

// 🖼️ Picture Quota System
function getNextPeriod(period) {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  if (period === "daily") return { start: now, end: now + oneDay };
  if (period === "weekly") return { start: now, end: now + oneDay * 7 };
  return { start: now, end: now + oneDay };
}

function checkPicQuota(client) {
  db.perform(async data => {
    for (const guildId of Object.keys(data.picquota || {})) {
      const quota = data.picquota[guildId];
      if (!quota) continue;

      const now = Date.now();
      if (now >= quota.end) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        const channel = guild.systemChannel || guild.channels.cache.find(c => c.isTextBased());
        if (!channel) continue;

        if (quota.current >= quota.amount) {
          channel.send(`🎉 Quota completed! ${quota.current}/${quota.amount} pictures sent!`);
          const reward = quota.reward || 20;
          const role = guild.roles.cache.get(quota.roleId);
          if (role) {
            role.members.forEach(member => {
              nestcoins.addCoins(guildId, member.id, reward);
            });
            channel.send(`💰 Each <@&${quota.roleId}> got **${reward} NestCoins**!`);
          }
        } else {
          channel.send(`❌ Quota failed! Only ${quota.current}/${quota.amount}.`);
        }

        const { start, end } = getNextPeriod(quota.period);
        quota.current = 0;
        quota.start = start;
        quota.end = end;
      }
    }
  });
}

function schedulePicQuota(client) {
  db.perform(data => {
    for (const guildId of Object.keys(data.picquota || {})) {
      const quota = data.picquota[guildId];
      if (!quota) continue;

      const now = Date.now();
      const msUntilEnd = quota.end - now;
      setTimeout(() => {
        checkPicQuota(client);
        schedulePicQuota(client);
      }, msUntilEnd);
    }
  });
}

// 🧠 On Bot Ready
client.on('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  checkBirthdays(client);
  scheduleBirthdays(client);
  checkScoreboard(client);
  scheduleScoreboard(client);
  checkPicQuota(client);
  schedulePicQuota(client);
});

// 🚀 Deploy commands & login
const { deployCommands } = require('./deploy-commands');
console.log("▶ Deploying commands...");
(async () => {
  await deployCommands();
  console.log("✅ Commands deployed. Logging in...");
  console.log("Using token:", process.env.BOT_TOKEN ? "✅ Loaded" : "❌ Missing");
  client.login(process.env.BOT_TOKEN);
})();

// 🧩 Command Loader
client.commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`[⚠️] Skipping invalid command: ${file}`);
  }
}

// 🗣️ Slash Command Handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) return console.error(`❌ Unknown command: ${interaction.commandName}`);

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: '❌ Error executing this command.', flags: 64  });
  }
});

// 🖼️ Message Image Tracker
client.on('messageCreate', message => {
  if (!message.guild || message.author.bot) return;

  db.perform(data => {
    const quota = data.picquota?.[message.guild.id];
    if (!quota) return;
    if (message.channelId !== quota.channelId) return;
    if (!message.member.roles.cache.has(quota.roleId)) return;

    const images = Array.from(message.attachments.values()).filter(a =>
      ['.png', '.jpg', '.jpeg', '.gif', '.webp'].some(ext => a.name?.toLowerCase().endsWith(ext))
    );

    if (images.length > 0) {
      quota.current = (quota.current || 0) + images.length;
      console.log(`📸 +${images.length} | ${quota.current}/${quota.amount}`);
    }
  });
});
