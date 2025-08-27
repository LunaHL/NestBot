import { Events } from 'discord.js';
import { cfg } from '../config.js';
import { add } from '../store.js';
import { scoreWordle } from '../utils.js';

function isTodayStr() {
  return new Date().toISOString().slice(0,10);
}

export function setupWordle(client) {
  client.on(Events.InteractionCreate, async (i) => {
    if (!i.isChatInputCommand()) return;
    if (i.commandName !== 'wordle') return;
    if (i.options.getSubcommand() !== 'guess') return;

    const word = (i.options.getString('word') || '').toLowerCase().trim();

    if (!/^[a-z]{5}$/.test(word)) {
      return i.reply({ content: 'Guess must be exactly **5 letters (A–Z)**.', ephemeral: true });
    }

    const c = cfg(i.guildId);
    const today = isTodayStr();

    if (!c.wordle.answer || c.wordle.date !== today) {
      return i.reply({ content: 'No Wordle set for today yet. Ask staff to set it on the dashboard.', ephemeral: true });
    }

    // Already solved?
    if (c.wordle.solvedBy?.includes(i.user.id)) {
      return i.reply({ content: 'You already solved today’s Wordle. Come back tomorrow!', ephemeral: true });
    }

    const answer = c.wordle.answer;
    const score = scoreWordle(word, answer);

    if (word === answer) {
      c.wordle.solvedBy.push(i.user.id);
      const newBal = add(i.guildId, i.user.id, 'coins', c.wordle.bonus || 5);
      return i.reply({ content: `🟩🟩🟩🟩🟩 **Correct!** You earned **${c.wordle.bonus}** 🪙 (now ${newBal}).` });
    } else {
      return i.reply({ content: `${score} Not quite. Try again later…`, ephemeral: true });
    }
  });
}
