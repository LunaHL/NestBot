# Data

The bot's memory. **Everything here except this README and the `.example`
files is ignored by git**, so it never ends up on GitHub, and `git pull`
never touches it. Back this folder up if you move the bot to another machine.

| File / folder | What it is |
|---|---|
| `nestbot.json` | All live data: coins, game state, streaks, drinks (stored as `coffee`, the old name), achievements, memories, settings set with commands (channels, shop, wheel…). Created automatically |
| `wordlist.json` | NestWord's word pools (managed with `/nestword pool-*`) |
| `backups/` | A copy of `nestbot.json` once per day, the last 7 days (`nestbot-YYYY-MM-DD.json`) |
| `archive/` | Old data moved out of `nestbot.json` every hour, one file per kind and month (`puzzles-2026-10.json`, `nestword-…`, `events-…`). Still used by `/puzzle history` and `/profile` |
| `*.tmp` | Appears for a split second while saving. Safe to ignore |
| `nestbot.json.broken-…` | Only if `nestbot.json` was unreadable at startup: the broken file, kept for inspection |
| `*.example` | Starting points for a fresh install (`nestbot.json.example`, `wordlist.json.example`) |

## How saving works

Changes are collected and written within 2 seconds: first to `nestbot.json.tmp`,
then renamed over `nestbot.json`. A rename is all-or-nothing, so a crash can't
leave a half-written file. Stopping the bot with Ctrl+C saves immediately.

## Restoring a backup

1. Stop the bot.
2. Copy the backup over the live file, e.g.
   ```bash
   cp src/data/backups/nestbot-2026-10-25.json src/data/nestbot.json
   ```
3. Start the bot.

If `nestbot.json` is broken when the bot starts, it does this automatically:
it keeps the broken file as `nestbot.json.broken-…` and loads the newest
backup. It refuses to start with empty data rather than overwrite your coins.

## Editing by hand

Possible, but **stop the bot first**. Otherwise the bot overwrites your edit
with its own copy from memory within a few seconds.
