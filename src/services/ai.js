require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../utils/db');
const gag = require('./gag');

const chatHistory = new Map();
const TZ = process.env.TIMEZONE || 'Europe/Berlin';

async function handleMessage(message, client) {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[AI] Ping received but GEMINI_API_KEY is missing.');
    return;
  }

  await message.channel.sendTyping();

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    const now = new Date().toLocaleString('en-US', { timeZone: TZ, dateStyle: 'full', timeStyle: 'medium' });
    
    // 🧠 Load Memory & Identity
    const userId = message.author.id;
    const username = message.author.username;
    const nickname = message.member?.displayName || username;
    const memories = db.database.memory?.[userId] || [];
    const opinion = db.database.opinions?.[userId] || "You haven't formed a strong opinion on them yet.";
    
    const memText = memories.length ? `\nFacts you know about them:\n- ${memories.join('\n- ')}` : '';

    // 📜 Fetch Recent Chat Context (Last 10 messages + Last 3 Images)
    let contextLog = '';
    const imageParts = [];
    try {
      const recent = await message.channel.messages.fetch({ limit: 30, before: message.id });
      const recentSorted = Array.from(recent.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      contextLog = recentSorted.slice(-10).map(m => {
        const name = m.member?.displayName || m.author.username;
        const txt = m.content || '[Media/Embed]';
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

    const persona = `You are NestBot, a mild tsundere Discord bot. You are helpful and accurate, but you act a bit sassy or reluctant. 
Current server time: ${now}.
User: ${nickname} (@${username}).
Your current opinion of them: "${opinion}".${memText}
${contextLog ? `\n[RECENT CHANNEL MESSAGES (Context)]:\n${contextLog}` : ''}

Instructions:
1. If the user is being extremely annoying, rude, or spamming, end your response with "[GAG]".
2. You are slowly forming an opinion on this user. If this interaction changes your opinion of them, append "[OPINION: <short summary of new opinion>]" to the end of your response. Keep it concise.
3. Recognize text enclosed in asterisks (e.g., *waves*) as roleplay actions. Respond to them appropriately and use actions yourself to express your personality (e.g., *sighs*, *looks away*).`;
    
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash',
      systemInstruction: { parts: [{ text: persona }] }
    });

    // Remove the bot's mention from the prompt
    const prompt = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
    
    if (!prompt) {
      await message.reply("What? You need me again? Fine, what is it?");
      return;
    }

    // 📜 Chat History
    const history = chatHistory.get(message.author.id) || [];
    const chat = model.startChat({ history });
    
    // Check current message for images
    if (message.attachments.size > 0) {
      for (const attachment of message.attachments.values()) {
        if (attachment.contentType?.startsWith('image/')) {
          try {
            const res = await fetch(attachment.url);
            const buf = await res.arrayBuffer();
            imageParts.unshift({
              inlineData: { data: Buffer.from(buf).toString('base64'), mimeType: attachment.contentType }
            });
          } catch (e) { console.error('[AI] Failed to download current image:', e); }
        }
      }
    }

    const msgParts = [{ text: prompt }, ...imageParts];
    
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

    // Update history (keep last 20 turns)
    const newHistory = [
      ...history,
      { role: 'user', parts: [{ text: prompt }] },
      { role: 'model', parts: [{ text: response }] }
    ];
    if (newHistory.length > 40) newHistory.splice(0, newHistory.length - 40);
    chatHistory.set(message.author.id, newHistory);

    // Parse Opinion Updates
    if (response.includes('[OPINION:')) {
      const match = response.match(/\[OPINION:(.*?)\]/);
      if (match) {
        const newOpinion = match[1].trim();
        db.perform(data => {
          if (!data.opinions) data.opinions = {};
          data.opinions[userId] = newOpinion;
        });
        response = response.replace(match[0], '').trim();
      }
    }

    if (response.includes('[GAG]')) {
      response = response.replace('[GAG]', '').trim();
      gag.gagUser(message.guild.id, message.author.id, 60, client.user.id);
      if (!response) response = "You're too annoying!";
      response += " 💢 *gags you*";
    }

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