# Data

The bot's memory. **Everything here except this README and `examples/` is
ignored by git**, so it never ends up on GitHub, and `git pull` never touches
it. Back this folder up if you move the bot to another machine.

## What is where

One file per kind of data, sorted into folders. Which key goes into which
folder is set in [`src/utils/dataLayout.js`](../utils/dataLayout.js).

| Folder | What's in it |
|---|---|
| `economy/` | `nestcoins.json` (everyone's coins), daily claims, shop, vouchers, loot drops, paid nicknames |
| `games/` | puzzles, puzzle streaks, NestWord, Wordle app, tournaments (`events`), duels, achievements, `wordlist.json` (NestWord's word pools) |
| `drinks/` | `coffee.json`: all drink stats (`coffee` is the old name, kept so nothing breaks) |
| `fun/` | punishment wheel, gags, blindfolds, picture leaderboard |
| `social/` | birthdays, suggestions, reminders, NestBot's memories, AI mood |
| `movies/` | movie nights (`watch`), watchlists, groups, series alerts, episode numbering |
| `holidays/` | Christmas, Easter, Halloween, holiday stats |
| `settings/` | `settings.json` (channels, roles, timings set with `/settings`), feature switches, hub/tips |
| `other/` | Anything not listed in `dataLayout.js` yet (e.g. a new feature). Give it a folder there |

A folder or file only appears once there is data for it. Switched-off
features keep their files; they're just not changed anymore.

Other things in here:

| File / folder | What it is |
|---|---|
| `backups/YYYY-MM-DD/` | A copy of all the folders above, once per day, the last 7 days |
| `backups/before-import-…/` | The data as it was before a `nestbot.json` was imported (see "Restoring"). Never deleted automatically |
| `backups/nestbot-YYYY-MM-DD.json` | Old-style backups from before the split. Disappear by themselves after 7 days |
| `archive/` | Old data moved out of the live files every hour, one file per kind and month (`puzzles-2026-10.json`, `nestword-…`, `events-…`). Still used by `/puzzle history` and `/profile` |
| `nestbot.json.imported-…` | The old single file, kept after it was split into the folders. Can be deleted once everything works |
| `last-crash.txt` | Only after a crash: what happened. Sent to you by DM after the restart, then deleted (stays if `MAINTAINER_ID` isn't set) |
| `*.tmp` | Appears for a split second while saving. Safe to ignore |
| `*.broken-…` | Only if a file was unreadable at startup: the broken file, kept for inspection |
| `examples/` | What some files look like, as a starting point (`games/wordlist.json`, `fun/wheels.json`) |

## How saving works

In memory everything is still one object; the code uses `db.read` and
`db.perform` (`src/utils/db.js`). Changes are collected and written within 2
seconds, but **only the files whose content changed**. Each file is first
written as `….json.tmp`, then renamed over the real file. A rename is
all-or-nothing, so a crash can't leave a half-written file. Stopping the bot
with Ctrl+C saves immediately.

## Restoring a backup

**Everything from one day:**
1. Stop the bot.
2. Copy the day's folders over the live ones, e.g.
   ```bash
   cp -r src/data/backups/2026-11-24/* src/data/
   ```
3. Start the bot.

**Only one thing** (e.g. the coins): same, but copy just that file:
```bash
cp src/data/backups/2026-11-24/economy/nestcoins.json src/data/economy/
```

**An old-style backup** (`nestbot-YYYY-MM-DD.json`, or a `nestbot.json` from
before the split): stop the bot, copy it to `src/data/nestbot.json`, start the
bot. It imports the file into the folders. Data that isn't in that file is
removed from the folders; what was there before is kept in
`backups/before-import-…/`.

**Broken files** are handled automatically at startup: the bot keeps the
broken file as `….broken-…` and loads that file's newest backup. If there is
no backup of it, it refuses to start rather than overwrite your data.

## Editing by hand

Possible, but **stop the bot first**. Otherwise the bot overwrites your edit
with its own copy from memory the next time it saves.
