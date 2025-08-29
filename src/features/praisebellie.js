import { Events } from 'discord.js';

const BELLIE_ID = '450785823458066433';

export function setupPraiseBellie(client) {
  // When Bellie uses any slash command
  client.on(Events.InteractionCreate, async (i) => {
    try {
      if (!i.user || i.user.id !== BELLIE_ID) return;
      if (!i.isChatInputCommand()) return;
      await i.followUp({
        content: `Aww ${i.user}, you’re so cute~ 💖`,
        ephemeral: false
      }).catch(() => {});
    } catch {}
  });

  // When Bellie pings the bot in chat
  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (msg.author.bot) return;
      if (msg.author.id !== BELLIE_ID) return;
      if (!msg.mentions.users.has(client.user.id)) return;

      await msg.channel.send(`Aww ${msg.author}, you’re so cute~ 💖`).catch(() => {});
    } catch {}
  });
}
