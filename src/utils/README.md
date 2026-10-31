# Utils

Small helpers used all over the bot.

| File | What it gives you |
|---|---|
| `db.js` | The database (`data/nestbot.json`). `db.read(data => …)` to look something up, `db.perform(data => …)` to change something. Changes are saved within 2 seconds, crash-safe, with a daily backup. On startup it falls back to the newest backup if the file is broken |
| `time.js` | Dates in the server's time zone (`TIMEZONE` in `.env`): `localDate()` = today as `"YYYY-MM-DD"`, `localDate(-1)` = yesterday, `nowInTZ()`, `formatDate()`, `isHalloween()`, `daysUntilHalloween()`, `zonedToUtc(date, time)` (server time → timestamp, handles summer time), `discordTime(ms)` (shows in each viewer's own time zone) |
| `schedule.js` | `runEvery(name, minutes, job)`: runs a background job now and then regularly; errors are logged instead of crashing the bot |
| `streak.js` | The streak reward rules for Puzzle and NestWord: new (+10% per day, max +50%, milestone bonuses at 7/14/30/100 days) and old (reward × streak days). Which one is active is set with `/settings streak` |
| `permissions.js` | `isAdmin(interaction)`: does the user have the Administrator permission? |
| `commands.js` | Loads all command files from `commands/` (used on startup and when registering commands) |
| `paths.js` | Where the data and asset folders are. `NESTBOT_DATA_DIR` in the environment moves the data folder (the tests use this) |
