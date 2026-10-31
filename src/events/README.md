# Events

What the bot does when something happens in Discord. `../index.js` connects
these three files to Discord.

| File | When | What it does |
|---|---|---|
| `ready.js` | Once, after logging in | Starts all background jobs (scoreboard, birthdays, cleanup, loot drops, …). The full list is in [`../README.md`](../README.md#what-happens-when-the-bot-starts) |
| `interactionCreate.js` | Someone uses a slash command, a button or types in an option | Runs the command (or its autocomplete). Buttons with an id like `watch:…` go to that command's `handleComponent()`, so they work after restarts. Crashes are logged and the user gets a short error, so the bot keeps running |
| `messageCreate.js` | Any message in the server | 0. From an app/bot: only the Wordle app's results in the Wordle channel → pay coins (`services/wordle.js`). 1. Gagged member → garble (`services/gag.js`). 2. `@NestBot` → AI reply (`services/ai.js`). 3. Image in the tracked channel → count it (`services/pictracker.js`) |

Bots' messages and DMs are ignored. Replying to one of NestBot's messages does
**not** trigger the AI; only typing `@NestBot` does.
