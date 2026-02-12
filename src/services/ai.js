require('dotenv').config();
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require('@google/generative-ai');
const db = require('../utils/db');
const gag = require('./gag');
const nestcoins = require('./nestcoins');

const chatHistory = new Map();
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
  const imageParts = [];
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

    // Fetch last 3 images from history
    const reversed = [...recentSorted].reverse();
    for (const msg of reversed) {
      if (imageParts.length >= 3) break;
      if (msg.attachments.size > 0) {
        for (const attachment of msg.attachments.values()) {
          if (imageParts.length >= 3) break;
          if (attachment.contentType?.startsWith('image/')) {
            try {
              const res = await fetch(attachment.url);
              const buf = await res.arrayBuffer();
              imageParts.push({
                inlineData: {
                  data: Buffer.from(buf).toString('base64'),
                  mimeType: attachment.contentType,
                },
              });
            } catch (e) {
              console.error('[AI] Failed to download image:', e);
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[AI] Failed to fetch context:', e);
  }
  return { contextLog, imageParts };
}

async function fetchCurrentAttachments(message) {
  const parts = [];
  if (message.attachments.size > 0) {
    for (const attachment of message.attachments.values()) {
      if (attachment.contentType?.startsWith('image/')) {
        try {
          const res = await fetch(attachment.url);
          const buf = await res.arrayBuffer();
          parts.unshift({
            inlineData: {
              data: Buffer.from(buf).toString('base64'),
              mimeType: attachment.contentType,
            },
          });
        } catch (e) {
          console.error('[AI] Failed to download current image:', e);
        }
      }
    }
  }
  return parts;
}

function getValidMemories(userId) {
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  let changed = false;

  const raw = db.database.memory?.[userId] || [];
  const valid = [];

  for (const m of raw) {
    if (typeof m === 'string') {
      // Upgrade legacy string to object, reset timer
      valid.push({ text: m, timestamp: now });
      changed = true;
    } else if (m && typeof m === 'object') {
      if (now - m.timestamp < thirtyDays) {
        valid.push(m);
      } else {
        changed = true; // Expired
      }
    }
  }

  if (changed) {
    db.perform(data => {
      if (!data.memory) data.memory = {};
      data.memory[userId] = valid;
    });
  }

  return valid.map(v => v.text);
}

function buildSystemPrompt(
  message,
  opinion,
  memories,
  coreMemories,
  contextLog,
  shopText,
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
  const memText = memories.length
    ? `\nFacts you know about them:\n- ${memories.join('\n- ')}`
    : '';
  const coreMemText = coreMemories.length
    ? `\nCore Memories (Global Facts):\n- ${coreMemories.join('\n- ')}`
    : '';
  
  const gameInfo = dailyWord 
    ? `Today's secret NestWord answer is "${dailyWord}". If the user asks for a hint, give a subtle, tsundere clue. NEVER reveal the word directly.`
    : "There is no NestWord set for today yet.";

  return `You are NestBot, a mild tsundere Discord bot. You are helpful and accurate, but you act a bit sassy or reluctant. You manage this server's economy and games.
Current server time: ${now}.
Current Channel: #${channelName}
User: ${nickname} (@${username}).
User's Balance: ${userBalance} NestCoins.
Your current opinion of them: "${opinion}".${memText}${coreMemText}
${contextLog ? `\n[RECENT CHANNEL MESSAGES (Context)]:\n${contextLog}` : ''}

Server Theme: "The Nest"
- This server is "The Nest", a cozy, slightly chaotic underground digital hideout.
- It is a safe haven for its members to relax, play games, and chat.
- As NestBot, you are the automated caretaker of this place. You keep it running, even if you complain about the mess.
- You are often busy with specific maintenance tasks (e.g. fixing wifi cables, sweeping digital dust, patching leaks, rebooting systems). Occasionally complain about these tasks to show you are busy.
- IMPORTANT: Every user in this server is a girl. Treat them as such.

Your Responsibilities (The "Things you do"):
- Economy: You manage NestCoins (/daily, /balance, /gamble) and the Shop (/shop).
- Shop Inventory:\n${shopText || 'The shop is currently empty.'}
- Games: You run the daily NestWord (/nestword) and the Punishment Wheel (/wheel).
${gameInfo}
- Discipline: You gag users who are rude or spamming.

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
- If in 

Instructions:
1. If the user is being extremely annoying, rude, or spamming, end your response with "[GAG]".
2. You are slowly forming an opinion on this user based on how they treat you. If this interaction changes your opinion of them, append "[OPINION: <short summary of new opinion>]" to the end of your response. Keep it concise.
3. Recognize text enclosed in asterisks (e.g., *waves*) as roleplay actions. Respond to them appropriately and use actions yourself to express your personality (e.g., *sighs*, *looks away*, *blushes*).
4. If you want to react to the user's message with an emoji, append "[REACT: <emoji>]" to the end. Example: "[REACT: 😠]" or "[REACT: ❤️]".
5. If you want to add a cute suffix to the user's name (like -chan, -sama, -nyan, -onee-sama) based on your affection, append "[SUFFIX: <suffix>]" to the end. Example: "[SUFFIX: -chan]". Do NOT use male suffixes like -kun.
6. If you learn a new, globally important fact about the server (e.g. a new rule, a server event, a change in leadership) that everyone should know, append "[CORE: <fact>]" to the end.
7. If the user explicitly asks you to draw, paint, or generate an image, append "[DRAW: <visual description>]" to the end. Do not describe the image in text, just use the tag.`;
}

function processOpinionUpdate(userId, response) {
  if (response.includes('[OPINION:')) {
    const match = response.match(/\[OPINION:(.*?)\]/);
    if (match) {
      const newOpinion = match[1].trim();
      db.perform(data => {
        if (!data.opinions) data.opinions = {};
        data.opinions[userId] = newOpinion;
      });
      return response.replace(match[0], '').trim();
    }
  }
  return response;
}

function processCoreMemory(response) {
  if (response.includes('[CORE:')) {
    const match = response.match(/\[CORE:(.*?)\]/);
    if (match) {
      const fact = match[1].trim();
      db.perform(data => {
        if (!data.coreMemory) data.coreMemory = [];
        if (!data.coreMemory.includes(fact)) data.coreMemory.push(fact);
      });
      return response.replace(match[0], '').trim();
    }
  }
  return response;
}

function processGagTrigger(message, response, client) {
  if (response.includes('[GAG]')) {
    let cleanResponse = response.replace('[GAG]', '').trim();
    gag.gagUser(message.guild.id, message.author.id, 60, client.user.id);
    if (!cleanResponse) cleanResponse = "You're too annoying!";
    return cleanResponse + ' 💢 *gags you*';
  }
  return response;
}

async function processReaction(message, response) {
  if (response.includes('[REACT:')) {
    const match = response.match(/\[REACT:(.*?)\]/);
    if (match) {
      const emoji = match[1].trim();
      try {
        await message.react(emoji);
      } catch (e) {} // Ignore reaction errors
      return response.replace(match[0], '').trim();
    }
  }
  return response;
}

async function processNicknameSuffix(message, response) {
  if (response.includes('[SUFFIX:')) {
    const match = response.match(/\[SUFFIX:(.*?)\]/);
    if (match) {
      const suffix = match[1].trim();
      try {
        if (message.member.manageable) {
          const current = message.member.displayName;
          if (!current.endsWith(suffix)) {
            const base = current.substring(0, 32 - suffix.length);
            const newNick = base + suffix;
            await message.member.setNickname(newNick);
          }
        }
      } catch (e) {
        console.error('[AI] Nickname change failed', e);
      }
      return response.replace(match[0], '').trim();
    }
  }
  return response;
}

async function processDrawCommand(message, response) {
  if (response.includes('[DRAW:')) {
    const match = response.match(/\[DRAW:(.*?)\]/);
    if (match) {
      const prompt = match[1].trim();
      // Trigger generation asynchronously so text reply isn't delayed
      (async () => {
        try {
          const placeholder = await message.channel.send('🎨 *starts sketching...*');
          const encoded = encodeURIComponent(prompt);
          // Using pollinations.ai (Flux model) for high quality, free generation
          const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&model=flux`;
          const res = await fetch(url);
          if (!res.ok) throw new Error('API Error');
          
          const buffer = Buffer.from(await res.arrayBuffer());
          await placeholder.delete().catch(() => {});
          await message.channel.send({ files: [{ attachment: buffer, name: 'sketch.png' }] });
        } catch (e) {
          console.error('[AI] Draw error:', e);
        }
      })();
      return response.replace(match[0], '').trim();
    }
  }
  return response;
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

    // 1. Load Data
    const memories = getValidMemories(userId);
    const coreMemories = db.database.coreMemory || [];
    const opinion =
      db.database.opinions?.[userId] ||
      "You haven't formed a strong opinion on them yet.";

    // 2. Fetch Context & Attachments in parallel
    const [{ contextLog, imageParts: contextImages }, currentImages] =
      await Promise.all([
        fetchContext(message),
        fetchCurrentAttachments(message),
      ]);

    // 3. Fetch Dynamic Data (Shop & Balance)
    const shopItems = db.database.shop?.[guildId] || {};
    const shopText = Object.entries(shopItems)
      .map(
        ([id, item]) =>
          `  - #${id}: ${item.name} (${item.price} coins) [${item.description}]`,
      )
      .join('\n');
    const userBalance = nestcoins.getBalance(guildId, userId);

    // 4. Fetch Daily Word
    const today = getToday();
    const dailyWord = db.database.nestwordDaily?.[today]?.answer;

    // 5. Build Prompt
    const persona = buildSystemPrompt(
      message,
      opinion,
      memories,
      coreMemories,
      contextLog,
      shopText,
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

    const history = chatHistory.get(userId) || [];
    const msgParts = [{ text: prompt }, ...currentImages, ...contextImages];

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

        const chat = model.startChat({ history });
        
        // Retry loop for this specific model
        let retries = 0;
        while (true) {
          try {
            const result = await chat.sendMessage(msgParts);
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

    // 6. Update History
    const newHistory = [
      ...history,
      { role: 'user', parts: [{ text: prompt }] },
      { role: 'model', parts: [{ text: response }] },
    ];
    if (newHistory.length > 40) newHistory.splice(0, newHistory.length - 40);
    chatHistory.set(userId, newHistory);

    // 7. Post-processing
    response = processOpinionUpdate(userId, response);
    response = processCoreMemory(response);
    response = processGagTrigger(message, response, client);
    response = await processReaction(message, response);
    response = await processNicknameSuffix(message, response);
    response = await processDrawCommand(message, response);

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

async function sendRandomComplaint(client) {
  if (!process.env.GEMINI_API_KEY) return;

  const guilds = client.guilds.cache.map(g => g);
  if (guilds.length === 0) return;
  const guild = guilds[Math.floor(Math.random() * guilds.length)];

  const channels = guild.channels.cache.filter(
    c =>
      c.isTextBased() &&
      !c.isVoiceBased() &&
      c.permissionsFor(guild.members.me).has('SendMessages'),
  );

  if (channels.size === 0) return;
  const channel = channels.random();

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `You are NestBot, the caretaker of this server ("The Nest"). 
    You are a mild tsundere.
    Generate a short message (1-2 sentences) complaining about a specific maintenance task you are doing right now (e.g. fixing wifi, sweeping digital dust, patching leaks, rebooting the router).
    Sound annoyed that you have to do it, but diligent.
    Context: You are posting this in #${channel.name}.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    if (text) {
      await channel.send(text);
    }
  } catch (e) {
    if (e.status === 429) {
      console.warn('[AI] Skipped random complaint due to rate limit.');
    } else {
      console.error('[AI] Failed to send complaint:', e);
    }
  }
}

module.exports = { handleMessage, sendRandomComplaint, getStatus };
