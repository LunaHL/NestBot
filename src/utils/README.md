# Utils

Small helpers used all over the bot.

| File | What it gives you |
|---|---|
| `db.js` | The database: one file per top-level key in `data/<folder>/<key>.json`, one object in memory. `db.read(data => …)` to look something up, `db.perform(data => …)` to change something. Changes are saved within 2 seconds (only changed files), crash-safe, with a daily backup. A broken file is restored from its newest backup at startup. An old single `data/nestbot.json` is imported into the folders |
| `zip.js` | `zipFolder(dir, skip)`: a folder as a ZIP in memory (no extra package) |
| `backupZip.js` | `zipData()`: all bot data as a ZIP (without backups/, examples/, temp files). Doesn't load `db.js`, so the menu can use it next to the running bot |
| `dataLayout.js` | Which data folder each key goes into (`nestcoins` → `economy/`). New keys not listed here land in `other/` |
| `time.js` | Dates in the server's time zone (`TIMEZONE` in `.env`): `localDate()` = today as `"YYYY-MM-DD"`, `localDate(-1)` = yesterday, `nowInTZ()`, `formatDate()`, `isHalloween()`, `daysUntilHalloween()`, `zonedToUtc(date, time)` (server time → timestamp, handles summer time), `discordTime(ms)` (shows in each viewer's own time zone) |
| `schedule.js` | `runEvery(name, minutes, job)`: runs a background job now and then regularly; errors are logged instead of crashing the bot |
| `streak.js` | The streak reward rules for Puzzle and NestWord: new (+10% per day, max +50%, milestone bonuses at 7/14/30/100 days) and old (reward × streak days). Which one is active is set with `/settings streak` |
| `permissions.js` | `isAdmin(interaction)`: does the user have the Administrator permission? `denyNonAdmin(interaction)` replies with the standard "admins only" message |
| `ui.js` | The shared look: `COLORS` per area, `card({ title, text, fields, footer, … })` for embeds, `ok()` / `fail()` / `info()` for short private replies, `coins(n)`, `duration(seconds)`, `rank(i)` (🥇🥈🥉). New commands should use these so everything looks the same |
| `commands.js` | Loads all command files from `commands/` (used on startup and when registering commands). A file can also export `commands: [...]` with several (the right-click entries) |
| `adminSplit.js` | Moves admin-only subcommands of a command under `/admin`, so regular members don't see them |
| `runAs.js` | Runs a slash command from a button, menu, form or right-click as if it was typed (hub menu, right-click menu, 🙋 Me too, 🎲 Again) |
| `paths.js` | Where the data and asset folders are. `NESTBOT_DATA_DIR` in the environment moves the data folder (the tests use this) |
