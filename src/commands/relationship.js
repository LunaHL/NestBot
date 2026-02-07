const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../utils/db');

// Helper for progress bar
function getProgressBar(value, max = 100) {
  const size = 15;
  const percent = Math.min(Math.max(value, 0), max) / max;
  const filled = Math.round(size * percent);
  const empty = size - filled;
  return '`' + '█'.repeat(filled) + '░'.repeat(empty) + '`';
}

async function generateAffectionScore(opinion) {
  if (!process.env.GEMINI_API_KEY) return 50;
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = `Analyze this opinion of a user: "${opinion}".
    Rate the affection level from 0 to 100 (0=hate, 50=neutral, 100=love).
    Return ONLY the integer number.`;
    
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const score = parseInt(text.match(/\d+/)?.[0] || '50', 10);
    return score;
  } catch (e) {
    console.error('[Relationship] Score generation failed:', e);
    return 50;
  }
}

async function sendRandomAffectionDM(client) {
  if (!process.env.GEMINI_API_KEY) return;
  
  // 1. Get candidates
  const opinions = db.database.opinions || {};
  const userIds = Object.keys(opinions);
  if (userIds.length === 0) return;

  // 2. Pick random
  const userId = userIds[Math.floor(Math.random() * userIds.length)];
  const opinion = opinions[userId];

  // 3. Check affection via AI
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const prompt = `You are NestBot, a mild tsundere Discord bot.
    Your opinion of the user (ID: ${userId}) is: "${opinion}".
    
    Task:
    1. Determine if this represents "High Affection" (close friend, love, very positive).
    2. If YES, write a short, sweet (but slightly shy/tsundere) DM to them just to say hi or check in.
    3. If NO, return "SKIP".
    
    Output format: Just the message or "SKIP".`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    if (text === 'SKIP' || text.length < 5) return;

    // 4. Send DM
    const user = await client.users.fetch(userId).catch(() => null);
    if (user) {
      await user.send(text).catch(() => console.log(`[Relationship] Could not DM user ${userId} (DMs likely closed)`));
      console.log(`[Relationship] Sent affection DM to ${user.tag}`);
    }
  } catch (e) {
    console.error('[Relationship] DM generation failed:', e);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('relationship')
    .setDescription('Check your relationship status with NestBot')
    .addUserOption(opt => opt.setName('user').setDescription('Check for another user')),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const opinion = db.database.opinions?.[target.id] || "I haven't formed a strong opinion on them yet.";

    await interaction.deferReply();

    const score = await generateAffectionScore(opinion);
    
    let status = 'Neutral';
    if (score < 30) status = 'Disliked';
    if (score < 10) status = 'Enemy';
    if (score > 60) status = 'Liked';
    if (score > 85) status = 'Love / Best Friend';

    const embed = new EmbedBuilder()
      .setTitle(`Relationship Status: ${target.username}`)
      .setColor(score > 50 ? '#ff69b4' : '#5865F2')
      .addFields(
        { name: 'Opinion', value: `*${opinion}*` },
        { name: 'Affection Level', value: `${getProgressBar(score)} **${score}%**` },
        { name: 'Status', value: status }
      )
      .setThumbnail(target.displayAvatarURL());

    await interaction.editReply({ embeds: [embed] });
  },

  schedule(client) {
    // Run every 6 hours
    const interval = 6 * 60 * 60 * 1000; 
    
    // Initial offset to not run immediately on boot
    setTimeout(() => {
      sendRandomAffectionDM(client);
      setInterval(() => sendRandomAffectionDM(client), interval);
    }, 60000); // 1 min after boot
  }
};