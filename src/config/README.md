# Config

Content that's meant to be edited without touching the code around it.

| File | What's in it |
|---|---|
| `coffeeMenu.js` | The café: every drink (name, emoji, price, serving lines, picture description), latte art designs, the daily cup limit, lucky bean and latte art chances, and the jittery / cut-off lines |

After changing anything here, restart the bot. If you add a drink or a latte
art design, also add its pictures (`npm run coffee-art`, see
[`../assets/coffee-art/README.md`](../assets/coffee-art/README.md)).

Most other numbers (prices, rewards, limits) are at the top of the file that
uses them. The table "Where do I change…?" in the main
[README](../../README.md#where-do-i-change) lists them all.
