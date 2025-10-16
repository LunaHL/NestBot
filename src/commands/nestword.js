const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/db');
const fs = require('fs');
const path = require('path');
const nestcoins = require('../services/nestcoins');

const TZ = process.env.TIMEZONE || 'Europe/Berlin';
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const nowInTZ = () => new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
const getToday = () => ymd(nowInTZ());
const getYesterday = () => { const d = nowInTZ(); d.setDate(d.getDate()-1); return ymd(d); };

const WORDLIST_PATH = path.join(__dirname, '..', 'data', 'wordlist.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nestword')
    .setDescription('Daily Nest Wordle!')
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Set the daily word (admins only)')
        .addStringOption(opt =>
          opt.setName('word').setDescription('Word to set').setRequired(true)
            .setMinLength(5).setMaxLength(5)
        )
        .addIntegerOption(opt =>
          opt.setName('reward').setDescription('Reward in NestCoins (default: 15)').setMinValue(0)
        )
        .addStringOption(opt =>
          opt.setName('date').setDescription('Date (YYYY-MM-DD, default: today)')
        )
        .addBooleanOption(opt =>
          opt.setName('append').setDescription('Automatically set for next free day')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('guess')
        .setDescription('Guess today’s word')
        .addStringOption(opt =>
          opt.setName('word').setDescription('Your guess').setRequired(true)
            .setMinLength(5).setMaxLength(5)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // === /nestword set ===
    if (sub === 'set') {
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (!isAdmin) {
        return interaction.reply({ content: "❌ You don't have permission.", flags: 64 });
      }

      const word = interaction.options.getString('word').toLowerCase();
      const date = interaction.options.getString('date') || getToday();
      const append = interaction.options.getBoolean('append');
      const reward = interaction.options.getInteger('reward') ?? 15;
      let finalDate = date;
      let daysAhead = 0;

      db.perform(data => {
        if (!data.wordles) data.wordles = {};

        if (append) {
          let d = nowInTZ();
          for (let i = 0; i < 365; i++) {
            d.setDate(d.getDate() + 1);
            const nextDate = ymd(d);
            if (!data.wordles[nextDate]) {
              finalDate = nextDate;
              daysAhead = i + 1;
              break;
            }
          }
        }

        data.wordles[finalDate] = {
          answer: word,
          date: finalDate,
          reward,
          solvedBy: [],
          guesses: {},
          stats: {},
          streaks: {}
        };

        delete data.wordle; // old cleanup
      });

      
      if (fs.existsSync(WORDLIST_PATH)) {
        const wordlist = JSON.parse(fs.readFileSync(WORDLIST_PATH, 'utf8'));
        wordlist.pool = wordlist.pool.filter(w => w !== word);
        if (!wordlist.usedWords.some(e => e.date === finalDate))
          wordlist.usedWords.push({ date: finalDate, word });
        fs.writeFileSync(WORDLIST_PATH, JSON.stringify(wordlist, null, 2));
      }

      return interaction.reply({
        content: `✅ Word for **${finalDate}** set to **${word}** (${reward} coins)${
          append ? `\n📅 (${daysAhead} day${daysAhead === 1 ? '' : 's'} ahead)` : ''
        }`,
        flags: 64
      });
    }


    // === /nestword guess ===
    if (sub === 'guess') {
      const guess = interaction.options.getString('word').toLowerCase();
      const userId = interaction.user.id;
      const today = getToday();
      const yesterday = getYesterday();

      let resultMsg = null;
      let errorMsg = null;

      db.perform(data => {
        const wordle = data.wordles?.[today];
        if (!wordle || !wordle.answer) {
          errorMsg = "❌ No word set for today.";
          return;
        }

        if (!wordle.guesses) wordle.guesses = {};
        if (!wordle.solvedBy) wordle.solvedBy = [];
        if (!wordle.stats) wordle.stats = {};
        if (!wordle.streaks) wordle.streaks = {};

        const tries = wordle.guesses[userId] || 0;
        if (tries >= 6) {
          errorMsg = "❌ You already used all 6 attempts today.";
          return;
        }

        wordle.guesses[userId] = tries + 1;

        const result = [];
        for (let i = 0; i < guess.length; i++) {
          if (guess[i] === wordle.answer[i]) result.push('🟩');
          else if (wordle.answer.includes(guess[i])) result.push('🟨');
          else result.push('❌');
        }

        if (guess === wordle.answer) {
          if (!wordle.solvedBy.includes(userId)) {
            wordle.solvedBy.push(userId);
            const triesNeeded = wordle.guesses[userId];
            wordle.stats[userId] = triesNeeded;

            const streakData = wordle.streaks[userId] || { count: 0, lastDate: null };
            if (streakData.lastDate === yesterday) streakData.count++;
            else streakData.count = 1;
            streakData.lastDate = today;
            wordle.streaks[userId] = streakData;

            const coins = wordle.reward;
            const newBalance = nestcoins.addCoins(guildId, userId, coins);

            let streakMsg = "";
            if (streakData.count % 10 === 0) {
              const bonus = 20;
              const bonusBalance = nestcoins.addCoins(guildId, userId, bonus);
              streakMsg = `🔥 10-day streak! +${bonus} extra NestCoins (Total: ${bonusBalance})`;
            }

            resultMsg = `${result.join('')}\n✅ Correct! You earned ${coins} NestCoins. ${streakMsg}`;
          } else {
            resultMsg = `${result.join('')}\n✅ Already solved today.`;
          }
        } else {
          resultMsg = `${result.join('')}\n❌ Not correct, try again.`;
        }

        data.wordles[today] = wordle;
      });

      return interaction.reply({
        content: errorMsg || resultMsg,
         flags: 64 
      });
    }
  }
};
