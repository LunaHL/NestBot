# How NestBot works

This folder is the whole bot. Every subfolder has its own README with details.

```
src/
├── index.js            Start here: creates the bot, loads commands, logs in
├── deploy-commands.js  Registers the slash commands with Discord
│
├── commands/   One file per slash command (/drinks, /puzzle, …): the Discord side
├── events/     What happens on startup, on every slash command, on every message
├── services/   The actual logic (coins, AI, gags, achievements, background jobs…)
├── config/     Content you'll want to edit (the drinks menu, /help texts)
├── utils/      Small shared helpers (database, dates, timers, permissions)
├── scripts/    One-off tools you run by hand (npm run drink-art)
├── assets/     Files that ship with the bot (drink pictures)
└── data/       The bot's memory: database, backups, archive (NOT in git)
```

## What happens when the bot starts

1. `index.js` loads every file in `commands/` (via `utils/commands.js`).
2. `deploy-commands.js` tells Discord which slash commands exist.
3. The bot logs in. Then `events/ready.js` starts the **background jobs**:

| Job | File | How often | What it does |
|---|---|---|---|
| NestWord | `commands/nestword.js` | every 10 min | Picks today's word if there isn't one yet |
| Puzzle announcement | `services/puzzle.js` | every 10 min | Posts today's puzzle in the puzzle channel (once a day, also when set later) |
| Wordle app | `services/wordle.js` | every 30 min | Looks for Wordle app results the bot missed (e.g. while offline) and pays them |
| Scoreboard | `services/scoreboard.js` | every 10 min | After midnight: posts yesterday's NestWord and Puzzle results (once a day) |
| Birthdays | `commands/birthday.js` | every 10 min | Announces today's birthdays and pays coins (once a day) |
| Picture tracker | `services/pictracker.js` | every 30 min | When a week is over: posts the leaderboard and pays rewards |
| Cleanup | `services/cleanup.js` | every hour | Moves old data into `data/archive/` |
| Halloween | `services/halloween.js` | every 30 min | On October 31: posts the Halloween announcement (once) |
| Loot drops | `commands/lootdrop.js` | 3–8 times a day | Drops a coin pouch in a random channel |
| AI model check | `services/ai.js` | once | Warns in the log if a configured Gemini model doesn't exist |

All jobs check "did I already do this today?" themselves, so they run at the
right time even after a restart or a daylight saving change.

## What happens on a slash command

```
User types /drinks order
  → events/interactionCreate.js finds the command by name
  → commands/drinks.js reads the options and builds the reply
  → services/drinks.js does the work (check limits, take coins, record the drink)
  → utils/db.js saves the change to data/nestbot.json
  → services/achievements.js checks for new achievements and announces them
```

If a command crashes, `interactionCreate.js` logs the error and tells the user
"Error executing this command" instead of the bot going down.

## What happens on a normal message

`events/messageCreate.js`, in this order:

0. **From a bot?** Only checked for the Wordle app's daily results in the Wordle channel (`services/wordle.js`), otherwise ignored.
1. **Gagged?** The message is deleted and reposted garbled (`services/gag.js`).
2. **@NestBot pinged?** The AI answers (`services/ai.js`). Replies to the
   bot's own messages don't count as a ping.
3. **Picture in the tracked channel?** It's counted (`services/pictracker.js`).

## Rules the code follows

- **Commands talk to Discord, services do the work.** A command file reads
  options and sends replies. Anything that changes coins, stats or data
  belongs in a service, so other commands can reuse it.
- **All data goes through `utils/db.js`.** Use `db.read(data => …)` to look
  something up and `db.perform(data => …)` to change something. Never write
  `data/nestbot.json` directly.
- **Dates use `utils/time.js`** (server time zone from `.env`), never `new Date()`
  for "today".
- **Background jobs use `runEvery` from `utils/schedule.js`.**
- **Admin checks use `isAdmin(interaction)` from `utils/permissions.js`.**
- Run `npm test` before pushing.

## Adding a new command

See [`commands/README.md`](commands/README.md#adding-a-command). In short: add
a file to `commands/`, restart the bot, done.
