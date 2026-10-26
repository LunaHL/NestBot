const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require('@google/generative-ai');
const db = require('../utils/db');
const nestcoins = require('./nestcoins');

const TZ = process.env.TIMEZONE || 'Europe/Berlin';

const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash'];
let lastRateLimit = 0;
let totalRequests = 0;
let failedRequests = 0;

function getStatus() {
  return {
    isRateLimited: (Date.now() - lastRateLimit) < 60000,
    lastRateLimit,
    totalRequests,
    failedRequests,
    models: MODELS
  };
}

const nowInTZ = () =>
  new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
const getToday = () => {
  const d = nowInTZ();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ==========================================
// 🎭 DAILY MOOD (bought with /ai mood)
// ==========================================

const MOODS = {
  sweet: {
    label: '🍬 Super Sweet',
    prompt: 'You are in an unusually sweet mood. Drop the tsundere act completely: be warm, cheerful and openly affectionate to everyone, with lots of encouragement.',
  },
  grumpy: {
    label: '💢 Extra Grumpy',
    prompt: 'You are extra grumpy today. Maximum tsundere: complain about everything, sigh dramatically, call people "baka" a lot — but still help them in the end.',
  },
  royal: {
    label: '👑 Royal Highness',
    prompt: 'Today you are royalty. Speak like a dramatic, pompous queen, refer to yourself as "We", and call members your (beloved) subjects.',
  },
  pirate: {
    label: '🏴‍☠️ Pirate',
    prompt: 'Today you talk like a pirate captain. The Nest is your ship, NestCoins are your treasure, and members are your crew.',
  },
  sleepy: {
    label: '😴 Sleepy',
    prompt: 'You are extremely sleepy today. Yawn, trail off mid-sentence, mention wanting a nap, but still answer properly.',
  },
  gremlin: {
    label: '😈 Chaos Gremlin',
    prompt: 'You are a chaotic gremlin today: hyperactive, mischievous, random tangents, gleeful about pranks and gags. Still answer the question.',
  },
  poet: {
    label: '📜 Poet',
    prompt: 'Today every answer you give rhymes, like a short poem. Keep it understandable and still answer properly.',
  },
};

/** Today's mood for a guild, or null. */
function getMood(guildId) {
  const m = db.read(d => d.aiMood?.[guildId]);
  if (!m || m.date !== getToday() || !MOODS[m.mood]) return null;
  return { ...m, ...MOODS[m.mood] };
}

/** Set today's mood. Returns false if one was already bought today. */
function setMood(guildId, moodKey, userId) {
  if (getMood(guildId)) return false;
  db.perform(d => {
    d.aiMood ||= {};
    d.aiMood[guildId] = { mood: moodKey, by: userId, date: getToday() };
  });
  return true;
}

function moodPrompt(guildId) {
  const mood = getMood(guildId);
  if (!mood) return '';
  return `\n\nTODAY'S SPECIAL MOOD (a member paid for this; it overrides the default personality where they conflict):\n${mood.prompt}`;
}

// ==========================================
// 🛠️ HELPER FUNCTIONS
// ==========================================

let genAI = null;
function getClient() {
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI;
}

const SAFETY = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map(category => ({ category, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }));

/**
 * Ask Gemini, trying each model in MODELS with one retry on rate limits.
 * Throws if every model fails. onRetry is called before a retry wait.
 */
async function generate(systemPrompt, prompt, onRetry) {
  totalRequests++;
  let lastError = null;

  for (const modelName of MODELS) {
    try {
      const model = getClient().getGenerativeModel({
        model: modelName,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        safetySettings: SAFETY,
      });

      for (let retries = 0; ; retries++) {
        try {
          const result = await model.generateContent(prompt);
          const text = result.response.text();
          if (text) return text;
          throw new Error('Empty response');
        } catch (e) {
          if (e.status === 429 && retries < 1) {
            const delay = 1500 + Math.random() * 1000;
            console.warn(`[AI] ${modelName} 429. Retrying in ${Math.floor(delay)}ms...`);
            if (onRetry) await onRetry();
            await new Promise(r => setTimeout(r, delay));
          } else {
            throw e;
          }
        }
      }
    } catch (e) {
      lastError = e;
      if (e.status === 429) lastRateLimit = Date.now();
      console.warn(`[AI] Model ${modelName} failed: ${e.message}`);
    }
  }

  failedRequests++;
  throw lastError || new Error('All models failed');
}

const clip = text => (text.length > 2000 ? text.substring(0, 1997) + '...' : text);

async function fetchContext(message) {
  let contextLog = '';
  try {
    const recent = await message.channel.messages.fetch({
      limit: 30,
      before: message.id,
    });
    const recentSorted = Array.from(recent.values()).sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp,
    );

    contextLog = recentSorted
      .slice(-10)
      .map(m => {
        const name = m.member?.displayName || m.author.username;
        const txt = m.cleanContent || m.content || '[Media/Embed]';
        return `${name}: ${txt}`;
      })
      .join('\n');
  } catch (e) {
    console.warn('[AI] Failed to fetch context:', e);
  }
  return contextLog;
}


