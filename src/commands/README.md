# Commands

Every `.js` file here is one slash command. It's loaded automatically when the
bot starts; there's no list to update anywhere.

A command file handles the **Discord side**: options, permission checks,
replies and embeds. The real work (coins, stats, saving) is in
[`../services/`](../services/README.md).

🔒 = admin only (Discord "Administrator" permission)

---

## 💰 Economy

| File | Command | What it does |
|---|---|---|
| `daily.js` | `/daily` | Claim free coins once per day (`DAILY_AMOUNT`) |
| `balance.js` | `/balance view` | Show your or someone's NestCoins |
| | `/balance transfer` | Give coins to someone |
| | `/balance grant` 🔒 / `remove` 🔒 | Add or take coins |
| `leaderboard.js` | `/leaderboard` | Richest members |
| `gamble.js` | `/gamble` | Bet 5 coins on the Nest Roulette |
| `shop.js` | `/shop list` / `buy` | Browse and buy items |
| | `/shop add` 🔒 / `remove` 🔒 | Manage items. An item can gag someone: put `[effect:gag;duration:300]` (seconds) in its description |
| `lootdrop.js` | `/drop status` 🔒 | Loot drop status. Drops themselves happen automatically 3–8 times a day |
| | `/drop blacklist` 🔒 | Turn drops off/on for a channel |

## 🎮 Daily games

| File | Command | What it does |
|---|---|---|
| `nestword.js` | `/nestword guess` | Guess today's word (Wordle-style, 3–7 letters) |
| | `/nestword info` | Today's length, attempts and reward |
| | `/nestword set` 🔒 | Set the word for a date |
| | `/nestword pool-bulkadd` 🔒 / `pool-remove` 🔒 / `pool-list` 🔒 / `pool-clear` 🔒 | Manage the word pools (stored in `data/wordlist.json`) |
| `puzzle.js` | `/puzzle solve` | Enter today's solve code |
| | `/puzzle info` | Today's puzzle, your streak |
| | `/puzzle history` | Past puzzles, optionally which ones a user solved |
| | `/puzzle set` 🔒 | Set a puzzle for a date (or `append` = next free day) |

Both games give a streak bonus (`utils/streak.js`), and yesterday's results are
posted after midnight (`services/scoreboard.js`).

## ☕ Café

| File | Command | What it does |
|---|---|---|
| `coffee.js` | `/coffee menu` | Drinks and prices |
| | `/coffee order` | Buy yourself a drink (with picture and maybe latte art) |
| | `/coffee gift` | Buy someone a drink, with an optional note |
| | `/coffee stats` / `leaderboard` | Cups, streaks, favorite drink, biggest drinkers |

Menu and prices: `config/coffeeMenu.js`. Pictures: `assets/coffee-art/`.

## ⚔️ Tournaments and duels

| File | Command | What it does |
|---|---|---|
| `event.js` | `/event list` / `join` / `leave` | See and join tournaments |
| | `/event bracket` / `standings` | Current state (bracket or Swiss table) |
| | `/event create` 🔒 | New tournament: single elimination or Swiss, with prize pool |
| | `/event pairings` 🔒 / `win` 🔒 | Make the next round, enter match winners. Prizes are paid when it ends |
| | `/event add-user` 🔒 / `finish` 🔒 | Add someone manually, end an event and pay a winner by hand |
| `duel.js` | `/duel challenge` | Rock-paper-scissors with a bet (0–500), winner takes both |
| | `/duel stats` | Win/loss record |

## 🏅 Profile and achievements

| File | Command | What it does |
|---|---|---|
| `profile.js` | `/profile` | All stats of a member, plus achievement badges |
| `achievements.js` | `/achievements` | All achievements, locked and unlocked |

The achievements themselves are defined in `services/achievements.js`.

## 🤖 AI

| File | Command | What it does |
|---|---|---|
| `ai.js` | `/ai status` | AI health, request counts, today's mood |
| | `/ai roast` / `compliment` / `poem` | Paid AI texts about someone (coins refunded if the AI fails) |
| | `/ai mood` | Paid personality for the rest of the day (one per day) |
| `memory.js` | `/memory add` / `list` / `forget` | Facts NestBot remembers about you (max 10) |

Chatting with `@NestBot` isn't a command; it's handled in
`events/messageCreate.js` → `services/ai.js`.

## 🔇 Fun moderation

| File | Command | What it does |
|---|---|---|
| `wheel.js` | `/wheel spin` | Spin the punishment wheel (on someone else: costs coins) |
| | `/wheel list` | All entries |
| | `/wheel add` 🔒 / `remove` 🔒 | Manage entries. An entry can gag: add `[effect:gag;duration:120]` |
| `ungag.js` | `/ungag` 🔒 | Remove someone's gag |

## 🎂 Social

| File | Command | What it does |
|---|---|---|
| `birthday.js` | `/birthday list` / `add` / `remove` | Birthdays (you can manage your own; admins all) |
| | `/birthday channel` 🔒 / `announce` 🔒 | Where to announce; announce now. Announcements happen automatically with 200 coins |
| `pictracker.js` | `/pictracker show` | This week's picture leaderboard |
| | `/pictracker setchannel` 🔒 / `reset` 🔒 | Which channel to count; reset the week |

## ❓ Help

| File | Command | What it does |
|---|---|---|
| `help.js` | `/help` | Overview of all features, with a dropdown per category |
| | `/help category:` | One category straight away |
| | `/help command:` | One command in detail: subcommands, options, 🔒 admin parts. Suggests matches while typing (searches names and explanations) |

The explanations are in `config/help.js`; subcommands and options are read
from the command files, so they're always current.

## 🎃 Halloween

| File | Command | What it does |
|---|---|---|
| `trickortreat.js` | `/trickortreat` | Only on October 31: 3 tries for treats or tricks. Other days: a countdown |

---

## Adding a command

1. Create a new file here, e.g. `hello.js`:
   ```js
   const { SlashCommandBuilder } = require('discord.js');

   module.exports = {
     data: new SlashCommandBuilder()
       .setName('hello')
       .setDescription('Say hi'),

     async execute(interaction) {
       await interaction.reply('Hi! 👋');
     },
   };
   ```
2. Add it to `/help`: put its name in a category in `config/help.js` and
   write an `explain` text in `COMMANDS` (mark admin-only subcommands there).
   If you skip this, it still shows up in `/help` under "Other".
3. Run `npm test` to make sure nothing crashes.
4. Restart the bot. The command shows up in Discord within a minute.

Useful building blocks:
- **Coins:** `services/nestcoins.js` (`getBalance`, `addCoins`, `removeCoins`)
- **Data:** `utils/db.js` (`db.read(...)`, `db.perform(...)`)
- **Admin only:** `const { isAdmin } = require('../utils/permissions')`
- **Dates:** `utils/time.js` (`localDate()`, `isHalloween()`)
- **Achievements:** after doing something, call
  `achievements.announce(interaction, [userId])` to check and announce unlocks
- **Background job:** export `schedule(client)` from the command file and use
  `runEvery` from `utils/schedule.js`; it starts automatically with the bot
- **Only visible to the user:** add `flags: 64` to the reply
