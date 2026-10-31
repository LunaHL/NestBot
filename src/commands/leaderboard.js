// /leaderboard: every ranking of the Nest in one place. Pick a board with the
// option or switch with the menu under the card ("leaderboard:…" keeps
// working after restarts). Replaces the old /puzzle, /wordle, /drinks and
// /pictracker leaderboards.
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const db = require('../utils/db');
const nestcoins = require('../services/nestcoins');
const puzzles = require('../services/puzzle');
const wordle = require('../services/wordle');
const achievements = require('../services/achievements');
const ui = require('../utils/ui');

/** "🥇 @user · text" lines, or "–". */
const list = (rows, fmt) =>
  rows.length
    ? rows.map(([id, v], i) => `${ui.rank(i)} <@${id}> · ${fmt(v)}`).join('\n')
    : '–';
const top = (obj, n = 10) =>
  Object.entries(obj)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
const plural = (n, one, many = `${one}s`) => `**${n}** ${n === 1 ? one : many}`;

const BOARDS = {
  coins: {
    label: 'NestCoins',
    emoji: '💰',
    color: ui.COLORS.coins,
    build: (guildId, viewerId) => {
      const all = nestcoins
        .getAllBalances(guildId)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1]);
      const mine = all.findIndex(([id]) => id === viewerId);
      return {
        text: list(all.slice(0, 10), n => ui.coins(n)),
        footer:
          mine >= 0
            ? `You: #${mine + 1} with ${all[mine][1]} coins`
            : 'Earn coins with /daily and the daily games',
      };
    },
  },
  puzzle: {
    label: 'Puzzle',
    emoji: '🧩',
    color: 0x9b59b6,
    build: () => {
      const lb = puzzles.getLeaderboard(5);
      return {
        fields: [
          {
            name: '🧠 Most solved',
            value: list(lb.solved, n => plural(n, 'puzzle')),
          },
          {
            name: '⚡ Most first places',
            value: list(lb.firsts, n => `**${n}**× first`),
          },
          {
            name: '🔥 Longest streaks',
            value: list(lb.streaks, n => plural(n, 'day')),
          },
        ],
      };
    },
  },
  wordle: {
    label: 'Wordle app',
    emoji: '🟩',
    color: 0x6aaa64,
    build: guildId => {
      const lb = wordle.getLeaderboard(guildId, 5);
      return {
        fields: [
          { name: '👑 Most crowns', value: list(lb.crowns, v => `**${v}**`) },
          {
            name: '🎯 Best average (min. 5 solved)',
            value: list(lb.average, v => `**${v.toFixed(2)}** guesses`),
          },
          {
            name: '📅 Most days played',
            value: list(lb.played, v => `**${v}**`),
          },
        ],
      };
    },
  },
  drinks: {
    label: 'Drinks',
    emoji: '🍹',
    color: 0x6f4e37,
    build: guildId => {
      const stats = db.read(d => d.coffee?.[guildId]) || {};
      const pick = key =>
        top(
          Object.fromEntries(
            Object.entries(stats).map(([id, s]) => [id, s[key] || 0]),
          ),
          5,
        );
      return {
        fields: [
          {
            name: '🍹 Most drinks had',
            value: list(pick('total'), n => plural(n, 'drink')),
          },
          {
            name: '🎁 Most generous',
            value: list(pick('given'), n => `**${n}** gifted`),
          },
          {
            name: '🍻 Most rounds bought',
            value: list(pick('rounds'), n => plural(n, 'round')),
          },
        ],
      };
    },
  },
  duels: {
    label: 'Duels',
    emoji: '🤺',
    color: 0xe74c3c,
    build: guildId => {
      const stats = db.read(d => d.duelStats?.[guildId]) || {};
      const pick = key =>
        top(
          Object.fromEntries(
            Object.entries(stats).map(([id, s]) => [id, s[key] || 0]),
          ),
          5,
        );
      return {
        fields: [
          {
            name: '🏆 Most wins',
            value: list(pick('wins'), n => plural(n, 'win')),
          },
          {
            name: '💰 Most coins won',
            value: list(pick('coinsWon'), n => ui.coins(n)),
          },
        ],
      };
    },
  },
  pictures: {
    label: 'Pictures this week',
    emoji: '📸',
    color: 0x3498db,
    build: guildId => {
      const users = db.read(d => d.pictracker?.[guildId]?.users) || {};
      return {
        text: list(top(users), n => `**${n}** 🖼️`),
        footer: 'Resets every Monday · active posters get coins',
      };
    },
  },
  achievements: {
    label: 'Achievements',
    emoji: '🏅',
    color: 0xf1c40f,
    build: guildId => {
      const all = db.read(d => d.achievements?.[guildId]) || {};
      const counts = Object.fromEntries(
        Object.entries(all).map(([id, have]) => [id, Object.keys(have).length]),
      );
      return {
        text: list(
          top(counts),
          n => `**${n}** / ${achievements.ACHIEVEMENTS.length}`,
        ),
      };
    },
  },
};

function view(guildId, board, viewerId) {
  const b = BOARDS[board] || BOARDS.coins;
  const r = b.build(guildId, viewerId);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('leaderboard:board')
    .setPlaceholder('Switch leaderboard…')
    .addOptions(
      Object.entries(BOARDS).map(([value, x]) => ({
        label: x.label,
        value,
        emoji: x.emoji,
        default: value === board,
      })),
    );
  return {
    embeds: [
      ui.card({
        title: `${b.emoji} ${b.label} Leaderboard`,
        color: b.color,
        text: r.text,
        fields: r.fields || [],
        footer: r.footer,
      }),
    ],
    components: [new ActionRowBuilder().addComponents(menu)],
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  BOARDS,

  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription(
      'All leaderboards of the Nest: coins, puzzle, Wordle, drinks, duels, pictures, achievements',
    )
    .addStringOption(o =>
      o
        .setName('board')
        .setDescription('Which leaderboard (default: NestCoins)')
        .addChoices(
          ...Object.entries(BOARDS).map(([value, b]) => ({
            name: `${b.emoji} ${b.label}`,
            value,
          })),
        ),
    ),

  async handleComponent(interaction) {
    return interaction.update(
      view(interaction.guildId, interaction.values?.[0], interaction.user.id),
    );
  },

  async execute(interaction) {
    const board = interaction.options.getString('board') || 'coins';
    return interaction.reply(
      view(interaction.guildId, board, interaction.user.id),
    );
  },
};
