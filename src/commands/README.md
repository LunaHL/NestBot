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
| `puzzle.js` | `/puzzle solve` | Enter today's code (10 tries per day). The first three get a bonus: 🥇 +15, 🥈 +10, 🥉 +5 |
| | `/puzzle info` | Today's puzzle card with "Open puzzle" button, your position and streak |
| | `/puzzle history` | Past puzzles, optionally which ones a user solved |
| | `/puzzle leaderboard` | Most solved, most first places, longest streaks |
| | `/puzzle set` 🔒 | Set a puzzle for a date (or `append` = next free day). Setting the same day again replaces it but keeps its solvers |
| | `/puzzle queue` 🔒 / `remove` 🔒 | Today's and upcoming puzzles with their codes; remove one |
| | `/puzzle channel` 🔒 | Puzzle channel (+ optional role ping): new puzzles are announced there, solves are posted there |

| `wordle.js` | `/wordle stats` / `leaderboard` | Stats and best players of the **Wordle app** (the Wordle activity in Discord) |
| | `/wordle rewards` | How many coins each result pays |
| | `/wordle channel` 🔒 | The channel where the Wordle app posts its daily results. NestBot reads them there and pays automatically |
| | `/wordle scan` 🔒 | Pay results the bot missed while it was offline (it also does this every 30 minutes) |

Wordle app rewards: 1/6 = 50, 2/6 = 35, 3/6 = 25, 4/6 = 15, 5/6 = 10, 6/6 = 5,
X/6 = 2, plus +10 for the best score of the day (👑). Change them in
`services/wordle.js`.

NestWord and Puzzle give a streak bonus (`utils/streak.js`), and yesterday's results are
posted after midnight (`services/scoreboard.js`).

## 🍹 Café & Bar

| File | Command | What it does |
|---|---|---|
| `drinks.js` | `/drinks menu` | All drinks and prices, or one section (`category:`) |
| | `/drinks order` | Buy yourself a drink (with picture and maybe latte art). The drink is chosen by typing: "tea", "earl", "beer" … |
| | `/drinks gift` | Buy someone a drink, with an optional note |
| | `/drinks stats` / `leaderboard` | Drinks per category, today's limits, streak, favorite, most drinks |

Sections: ☕ coffee, 🫖 tea (5 black teas), 🍫 hot chocolate, 🍹 cocktails,
🍺 beer, 🍷 wine, 🎃 Halloween specials. Per day: max 6 with caffeine, 3 with
alcohol, 12 in total. Menu, prices and limits: `config/drinksMenu.js`.
Pictures: `assets/drink-art/`.

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

## 🛠️ Admin

| File | Command | What it does |
|---|---|---|
| `settings.js` | `/settings streak` 🔒 | Switch how Puzzle and NestWord streaks are rewarded: **new** (+10% per day, max +50%, milestones) or **old** (reward × streak days, no limit). Without `mode` it shows the current one and a comparison table |
| | `/settings watch` 🔒 | Movie nights: #movies channel, room category, mod role, who may plan, when rooms open, auto-close, checkpoints, check-in coins, reminders |
| | `/settings free` 🔒 | **Free mode** on/off: drinks, shop items, AI extras and targeted wheel spins cost nothing; coins can still be earned. Gamble and duel bets and transfers are not affected |

## 🍿 Movie nights

| File | Command | What it does |
|---|---|---|
| `watch.js` | `/watch plan` | Plan a movie night: title (search while typing: movies, series, anime), day, time; for series also season, episode and how many episodes. Posts a card in #movies and a Discord event |
| | `/watch now` | Start right away: the room opens immediately |
| | `/watch calendar` | Upcoming nights with sign-up buttons (also pinned in #movies) |
| | `/watch sync` | In a room: "you're 40 s behind" |
| | `/watch edit` / `cancel` / `end` | Planner, admins and the mod role only |
| | `/watch history` / `top` | Past movie nights; 🏆 Nest Top 10 by rating |
| | `/watch plan` without a title, or `/watch vote` | 🗳️ Vote on what to watch: the room opens right away, options come from the watchlists of everyone signed up, the winner is set automatically (ties: the wheel). Duration: 1 h … 7 days or until the start |
| | `/watch suggest` | In the room: add a title to the running vote |

| `group.js` | `/group create` | Your own permanent private channel for a couple or a fixed group (no size limit; `/settings watch max-groups` limits how many one person may own) |
| | `/group add` / `kick` (owner) · `leave` · `delete` (owner or admins, asks first) · `rename` · `list` | Manage it. If the owner leaves, the next member becomes owner |
| | `/group watchlist add` / `remove` / `show` / `seen` / `next` | Shared watchlist with 👍 votes; "up next" = most 👍; start watching straight from the list |
| | `/group calendar` | Show the group's movie nights in the public calendar (only members can join) |

`/watch now` and `/watch plan` **inside a group channel** run the movie night
right there (no temporary room, nothing in #movies), with the group's own
series progress; a vote there uses the shared watchlist first.

**Series and anime:** pick season/episode, or `absolute:` for long anime
("episode 1050"), or nothing to **continue where the server stopped last
time**. After each episode: **⏭️ Next** (also into the next season) or
**🛑 Stop here**. Everyone gets exactly the episodes they were there for marked
on their watchlist. Movie series show "part 2 of 3" and the next part at the end.
| `watchlist.js` | `/watchlist add` / `remove` / `edit` | Your list: 📌 want, ▶️ watching (season/episode), ✅ watched; must-watch ❗, notes, 🌐/🔒 per entry |
| | `/watchlist show` | Yours (with private ones) or someone else's public list, with filters and "📋 copy to my watchlist" |
| | `/watchlist seen` / `rate` | Mark as watched / rate ⭐1–5 (outside movie nights) |
| | `/watchlist pending` | Movie nights waiting for your "✅ yes, I watched it" (7 days) |
| | `/watchlist settings` | Public/private list, your country, your streaming services, DM when your titles get planned |
| | `/watchlist match` / `random` | 🎯 what you all want to watch; 🎲 pick something |

How a night works: sign up in the calendar → 1 hour before, a private room
opens (anyone can still **🚪 Enter room**) → at the start everyone pauses at
0:00 and presses **✅ Ready** → 3… 2… 1… ▶️ → shared live clock with
**⏸️ Pause** (anyone) and **🕐 Where should I be?** → `/watch end` posts a
summary in #movies and deletes the room (or it closes itself after 24 h).
Admins set it up with `/settings watch`.

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
- **Coins:** `services/nestcoins.js` (`getBalance`, `addCoins`, `removeCoins`). For anything people *buy*, use `pay()` so free mode works
- **Data:** `utils/db.js` (`db.read(...)`, `db.perform(...)`)
- **Admin only:** `const { isAdmin } = require('../utils/permissions')`
- **Dates:** `utils/time.js` (`localDate()`, `isHalloween()`)
- **Achievements:** after doing something, call
  `achievements.announce(interaction, [userId])` to check and announce unlocks
- **Background job:** export `schedule(client)` from the command file and use
  `runEvery` from `utils/schedule.js`; it starts automatically with the bot
- **Only visible to the user:** add `flags: 64` to the reply
