import { Events } from 'discord.js';
import { cfg } from '../config.js';
import { save } from '../store.js';
import { maybeSass } from '../utils.js';

export function setupSass(client) {
  // /sass
  client.on(Events.InteractionCreate, async (i) => {
    if (!i.isChatInputCommand() || i.commandName !== 'sass') return;
    const c = cfg(i.guildId);
    const mode = i.options.getString('mode');
    const chance = i.options.getInteger('chance');
    if (mode === 'on') c.sassEnabled = true;
    if (mode === 'off') c.sassEnabled = false;
    if (chance !== null) c.sassChance = chance;
    save();
    return i.reply({ content: `Sassy Mode: **${c.sassEnabled ? 'ON' : 'OFF'}** • Chance: **${c.sassChance}%**`, ephemeral: true });
  });

  // complaint listener
  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (!msg.guild || msg.author.bot) return;
      const t = msg.content.toLowerCase();
      if (/(too hard|unfair|pls|please end|i can'?t|stop it)/i.test(t)) {
        maybeSass(msg, 'complain');
      }
    } catch {}
  });
}
