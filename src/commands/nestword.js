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

// ---------------- Utils ----------------
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const isAlphaLowerLen = (s, min=3, max=7) => new RegExp(`^[a-z]{${min},${max}}$`).test(s);
const attemptsForLen = len => clamp(8 - (len - 3), 5, 8);  // 3→8, 4→7, 5→6, 6→5, 7→5
const rewardForAttempts = att => Math.max(1, Math.round(15 * 6 / att)); // Base 15 @ 6 attempts

let _cachedWordlist = null;

const ensureWordlistFile = () => {
  if (!fs.existsSync(WORDLIST_PATH)) {
    const init = {
      pool3: [], pool4: [], pool5: [], pool6: [], pool7: [],
      usedWords: [],
      config: { cooldownDays: 30, requireGuessInPool: false, defaultLen: 5 }
    };
    fs.writeFileSync(WORDLIST_PATH, JSON.stringify(init, null, 2));
  }
};
const loadWordlist = () => {
  if (_cachedWordlist) return _cachedWordlist;
  ensureWordlistFile();
  try {
    _cachedWordlist = JSON.parse(fs.readFileSync(WORDLIST_PATH, 'utf8'));
  } catch (e) {
    console.error('[NestWord] Failed to load wordlist:', e);
    _cachedWordlist = { pool3: [], pool4: [], pool5: [], pool6: [], pool7: [], usedWords: [] };
  }
  return _cachedWordlist;
};
const saveWordlist = wl => {
  _cachedWordlist = wl;
  fs.writeFileSync(WORDLIST_PATH, JSON.stringify(wl, null, 2));
};

function parseBulkWords(input) {
  return input
    .split(/[\n, ]+/g)
    .map(w => w.trim().toLowerCase())
    .filter(Boolean);
}

function scoreGuess(guess, answer) {
  const len = answer.length;
  const res = Array(len).fill('❌');
  const ansArr = answer.split('');
  const gArr = guess.split('');

  const counts = {};
  for (let i = 0; i < len; i++) {
    if (gArr[i] === ansArr[i]) {
      res[i] = '🟩';
    } else {
      counts[ansArr[i]] = (counts[ansArr[i]] || 0) + 1;
    }
  }
  for (let i = 0; i < len; i++) {
    if (res[i] === '🟩') continue;
    const ch = gArr[i];
    if (counts[ch] > 0) {
      res[i] = '🟨';
      counts[ch]--;
    }
  }
  return res.join('');
}

function desiredLength(data, wl) {
  const available = [3, 4, 5, 6, 7].filter(len => {
    const pool = wl[`pool${len}`];
    return Array.isArray(pool) && pool.length > 0;
  });

  if (available.length === 0) {
    throw new Error("No words available in any pool (3–7). Please add some with /nestword pool-bulkadd.");
  }

  const randomLen = available[Math.floor(Math.random() * available.length)];
  return randomLen;
}


function pickWordForToday(data) {
  const today = getToday();
  if (!data.nestwordDaily) data.nestwordDaily = {};
  if (data.nestwordDaily[today]) return data.nestwordDaily[today];

  const wl = loadWordlist();
  const len = desiredLength(data, wl);
  const poolKey = `pool${len}`;
  const pool = wl[poolKey] || [];
  const cd = wl.config?.cooldownDays ?? 30;

  const cutoff = new Date(nowInTZ());
  cutoff.setDate(cutoff.getDate() - cd);
  const cutoffYMD = ymd(cutoff);
  const recent = new Set((wl.usedWords || []).filter(e => e.len === len && e.date > cutoffYMD).map(e => e.word));

  let candidates = pool.filter(w => !recent.has(w));
  if (candidates.length === 0) candidates = pool.slice();
  if (!candidates.length) throw new Error(`Pool${len} is empty, please add words of length ${len}.`);

  const answer = candidates[Math.floor(Math.random() * candidates.length)];
  const attempts = attemptsForLen(len);
  const reward = rewardForAttempts(attempts);

  data.nestwordDaily[today] = {
    answer,
    len,
    attempts,
    reward,
    solvedBy: [],
    guesses: {}, // userId -> number
    rows: {}     // userId -> array of emoji rows
  };

  wl.usedWords = wl.usedWords || [];
  wl.usedWords.push({ date: today, word: answer, len });
  saveWordlist(wl);

  return data.nestwordDaily[today];
}

