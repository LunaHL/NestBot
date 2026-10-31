const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const nestcoins = require('../services/nestcoins');
const achievements = require('../services/achievements');
const db = require('../utils/db');

const MAX_BET = 500;
const ACCEPT_TIME_MS = 2 * 60 * 1000; // time to accept the challenge
const PICK_TIME_MS = 60 * 1000; // time to pick a move
const MAX_TIES = 3; // after this many ties in a row, both get refunded

const MOVES = {
  rock: { emoji: '🪨', name: 'Rock', beats: 'scissors' },
  paper: { emoji: '📄', name: 'Paper', beats: 'rock' },
  scissors: { emoji: '✂️', name: 'Scissors', beats: 'paper' },
};

const pending = new Set(); // "guildId:userId" of challengers with an open duel

function recordResult(guildId, winnerId, loserId, pot) {
  db.perform(d => {
    d.duelStats ||= {};
    const g = (d.duelStats[guildId] ||= {});
    const blank = () => ({ wins: 0, losses: 0, ties: 0, coinsWon: 0 });
    const w = (g[winnerId] ||= blank());
    const l = (g[loserId] ||= blank());
    w.wins++;
    w.coinsWon += pot / 2; // net gain = opponent's bet
    l.losses++;
  });
}

function recordDraw(guildId, ids) {
  db.perform(d => {
    d.duelStats ||= {};
    const g = (d.duelStats[guildId] ||= {});
    for (const id of ids)
      (g[id] ||= { wins: 0, losses: 0, ties: 0, coinsWon: 0 }).ties++;
  });
}

function buttons(prefix, defs, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      defs.map(([id, label, style]) =>
        new ButtonBuilder()
          .setCustomId(`${prefix}:${id}`)
          .setLabel(label)
          .setStyle(style)
          .setDisabled(disabled),
      ),
    ),
  ];
}

const moveButtons = (prefix, disabled) =>
  buttons(
    prefix,
    Object.entries(MOVES).map(([k, m]) => [
      k,
      `${m.emoji} ${m.name}`,
      ButtonStyle.Primary,
    ]),
    disabled,
  );

