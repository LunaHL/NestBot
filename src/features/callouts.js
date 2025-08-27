import { Events } from 'discord.js';
import { CALLOUT_COOLDOWN_MS, CALLOUT_LAST, looksLikeCallout } from '../utils.js';

export function setupCallouts(client) {
  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (!msg.guild || msg.author.bot) return;

      // require an actual mention to avoid random triggers
      if (!msg.mentions.users.has(client.user.id)) return;

      const last = CALLOUT_LAST.get(msg.author.id) || 0;
      if (Date.now() - last < CALLOUT_COOLDOWN_MS) return;

      if (looksLikeCallout(msg.content)) {
        CALLOUT_LAST.set(msg.author.id, Date.now());
        const comebacks = [
          "wobot? rude. it’s **NestBot**, darling 😼",
          "I’ve got *plenty* to say. Sweet or sizzling?",
          "Bold to poke the machine that spins punishments.",
          "Processing sass… 100%. Want a side of wheel with that?",
          "Say please. Then maybe I’ll purr."
        ];
        const line = comebacks[Math.floor(Math.random() * comebacks.length)];
        await msg.reply(line).catch(()=>{});
      }
    } catch {}
  });
}
