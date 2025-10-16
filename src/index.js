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

const TZ = process.env.TIMEZONE || 'Europe/Berlin';
function getLocalDate(offsetDays = 0) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  now.setDate(now.getDate() + offsetDays);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function getLocalDayMonth() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// 🥳 Birthday Checker
function checkBirthdays(client) {
  const today = getLocalDayMonth();

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
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = nextMidnight - now;

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

    const today = getLocalDate(0);
    const yesterday = getLocalDate(-1);

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
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = nextMidnight - now;

  setTimeout(() => {
    checkScoreboard(client);
    setInterval(() => checkScoreboard(client), 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

// 🖼️ Picture Tracker System
function getWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sonntag
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  return { start: monday.getTime(), end: sunday.getTime() };
}

function checkPicTracker(client) {
  db.perform(data => {
    for (const guildId of Object.keys(data.pictracker || {})) {
      const board = data.pictracker[guildId];
      if (!board) continue;

      const now = Date.now();
      if (now >= board.end) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        // Leaderboard
        const sorted = Object.entries(board.users || {}).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) continue;

        const topText = sorted
          .slice(0, 10)
          .map(([id, count], i) => `**#${i + 1}** <@${id}> — ${count} 🖼️`)
          .join("\n");

        let channel;
        if (board.channelId) {
          channel = guild.channels.cache.get(board.channelId);
        } else {
          channel = guild.systemChannel || guild.channels.cache.find(c => c.isTextBased());
        }

        if (channel) {
          channel.send(`🏆 **Weekly Picture Leaderboard** 🏆\n\n${topText}`);
        } else {
          console.log(`⚠️ No valid channel found for guild ${guild.name}`);
        }


        // Reset for new week
        data.pictracker[guildId] = { users: {}, ...getWeekRange() };
      }
    }
  });
}

function schedulePicTracker(client) {
  const now = new Date();
  const nextMonday = new Date(now);
  const day = now.getDay();
  const daysUntilMonday = (8 - day) % 7 || 7;
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  const msUntilMonday = nextMonday - now;

  setTimeout(() => {
    checkPicTracker(client);
    setInterval(() => checkPicTracker(client), 7 * 24 * 60 * 60 * 1000);
  }, msUntilMonday);
}

// 🧠 On Bot Ready
client.on('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  checkBirthdays(client);
  scheduleBirthdays(client);
  checkScoreboard(client);
  scheduleScoreboard(client);
  checkPicTracker(client);
  schedulePicTracker(client);
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

// 📸 Track all image uploads
client.on('messageCreate', message => {
  if (!message.guild || message.author.bot) return;

  const images = Array.from(message.attachments.values()).filter(a =>
    a.contentType?.startsWith('image/')
  );
  if (images.length === 0) return;

  const guildId = message.guild.id;
  const userId = message.author.id;

  db.perform(data => {
    if (!data.pictracker) data.pictracker = {};
    if (!data.pictracker[guildId]) data.pictracker[guildId] = { users: {}, ...getWeekRange() };

    const tracker = data.pictracker[guildId];

    // Falls neue Woche begonnen hat → reset
    if (Date.now() > tracker.end) {
      data.pictracker[guildId] = { users: {}, ...getWeekRange() };
    }

    tracker.users[userId] = (tracker.users[userId] || 0) + images.length;
  });
});