async function startDuel(interaction) {
  const guildId = interaction.guildId;
  const challenger = interaction.user;
  const opponent = interaction.options.getUser('opponent');
  const bet = interaction.options.getInteger('bet') ?? 10;
  const cName = interaction.member?.displayName || challenger.username;
  const oName =
    interaction.options.getMember('opponent')?.displayName || opponent.username;

  if (opponent.id === challenger.id)
    return interaction.reply({
      content: '🤺 You can’t duel yourself. Well, you can, but not here.',
      flags: 64,
    });
  if (opponent.bot)
    return interaction.reply({
      content: '🤖 Bots don’t duel. We’d win anyway.',
      flags: 64,
    });

  const key = `${guildId}:${challenger.id}`;
  if (pending.has(key))
    return interaction.reply({
      content: '⚔️ You already have an open duel. Finish that one first.',
      flags: 64,
    });
  if (nestcoins.getBalance(guildId, challenger.id) < bet) {
    return interaction.reply({
      content: `💸 You don’t have **${bet}** NestCoins to bet.`,
      flags: 64,
    });
  }
  if (nestcoins.getBalance(guildId, opponent.id) < bet) {
    return interaction.reply({
      content: `💸 ${oName} doesn’t have **${bet}** NestCoins to bet.`,
      flags: 64,
    });
  }

  pending.add(key);
  const prefix = `duel:${interaction.id}`;
  const betText =
    bet > 0
      ? `for **${bet}** NestCoins each (winner takes **${bet * 2}**)`
      : 'just for glory';

  const embed = new EmbedBuilder()
    .setTitle('⚔️ Duel Challenge!')
    .setDescription(
      `**${cName}** challenges **${oName}** to Rock · Paper · Scissors ${betText}!\n\n${opponent}, do you accept?`,
    )
    .setColor(0xe74c3c);

  const message = await interaction.reply({
    content: `${opponent}`,
    embeds: [embed],
    components: buttons(prefix, [
      ['accept', '✅ Accept', ButtonStyle.Success],
      ['decline', '❌ Decline', ButtonStyle.Danger],
    ]),
    allowedMentions: { users: [opponent.id] },
    fetchReply: true,
  });

  // Duel state. `done` is set before any await so double-clicks can't resolve twice.
  const state = {
    phase: 'challenge',
    picks: {},
    ties: 0,
    done: false,
    paid: false,
  };
  const players = [challenger.id, opponent.id];
  const nameOf = id => (id === challenger.id ? cName : oName);

  const collector = message.createMessageComponentCollector({
    time: ACCEPT_TIME_MS,
  });

  const finish = async (i, text, color) => {
    state.done = true;
    pending.delete(key);
    collector.stop('done');
    const result = new EmbedBuilder()
      .setTitle('⚔️ Duel')
      .setDescription(text)
      .setColor(color);
    const payload = { content: '', embeds: [result], components: [] };
    if (i) await i.update(payload).catch(() => {});
    else await message.edit(payload).catch(() => {});
  };

  const refund = () => {
    if (state.paid && bet > 0)
      for (const id of players) nestcoins.addCoins(guildId, id, bet);
  };

  collector.on('collect', async i => {
    if (state.done) return i.deferUpdate().catch(() => {});
    const action = i.customId.slice(prefix.length + 1);

    // ----- Accept / decline -----
    if (state.phase === 'challenge') {
      if (action === 'decline' && players.includes(i.user.id)) {
        const who =
          i.user.id === challenger.id
            ? `${cName} withdrew the challenge.`
            : `${oName} declined the duel.`;
        return finish(i, `🏳️ ${who}`, 0x95a5a6);
      }
      if (i.user.id !== opponent.id) {
        return i
          .reply({ content: 'This duel isn’t for you.', flags: 64 })
          .catch(() => {});
      }
      if (action !== 'accept') return i.deferUpdate().catch(() => {});

      // Take both bets now (balances may have changed since the challenge)
      if (bet > 0) {
        if (nestcoins.removeCoins(guildId, challenger.id, bet) === null) {
          return finish(
            i,
            `💸 ${cName} can’t afford the bet anymore. Duel cancelled.`,
            0x95a5a6,
          );
        }
        if (nestcoins.removeCoins(guildId, opponent.id, bet) === null) {
          nestcoins.addCoins(guildId, challenger.id, bet);
          return finish(
            i,
            `💸 ${oName} can’t afford the bet anymore. Duel cancelled.`,
            0x95a5a6,
          );
        }
      }
      state.paid = true;
      state.phase = 'pick';
      collector.resetTimer({ time: PICK_TIME_MS });

      const fight = new EmbedBuilder()
        .setTitle(`⚔️ ${cName} vs ${oName}`)
        .setDescription(
          `Both of you: pick your move! Nobody can see it until both have chosen.\n⏱️ ${PICK_TIME_MS / 1000} seconds.`,
        )
        .setColor(0xe67e22);
      return i
        .update({
          content: '',
          embeds: [fight],
          components: moveButtons(prefix),
        })
        .catch(() => {});
    }

    // ----- Picking moves -----
    if (!players.includes(i.user.id)) {
      return i
        .reply({ content: 'This duel isn’t for you.', flags: 64 })
        .catch(() => {});
    }
    if (!MOVES[action]) return i.deferUpdate().catch(() => {});
    if (state.picks[i.user.id]) {
      return i
        .reply({
          content: `You already picked ${MOVES[state.picks[i.user.id]].emoji}.`,
          flags: 64,
        })
        .catch(() => {});
    }
    state.picks[i.user.id] = action;

    const [a, b] = players.map(id => state.picks[id]);
    if (!a || !b) {
      return i
        .reply({
          content: `You picked ${MOVES[action].emoji} **${MOVES[action].name}**. Waiting for your opponent…`,
          flags: 64,
        })
        .catch(() => {});
    }

    // Both picked: resolve
    const reveal = `${cName}: ${MOVES[a].emoji} **${MOVES[a].name}** vs ${oName}: ${MOVES[b].emoji} **${MOVES[b].name}**`;

    if (a === b) {
      state.ties++;
      state.picks = {};
      if (state.ties >= MAX_TIES) {
        refund();
        recordDraw(guildId, players);
        return finish(
          i,
          `${reveal}\n\n🤝 ${MAX_TIES} ties in a row! It’s a draw. Bets returned.`,
          0x95a5a6,
        );
      }
      collector.resetTimer({ time: PICK_TIME_MS });
      const again = new EmbedBuilder()
        .setTitle(`⚔️ ${cName} vs ${oName}`)
        .setDescription(
          `${reveal}\n\n🤝 **Tie!** Pick again (${state.ties}/${MAX_TIES}).`,
        )
        .setColor(0xe67e22);
      return i
        .update({ embeds: [again], components: moveButtons(prefix) })
        .catch(() => {});
    }

    const winnerId = MOVES[a].beats === b ? challenger.id : opponent.id;
    const loserId = winnerId === challenger.id ? opponent.id : challenger.id;
    const pot = bet * 2;
    if (pot > 0) nestcoins.addCoins(guildId, winnerId, pot);
    recordResult(guildId, winnerId, loserId, pot);

    await finish(
      i,
      `${reveal}\n\n🏆 **${nameOf(winnerId)} wins!**` +
        (pot > 0 ? ` +**${pot}** NestCoins` : ''),
      0x2ecc71,
    );
    await achievements.announce(i, players);
  });

  collector.on('end', async () => {
    if (state.done) return;

    if (state.phase === 'challenge') {
      return finish(
        null,
        `⌛ ${oName} didn’t answer in time. Duel expired.`,
        0x95a5a6,
      );
    }

    // Time ran out while picking: whoever picked wins by forfeit
    const picked = players.filter(id => state.picks[id]);
    if (picked.length === 1) {
      const winnerId = picked[0];
      const loserId = players.find(id => id !== winnerId);
      const pot = bet * 2;
      if (pot > 0) nestcoins.addCoins(guildId, winnerId, pot);
      recordResult(guildId, winnerId, loserId, pot);
      await finish(
        null,
        `⌛ ${nameOf(loserId)} ran out of time.\n🏆 **${nameOf(winnerId)} wins by forfeit!**` +
          (pot > 0 ? ` +**${pot}** NestCoins` : ''),
        0x2ecc71,
      );
      return achievements.announce(interaction, players);
    }
    refund();
    return finish(
      null,
      '⌛ Nobody picked a move in time. Bets returned.',
      0x95a5a6,
    );
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('duel')
    .setDescription(
      'Challenge someone to Rock · Paper · Scissors (record: /profile)',
    )
    .addUserOption(opt =>
      opt.setName('opponent').setDescription('Who to duel').setRequired(true),
    )
    .addIntegerOption(opt =>
      opt
        .setName('bet')
        .setDescription(`NestCoins each (0–${MAX_BET}, default 10)`)
        .setMinValue(0)
        .setMaxValue(MAX_BET),
    ),

  async execute(interaction) {
    return startDuel(interaction);
  },
};
