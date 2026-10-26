# Services

The bot's actual logic. Commands (`../commands/`) call these; services never
reply to Discord interactions themselves (except `achievements.announce`).

## Money and stats

| File | What it does | Used by |
|---|---|---|
| `nestcoins.js` | Balances: `getBalance`, `addCoins`, `removeCoins` (returns `null` if not enough), `getAllBalances` | Almost everything |
| `stats.js` | Collects every stat about one member (puzzles, NestWord, coffee, duels, gags…) in one object | `/profile`, achievements |
| `achievements.js` | The list of all achievements, unlocking, coin rewards, and `announce()` for the chat message | Many commands, `/achievements`, `/profile` |
| `history.js` | Combines current data with the archive (all puzzles, NestWord days, events ever) | `/puzzle history`, stats |

**Adding an achievement:** add a line to `ACHIEVEMENTS` in `achievements.js`
with an `id` (never change it later), category, emoji, name, description,
coin reward and a `check(stats)` function. Everything in `stats.js` can be
used. Members who already qualify get it the next time they do something.

## Features

| File | What it does |
|---|---|
| `ai.js` | Everything Gemini: the personality (`buildSystemPrompt`), chat replies, roast/compliment/poem texts, daily moods, model fallback and the startup model check |
| `memory.js` | The facts members save with `/memory` (max 10 each, max 150 characters) |
| `coffee.js` | Café logic: serving, charging, daily limit, streaks, coffee stats |
| `coffeeArt.js` | Finds the right picture in `assets/coffee-art/` for a drink and latte art |
| `gag.js` | Gagging: who is gagged and until when, garbling text, and handling messages of gagged members (delete, repost garbled, double the gag on spam) |
| `halloween.js` | Trick-or-treat outcomes, daily tries, the October 31 announcement |

## Background jobs

Started once from `../events/ready.js`; each checks itself whether there's
anything to do.

| File | What it does |
|---|---|
| `scoreboard.js` | After midnight: posts yesterday's NestWord and Puzzle results to `SCOREBOARD_CHANNEL_ID` |
| `pictracker.js` | Counts images in the tracked channel; at the end of each week posts the leaderboard and pays rewards |
| `cleanup.js` | Every hour: moves NestWord days and past puzzles older than 7 days, and tournaments finished 30+ days ago, into the archive. Removes expired gags |
| `archive.js` | Reads and writes the monthly archive files in `../data/archive/` |

(Birthdays, loot drops and the daily NestWord pick live in their command files,
see the job table in [`../README.md`](../README.md).)
