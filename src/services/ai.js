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
// 🛠️ HELPER FUNCTIONS
// ==========================================

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
1. Recognize text enclosed in asterisks (e.g., *waves*) as roleplay actions. Respond to them appropriately and use actions yourself to express your personality (e.g., *sighs*, *looks away*, *blushes*).`;
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
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const userId = message.author.id;
    const guildId = message.guild.id;
    totalRequests++;

    // 2. Fetch Context & Attachments in parallel
    const contextLog = await fetchContext(message);

    // 3. Fetch Dynamic Data (Shop & Balance)
    const userBalance = nestcoins.getBalance(guildId, userId);

    // 4. Fetch Daily Word
    const today = getToday();
    const dailyWord = db.database.nestwordDaily?.[today]?.answer;

    // 5. Build Prompt
    const persona = buildSystemPrompt(
      message,
      contextLog,
      userBalance,
      dailyWord,
    );

    // 4. Prepare Chat
    const prompt = message.content
      .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
      .trim();
    if (!prompt) {
      await message.reply('What? You need me again? Fine, what is it?');
      return;
    }

    let response = null;
    let lastError = null;

    // 5. Try Models (Failover Strategy)
    for (const modelName of MODELS) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: { parts: [{ text: persona }] },
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          ],
        });

        // Retry loop for this specific model
        let retries = 0;
        while (true) {
          try {
            const result = await model.generateContent(prompt);
            response = result.response.text();
            break; // Success
          } catch (e) {
            if (e.status === 429 && retries < 1) {
              retries++;
              const delay = 1500 + Math.random() * 1000;
              console.warn(`[AI] ${modelName} 429. Retrying in ${Math.floor(delay)}ms...`);
              await message.channel.sendTyping().catch(() => {});
              await new Promise(r => setTimeout(r, delay));
            } else {
              throw e;
            }
          }
        }
        
        if (response) break; // We got a response, stop trying models

      } catch (e) {
        lastError = e;
        if (e.status === 429) lastRateLimit = Date.now();
        console.warn(`[AI] Model ${modelName} failed: ${e.message}`);
      }
    }

    if (!response) {
      failedRequests++;
      throw lastError || new Error('All models failed');
    }


    // 8. Reply
    const replyText =
      response.length > 2000 ? response.substring(0, 1997) + '...' : response;
    await message.reply(replyText);
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

module.exports = { handleMessage, getStatus };
