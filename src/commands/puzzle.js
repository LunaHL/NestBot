const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const achievements = require('../services/achievements');
const db = require('../utils/db');
const nestcoins = require('../services/nestcoins');
const history = require('../services/history');
const { streakReward, streakMessage } = require('../utils/streak');

const HISTORY_PAGE_SIZE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('puzzle')
    .setDescription('Daily Puzzle of the Day!')
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Set a puzzle (admins only)')
        .addStringOption(opt =>
          opt.setName('link').setDescription('Puzzle link').setRequired(true),
        )
        .addStringOption(opt =>
          opt.setName('code').setDescription('Solve code').setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('difficulty')
            .setDescription('Difficulty')
            .addChoices(
              { name: 'Easy', value: 'easy' },
              { name: 'Medium', value: 'medium' },
              { name: 'Hard', value: 'hard' },
              { name: 'special', value: 'special' },
            )
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('date')
            .setDescription('Date (YYYY-MM-DD, default: today)'),
        )
        .addBooleanOption(opt =>
          opt
            .setName('append')
            .setDescription('Automatically set for next free day'),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('info')
        .setDescription('Show puzzle info')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User to check'),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('solve')
        .setDescription('Solve today’s puzzle')
        .addStringOption(opt =>
          opt.setName('code').setDescription('Solve code').setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('history')
        .setDescription('Show past puzzles')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Show which ones this user solved'),
        )
        .addIntegerOption(opt =>
          opt.setName('page').setDescription('Page number').setMinValue(1),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const rewards = { easy: 10, medium: 20, hard: 30, special: 50 };

    // ==== /puzzle set ====
    if (sub === 'set') {
      const isAdmin = interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator,
      );
      if (!isAdmin)
        return interaction.reply({ content: '❌ No permission.', flags: 64 });

      const link = interaction.options.getString('link');
      const code = interaction.options.getString('code');
      const difficulty = interaction.options.getString('difficulty');
      const date = interaction.options.getString('date') || getToday();
      const reward = rewards[difficulty] || 10;
      const append = interaction.options.getBoolean('append');
      let finalDate = date;

      db.perform(data => {
        if (!data.puzzles) data.puzzles = {};

        if (append) {
          let d = nowInTZ();
          for (let i = 0; i < 365; i++) {
            d.setDate(d.getDate() + 1);
            const nextDate = ymd(d);
            if (!data.puzzles[nextDate]) {
              finalDate = nextDate;
              break;
            }
          }
        }

        data.puzzles[finalDate] = {
          link,
          code,
          difficulty,
          reward,
          solvedBy: [],
        };
      });

      return interaction.reply({
        content: `✅ Puzzle for **${finalDate}** set!\nDifficulty: **${difficulty}** (${reward} coins)\n🔗 ${link}`,
        flags: 64,
      });
    }

    // ==== /puzzle info ====
    if (sub === 'info') {
      const today = getToday();
      const user = interaction.options.getUser('user') || interaction.user;
      const userId = user.id;

      let puzzle,
        solved = false,
        streak = { current: 0, best: 0 };

      db.perform(data => {
        puzzle = data.puzzles?.[today];
        if (!data.puzzleStreaks) data.puzzleStreaks = {};
        streak = data.puzzleStreaks[userId] || { current: 0, best: 0 };
        if (puzzle && puzzle.solvedBy.includes(userId)) solved = true;
      });

      if (!puzzle)
        return interaction.reply({ content: '❌ No puzzle today.', flags: 64 });

      const msg =
        `🧩 **Puzzle of the Day (${today})**\n` +
        `Difficulty: **${puzzle.difficulty}** (${puzzle.reward} coins)\n` +
        `🔗 ${puzzle.link}\n\n` +
        `👤 **${user.username}**:\n` +
        (solved ? '✅ Solved\n' : '❌ Not solved\n') +
        `🔥 Streak: ${streak.current} (Best: ${streak.best})`;

      return interaction.reply({ content: msg });
    }

    // ==== /puzzle history ====
    if (sub === 'history') {
      const user = interaction.options.getUser('user');
      const today = getToday();

      // Past and today's puzzles only; queued future puzzles stay secret
      const entries = Object.entries(history.allPuzzles())
        .filter(([date]) => date <= today)
        .sort(([a], [b]) => b.localeCompare(a));

      if (entries.length === 0)
        return interaction.reply({ content: '📭 No puzzles yet.', flags: 64 });

      const pages = Math.ceil(entries.length / HISTORY_PAGE_SIZE);
      const page = Math.min(interaction.options.getInteger('page') || 1, pages);
      const slice = entries.slice(
        (page - 1) * HISTORY_PAGE_SIZE,
        page * HISTORY_PAGE_SIZE,
      );

      const lines = slice.map(([date, p]) => {
        const solvers = p.solvedBy?.length || 0;
        const mark = user ? (p.solvedBy?.includes(user.id) ? '✅ ' : '❌ ') : '';
        return (
          `${mark}**${date}** · ${p.difficulty} · ${solvers} solver${solvers === 1 ? '' : 's'}` +
          ` · [link](<${p.link}>)`
        );
      });

      let header = `🧩 **Puzzle History** (page ${page}/${pages})`;
      if (user) {
        const solved = entries.filter(([, p]) => p.solvedBy?.includes(user.id)).length;
        header += `\n👤 **${user.username}** solved **${solved}** of ${entries.length}`;
      }

      return interaction.reply({
        content: `${header}\n\n${lines.join('\n')}`,
        allowedMentions: { parse: [] },
      });
    }

    // ==== /puzzle solve ====
    if (sub === 'solve') {
      const code = interaction.options.getString('code');
      const userId = interaction.user.id;
      const today = getToday();
      const yesterday = getYesterday();

      let puzzle,
        reward = 0,
        solved = false,
        streakMsg = '';

      db.perform(data => {
        if (!data.puzzles || !data.puzzles[today]) return;
        puzzle = data.puzzles[today];

        if (puzzle.solvedBy.includes(userId)) {
          solved = true;
          return;
        }
        if (puzzle.code.toLowerCase() !== code.toLowerCase()) return;

        if (!data.puzzleStreaks) data.puzzleStreaks = {};
        const streak = data.puzzleStreaks[userId] || {
          current: 0,
          best: 0,
          lastDate: null,
        };

        if (streak.lastDate === yesterday) {
          streak.current++;
        } else {
          streak.current = 1;
        }

        if (streak.current > streak.best) streak.best = streak.current;
        streak.lastDate = today;
        data.puzzleStreaks[userId] = streak;

        const r = streakReward(puzzle.reward, streak.current);
        reward = r.total;
        streakMsg = streakMessage(streak.current, r);

        puzzle.solvedBy.push(userId);
        nestcoins.addCoins(guildId, userId, reward);
      });

      if (!puzzle)
        return interaction.reply({ content: '❌ No puzzle today.', flags: 64 });
      if (solved)
        return interaction.reply({ content: '✅ Already solved.', flags: 64 });
      if (puzzle.code.toLowerCase() !== code.toLowerCase())
        return interaction.reply({ content: '❌ Wrong code.', flags: 64 });

      await interaction.reply({
        content: `🎉 Correct! You earned **${reward}** coins!\n${streakMsg}`,
        flags: 64,
      });
      return achievements.announce(interaction, [userId]);
    }
  },
};
