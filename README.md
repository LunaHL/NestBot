# 🪺 NestBot

The Discord bot of **The Nest**: a NestCoins economy, daily games, a café & bar,
tournaments, duels, achievements and an AI caretaker (Google Gemini) you can
chat with by pinging `@NestBot`.

- **All commands:** [`src/commands/README.md`](src/commands/README.md)
- **How the code is organized:** [`src/README.md`](src/README.md)
- **What changed when:** [`CHANGELOG.md`](CHANGELOG.md)
- **What comes next (ideas):** [`ROADMAP.md`](ROADMAP.md)

---

## Features at a glance

| | |
|---|---|
| 💰 **Economy** | NestCoins, `/daily` (off), `/balance`, `/leaderboard` (all rankings), `/shop` (categories, effects, nicknames; off), `/gamble` (off), random loot drops in chat (off), free mode for admins (`/settings free`) |
| 🎮 **Daily games** | `/nestword` (Wordle-like, 3–7 letters; off), `/puzzle` (puzzle of the day), coins for the Discord **Wordle app** (automatic), streak bonuses, daily results post |
| 🍹 **Café & Bar** | `/drinks` to order or gift (gifts off) coffee, tea, hot chocolate, cocktails, beer and wine, with pictures, latte art, streaks and daily limits |
| ⚔️ **Competition** | `/event` tournaments (single elimination / Swiss; off), `/duel` rock-paper-scissors with bets (off) |
| 🏅 **Progress** | `/profile` with all stats in tabs (games, drinks, duels & fun, movies, achievements), 60 achievements with coin rewards (off) |
| 🤖 **AI** | Ping `@NestBot` to chat; `/ai roast/compliment/poem`, `/ai mood`, “@NestBot remember that …” (all off) |
| 🔇 **Fun moderation** | `/wheel` punishment wheel, gags (garbled messages), `/ungag`, 🙈 blindfolds, paid temporary nicknames (in `/shop`) (all off) |
| 🎂 **Social** | `/birthday` announcements with coins, weekly picture leaderboard (off), `/suggest` ideas (off), `/remind` DMs (off) |
| 🍿 **Movie nights** | `/watch`: plan or start a movie/series/anime night, sign up in the #movies calendar, private room, check-in and a shared live clock so everyone watches in sync on their own device. `/watchlist`: personal watchlists with ratings and matches. `/group` watch groups (all off) |
| 🎄 **Christmas & Easter** | Dec 1–26: `/christmas` advent calendar, Secret Santa, snowballs, the server tree, holiday drinks, New Year post. Easter: egg hunt in the chat, 🐰 Bunny Girl outfit, `/easter` egg painting. Admins can test them any time (`/settings holidays test:`) (off) |
| 🎃 **Halloween** | Only on October 31: `/trickortreat`, spooky drinks, haunted loot drops (off) |
| ❓ **Help** | `/help` explains everything in Discord, with categories and a command search; ask @NestBot; pinned hub menu (off); right-click a member → Apps (off); tips after commands (off) |
| 🛠️ **Admin** | `/settings` and `/admin` (shop, wheel, puzzle, NestWord, coins, birthdays, tournaments), hidden from regular members |

## Switching features on/off

Most features are switched off right now (marked “(off)” above).
- **Defaults:** `src/config/features.js`, one line per feature (`true` = on). Restart after a change.
- **In Discord:** `/settings features` (admins). Pick in the two menus what is on; works right away and is saved in the database. **↩️ Back to file defaults** undoes it.