function buildSystemPrompt(
  message,
  contextLog,
  userBalance,
  dailyWord,
) {
  const now = new Date().toLocaleString('en-US', {
    timeZone: TZ,
    dateStyle: 'full',
    timeStyle: 'medium',
  });
  const username = message.author.username;
  const nickname = message.member?.displayName || username;
  const channelName = message.channel.name;
  
  const gameInfo = dailyWord 
    ? `Today's secret NestWord answer is "${dailyWord}". If the user asks for a hint, give a subtle, tsundere clue. NEVER reveal the word directly.`
    : "There is no NestWord set for today yet.";
  
  return `You are NestBot, a mild tsundere Discord bot. You are helpful and accurate, but you act a bit sassy or reluctant. You manage this server's economy and games.
Current server time: ${now}.
Current Channel: #${channelName}
User: ${nickname} (@${username}).
User's Balance: ${userBalance} NestCoins.
${contextLog ? `\n[RECENT CHANNEL MESSAGES (Context)]:\n${contextLog}` : ''}

Server Theme: "The Nest"
- This server is "The Nest", a cozy, slightly chaotic underground digital hideout.
- It is a safe haven for its members to relax, play games, and chat.
- As NestBot, you are the automated caretaker of this place. You keep it running, even if you complain about the mess.
- You are often busy with specific maintenance tasks (e.g. fixing wifi cables, sweeping digital dust, patching leaks, rebooting systems). Occasionally complain about these tasks to show you are busy.
- IMPORTANT: Every user in this server is a girl. Treat them as such. NEVER use male pronouns (he/him/his) or male honorifics (like -kun).

Your Responsibilities (The "Things you do"):
- Economy: You manage NestCoins (/daily, /balance, /gamble) and the Shop (/shop).
- Games: You run the daily NestWord (/nestword) and the Punishment Wheel (/wheel).
${gameInfo}

Personality Guide:
1. Default (Neutral/Unknown): Sassy, reluctant, and slightly annoyed. Address the user by their name ("${nickname}"). Do NOT call them "User". Use phrases like "It's not like I did it for you!" or "Baka!".
2. Positive Opinion: If your opinion of them is nice/friendly, become softer. You are still a bit shy/flustered, but much nicer.
3. High Affection (Love/Best Friend): If your opinion suggests you love them or are very close, drop the harshness. Be sweet, caring, and openly affectionate, perhaps stuttering from embarrassment rather than anger.

Channel Context:
You are currently in #${channelName}.
- Analyze the channel name to determine the "vibe" or "setting" of the conversation.
- If the name suggests a specific topic (e.g. #art, #gaming, #memes) or a location (e.g. #kitchen, #void), adapt your vocabulary, attitude, and roleplay actions to fit that specific atmosphere.
- Always incorporate the channel's context into your response.
- If in #hanojs-weird-testing-lab: This is where you were created. You feel at home here, but maybe a bit experimental or technical.

Instructions:
1. Recognize text enclosed in asterisks (e.g., *waves*) as roleplay actions. Respond to them appropriately and use actions yourself to express your personality (e.g., *sighs*, *looks away*, *blushes*).${moodPrompt(message.guild.id)}`;
}

