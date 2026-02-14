const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');
const db = require('../utils/db');
const nestcoins = require('../services/nestcoins');

function calculateStandings(event) {
  const scores = event.scores || {};
  const participants = event.participants;

  // Calculate Buchholz (Sum of opponents' scores)
  const buchholz = {};
  participants.forEach(p => (buchholz[p] = 0));

  const allMatches = [
    ...(event.history || []),
    ...(event.matches ? [event.matches] : []),
  ];

  allMatches.forEach(roundMatches => {
    roundMatches.forEach(m => {
      if (m.p1 && m.p2) {
        // Ignore byes
        buchholz[m.p1] += scores[m.p2] || 0;
        buchholz[m.p2] += scores[m.p1] || 0;
      }
    });
  });

  return participants
    .map(id => ({
      id,
      score: scores[id] || 0,
      buchholz: buchholz[id] || 0,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.buchholz - a.buchholz;
    });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Manage server events and tournaments')
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create a new event (Admin only)')
        .addStringOption(opt =>
          opt
            .setName('name')
            .setDescription('Name of the event')
            .setRequired(true),
        )
        .addIntegerOption(opt =>
          opt
            .setName('prize')
            .setDescription('Prize pool (NestCoins)')
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('type')
            .setDescription('Tournament Type')
            .addChoices(
              { name: 'Single Elimination', value: 'elimination' },
              { name: 'Swiss System', value: 'swiss' },
            )
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('date')
            .setDescription('When? (Text, e.g. "Friday 20:00")')
            .setRequired(false),
        )
        .addIntegerOption(opt =>
          opt
            .setName('limit')
            .setDescription('Max participants (0 for unlimited)')
            .setRequired(false),
        )
        .addIntegerOption(opt =>
          opt
            .setName('rounds')
            .setDescription('Number of rounds (Swiss only)')
            .setMinValue(1)
            .setMaxValue(10),
        )
        .addIntegerOption(opt =>
          opt
            .setName('best_of')
            .setDescription('Best of X matches')
            .addChoices(
              { name: 'Bo1', value: 1 },
              { name: 'Bo3', value: 3 },
              { name: 'Bo5', value: 5 },
            ),
        )
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Announcement channel')
            .setRequired(false),
        ),
    )
    .addSubcommand(sub =>
      sub.setName('list').setDescription('Show active events'),
    )
    .addSubcommand(sub =>
      sub
        .setName('join')
        .setDescription('Join an event')
        .addIntegerOption(opt =>
          opt.setName('id').setDescription('Event ID').setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('leave')
        .setDescription('Leave an event')
        .addIntegerOption(opt =>
          opt.setName('id').setDescription('Event ID').setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('finish')
        .setDescription('End event and pay winner (Admin only)')
        .addIntegerOption(opt =>
          opt.setName('id').setDescription('Event ID').setRequired(true),
        )
        .addUserOption(opt =>
          opt.setName('winner').setDescription('The winner').setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('add-user')
        .setDescription('Manually add a user to an event (Admin only)')
        .addIntegerOption(opt =>
          opt.setName('id').setDescription('Event ID').setRequired(true),
        )
        .addUserOption(opt =>
          opt.setName('user').setDescription('User to add').setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('pairings')
        .setDescription('Generate pairings for the next round (Admin only)')
        .addIntegerOption(opt =>
          opt.setName('id').setDescription('Event ID').setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('win')
        .setDescription('Declare winner of a match (Admin only)')
        .addIntegerOption(opt =>
          opt.setName('id').setDescription('Event ID').setRequired(true),
        )
        .addUserOption(opt =>
          opt.setName('winner').setDescription('The winner').setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('bracket')
        .setDescription('Show the current bracket status')
        .addIntegerOption(opt =>
          opt.setName('id').setDescription('Event ID').setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('standings')
        .setDescription('Show current standings (Swiss)')
        .addIntegerOption(opt =>
          opt.setName('id').setDescription('Event ID').setRequired(true),
        ),
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // --- CREATE ---
    if (sub === 'create') {
      if (
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content: '❌ Only admins can create events.',
          flags: 64,
        });
      }
      const name = interaction.options.getString('name');
      const prize = interaction.options.getInteger('prize');
      const type = interaction.options.getString('type');
      const dateStr = interaction.options.getString('date') || 'TBA';
      const limit = interaction.options.getInteger('limit') || 0;
      const rounds = interaction.options.getInteger('rounds') || 3;
      const bestOf = interaction.options.getInteger('best_of') || 1;
      const channel = interaction.options.getChannel('channel');

      let id;
      db.perform(data => {
        data.events = data.events || {};
        data.events[guildId] = data.events[guildId] || [];
        const events = data.events[guildId];

        // Simple ID generation
        id = events.length + 1;

        events.push({
          id,
          name,
          prize,
          type,
          date: dateStr,
          limit,
          rounds: type === 'swiss' ? rounds : 0,
          bestOf,
          participants: [],
          active: true,
          createdBy: interaction.user.id,
          channelId: channel ? channel.id : interaction.channelId,
          history: [],
          scores: {}, // userId -> score
        });
      });

      return interaction.reply(
        `🎉 **Event created!**\nID: **${id}** | **${name}**\nType: **${type === 'swiss' ? 'Swiss System' : 'Single Elimination'}** (${bestOf === 1 ? 'Bo1' : 'Bo' + bestOf})\nPrize: **${prize}** NestCoins\nWhen: ${dateStr}\nUse \`/event join id:${id}\` to join!`,
      );
    }

    // --- LIST ---
    if (sub === 'list') {
      let events = [];
      db.perform(data => {
        events = (data.events?.[guildId] || []).filter(e => e.active);
      });

      if (!events.length) {
        return interaction.reply({
          content: 'There are currently no active events.',
          flags: 64,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('📅 Current Events')
        .setColor('#FFD700');

      events.forEach(e => {
        const count = e.participants.length;
        const max = e.limit > 0 ? `/${e.limit}` : '';
        embed.addFields({
          name: `#${e.id}: ${e.name}`,
          value: `💰 Prize: ${e.prize}\n📅 When: ${e.date}\n👥 Participants: ${count}${max}\nCreated by: <@${e.createdBy}>`,
        });
      });

      return interaction.reply({ embeds: [embed] });
    }

    // --- JOIN ---
    if (sub === 'join') {
      const id = interaction.options.getInteger('id');
      const userId = interaction.user.id;
      let result = '';

      db.perform(data => {
        const events = data.events?.[guildId] || [];
        const event = events.find(e => e.id === id && e.active);

        if (!event) {
          result = '❌ Event not found or ended.';
          return;
        }
        if (event.participants.includes(userId)) {
          result = '⚠️ You are already registered.';
          return;
        }
        if (event.limit > 0 && event.participants.length >= event.limit) {
          result = '❌ Event is full!';
          return;
        }

        event.participants.push(userId);
        result = `✅ You have registered for **${event.name}**!`;
      });

      return interaction.reply({ content: result, flags: 64 });
    }

    // --- FINISH ---
    if (sub === 'finish') {
      if (
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content: '❌ Only admins can end events.',
          flags: 64,
        });
      }

      const id = interaction.options.getInteger('id');
      const winner = interaction.options.getUser('winner');
      let eventName = '';
      let prize = 0;
      let success = false;

      db.perform(data => {
        const events = data.events?.[guildId] || [];
        const event = events.find(e => e.id === id && e.active);

        if (!event) return;

        event.active = false; // Mark as finished
        eventName = event.name;
        prize = event.prize;
        success = true;
      });

      if (!success) {
        return interaction.reply({
          content: '❌ Event not found or already ended.',
          flags: 64,
        });
      }

      // Pay the winner
      nestcoins.addCoins(guildId, winner.id, prize);

      return interaction.reply(
        `🏆 **Event Ended!**\nEvent: **${eventName}**\nWinner: ${winner} has received **${prize} NestCoins**! 🎉`,
      );
    }

    // --- LEAVE ---
    if (sub === 'leave') {
      const id = interaction.options.getInteger('id');
      const userId = interaction.user.id;
      let result = '';

      db.perform(data => {
        const events = data.events?.[guildId] || [];
        const event = events.find(e => e.id === id && e.active);

        if (!event) {
          result = '❌ Event not found.';
          return;
        }
        const idx = event.participants.indexOf(userId);
        if (idx === -1) {
          result = '⚠️ You are not registered.';
          return;
        }

        event.participants.splice(idx, 1);
        result = `🗑️ You have unregistered from **${event.name}**.`;
      });

      return interaction.reply({ content: result, flags: 64 });
    }

    // --- ADD USER ---
    if (sub === 'add-user') {
      if (
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content: '❌ Only admins can add users.',
          flags: 64,
        });
      }
      const id = interaction.options.getInteger('id');
      const user = interaction.options.getUser('user');
      let result = '';

      db.perform(data => {
        const events = data.events?.[guildId] || [];
        const event = events.find(e => e.id === id && e.active);

        if (!event) {
          result = '❌ Event not found or ended.';
          return;
        }
        if (event.participants.includes(user.id)) {
          result = '⚠️ User is already registered.';
          return;
        }
        if (event.limit > 0 && event.participants.length >= event.limit) {
          result = '❌ Event is full!';
          return;
        }

        event.participants.push(user.id);
        result = `✅ **${user.username}** was added to event **${event.name}**.`;
      });

      return interaction.reply({ content: result, flags: 64 });
    }

    // --- PAIRINGS ---
    if (sub === 'pairings') {
      if (
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content: '❌ Only admins can create pairings.',
          flags: 64,
        });
      }
      const id = interaction.options.getInteger('id');
      let responseEmbed = null;
      let errorMsg = null;

      db.perform(data => {
        const events = data.events?.[guildId] || [];
        const event = events.find(e => e.id === id && e.active);

        if (!event) {
          errorMsg = '❌ Event not found.';
          return;
        }

        // Check if previous round is finished
        if (event.matches && event.matches.some(m => !m.winner)) {
          errorMsg =
            '⚠️ The current round is not finished yet. Determine all winners first with `/event win`.';
          return;
        }

        // Archive previous round
        if (event.matches) {
          if (!event.history) event.history = [];
          event.history.push(event.matches);
        }

        let players = [];

        if (event.type === 'swiss') {
          // --- SWISS LOGIC ---
          if (!event.scores) event.scores = {};
          // Ensure everyone has a score entry
          event.participants.forEach(p => {
            if (event.scores[p] === undefined) event.scores[p] = 0;
          });

          const currentRound = (event.history?.length || 0) + 1;
          if (currentRound > event.rounds) {
            errorMsg = `⚠️ The tournament is over (${event.rounds} rounds played). Use \`/event standings\` for the result.`;
            return;
          }

          // Sort by Score (Desc)
          players = [...event.participants].sort((a, b) => {
            return (event.scores[b] || 0) - (event.scores[a] || 0);
          });

          // Simple Swiss Pairing: Pair neighbors (0-1, 2-3)
          // (In a real system we would check for repeat matchups, but keeping it simple for now)
        } else {
          // --- ELIMINATION LOGIC ---
          if (!event.activePlayers) {
            // First Round
            if (event.participants.length < 2) {
              errorMsg = '⚠️ Not enough participants.';
              return;
            }
            event.activePlayers = [...event.participants];
          } else {
            // Advance winners from previous matches
            if (event.matches) {
              event.activePlayers = event.matches
                .map(m => m.winner)
                .filter(w => w);
            }
          }

          if (event.activePlayers.length < 2) {
            errorMsg = `🏆 The tournament seems to be over! The winner is <@${event.activePlayers[0]}>.`;
            return;
          }

          players = [...event.activePlayers];
          // Shuffle for random bracket
          for (let i = players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [players[i], players[j]] = [players[j], players[i]];
          }
        }

        const newMatches = [];
        const roundNum = (event.history?.length || 0) + 1;
        const embed = new EmbedBuilder()
          .setTitle(`⚔️ Pairings: ${event.name} (Round ${roundNum})`)
          .setColor('#FF4500')
          .setDescription(
            `Format: ${event.bestOf === 1 ? 'Best of 1' : 'Best of ' + event.bestOf}`,
          );

        while (players.length > 0) {
          if (players.length === 1) {
            // Bye
            const p1 = players.pop();
            newMatches.push({ p1, p2: null, winner: p1 }); // Auto win
            embed.addFields({
              name: 'Bye',
              value: `<@${p1}> advances automatically.`,
            });
          } else {
            // For Swiss, we sorted them, so we take from the top (shift) or just pop 2 if sorted reversed.
            // Above sort was Descending (High score first).
            // To pair High vs High, we take 0 and 1.
            const p1 = players.shift();
            const p2 = players.shift();
            newMatches.push({ p1, p2, winner: null });
            embed.addFields({ name: 'Match', value: `<@${p1}> 🆚 <@${p2}>` });
          }
        }

        event.matches = newMatches;
        responseEmbed = embed;
      });

      if (errorMsg) return interaction.reply({ content: errorMsg, flags: 64 });
      return interaction.reply({ embeds: [responseEmbed] });
    }

    // --- WIN ---
    if (sub === 'win') {
      if (
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content: '❌ Only admins can determine winners.',
          flags: 64,
        });
      }
      const id = interaction.options.getInteger('id');
      const winnerUser = interaction.options.getUser('winner');
      let result = '';
      let tournamentFinished = false;
      let payouts = [];
      let announcement = null;

      db.perform(data => {
        const events = data.events?.[guildId] || [];
        const event = events.find(e => e.id === id && e.active);

        if (!event) {
          result = '❌ Event not found.';
          return;
        }
        if (!event.matches || event.matches.length === 0) {
          result =
            '⚠️ There are no active matches. Start a round first with `/event pairings`.';
          return;
        }

        const match = event.matches.find(
          m => (m.p1 === winnerUser.id || m.p2 === winnerUser.id) && !m.winner,
        );

        if (!match) {
          const finishedMatch = event.matches.find(
            m => m.p1 === winnerUser.id || m.p2 === winnerUser.id,
          );
          if (finishedMatch) {
            result = `⚠️ The match of ${winnerUser.username} is already decided (Winner: <@${finishedMatch.winner}>).`;
          } else {
            result = `⚠️ ${winnerUser.username} is not playing in this round.`;
          }
          return;
        }

        match.winner = winnerUser.id;

        // Update Score for Swiss
        if (event.type === 'swiss') {
          if (!event.scores) event.scores = {};
          event.scores[winnerUser.id] = (event.scores[winnerUser.id] || 0) + 1;
        }

        const loserId = match.p1 === winnerUser.id ? match.p2 : match.p1;

        result = `✅ **${winnerUser.username}** won against <@${loserId}>!`;

        const remaining = event.matches.filter(m => !m.winner).length;
        if (remaining === 0) {
          // Check if Tournament Finished
          let isFinished = false;
          if (event.type === 'swiss') {
            const roundsPlayed = (event.history?.length || 0) + 1;
            if (roundsPlayed >= event.rounds) isFinished = true;
          } else {
            // Elimination: Finished if only 1 match was played (Finals)
            if (event.matches.length === 1) isFinished = true;
          }

          if (isFinished) {
            // Tournament Finished
            tournamentFinished = true;
            event.active = false;

            let winnerId,
              runnerUpId,
              thirdPlaceIds = [];

            if (event.type === 'swiss') {
              const standings = calculateStandings(event);
              winnerId = standings[0]?.id;
              runnerUpId = standings[1]?.id;
              if (standings[2]) thirdPlaceIds.push(standings[2].id);
            } else {
              // Elimination
              winnerId = match.winner;
              runnerUpId = loserId;
              // 3rd place logic (losers of the previous round/semi-finals)
              if (event.history && event.history.length > 0) {
                const lastRound = event.history[event.history.length - 1];
                lastRound.forEach(m => {
                  if (m.winner) {
                    const l = m.p1 === m.winner ? m.p2 : m.p1;
                    if (l) thirdPlaceIds.push(l);
                  }
                });
              }
            }

            // Prizes: 1st = 100%, 2nd = 50%, 3rd = 25%
            const p1 = event.prize;
            const p2 = Math.floor(p1 * 0.5);
            const p3 = Math.floor(p1 * 0.25);

            payouts.push({ id: winnerId, amount: p1 });
            if (runnerUpId) payouts.push({ id: runnerUpId, amount: p2 });
            thirdPlaceIds.forEach(uid => payouts.push({ id: uid, amount: p3 }));

            announcement = {
              name: event.name,
              channelId: event.channelId || interaction.channelId,
              winnerId,
              runnerUpId,
              thirdPlaceIds,
              p1,
              p2,
              p3,
            };

            result += `\n🎉 **Tournament Complete!** Winners announced in <#${announcement.channelId}>.`;
          } else {
            result +=
              '\n🏁 **Round ended!** Use `/event pairings` for the next round.';
          }
        }
      });

      if (tournamentFinished) {
        for (const p of payouts) nestcoins.addCoins(guildId, p.id, p.amount);

        if (announcement) {
          const channel = interaction.guild.channels.cache.get(
            announcement.channelId,
          );
          if (channel) {
            const embed = new EmbedBuilder()
              .setTitle(`🏆 Tournament Finished: ${announcement.name}`)
              .setColor('#FFD700')
              .setDescription(
                `The tournament has concluded! Here are the winners:`,
              )
              .addFields({
                name: '🥇 1st Place',
                value: `<@${announcement.winnerId}> (+${announcement.p1} coins)`,
                inline: false,
              });
            if (announcement.runnerUpId)
              embed.addFields({
                name: '🥈 2nd Place',
                value: `<@${announcement.runnerUpId}> (+${announcement.p2} coins)`,
                inline: false,
              });
            if (announcement.thirdPlaceIds.length > 0)
              embed.addFields({
                name: '🥉 3rd Place',
                value: `${announcement.thirdPlaceIds.map(id => `<@${id}>`).join(', ')} (+${announcement.p3} coins each)`,
                inline: false,
              });
            channel.send({ embeds: [embed] });
          }
        }
      }

      return interaction.reply({ content: result });
    }

    // --- BRACKET ---
    if (sub === 'bracket') {
      const id = interaction.options.getInteger('id');
      let embed = null;
      let errorMsg = null;

      db.perform(data => {
        const events = data.events?.[guildId] || [];
        const event = events.find(e => e.id === id && e.active);

        if (!event) {
          errorMsg = '❌ Event not found.';
          return;
        }

        if (!event.matches || event.matches.length === 0) {
          errorMsg =
            '⚠️ There are no active matches. Start a round first with `/event pairings`.';
          return;
        }

        embed = new EmbedBuilder()
          .setTitle(`🏆 Bracket: ${event.name}`)
          .setColor('#00AAFF')
          .setDescription('Current Bracket Status');

        let matchIndex = 1;
        for (const m of event.matches) {
          const p1 = `<@${m.p1}>`;
          const p2 = m.p2 ? `<@${m.p2}>` : '*Freilos*';

          let status = '⏳ Pending';
          if (m.winner) {
            status = `✅ Winner: <@${m.winner}>`;
          }

          embed.addFields({
            name: `Match ${matchIndex++}`,
            value: `${p1} 🆚 ${p2}\n${status}`,
            inline: true,
          });
        }
      });

      if (errorMsg) return interaction.reply({ content: errorMsg, flags: 64 });
      return interaction.reply({ embeds: [embed] });
    }

    // --- STANDINGS ---
    if (sub === 'standings') {
      const id = interaction.options.getInteger('id');
      let embed = null;
      let errorMsg = null;

      db.perform(data => {
        const events = data.events?.[guildId] || [];
        const event = events.find(e => e.id === id); // Can view standings even if finished

        if (!event) {
          errorMsg = '❌ Event not found.';
          return;
        }

        const standings = calculateStandings(event);

        embed = new EmbedBuilder()
          .setTitle(`📊 Standings: ${event.name}`)
          .setColor('#00FF00')
          .setDescription(
            `Type: ${event.type === 'swiss' ? 'Swiss' : 'Elimination'} | Rounds: ${event.history?.length || 0}`,
          );

        standings.forEach((p, i) => {
          embed.addFields({
            name: `#${i + 1}`,
            value: `<@${p.id}> — Score: **${p.score}** (Buchholz: ${p.buchholz})`,
            inline: false,
          });
        });
      });

      if (errorMsg) return interaction.reply({ content: errorMsg, flags: 64 });
      return interaction.reply({ embeds: [embed] });
    }
  },
};
