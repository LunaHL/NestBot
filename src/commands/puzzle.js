// /puzzle: the Puzzle of the Day. Only the Discord side lives here.
// Logic, rewards and the daily announcement: src/services/puzzle.js.
const { SlashCommandBuilder } = require('discord.js');
const achievements = require('../services/achievements');
const history = require('../services/history');
const puzzles = require('../services/puzzle');
const { isAdmin, denyNonAdmin } = require('../utils/permissions');
const { localDate } = require('../utils/time');

const HISTORY_PAGE_SIZE = 10;
const { DIFFICULTIES, MEDALS } = puzzles;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('puzzle')
    .setDescription('Daily Puzzle of the Day!')
    .addSubcommand(sub =>
      sub
        .setName('info')
        .setDescription("Today's puzzle and your progress")
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
          opt
            .setName('user')
            .setDescription('Show which ones this user solved'),
        )
        .addIntegerOption(opt =>
          opt.setName('page').setDescription('Page number').setMinValue(1),
        ),
    )
    // ----- Admin -----
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Set a puzzle (admins only)')
        .addStringOption(opt =>
          opt
            .setName('link')
            .setDescription('Puzzle link (https://…)')
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt.setName('code').setDescription('Solve code').setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('difficulty')
            .setDescription('Difficulty')
            .setRequired(true)
            .addChoices(
              ...Object.entries(DIFFICULTIES).map(([value, d]) => ({
                name: `${d.emoji} ${d.label} (${d.reward} coins)`,
                value,
              })),
            ),
        )
        .addStringOption(opt =>
          opt
            .setName('date')
            .setDescription('Date YYYY-MM-DD (default: today)'),
        )
        .addBooleanOption(opt =>
          opt
            .setName('append')
            .setDescription('Put it on the next free day instead'),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('queue')
        .setDescription(
          'Today’s and upcoming puzzles with codes (admins only)',
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a scheduled puzzle (admins only)')
        .addStringOption(opt =>
          opt
            .setName('date')
            .setDescription('Date YYYY-MM-DD')
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const today = localDate(0);

    // ==== /puzzle info ====
    if (sub === 'info') {
      const user = interaction.options.getUser('user') || interaction.user;
      const puzzle = puzzles.getPuzzle(today);
      if (!puzzle) {
        return interaction.reply({
          content: '❌ No puzzle today. Check back later!',
          flags: 64,
        });
      }

      const streak = puzzles.getStreak(user.id);
      const position = puzzle.solvedBy.indexOf(user.id) + 1;
      const status = position
        ? `✅ Solved ${MEDALS[position - 1] || ''} (#${position})`
        : `❌ Not solved yet · ${puzzles.wrongTriesLeft(puzzle, user.id)} tries left`;

      const embed = puzzles.puzzleEmbed(today, puzzle, { guildId }).addFields({
        name: `👤 ${user.username}`,
        value: `${status}\n🔥 Streak: **${streak.current}** (best ${streak.best})`,
      });
      return interaction.reply({
        embeds: [embed],
        components: puzzles.linkButton(puzzle),
        allowedMentions: { parse: [] },
      });
    }

    // ==== /puzzle solve ====
    if (sub === 'solve') {
      const userId = interaction.user.id;
      const result = puzzles.solve(
        guildId,
        userId,
        interaction.options.getString('code'),
      );

      const errors = {
        none: '❌ No puzzle today.',
        solved: `✅ You already solved today's puzzle (#${result.position}).`,
        locked: `🔒 That's ${puzzles.MAX_WRONG_PER_DAY} wrong codes. No more tries today. See you tomorrow!`,
        wrong: `❌ Wrong code. **${result.triesLeft}** ${result.triesLeft === 1 ? 'try' : 'tries'} left today.`,
      };
      if (result.error)
        return interaction.reply({ content: errors[result.error], flags: 64 });

      const medal = MEDALS[result.position - 1];
      await interaction.reply({
        content:
          `🎉 Correct! You earned **${result.reward}** coins!` +
          (medal
            ? `\n${medal} You were **#${result.position}** today (+${result.bonus} bonus)!`
            : '') +
          (result.streakMsg ? `\n${result.streakMsg}` : ''),
        flags: 64,
      });

      // Public notice without the code: puzzle channel, or here if none is set
      const name = interaction.member?.displayName || interaction.user.username;
      const posted = await puzzles.postSolveNotice(
        interaction.client,
        guildId,
        name,
        result.position,
      );
      if (!posted) {
        await interaction
          .followUp({
            content: `🧩 **${name}** solved today's puzzle! ${medal || '✅'} (#${result.position})`,
            allowedMentions: { parse: [] },
          })
          .catch(() => {});
      }
      return achievements.announce(interaction, [userId]);
    }

    // ==== /puzzle history ====
    if (sub === 'history') {
      const user = interaction.options.getUser('user');

      // Past and today's puzzles only; queued future puzzles stay secret
      const entries = Object.entries(history.allPuzzles())
        .filter(([date]) => date <= today)
        .sort(([a], [b]) => b.localeCompare(a));
      if (entries.length === 0) {
        return interaction.reply({ content: '📭 No puzzles yet.', flags: 64 });
      }

      const pages = Math.ceil(entries.length / HISTORY_PAGE_SIZE);
      const page = Math.min(interaction.options.getInteger('page') || 1, pages);
      const slice = entries.slice(
        (page - 1) * HISTORY_PAGE_SIZE,
        page * HISTORY_PAGE_SIZE,
      );

      const lines = slice.map(([date, p]) => {
        const solvers = p.solvedBy?.length || 0;
        const mark = user
          ? p.solvedBy?.includes(user.id)
            ? '✅ '
            : '❌ '
          : '';
        return (
          `${mark}**${date}** · ${puzzles.difficultyOf(p).emoji} ${puzzles.difficultyOf(p).label}` +
          ` · ${solvers} solver${solvers === 1 ? '' : 's'} · [link](<${p.link}>)`
        );
      });

      let header = `🧩 **Puzzle History** (page ${page}/${pages})`;
      if (user) {
        const solved = entries.filter(([, p]) =>
          p.solvedBy?.includes(user.id),
        ).length;
        header += `\n👤 **${user.username}** solved **${solved}** of ${entries.length}`;
      }
      return interaction.reply({
        content: `${header}\n\n${lines.join('\n')}`,
        allowedMentions: { parse: [] },
      });
    }

    // ===== Admin only from here =====
    if (!isAdmin(interaction)) return denyNonAdmin(interaction);

    // ==== /puzzle set ====
    if (sub === 'set') {
      const difficulty = interaction.options.getString('difficulty');
      const result = puzzles.setPuzzle({
        link: interaction.options.getString('link'),
        code: interaction.options.getString('code'),
        difficulty,
        date: interaction.options.getString('date'),
        append: interaction.options.getBoolean('append'),
      });

      const errors = {
        link: '❌ The link must start with `http://` or `https://`.',
        'date-format':
          '❌ Date must look like `2026-10-31` (YYYY-MM-DD) and exist.',
        'date-past': '❌ That date is in the past.',
      };
      if (result.error)
        return interaction.reply({ content: errors[result.error], flags: 64 });

      const d = DIFFICULTIES[difficulty];
      const note = result.replaced
        ? `\n✏️ Replaced the existing puzzle for that day (kept its ${result.keptSolvers} solver${result.keptSolvers === 1 ? '' : 's'}).`
        : '';
      const when =
        result.date === today
          ? puzzles.getSettings(guildId).channelId
            ? '\n📣 It will be announced in the puzzle channel within 10 minutes.'
            : '\n💡 Set a puzzle channel with `/settings channels puzzle:` to announce it automatically.'
          : '';
      return interaction.reply({
        content: `✅ Puzzle for **${result.date}** set! ${d.emoji} ${d.label} (${d.reward} coins)${note}${when}`,
        flags: 64,
      });
    }

    // ==== /puzzle queue ====
    if (sub === 'queue') {
      const queue = puzzles.getQueue();
      if (!queue.length) {
        return interaction.reply({
          content: '📭 No puzzles scheduled. Add one with `/puzzle set`.',
          flags: 64,
        });
      }
      const lines = queue.slice(0, 25).map(([date, p]) => {
        const diff = puzzles.difficultyOf(p);
        const solved = p.solvedBy?.length
          ? ` · ${p.solvedBy.length} solved`
          : '';
        return `**${date}**${date === today ? ' (today)' : ''} · ${diff.emoji} ${diff.label} · code \`${p.code}\`${solved} · [link](<${p.link}>)`;
      });
      return interaction.reply({
        content:
          `🗓️ **Puzzle queue** (${queue.length})\n${lines.join('\n')}` +
          (queue.length > 25 ? `\n…and ${queue.length - 25} more` : ''),
        flags: 64,
      });
    }

    // ==== /puzzle remove ====
    if (sub === 'remove') {
      const date = interaction.options.getString('date');
      if (date < today) {
        return interaction.reply({
          content:
            '❌ Past puzzles can’t be removed (they’re part of the history).',
          flags: 64,
        });
      }
      const removed = puzzles.removePuzzle(date);
      return interaction.reply({
        content: removed
          ? `🗑️ Removed the puzzle for **${date}** (code \`${removed.code}\`).`
          : `❓ There's no puzzle on **${date}**. See \`/puzzle queue\`.`,
        flags: 64,
      });
    }
  },
};
