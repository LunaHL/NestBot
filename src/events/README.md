# Events

What the bot does when something happens in Discord. `../index.js` connects
these three files to Discord.

| File | When | What it does |
|---|---|---|
| `ready.js` | Once, after logging in | Starts all background jobs (scoreboard, birthdays, cleanup, loot drops, …). The full list is in [`../README.md`](../README.md#what-happens-when-the-bot-starts) |
| `interactionCreate.js` | Someone uses a slash command | Finds the command in `../commands/` and runs it. If it crashes, logs the error and tells the user, so the bot keeps running |
| `messageCreate.js` | Any message in the server | 1. Gagged member → garble (`services/gag.js`). 2. `@NestBot` → AI reply (`services/ai.js`). 3. Image in the tracked channel → count it (`services/pictracker.js`) |

Bots' messages and DMs are ignored. Replying to one of NestBot's messages does
**not** trigger the AI; only typing `@NestBot` does.
