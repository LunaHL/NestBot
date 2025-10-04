const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/db');
const nestcoins = require('../services/nestcoins');

const TZ = process.env.TIMEZONE || 'Europe/Berlin';
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const nowInTZ = () => new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
const getToday = () => ymd(nowInTZ());
const getYesterday = () => { const d = nowInTZ(); d.setDate(d.getDate()-1); return ymd(d); };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('puzzle')
    .setDescription('Daily Puzzle of the Day!')
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Set a puzzle (admins only)')
        .addStringOption(opt =>
          opt.setName('link').setDescription('Puzzle link').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('code').setDescription('Solve code').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('difficulty').setDescription('Difficulty').addChoices(
            { name: 'Easy', value: 'easy' },
            { name: 'Medium', value: 'medium' },
            { name: 'Hard', value: 'hard' }
          ).setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('date').setDescription('Date (YYYY-MM-DD, default: today)')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('info')
        .setDescription('Show puzzle info')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User to check')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('solve')
        .setDescription('Solve today’s puzzle')
        .addStringOption(opt =>
          opt.setName('code').setDescription('Solve code').setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const rewards = { easy: 10, medium: 20, hard: 30 };

    // ==== /puzzle set ====
    if (sub === 'set') {
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (!isAdmin)
        return interaction.reply({ content: "❌ No permission.", ephemeral: true });

      const link = interaction.options.getString('link');
      const code = interaction.options.getString('code');
      const difficulty = interaction.options.getString('difficulty');
      const date = interaction.options.getString('date') || getToday();
      const reward = rewards[difficulty] || 10;

      db.perform(data => {
        if (!data.puzzles) data.puzzles = {};
        data.puzzles[date] = { link, code, difficulty, reward, solvedBy: [] };
      });

      return interaction.reply({
        content: `✅ Puzzle for **${date}** set!\n🧩 Difficulty: **${difficulty}** (${reward} coins)\n🔗 ${link}`,
        ephemeral: true
      });
    }

    // ==== /puzzle info ====
    if (sub === 'info') {
      const today = getToday();
      const user = interaction.options.getUser('user') || interaction.user;
      const userId = user.id;

      let puzzle, solved = false, streak = { current: 0, best: 0 };

      db.perform(data => {
        puzzle = data.puzzles?.[today];
        if (!data.puzzleStreaks) data.puzzleStreaks = {};
        streak = data.puzzleStreaks[userId] || { current: 0, best: 0 };
        if (puzzle && puzzle.solvedBy.includes(userId)) solved = true;
      });

      if (!puzzle)
        return interaction.reply({ content: "❌ No puzzle set for today.", ephemeral: true });

      const msg =
        `🧩 **Puzzle of the Day (${today})**\n` +
        `Difficulty: **${puzzle.difficulty}** (${puzzle.reward} coins)\n` +
        `🔗 ${puzzle.link}\n\n` +
        `👤 **${user.username}**:\n` +
        (solved ? "✅ Solved\n" : "❌ Not solved\n") +
        `🔥 Streak: ${streak.current} (Best: ${streak.best})`;

      return interaction.reply({ content: msg });
    }

    // ==== /puzzle solve ====
    if (sub === 'solve') {
      const code = interaction.options.getString('code');
      const userId = interaction.user.id;
      const today = getToday();
      const yesterday = getYesterday();

      let puzzle, reward = 0, solved = false, streakMsg = "";

      db.perform(data => {
        if (!data.puzzles || !data.puzzles[today]) return;
        puzzle = data.puzzles[today];

        if (puzzle.solvedBy.includes(userId)) { solved = true; return; }
        if (puzzle.code !== code) return;

        reward = puzzle.reward;
        if (!data.puzzleStreaks) data.puzzleStreaks = {};
        const streak = data.puzzleStreaks[userId] || { current: 0, best: 0, lastDate: null };

        if (streak.lastDate === yesterday) streak.current++;
        else streak.current = 1;

        if (streak.current > streak.best) streak.best = streak.current;
        streak.lastDate = today;
        data.puzzleStreaks[userId] = streak;

        if (streak.current % 10 === 0) {
          reward += 10;
          streakMsg = `🔥 10-day streak! +10 bonus coins!`;
        }

        puzzle.solvedBy.push(userId);
        nestcoins.addCoins(guildId, userId, reward);
      });

      if (!puzzle)
        return interaction.reply({ content: "❌ No puzzle set for today.", ephemeral: true });
      if (solved)
        return interaction.reply({ content: "✅ Already solved today.", ephemeral: true });
      if (puzzle.code !== code)
        return interaction.reply({ content: "❌ Wrong code.", ephemeral: true });

      return interaction.reply({
        content: `🎉 Correct! You earned **${reward}** NestCoins!\n${streakMsg}`,
        ephemeral: true
      });
    }
  }
};
