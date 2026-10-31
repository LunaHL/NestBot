# 🪺 NestBot

The Discord bot of **The Nest**: a NestCoins economy, daily games, a café & bar,
tournaments, duels, achievements and an AI caretaker (Google Gemini) you can
chat with by pinging `@NestBot`.

- **All commands:** [`src/commands/README.md`](src/commands/README.md)
- **How the code is organized:** [`src/README.md`](src/README.md)
- **What changed when:** [`CHANGELOG.md`](CHANGELOG.md)

---

## Features at a glance

| | |
|---|---|
| 💰 **Economy** | NestCoins, `/daily`, `/balance`, `/leaderboard`, `/shop`, `/gamble`, random loot drops in chat, free mode for admins (`/settings free`) |
| 🎮 **Daily games** | `/nestword` (Wordle-like, 3–7 letters), `/puzzle` (puzzle of the day), coins for the Discord **Wordle app** (`/wordle`), streak bonuses, daily results post |
| 🍹 **Café & Bar** | `/drinks` to order or gift coffee, tea, hot chocolate, cocktails, beer and wine, with pictures, latte art, streaks and daily limits |
| ⚔️ **Competition** | `/event` tournaments (single elimination / Swiss), `/duel` rock-paper-scissors with bets |
| 🏅 **Progress** | `/profile` with all stats, 41 `/achievements` with coin rewards |
| 🤖 **AI** | Ping `@NestBot` to chat; `/ai roast/compliment/poem`, `/ai mood`, `/memory` |
| 🔇 **Fun moderation** | `/wheel` punishment wheel, gags (garbled messages), `/ungag` |
| 🎂 **Social** | `/birthday` announcements with coins, `/pictracker` weekly picture leaderboard |
| 🍿 **Movie nights** | `/watch`: plan or start a movie/series/anime night, sign up in the #movies calendar, private room, check-in and a shared live clock so everyone watches in sync on their own device. `/watchlist`: personal watchlists with ratings and matches |
| 🎃 **Halloween** | Only on October 31: `/trickortreat`, spooky drinks, haunted loot drops |
| ❓ **Help** | `/help` explains everything in Discord, with categories and a command search |

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

In the Discord Developer Portal, the bot needs the **Message Content** intent
turned on (for the AI chat, gags and the picture tracker). On the server, its
role needs **Manage Channels**, **Manage Roles** and **Manage Events** (movie
night rooms and events).

**Movie nights:** set them up once in Discord with
`/settings watch channel:#movies category:<a category for the rooms>`.

## Updating the bot

On the server:
```bash
git pull
npm install        # only needed when package.json changed, but never hurts
```
Then restart the bot. Your data (`src/data/`) and `.env` are not in git, so an
update never touches them.

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
| Daily coins | `src/commands/daily.js` (`DAILY_AMOUNT`) |
| Birthday coins | `src/commands/birthday.js` (`BIRTHDAY_COINS`) |
| Picture tracker rewards | `src/services/pictracker.js` |
| Duel limits | `src/commands/duel.js` (`MAX_BET`, timers) |
| Targeted wheel spin price | `src/commands/wheel.js` (`PRICE_TARGETED_SPIN`) |
| Halloween outcomes and tries | `src/services/halloween.js` |
| How long old data stays before archiving | `src/services/cleanup.js` |
| Number of daily backups | `src/utils/db.js` (`BACKUPS_TO_KEEP`) |
| Gemini models, time zone, test switches | `.env` (see `.env.example`) |

Restart the bot after changing anything.

---

## Data, backups and the archive

Everything the bot remembers is in `src/data/`. Details and how to restore a
backup: [`src/data/README.md`](src/data/README.md).

- `nestbot.json`: all live data (coins, games, stats…), saved safely within
  2 seconds of any change.
- `backups/`: one copy per day, the last 7 days.
- `archive/`: old puzzles, NestWord days and tournaments, moved out of the main
  file every hour so it stays small. Used by `/puzzle history` and `/profile`.

## Troubleshooting

| Problem | Fix |
|---|---|
| Bot doesn't answer when pinged | Check `GEMINI_API_KEY`, and the log for `[AI]` warnings |
| `[AI] ⚠️ Model(s) not available` | Set `AI_MODELS=` in `.env` to one of the models listed in that warning |
| New commands don't show up | Wait a minute and restart Discord. Check the log for "Registered N slash commands" |
| `Scoreboard channel invalid` | `SCOREBOARD_CHANNEL_ID` in `.env` is wrong or the bot can't see that channel |
| `nestbot.json is broken` at startup | The bot restores the newest backup automatically; see `src/data/README.md` |
| A command says "Error executing this command" | The bot log shows the cause. Run `npm test` to find crashes |