Off means invisible everywhere (commands, `/help`, hub, reminders, tips, NestBot's knowledge, profile, leaderboards, background jobs). All data and channels are kept.

---

## Setup (first time)

Needs **Node.js 20 or newer** (`node -v`).

1. **Install:**
   ```bash
   git clone https://github.com/LunaHL/NestBot.git
   cd NestBot
   npm install
   ```
2. **Settings:** copy `.env.example` to `.env` and fill it in. Every setting is
   explained in that file. Required: `BOT_TOKEN`, `CLIENT_ID`, `GUILD_ID`,
   `SCOREBOARD_CHANNEL_ID`, and `GEMINI_API_KEY` for the AI. Optional:
   `TMDB_TOKEN` for movie posters and info.
3. **Start:**
   ```bash
   npm start
   ```
   The bot registers its slash commands and logs in. Data files are created
   automatically in `src/data/`.

In the Discord Developer Portal (Bot → Privileged Gateway Intents), turn on:
- **Message Content** (required: AI chat, gags, picture tracker)
- **Server Members** and **Presence** (optional: `/drinks round` for everyone
  or everyone online, and paid nicknames that can't be changed back early).
  If they're off, NestBot starts without them and logs a warning.

On the server, its role needs **Manage Channels**, **Manage Roles**, **Manage
Events** (movie night rooms and events) **Manage Nicknames** (paid nicknames) and **Manage Roles** (blindfolds).
For nicknames, NestBot's role must be **above** the roles of the people it
renames; the server owner can never be renamed.

**Channels:** set the puzzle, Wordle, birthday and picture channels once with
`/settings channels`.

**Movie nights:** set them up once in Discord with
`/settings watch channel:#movies category:<a category for the rooms>`.

## The menu (on the server)

```bash
npm run menu
```
Everything for running the bot in one place (it runs in pm2):

| | |
|---|---|
| **Update** | `git pull`, `npm install` if needed, `npm test`, and only if the tests pass: restart and show the log. If they fail, the bot keeps running and the menu offers to go back to the old code |
| **Status** | pm2 state, uptime, restarts, version, data sizes, backups, last crash |
| **Logs** / **Logs live** | `pm2 logs` (live: Ctrl+C goes back to the menu) |
| **Restart / Stop / Start** | pm2 (Start also sets the bot up in pm2 if it isn't yet) |
| **Backup now** | a ZIP of all data in `~/nestbot-backups/` |
| **Restore** | a daily backup, everything or only one file. Makes a ZIP of the current data first, stops and starts the bot itself |
| **Log rotation** | sets up `pm2-logrotate` once (10 MB per file, 7 kept) |

## Updating the bot

On the server: `npm run menu` → **Update**. By hand it's:
```bash
git pull
npm install        # only needed when package.json changed, but never hurts
npm test
pm2 restart nestbot
```
Your data (`src/data/`) and `.env` are not in git, so an update never touches
them.

**Version:** `version` in `package.json` matches the newest entry in
`CHANGELOG.md` (V 1.25 → `1.25.0`). Change both together. The bot logs it at
startup, the menu shows it.

## Backup and error DMs

With `MAINTAINER_ID` in `.env` (your Discord user ID), NestBot DMs you:
- **once a week** a ZIP of all data (`BACKUP_DM_DAYS`, first one right after
  the start). To restore: stop the bot, unzip into `src/data/`, start it.
  These are your copies off the server; the daily backups are on the server.
- **bad errors:** the bot crashed and pm2 restarted it, a command or button
  failed for someone, saving data failed. The same error at most once a day,
  at most 5 DMs an hour. Small hiccups of background jobs only go to the log.

Your DMs must be open for the bot (it shares a server with you).

**Rule of thumb:** make code changes on your PC, run `npm test`, push, then
`git pull` on the server. Don't edit code directly on the server, or the two
copies drift apart.

## Testing

```bash
npm test
```
Runs every command with fake input and reports anything that crashes. It uses
a temporary data folder, so it's safe to run anywhere, even on the server.
See [`tests/README.md`](tests/README.md).

## Other scripts

| Command | What it does |
|---|---|
| `npm start` | Start the bot |
| `npm test` | Run the smoke test |
| `npm run menu` | The maintainer menu on the server: update, status, logs, backups, restore |
| `npm run commands` | Only register the slash commands with Discord (the bot also does this on every start) |
| `npm run drink-art` | Generate missing drink pictures once ([details](src/scripts/README.md)) |

---

## Where do I change…?

| What | Where |
|---|---|
| Drinks, prices, serving lines, daily limits | `src/config/drinksMenu.js` |
| Texts of `/help` | `src/config/help.js` |
| Movie night timings (room opens, auto-close, checkpoints, check-in coins), mod role | `/settings watch` in Discord |
| Drink pictures | `src/assets/drink-art/` ([README](src/assets/drink-art/README.md)) |
| AI personality, moods | `src/services/ai.js` (`buildSystemPrompt`, `MOODS`) |
| Prices for roast / compliment / poem / mood | `src/commands/ai.js` (`PRICES`) |
| Achievements (add, change rewards) | `src/services/achievements.js` |
| Streak bonus for Puzzle and NestWord | Switch old/new with `/settings streak` in Discord; numbers in `src/utils/streak.js` |
| Puzzle rewards, first-solver bonus, tries per day | `src/services/puzzle.js` (top of the file) |
| Wordle app rewards | `src/services/wordle.js` (`REWARDS`, `CROWN_BONUS`) |
| Switch whole features on/off | Defaults: `src/config/features.js`; override: `/settings features` in Discord |
| Daily coins | `src/commands/daily.js` (`DAILY_AMOUNT`) |
| Birthday coins | `src/commands/birthday.js` (`BIRTHDAY_COINS`) |
| Picture tracker rewards | `src/services/pictracker.js` |
| Duel limits | `src/commands/duel.js` (`MAX_BET`, timers) |
| Targeted wheel spin price | `src/services/wheel.js` (`PRICE_TARGETED_SPIN`) |
| Nickname prices and durations | `src/services/nickname.js` (`PRICES`) |
| Drink round discounts, max people | `src/services/drinks.js` (`ROUND_DISCOUNTS`, `ROUND_MAX`) |
| Colors and the shared message style | `src/utils/ui.js` |
| New effects for shop items and the wheel | `src/services/effects.js` |
| Halloween outcomes and tries | `src/services/halloween.js` |
| How long old data stays before archiving | `src/services/cleanup.js` |
| Number of daily backups | `src/utils/db.js` (`BACKUPS_TO_KEEP`) |
| Which data file lands in which folder of `src/data/` | `src/utils/dataLayout.js` |
| Backup DM interval, who gets error DMs | `.env` (`BACKUP_DM_DAYS`, `MAINTAINER_ID`) |
| Error DM limits | `src/services/maintainer.js` |
| Gemini models, time zone, test switches | `.env` (see `.env.example`) |

Restart the bot after changing anything.

---

## Data, backups and the archive

Everything the bot remembers is in `src/data/`. Details and how to restore a
backup: [`src/data/README.md`](src/data/README.md).

- `economy/`, `games/`, `drinks/`, `social/`, `movies/`, `settings/` …: all
  live data, one file per kind (e.g. `economy/nestcoins.json`), saved safely
  within 2 seconds of any change. Which file goes where:
  `src/utils/dataLayout.js`.
- `backups/`: a copy of all folders once per day, the last 7 days.
- `archive/`: old puzzles, NestWord days and tournaments, moved out of the live
  files every hour so they stay small. Used by `/puzzle history` and `/profile`.

## Troubleshooting

| Problem | Fix |
|---|---|
| Bot doesn't answer when pinged | Check `GEMINI_API_KEY`, and the log for `[AI]` warnings |
| `[AI] ⚠️ Model(s) not available` | Set `AI_MODELS=` in `.env` to one of the models listed in that warning |
| New commands don't show up | Wait a minute and restart Discord. Check the log for "Registered N slash commands" |
| `Scoreboard channel invalid` | `SCOREBOARD_CHANNEL_ID` in `.env` is wrong or the bot can't see that channel |
| `… is broken and no backup of it could be found` at startup | One data file is unreadable and there's no backup of it. The broken file is kept as `….broken-…`; see `src/data/README.md` |
| No backup / error DMs | `MAINTAINER_ID` in `.env`? DMs from server members allowed? The log says `[Maintainer] DM … failed` with the reason |
| A command says "Error executing this command" | The bot log shows the cause. Run `npm test` to find crashes |
