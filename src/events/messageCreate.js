// Runs for every message in the server.
const ai = require('../services/ai');
const gag = require('../services/gag');
const { countImages } = require('../services/pictracker');

module.exports = async function onMessage(message) {
  try {
    if (!message.guild || message.author.bot) return;

    // 1. Gagged members: their message is replaced by a garbled version
    if (await gag.handleGaggedMessage(message)) return;

    // 2. AI chat, but only for a real @NestBot. Replying to one of the bot's
    //    messages also counts as a mention in Discord, so that's ignored,
    //    as are @everyone/@here and role pings.
    const pinged = message.mentions.has(message.client.user, {
      ignoreRepliedUser: true,
      ignoreEveryone: true,
      ignoreRoles: true,
    });
    if (pinged) return ai.handleMessage(message, message.client);

    // 3. Picture tracker
    countImages(message);
  } catch (e) {
    console.error('messageCreate error:', e);
  }
};