function ensureUserBlock(data, userId) {
  if (!data.nestwordUsers) data.nestwordUsers = {};
  if (!data.nestwordUsers[userId]) {
    data.nestwordUsers[userId] = { streakCount: 0, bestStreak: 0, lastDate: null, totalSolved: 0 };
  }
  return data.nestwordUsers[userId];
}

function isAdminMember(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

// --------- Midnight scheduler (Europe/Berlin) ----------
let _midnightTimeout = null;
function msUntilNextBerlinMidnight() {
  const now = new Date();
  const tzNow = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  const tzMidnight = new Date(tzNow);
  tzMidnight.setHours(24, 0, 0, 0); // next local midnight
  return tzMidnight - tzNow;        // handles DST automatically
}
function setWordForTodaySafely() {
  db.perform(data => {
    try {
      pickWordForToday(data);
    } catch {
      // ignore (e.g., pool empty); admin can fill later
    }
  });
}
function scheduleNextMidnight() {
  const ms = msUntilNextBerlinMidnight();
  _midnightTimeout = setTimeout(() => {
    setWordForTodaySafely(); // 00:00 Berlin
    scheduleNextMidnight();  // schedule following midnight
  }, ms);
}
/** Call once after client ready:
 *   const nestword = require('./commands/nestword');
 *   nestword.initDailyPicker();
 */
function initDailyPicker() {
  setWordForTodaySafely();       // ensure word exists after boot
  try { if (_midnightTimeout) clearTimeout(_midnightTimeout); } catch {}
  scheduleNextMidnight();
}

// -------------- Slash Commands --------------
module.exports = {
  initDailyPicker,

  data: new SlashCommandBuilder()
    .setName('nestword')
    .setDescription('Daily Nest Wordle with variable lengths (3–7)')
    // set / guess / info
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set or override the daily word for a specific date (admins only)')
        .addStringOption(opt => opt.setName('word').setDescription('The word (3–7 letters, a–z)').setRequired(true))
        .addStringOption(opt => opt.setName('date').setDescription('Date YYYY-MM-DD (default: today)'))
        .addIntegerOption(opt => opt.setName('reward').setDescription('Override reward in NestCoins (optional)'))
    )
    .addSubcommand(sub =>
      sub.setName('guess')
        .setDescription('Guess today’s word')
        .addStringOption(opt => opt.setName('word').setDescription('Your guess (3–7 letters)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('info')
        .setDescription('Show today’s word settings: length, attempts, reward')
    )
    // pool-* (no subcommand group)
    .addSubcommand(sub =>
      sub.setName('pool-bulkadd')
        .setDescription('Add many words at once (length auto-detected, admins only)')
        .addStringOption(opt => opt.setName('words').setDescription('Words separated by newline/comma/space').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('pool-remove')
        .setDescription('Remove a single word (length auto-detected, admins only)')
        .addStringOption(opt => opt.setName('word').setDescription('The exact word to remove').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('pool-list')
        .setDescription('List words in a pool length (admins only)')
        .addIntegerOption(opt => opt.setName('length').setDescription('3–7').setRequired(true))
        .addIntegerOption(opt => opt.setName('page').setDescription('Page number (1-based)'))
    )
    .addSubcommand(sub =>
      sub.setName('pool-clear')
        .setDescription('Clear a pool by length (admins only)')
        .addIntegerOption(opt => opt.setName('length').setDescription('3–7').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // ---------------- /nestword set ----------------
    if (sub === 'set') {
      if (!isAdminMember(interaction)) {
        return interaction.reply({ content: "❌ You don't have permission.", flags: 64 });
      }
      const wordRaw = interaction.options.getString('word').trim().toLowerCase();
      const date = interaction.options.getString('date') || getToday();
      const manualReward = interaction.options.getInteger('reward');

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        return interaction.reply({ content: '❌ Invalid date format. Use YYYY-MM-DD.', flags: 64 });
      if (!isAlphaLowerLen(wordRaw, 3, 7))
        return interaction.reply({ content: '❌ Word must be 3–7 letters, a–z only.', flags: 64 });

      const len = wordRaw.length;
      const attempts = attemptsForLen(len);
      const reward = manualReward ?? rewardForAttempts(attempts);

      db.perform(data => {
        if (!data.nestwordDaily) data.nestwordDaily = {};
        data.nestwordDaily[date] = {
          answer: wordRaw,
          len,
          attempts,
          reward,
          solvedBy: [],
          guesses: {},
          rows: {}
        };
        const wl = loadWordlist();
        wl.usedWords = wl.usedWords || [];
        wl.usedWords = wl.usedWords.filter(e => e.date !== date);
        wl.usedWords.push({ date, word: wordRaw, len });
        saveWordlist(wl);
      });

      return interaction.reply({
        content: `✅ Set word for **${date}** → **${wordRaw}** (len=${len}, attempts=${attempts}, reward=${reward})`,
        flags: 64
      });
    }

    // ---------------- /nestword guess ----------------
    if (sub === 'guess') {
      const guessRaw = interaction.options.getString('word').trim().toLowerCase();
      if (!isAlphaLowerLen(guessRaw, 3, 7)) {
        return interaction.reply({ content: '❌ Guess must be 3–7 letters, a–z only.', flags: 64 });
      }
      const userId = interaction.user.id;
      const today = getToday();
      const yesterday = getYesterday();

      let replyContent = '❌ Unknown error.';
      db.perform(data => {
        // ensure daily exists (midnight job usually set; fallback here)
        let daily = data.nestwordDaily?.[today];
        try {
          if (!daily || !daily.answer) daily = pickWordForToday(data);
        } catch (err) {
          replyContent = `❌ ${err.message}`;
          return;
        }

        // length match
        if (guessRaw.length !== daily.len) {
          replyContent = `❌ Wrong length. Today's word has **${daily.len}** letters.`;
          return;
        }

        // optional: must be in pool
        const wl = loadWordlist();
        const requireInPool = !!(wl.config && wl.config.requireGuessInPool);
        if (requireInPool) {
          const key = `pool${daily.len}`;
          const pool = wl[key] || [];
          if (!pool.includes(guessRaw)) {
            replyContent = `❌ Guess not in allowed word list for length ${daily.len}.`;
            return;
          }
        }

        daily.guesses = daily.guesses || {};
        daily.solvedBy = daily.solvedBy || [];
        daily.rows = daily.rows || {};
        if (!data.nestwordDaily) data.nestwordDaily = {};

        const used = daily.guesses[userId] || 0;
        if (daily.solvedBy.includes(userId)) {
          const rows = daily.rows[userId] || [];
          replyContent = `${rows.length ? rows[rows.length - 1] + '\n' : ''}✅ Already solved today.`;
          data.nestwordDaily[today] = daily;
          return;
        }

        if (used >= daily.attempts) {
          replyContent = `❌ No attempts left (${daily.attempts}/${daily.attempts}).`;
          data.nestwordDaily[today] = daily;
          return;
        }

        const row = scoreGuess(guessRaw, daily.answer);
        daily.rows[userId] = daily.rows[userId] || [];
        daily.rows[userId].push(row);
        daily.guesses[userId] = used + 1;

        if (guessRaw === daily.answer) {
          daily.solvedBy.push(userId);

          const u = ensureUserBlock(data, userId);
          if (u.lastDate === yesterday) u.streakCount += 1;
          else u.streakCount = 1;
          u.lastDate = today;
          u.bestStreak = Math.max(u.bestStreak || 0, u.streakCount);
          u.totalSolved = (u.totalSolved || 0) + 1;

          let coins = daily.reward;
          let streakMsg = '';
          if (u.streakCount > 1) {
            coins *= u.streakCount;
            streakMsg = `\n🔥 **${u.streakCount}-day streak!** Reward multiplied by **${u.streakCount}**!`;
          }

          const newBalance = nestcoins.addCoins(guildId, userId, coins);

          replyContent = `${row}\n✅ Correct! +${coins} NestCoins (Balance: ${newBalance})${streakMsg}`;
        } else {
          const left = daily.attempts - daily.guesses[userId];
          replyContent = `${row}\n❌ Not correct. Attempts left: **${left}/${daily.attempts}**.`;
        }

        data.nestwordDaily[today] = daily;
      });

      return interaction.reply({ content: replyContent, flags: 64 });
    }

    // ---------------- /nestword info ----------------
    if (sub === 'info') {
      const userId = interaction.user.id;
      const today = getToday();

      let content = '❌ Unknown error.';
      db.perform(data => {
        let daily = data.nestwordDaily?.[today];
        try {
          if (!daily || !daily.answer) daily = pickWordForToday(data); // if missing, set now
        } catch (err) {
          content = `❌ ${err.message}`;
          return;
        }

        const used = (daily.guesses || {})[userId] || 0;
        const left = (daily.attempts || 0) - used;

        content =
          `📅 **Today** (${today})\n` +
          `• **Length:** ${daily.len}\n` +
          `• **Attempts:** ${daily.attempts}\n` +
          `• **Reward:** ${daily.reward} NestCoins` +
          (used ? `\n• **Your attempts used:** ${used} (left: ${Math.max(0,left)})` : '');
      });

      return interaction.reply({ content, flags: 64 });
    }

    // ----- pool-* (admins only) -----
    if (sub.startsWith('pool-')) {
      if (!isAdminMember(interaction)) {
        return interaction.reply({ content: "❌ You don't have permission.", flags: 64 });
      }

      // /nestword pool-bulkadd
      if (sub === 'pool-bulkadd') {
        const raw = interaction.options.getString('words');
        const words = parseBulkWords(raw);
        if (!words.length) return interaction.reply({ content: '❌ No valid words found in input.', flags: 64 });

        const wl = loadWordlist();
        const addedByLen = { 3: [], 4: [], 5: [], 6: [], 7: [] };
        const skipped = [];

        for (const w of words) {
          if (!/^[a-z]+$/.test(w) || w.length < 3 || w.length > 7) { skipped.push(w); continue; }
          const key = `pool${w.length}`;
          wl[key] = wl[key] || [];
          if (!wl[key].includes(w)) { wl[key].push(w); addedByLen[w.length].push(w); }
        }
        saveWordlist(wl);

        const summary = [
          `✅ Added: 3:${addedByLen[3].length}, 4:${addedByLen[4].length}, 5:${addedByLen[5].length}, 6:${addedByLen[6].length}, 7:${addedByLen[7].length}`,
          skipped.length ? `⚠️ Skipped: ${skipped.slice(0,10).join(', ')}${skipped.length>10?'…':''}` : null
        ].filter(Boolean).join('\n');
        return interaction.reply({ content: summary, flags: 64 });
      }

      // /nestword pool-remove
      if (sub === 'pool-remove') {
        const word = interaction.options.getString('word').trim().toLowerCase();
        if (!/^[a-z]+$/.test(word) || word.length < 3 || word.length > 7)
          return interaction.reply({ content: '❌ Word must be 3–7 letters, a–z only.', flags: 64 });

        const wl = loadWordlist();
        const key = `pool${word.length}`;
        const before = (wl[key] || []).length;
        wl[key] = (wl[key] || []).filter(w => w !== word);
        saveWordlist(wl);

        return interaction.reply({
          content: (wl[key].length < before)
            ? `✅ Removed **${word}** from pool${word.length}.`
            : `ℹ️ **${word}** not found in pool${word.length}.`,
          flags: 64
        });
      }

      // /nestword pool-list
      if (sub === 'pool-list') {
        const length = interaction.options.getInteger('length');
        const page = Math.max(1, interaction.options.getInteger('page') || 1);
        if (length < 3 || length > 7) return interaction.reply({ content: '❌ Length must be between 3 and 7.', flags: 64 });

        const wl = loadWordlist();
        const key = `pool${length}`;
        const arr = (wl[key] || []).slice().sort();
        const pageSize = 50;
        const totalPages = Math.max(1, Math.ceil(arr.length / pageSize));
        const p = Math.min(page, totalPages);
        const chunk = arr.slice((p-1)*pageSize, (p-1)*pageSize + pageSize);

        const header = `📚 pool${length} (size=${arr.length}) — page ${p}/${totalPages}`;
        const body = chunk.length ? chunk.join(', ') : '_empty_';
        return interaction.reply({ content: `${header}\n${body}`, flags: 64 });
      }

      // /nestword pool-clear
      if (sub === 'pool-clear') {
        const length = interaction.options.getInteger('length');
        if (length < 3 || length > 7) return interaction.reply({ content: '❌ Length must be between 3 and 7.', flags: 64 });

        const wl = loadWordlist();
        wl[`pool${length}`] = [];
        saveWordlist(wl);
        return interaction.reply({ content: `✅ Cleared pool${length}.`, flags: 64 });
      }
    }

    // Fallback
    return interaction.reply({ content: '❌ Unknown command usage.', flags: 64 });
  }
};
