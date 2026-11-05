# Commands

Every `.js` file here is one slash command. It's loaded automatically when the
bot starts; there's no list to update anywhere.

A command file handles the **Discord side**: options, permission checks,
replies and embeds. The real work (coins, stats, saving) is in
[`../services/`](../services/README.md).

🔒 = admin only (Discord "Administrator" permission). Admin-only commands are hidden from regular members; the admin parts of normal commands are under **`/admin`** (see below)

---

## 💰 Economy

| File | Command | What it does |
|---|---|---|
| `daily.js` | `/daily` | Claim free coins once per day (`DAILY_AMOUNT`) |
| `balance.js` | `/balance view` | Show your or someone's NestCoins |
| | `/balance transfer` | Give coins to someone |
| | `/admin coins grant` 🔒 / `remove` 🔒 | Add or take coins |
| `leaderboard.js` | `/leaderboard` | Every ranking in one place: 💰 coins, 🧩 puzzle, 🟩 Wordle app, 🍹 drinks, 🤺 duels, 📸 pictures this week, 🏅 achievements. Pick with `board:` or switch with the menu under the card |
| `gamble.js` | `/gamble` | Bet 5 coins on the Nest Roulette |
| `shop.js` | `/shop browse` | The shop as a card, grouped by category, with a category menu and a buy menu: pick an item → (items with an effect: pick the target) → confirm. NestBot's specials: 🏷️ Rename someone (pick person → time → type the name), 🔓 Get your name back (same price it cost), 🙈 Blindfold someone (pick person → time; 5 min = 20 … 1 h = 150 coins; only when blindfolds are set up) |
| | `/shop buy` | Buy directly (`item` with search while typing, `target` for items with an effect) |
| | `/shop nickname` | Rename someone for 10 min … 24 h (15 … 300 coins) directly. The old nickname comes back automatically |
| | `/admin shop add` 🔒 / `edit` 🔒 / `remove` 🔒 | Manage items: name, price, emoji, `category` (reuse one while typing or type a new one), description and an optional effect (🔇 gag / 🏷️ nickname, `minutes`, `nickname`). Old items with `[effect:gag;…]` in the text are converted automatically |
| `lootdrop.js` | `/drop status` 🔒 | Loot drop status. Drops themselves happen automatically 3–8 times a day |
| | `/drop blacklist` 🔒 | Turn drops off/on for a channel |

## 🎮 Daily games

| File | Command | What it does |
|---|---|---|
| `nestword.js` | `/nestword guess` | Guess today's word (Wordle-style, 3–7 letters) |
| | `/nestword info` | Today's length, attempts and reward |
| | `/admin nestword set` 🔒 | Set the word for a date |
| | `/admin nestword pool-bulkadd` 🔒 / `pool-remove` 🔒 / `pool-list` 🔒 / `pool-clear` 🔒 | Manage the word pools (stored in `data/wordlist.json`) |
| `puzzle.js` | **🔑 Enter code** button | On every puzzle card (announcement, `/puzzle info`, the hub menu): opens a form for today's code (10 tries per day). The first three get a bonus: 🥇 +15, 🥈 +10, 🥉 +5 |
| | `/puzzle info` | Today's puzzle card with "Open puzzle" button, your position and streak |
| | `/puzzle history` | Past puzzles, optionally which ones a user solved |
| | `/admin puzzle set` 🔒 | Set a puzzle for a date (or `append` = next free day). Setting the same day again replaces it but keeps its solvers |
| | `/admin puzzle queue` 🔒 / `remove` 🔒 | Today's and upcoming puzzles with their codes; remove one |

**Wordle app** (the Wordle activity in Discord): no command. NestBot reads the
app's daily results in the Wordle channel (`/settings channels wordle:`) and
pays automatically, also for days it missed while offline (every 30 minutes,
or now with `/settings tools`). Stats: `/profile tab:Games`, rankings:
`/leaderboard board:Wordle`, rewards table: `/help`.

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
| | `/drinks round` | 🍻 Buy a round: everyone in your voice channel (default), everyone online or everyone on the server. Preview with price first, then confirm. 5+ −10%, 10+ −20%, 20+ −30%, max 50 people; people at their limit are skipped and cost nothing. Online/everyone need the Server Members + Presence intents |

