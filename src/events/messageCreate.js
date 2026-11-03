// Runs for every message in the server.
const ai = require('../services/ai');
const gag = require('../services/gag');
const blindfold = require('../services/blindfold');
const watch = require('../services/watch');
const { countImages } = require('../services/pictracker');
const wordle = require('../services/wordle');

module.exports = async function onMessage(message) {
  try {
    if (!message.guild) return;

    // Movie night rooms: keep the check-in / live clock at the bottom
    watch.onRoomMessage(message);
    // Group channels: keep the group panel at the bottom
    require('../services/groups').onGroupMessage(message);

    // 0. The Wordle app's daily results (posted by an app, so before the
    //    "ignore bots" check). Only in the channel set with /settings channels.
    if (message.author.bot) {
      await wordle.processMessage(message);
      return;
    }

    // 1. Blindfolded members miss this message: count it, whisper mentions
    await blindfold.onMessage(message);

    // 2. Gagged members: their message is replaced by a garbled version
    if (await gag.handleGaggedMessage(message)) return;

    // Easter: bunnies hop, eggs hide under messages
    const easter = require('../services/easter');
    await easter.maybeHop(message);
    await easter.maybeEgg(message);

    // 3. AI chat, but only for a real @NestBot. Replying to one of the bot's
    //    messages also counts as a mention in Discord, so that's ignored,
    //    as are @everyone/@here and role pings.
    const pinged = message.mentions.has(message.client.user, {
      ignoreRepliedUser: true,
      ignoreEveryone: true,
      ignoreRoles: true,
    });
    if (pinged) return ai.handleMessage(message, message.client);

    // 4. Picture tracker
    countImages(message);
  } catch (e) {
    console.error('messageCreate error:', e);
  }
};
