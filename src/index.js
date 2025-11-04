require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./utils/db');
const nestword = require('./commands/nestword');
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
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

// 🧩📊 Scoreboard System
function checkScoreboard(client) {
  const SCOREBOARD_CHANNEL = process.env.SCOREBOARD_CHANNEL_ID;
  const channel = client.channels.cache.get(SCOREBOARD_CHANNEL);
  if (!channel) {
    console.log('❌ Scoreboard channel invalid');
    return;
  }

  const today = getLocalDate(0);
  const yesterday = getLocalDate(-1);

  let shouldCheck;
  db.perform(data => {
    shouldCheck = data.scoreboardLastChecked != today;
    data.scoreboardLastChecked = today;
  });

  if (!shouldCheck) return;

  db.perform(data => {
    // 🟩 Wordle scoreboard
    const wordle = data.wordles?.[yesterday];
    if (wordle && wordle.stats && Object.keys(wordle.stats).length > 0) {
      const lines = [];
      for (const [userId, tries] of Object.entries(wordle.stats)) {
        const solved = wordle.solvedBy?.includes(userId);
        lines.push(
          `• <@${userId}> — ${solved ? `✅ ${tries} tries` : `❌ ${tries} tries`}`,
        );
      }
      if (lines.length > 0) {
        const summary = `📊 **NestWord Results for ${wordle.date}**\n${lines.join('\n')}`;
        channel.send(summary);
      }
    }

    // 🧩 Puzzle scoreboard
    const puzzle = data.puzzles?.[yesterday];
    if (puzzle && puzzle.solvedBy && puzzle.solvedBy.length > 0) {
      const lines = puzzle.solvedBy.map(uid => `• <@${uid}> — ✅ solved`);
      const summary = `🧩 **Puzzle Results for ${yesterday}**\n${lines.join('\n')}`;
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
  nextMidnight.setHours(24, 1, 0, 0);
  const msUntilMidnight = nextMidnight - now;

  checkScoreboard(client);

  setTimeout(() => {
    checkScoreboard(client);
    setInterval(() => checkScoreboard(client), 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

const schedulers = [];

// 🧠 On Bot Ready
client.on('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  nestword.initDailyPicker();
  scheduleScoreboard(client);
  for (const scheduler of schedulers) {
    scheduler.schedule(client);
  }
});

// 🚀 Deploy commands & login
const { deployCommands } = require('./deploy-commands');
console.log('▶ Deploying commands...');
(async () => {
  await deployCommands();
  console.log('✅ Commands deployed. Logging in...');
  console.log(
    'Using token:',
    process.env.BOT_TOKEN ? '✅ Loaded' : '❌ Missing',
  );
  client.login(process.env.BOT_TOKEN);
})();

// 🧩 Command Loader
client.commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    if ('schedule' in command) {
      schedulers.push(command);
    }
  } else {
    console.log(`[⚠️] Skipping invalid command: ${file}`);
  }
}

// 🗣️ Slash Command Handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = interaction.client.commands.get(interaction.commandName);
  if (!command)
    return console.error(`❌ Unknown command: ${interaction.commandName}`);
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: '❌ Error executing this command.',
      flags: 64,
    });
  }
});

// 🖼️ Picture Tracker System
function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  return { start: monday.getTime(), end: sunday.getTime() };
}

// 📸 Track all image uploads
client.on('messageCreate', message => {
  if (!message.guild || message.author.bot) return;

  db.perform(data => {
    const board = data.pictracker?.[message.guild.id];
    if (!board || !board.channelId) return;
    if (message.channelId !== board.channelId) return;
    if (!message.attachments.size) return;

    const images = Array.from(message.attachments.values()).filter(a =>
      a.contentType?.startsWith('image/'),
    );
    if (images.length === 0) return;

    // Neue Woche automatisch starten, falls nötig
    if (Date.now() > board.end) {
      data.pictracker[message.guild.id] = {
        users: {},
        ...getWeekRange(),
        channelId: board.channelId,
      };
    }

    const userId = message.author.id;
    board.users[userId] = (board.users[userId] || 0) + images.length;
  });
});