Sections: ☕ coffee, 🫖 tea (5 black teas), 🍫 hot chocolate, 🍹 cocktails,
🍺 beer, 🍷 wine, 🎃 Halloween specials. Per day: max 6 with caffeine, 3 with
alcohol, 12 in total. Menu, prices and limits: `config/drinksMenu.js`.
Pictures: `assets/drink-art/`.

## ⚔️ Tournaments and duels

| File | Command | What it does |
|---|---|---|
| `event.js` | `/event list` / `join` / `leave` | See and join tournaments |
| | `/event bracket` / `standings` | Current state (bracket or Swiss table) |
| | `/admin event create` 🔒 | New tournament: single elimination or Swiss, with prize pool |
| | `/admin event pairings` 🔒 / `win` 🔒 | Make the next round, enter match winners. Prizes are paid when it ends |
| | `/admin event add-user` 🔒 / `finish` 🔒 | Add someone manually, end an event and pay a winner by hand |
| `duel.js` | `/duel` | Rock-paper-scissors with a bet (0–500), winner takes both. Your record is in `/profile` |

## 🏅 Profile and achievements

| File | Command | What it does |
|---|---|---|
| `profile.js` | `/profile` | All stats of a member in tabs (menu, or `tab:` to open one directly): 📊 Overview · 🎮 Games (Puzzle, NestWord, Wordle app with result chart) · 🍹 Drinks (today's limits, streak, favorite, gifts, rounds) · ⚔️ Duels & fun (duels, tournaments, gags, paid nicknames, Halloween) · 🎬 Movies (your own movie settings only shown to you) · 🏅 Achievements (all, locked and unlocked) |

The achievements themselves are defined in `services/achievements.js`.

## 🤖 AI

| File | Command | What it does |
|---|---|---|
| `ai.js` | `/ai status` | AI health, request counts, today's mood |
| | `/ai roast` / `compliment` / `poem` | Paid AI texts about someone (coins refunded if the AI fails) |
| | `/ai mood` | Paid personality for the rest of the day (one per day) |
| (no command) | “@NestBot remember that …” / “forget …” / “what do you know about me?” | Facts NestBot remembers about you (max 10), handled in `services/ai.js` + `services/memory.js` without asking Gemini. The list has a 🗑️ menu to forget one |

Chatting with `@NestBot` isn't a command; it's handled in
`events/messageCreate.js` → `services/ai.js`.

## 🔇 Fun moderation

| File | Command | What it does |
|---|---|---|
| `wheel.js` | `/wheel spin` | Shows the wheel, then a 🎡 Spin button with a short animation (on someone else: costs coins). Only whoever opened it can spin |
| | `/wheel list` | All entries |
| | `/admin wheel add` 🔒 / `remove` 🔒 | Manage entries, with an optional effect (🔇 gag / 🏷️ nickname). The wheel is now per server; the old shared list moves into the first server that uses it |
| `ungag.js` | `/ungag` 🔒 | Remove someone's gag |

## 🎂 Social

| File | Command | What it does |
|---|---|---|
| `birthday.js` | `/birthday set` / `list` / `remove` | Save your birthday typed freely (“24.12.”, “Dec 24”, optional year for “turns 25”), upcoming birthdays (soonest first), remove yours |
| | `/admin birthday add-for` / `remove-for` / `announce` 🔒 | Birthdays for others (also outside names), announce now |
| `suggest.js` | `/suggest idea:` | 💡 An idea for NestBot: posted as a card with 👍/👎 and a thread; admins set the status with ⚙️ (planned, in progress, done, declined), the author gets a DM. Without text: the most liked open ideas |

📸 **Picture leaderboard** (no command): pictures in the picture channel are
counted, the weekly leaderboard is posted every Monday with coins. Live:
`/leaderboard board:Pictures`; channel and reset: `/settings channels` /
`/settings tools`.

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
| `admin.js` | `/admin <tool> <action>` 🔒 | All admin parts of other commands, grouped: `shop`, `wheel`, `puzzle`, `nestword`, `coins`, `birthday`, `event`. Only admins see it. The subcommands still live in their own files and are moved here with `utils/adminSplit.js` |
| `userMenu.js` | Right-click a member → **Apps** | 👤 View profile · 🍹 Gift a drink (menu section → drink) · 🤺 Challenge to a duel (bet in a form) · 🏷️ Rename · 🙈 Blindfold. Discord allows at most 5 |
| `settings.js` | `/settings streak` 🔒 | Switch how Puzzle and NestWord streaks are rewarded: **new** (+10% per day, max +50%, milestones) or **old** (reward × streak days, no limit). Without `mode` it shows the current one and a comparison table |
| | `/settings watch` 🔒 | Movie nights: #movies channel, room category, mod role, who may plan, when rooms open, auto-close, checkpoints, check-in coins, reminders |
| | `/settings free` 🔒 | **Free mode** on/off: drinks and rounds, shop items, nicknames, AI extras and targeted wheel spins cost nothing; coins can still be earned. Gamble and duel bets and transfers are not affected |
| | `/settings nicknames` 🔒 | `paid`: paid nicknames on/off (off resets all running ones). `self-change`: may everyone change their own nickname (edits the @everyone role; lists other roles that still allow it). `end-for`: end one person's paid nickname |
| | `/settings blindfold` 🔒 | `enabled:true` creates the 🙈 Blindfolded role and the 🕶️ in-the-dark channel and hides every channel from the role (lists channels that other roles explicitly allow); `enabled:false` removes all of it. `give` + `minutes`: blindfold someone; `end-for`: take it off |
| | `/settings hub` 🔒 | `channel`: posts and pins the NestBot menu (buttons for daily, profile, leaderboards, shop, drinks, puzzle, NestWord, movie nights, watchlist, help; answers are private). `weekly`: “💡 Did you know?” there every Monday 18:00. `tips`: how often a private tip follows a command (off / rarely / sometimes / often). `post-now`: try the weekly post |
| | `/settings channels` 🔒 | All posting channels in one place: puzzle (+ `puzzle-ping` role), Wordle app, birthdays, pictures. Empty = show them |
| | `/settings tools` 🔒 | One-off actions: pay missed Wordle results, reset this week's picture count, end all paid nicknames |

## 🍿 Movie nights

| File | Command | What it does |
|---|---|---|
| `watch.js` | `/watch plan` | Plan a movie night: `when` (understands “tomorrow 20:00”, “friday”, “fr 21:00”, “6.11. 20:00”; suggests the next days while typing), title (search while typing: movies, series, anime; leave it out to vote), for series also season, episode and how many episodes. Posts a card in #movies and a Discord event |
| | `/watch now` | Start right away: the room opens immediately |
| | **Buttons instead of commands** | **⚙️** on the card, check-in and clock (planner, admins, mod role): ✏️ change time or title (a form), 🗳️ start a vote, ❌ cancel (asks first), 🏁 end. In the room: **🔄 I’m at…** (“you're 40 s behind”), **💡 Suggest** during a vote. Under the calendar in #movies: 🎞️ History and 🏆 Nest Top 10 |
| | `/watch plan` without a title, or ⚙️ → 🗳️ | Vote on what to watch: the room opens right away, options come from the watchlists of everyone signed up, the winner is set automatically (ties: the wheel). Duration: 1 h … 7 days or until the start |

| `group.js` | `/group create` | Your own permanent private channel for a couple or a fixed group (no size limit; `/settings watch max-groups` limits how many one person may own) |
| | `/group list` | Your groups |
| | **Panel** in the group channel (moves back to the bottom after people chat; during a movie night the clock has the bottom) | Members, ⭐ up next, list size. Everyone: 📝 Watchlist (👍 vote, 🎬 watch now, ✅ watched, 🗑️ remove, 📺 **where are we?**: the group's series progress with ⏭️ we watched the next one (also marked on your own list), ⏮️ back one, 📺 set episode, ▶️ watch the next one now, 📋 episode overview with ✅; movies: 📚 the movie series; changes are posted in the channel), ➕ Add a title (form), 🍿 Watch now / plan (form: title, empty = up next; when, empty = now), 👋 Leave. Owner 👑: ➕ Invite, 👢 Remove someone, ✏️ Rename, 🗓️ show in the public calendar, 🗑️ Delete (asks first; admins too). If the owner leaves, the next member becomes owner. Panels are refreshed on startup. **📢 Alerts:** every 6 hours NestBot checks TMDB for the series the group watches and posts when a new season is announced (with date) or a new episode is out and the group is caught up (with ▶️ Watch it now) |

`/watch now` and `/watch plan` **inside a group channel** run the movie night
right there (no temporary room, nothing in #movies), with the group's own
series progress; a vote there uses the shared watchlist first.

**Series and anime:** pick season/episode, or `absolute:` for long anime
("episode 1050"), or nothing to **continue where the server stopped last
time**. After each episode: **⏭️ Next** (also into the next season) or
**🛑 Stop here**. Everyone gets exactly the episodes they were there for marked
on their watchlist. Movie series show "part 2 of 3" and the next part at the end.
| `watchlist.js` | `/watchlist add` | Add a title (📌 want to watch). With `watched:` or `rating:` for something you already saw, `season:` + `episode:` for a series you're in the middle of; plus must-watch ❗, a note, 🌐/🔒 |
| | `/watchlist show` | Your list (with private ones) or someone else's public list, with filters. Own list: pick an entry to set 📌/▶️/✅, ⭐ rate, 🔒/🌐, ❗, ✏️ note, 🗑️ remove. Series: ⏭️ next episode watched (moves to the next season, marks the series watched after the last episode), ⏮️ back one, 📺 set season + episode (or one overall number for long anime), 📋 all episodes with ✅ and episode names. Movies: 📚 the movie series with ✅ for the parts you watched. Buttons: ◀️ ▶️ pages, 🎲 pick for me, 📬 movie nights waiting for your “✅ yes, I watched it” (7 days). Someone else's: 📋 copy to your list |
| | `/watchlist settings` | Public/private list, your country, your streaming services, DM when your titles get planned |
| | `/watchlist match` | 🎯 what you all want to watch |

How a night works: sign up in the calendar → 1 hour before, a private room
opens (anyone can still **🚪 Enter room**) → at the start everyone pauses at
0:00 and presses **✅ Ready** → 3… 2… 1… ▶️ → shared live clock with
**⏸️ Pause** (anyone), **🕐 Where should I be?** and **🔄 I’m at…** (the check-in and the clock move back to the bottom when people chat) → **⚙️ → 🏁 End** posts a
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

## Small extras

- **🙋 Me too** under every served drink: orders the same drink for whoever clicks
- **🎲 Again** under `/gamble`: play another round
- **Seasonal commands:** `/trickortreat` only shows up in Discord on October 31 (`season()` in the command file; `deploy-commands.js` re-registers when a season starts or ends)

## 🎄 Christmas & 🐣 Easter (only in their season)

| File | Command | What it does |
|---|---|---|
| `christmas.js` | `/christmas advent` | Open today's door (Dec 1–24): coins, 🎟️ free drink, 🎡 free wheel spin, 🎅 Santa hat (3 days). Door 6 and 24 are special |
| | `/christmas snowball` | 3 free a day (then 5 coins): 60% hit, 15% a bystander, 25% miss. A hit freezes for 10 min (❄️ name, can't throw); a warm drink gift thaws |
| | `/christmas tree` | The server tree with ornament buttons, one a day each. 50 → 20 coins for every helper, 150 → 🌟 and double loot drops for a day. Posted finished on Dec 24 |
| | `/christmas santa join` / `leave` / `gift` / `status` | Secret Santa: sign up until Dec 10, names drawn by DM, gifts (coins put aside, a drink voucher, a note) opened Dec 24 18:00 in the holiday channel; forgetful Santas get 🪨 |
| `easter.js` | `/easter basket` / `paint` / `gift` | Your eggs, today's painted egg (collect 10 patterns), give a painted egg away |
| (chat) | Egg hunt | At Easter an egg sometimes hides under a chat message (🥚 5 · 🌈 15 · 🥇 50 coins · 💣 prank · 🐰 bunny egg); first click wins, gone after 2 min |
| (shop) | 🐰 Bunny Girl outfit / 🥕 take it off | Pink role, 🐰 name, *hops* and carrot drinks for 24 h; 3 bunnies at once = bunny party |
| `settings.js` | `/settings holidays` 🔒 | **On/off (off by default: nothing shows up)**, holiday channel, egg hunt and bunny on/off, **test mode** (Christmas / Easter / New Year now). `/settings tools` can draw/open Secret Santa, post New Year and the Easter results now |

New Year: Dec 31 23:50 a countdown, at midnight a 🥂 button (25 coins each). Holiday drinks are in `config/drinksMenu.js` (`season:`); their pictures need `npm run drink-art`.
