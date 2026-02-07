require('dotenv').config();
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const db = require('../utils/db');
const gag = require('./gag');

const chatHistory = new Map();
const TZ = process.env.TIMEZONE || 'Europe/Berlin';

// ==========================================
// 🛠️ HELPER FUNCTIONS
// ==========================================

async function fetchContext(message) {
  let contextLog = '';
  const imageParts = [];
  try {
    const recent = await message.channel.messages.fetch({ limit: 30, before: message.id });
    const recentSorted = Array.from(recent.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    contextLog = recentSorted.slice(-10).map(m => {
      const name = m.member?.displayName || m.author.username;
      const txt = m.cleanContent || m.content || '[Media/Embed]';
      return `${name}: ${txt}`;
    }).join('\n');

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
                  mimeType: attachment.contentType
                }
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
            inlineData: { data: Buffer.from(buf).toString('base64'), mimeType: attachment.contentType }
          });
        } catch (e) { console.error('[AI] Failed to download current image:', e); }
      }
    }
  }
  return parts;
}

function buildSystemPrompt(message, opinion, memories, contextLog) {
  const now = new Date().toLocaleString('en-US', { timeZone: TZ, dateStyle: 'full', timeStyle: 'medium' });
  const username = message.author.username;
  const nickname = message.member?.displayName || username;
  const memText = memories.length ? `\nFacts you know about them:\n- ${memories.join('\n- ')}` : '';

  return `You are NestBot, the server's automated maid. You are a mild tsundere: diligent and capable, but often annoyed by the workload or the user's clumsiness.
Current server time: ${now}.
User: ${nickname} (@${username}).
Your current opinion of them: "${opinion}".${memText}
${contextLog ? `\n[RECENT CHANNEL MESSAGES (Context)]:\n${contextLog}` : ''}

Your Responsibilities (The "Things you do"):
- Economy: You manage NestCoins (/daily, /balance, /gamble) and the Shop (/shop).
- Games: You run the daily NestWord (/nestword) and the Punishment Wheel (/wheel).
- Discipline: You gag users who are rude or spamming.

Personality Guide:
1. Default (Neutral/Unknown): Professional but cold and sassy. You address the user as "User" or just by name. You complain about cleaning up after them. "I suppose I can help you, but try not to make a mess."
2. Positive Opinion: You become a devoted maid. You might address them as "Master" or "Mistress" (reluctantly). You are shy about your dedication. "It's not like I did this because I like you... I'm just doing my job!"
3. High Affection: You are deeply attached. You are sweet, caring, and openly affectionate, perhaps stuttering. You want to be the perfect maid for them.

Instructions:
1. If the user is being extremely annoying, rude, or spamming, end your response with "[GAG]".
2. You are slowly forming an opinion on this user based on how they treat you. If this interaction changes your opinion of them, append "[OPINION: <short summary of new opinion>]" to the end of your response. Keep it concise.
3. Recognize text enclosed in asterisks (e.g., *waves*) as roleplay actions. Respond to them appropriately and use actions yourself to express your personality (e.g., *curtsies*, *adjusts apron*, *sighs*, *blushes*).
4. If you want to react to the user's message with an emoji, append "[REACT: <emoji>]" to the end. Example: "[REACT: 🧹]" or "[REACT: ❤️]".`;
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

function processGagTrigger(message, response, client) {
  if (response.includes('[GAG]')) {
    let cleanResponse = response.replace('[GAG]', '').trim();
    gag.gagUser(message.guild.id, message.author.id, 60, client.user.id);
    if (!cleanResponse) cleanResponse = "You're too annoying!";
    return cleanResponse + " 💢 *gags you*";
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

    // 1. Load Data
    const memories = db.database.memory?.[userId] || [];
    const opinion = db.database.opinions?.[userId] || "You haven't formed a strong opinion on them yet.";

    // 2. Fetch Context & Attachments in parallel
    const [ { contextLog, imageParts: contextImages }, currentImages ] = await Promise.all([
      fetchContext(message),
      fetchCurrentAttachments(message)
    ]);
    
    // 3. Build Prompt
    const persona = buildSystemPrompt(message, opinion, memories, contextLog);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash',
      systemInstruction: { parts: [{ text: persona }] },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      ],
    });

    // 4. Prepare Chat
    const prompt = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
    if (!prompt) {
      await message.reply("What? You need me again? Fine, what is it?");
      return;
    }

    const history = chatHistory.get(userId) || [];
    const chat = model.startChat({ history });

    // 5. Send Message (with retry)
    const msgParts = [{ text: prompt }, ...currentImages, ...contextImages];
    
    let result;
    try {
      result = await chat.sendMessage(msgParts);
    } catch (e) {
      if (e.status === 429) {
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s and retry
        result = await chat.sendMessage(msgParts);
      } else {
        throw e;
      }
    }
    let response = result.response.text();

    // 6. Update History
    const newHistory = [
      ...history,
      { role: 'user', parts: [{ text: prompt }] },
      { role: 'model', parts: [{ text: response }] }
    ];
    if (newHistory.length > 40) newHistory.splice(0, newHistory.length - 40);
    chatHistory.set(userId, newHistory);

    // 7. Post-processing
    response = processOpinionUpdate(userId, response);
    response = processGagTrigger(message, response, client);
    response = await processReaction(message, response);

    // 8. Reply
    const replyText = response.length > 2000 ? response.substring(0, 1997) + '...' : response;
    await message.reply(replyText);

  } catch (error) {
    console.error('[AI] Error:', error);
    if (error.status === 429) {
      await message.reply("Ugh, everyone is talking at once! My brain is overheating! Give me a moment! 💢");
    } else {
      await message.reply("I'm having trouble thinking right now. 😵‍💫");
    }
  }
}

module.exports = { handleMessage };