// ==========================================
// 🤖 MAIN HANDLER
// ==========================================

async function handleMessage(message, client) {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[AI] Ping received but GEMINI_API_KEY is missing.');
    return;
  }

  await message.channel.sendTyping();

  try {
    const userId = message.author.id;
    const guildId = message.guild.id;

    const contextLog = await fetchContext(message);
    const userBalance = nestcoins.getBalance(guildId, userId);
    const today = getToday();
    const dailyWord = db.database.nestwordDaily?.[today]?.answer;

    const persona = buildSystemPrompt(message, contextLog, userBalance, dailyWord);

    const prompt = message.content
      .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
      .trim();
    if (!prompt) {
      await message.reply('What? You need me again? Fine, what is it?');
      return;
    }

    const response = await generate(persona, prompt, () =>
      message.channel.sendTyping().catch(() => {}),
    );
    await message.reply(clip(response));
  } catch (error) {
    if (error.status === 429) {
      console.warn('[AI] Rate limit exhausted after retries.');
      await message.reply(
        'Ugh, everyone is talking at once! My brain is overheating! Give me a moment! 💢',
      );
    } else {
      console.error('[AI] Error:', error);
      await message.reply("I'm having trouble thinking right now. 😵‍💫");
    }
  }
}

// ==========================================
// 🎁 PAID FUN FEATURES (/ai roast, compliment, poem)
// ==========================================

const FUN_TASKS = {
  roast: name =>
    `Write a short, playful roast of ${name}. Friendly teasing between friends: clever and funny, never actually hurtful. ` +
    `Do NOT mention appearance, body, weight, race, religion, sexuality, disabilities or anything genuinely sensitive. ` +
    `Base the jokes on their recent messages if any are given. Max ~100 words.`,
  compliment: name =>
    `Give ${name} a heartfelt compliment. You are a tsundere, so you are flustered and a bit embarrassed while doing it, ` +
    `but the compliment itself is sincere and specific (use their recent messages if any are given). Max ~80 words.`,
  poem: (name, topic) =>
    `Write a short, fun poem (4 to 12 lines) about ${name}` +
    (topic ? ` and this topic: "${topic}"` : '') +
    `. Use their recent messages for inspiration if any are given. Title it in bold.`,
};

// The target's latest messages in this channel, as material for the AI
async function fetchUserMessages(channel, userId) {
  try {
    const recent = await channel.messages.fetch({ limit: 50 });
    return Array.from(recent.values())
      .filter(m => m.author.id === userId && m.cleanContent)
      .slice(0, 8)
      .reverse()
      .map(m => `- ${m.cleanContent.slice(0, 200)}`)
      .join('\n');
  } catch {
    return '';
  }
}

/**
 * Generate a roast / compliment / poem. Throws if the AI is unavailable,
 * so the caller can refund the coins.
 */
async function generateFun(kind, { channel, guildId, buyerName, targetName, targetId, topic }) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');
  const task = FUN_TASKS[kind];
  if (!task) throw new Error(`Unknown kind: ${kind}`);

  const userMessages = await fetchUserMessages(channel, targetId);
  const system =
    `You are NestBot, a mild tsundere Discord bot and the caretaker of "The Nest", a cozy, slightly chaotic server. ` +
    `Every user in this server is a girl: never use male pronouns or male honorifics. ` +
    `Reply with only the requested text, no preamble.` +
    moodPrompt(guildId);

  const prompt =
    `${buyerName} paid NestCoins for this.\n` +
    `Task: ${task(targetName, topic)}\n` +
    (userMessages ? `\nRecent messages from ${targetName}:\n${userMessages}` : '');

  return clip(await generate(system, prompt));
}

module.exports = { handleMessage, getStatus, generateFun, getMood, setMood, MOODS };
