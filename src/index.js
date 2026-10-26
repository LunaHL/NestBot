require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./utils/db');
const gag = require('./services/gag');
const ai = require('./services/ai');
const { startCleanup } = require('./services/cleanup');
const { startHalloween } = require('./services/halloween');
const gagRepostLimiter = new Map(); // key: `${guildId}:${userId}` -> { lastPost: number, dropped: number }
const GAG_REPOST_COOLDOWN_MS = 1200; // bot repost max ~1 per 1.2s per user
const GAG_DROP_NOTICE_EVERY = 8;     // optional: every 8 dropped msgs, send a small notice
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
    const daily = data.nestwordDaily?.[yesterday];

    if (daily && daily.guesses && Object.keys(daily.guesses).length > 0) {
      const lines = [];

      for (const [userId, tries] of Object.entries(daily.guesses)) {
        const solved = daily.solvedBy?.includes(userId);
        lines.push(
          `• <@${userId}> — ${solved ? `✅ ${tries} tries` : `❌ ${tries} tries`}`,
        );
      }

      if (lines.length > 0) {
        const header =
          `📊 **NestWord Results for ${yesterday}**\n` +
          `• Length: **${daily.len}**\n` +
          `• Attempts allowed: **${daily.attempts}**\n` +
          `• Reward: **${daily.reward}** NestCoins\n`;

        const summary = header + '\n' + lines.join('\n');
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
    // Old entries are removed by services/cleanup.js
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
  startCleanup();
  startHalloween(client);
  ai.checkModels();
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
    // If the command already replied/deferred, reply() would throw again
    const msg = { content: '❌ Error executing this command.', flags: 64 };
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
    } catch (e) {
      console.error('Failed to send error message:', e);
    }
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

// 📸 Track all image uploads + gag feature
client.on('messageCreate', async message => {
  try {
    if (!message.guild || message.author.bot) return;

    // 🔇 GAG FEATURE
    const guildId = message.guild.id;
    const userId = message.author.id;

    if (gag.isGagged(guildId, userId)) {
      const garbled = gag.garble(message.content);

      // 1) ALWAYS try to delete the readable original (this is the key)
      const me = message.guild.members.me;
      const canDelete = me?.permissionsIn(message.channel)?.has('ManageMessages');

      if (canDelete) {
        await message.delete().catch(() => {});
      } else {
        // If you can't delete, you can't prevent readable spam reliably.
        // Best fallback: react + repost garbled (but it will still be readable in original).
        await message.react('🔇').catch(() => {});
      }

      // 2) Rate-limit BOT reposts (but originals are already gone when canDelete=true)
      const key = `${guildId}:${userId}`;
      const now = Date.now();

      let state = gagRepostLimiter.get(key);
      if (!state) state = { lastPost: 0, dropped: 0, punishedAt: 0 };

      if (now - state.lastPost < GAG_REPOST_COOLDOWN_MS) {
        state.dropped++;

        // Spam Punishment
        if (state.dropped % GAG_DROP_NOTICE_EVERY === 0) {
          const now2 = Date.now();

          // throttle punishment: max every 5 seconds (so it doesn't escalate)
          if (now2 - (state.punishedAt || 0) > 5000) {
            const doubled = gag.doubleRemaining(guildId, userId);
            if (doubled) state.punishedAt = now2;
          }

          const remainingSec = Math.ceil(gag.getRemainingMs(guildId, userId) / 1000);
          const remainingMin = Math.ceil(remainingSec / 60);

          await message.channel.send({
            content: `⛓️🔇 **${message.member?.displayName || message.author.username}** spam detected. Gag time doubled. **~${remainingMin} min** left.`,
            allowedMentions: { parse: [] },
          }).catch(() => {});

          // counts as "post" for cooldown (so it doesn't spam)
        }

        gagRepostLimiter.set(key, state);
        return;
      }

      // Allowed to repost now
      state.lastPost = now;
      gagRepostLimiter.set(key, state);

      if (garbled && garbled.trim()) {
        const remainingSec = Math.ceil(gag.getRemainingMs(guildId, userId) / 1000);
        await message.channel.send({
          content: `🔇 **${message.member?.displayName || message.author.username}**: ${garbled}\n*(gagged • ${remainingSec}s left)*`,
          allowedMentions: { parse: [] },
        }).catch(() => {});
      }

      return;

    }

    // 🤖 AI Reply on Ping
    // Only a real @NestBot counts. Replying to one of the bot's messages
    // (puzzle posts, scoreboards, ...) also "mentions" it, so ignore that,
    // plus @everyone/@here and role pings.
    const pinged = message.mentions.has(client.user, {
      ignoreRepliedUser: true,
      ignoreEveryone: true,
      ignoreRoles: true,
    });
    if (pinged) {
      await ai.handleMessage(message, client);
      return;
    }

    // 🖼️ PICTURE TRACKER 
    // Only touch the DB for image posts in the tracked channel
    if (!message.attachments.size) return;
    const trackedChannel = db.read(
      data => data.pictracker?.[message.guild.id]?.channelId,
    );
    if (!trackedChannel || message.channelId !== trackedChannel) return;

    const images = Array.from(message.attachments.values()).filter(a =>
      a.contentType?.startsWith('image/'),
    );
    if (images.length === 0) return;

    db.perform(data => {
      let board = data.pictracker[message.guild.id];

      if (Date.now() > board.end) {
        board = data.pictracker[message.guild.id] = {
          users: {},
          ...getWeekRange(),
          channelId: board.channelId,
        };
      }

      const userId2 = message.author.id;
      board.users[userId2] = (board.users[userId2] || 0) + images.length;
    });
  } catch (e) {
    console.error('messageCreate error:', e);
  }
});