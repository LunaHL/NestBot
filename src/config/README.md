# Config

Content that's meant to be edited without touching the code around it.

| File | What's in it |
|---|---|
| `help.js` | The texts of `/help`: the categories (which commands go where, intro texts, notes about automatic features) and an explanation per command, including which subcommands are admin-only |
| `drinksMenu.js` | The café & bar: menu sections, every drink (name, emoji, price, category, caffeine/alcohol, serving lines, picture description), latte art designs, the daily limits (caffeine, alcohol, total), chances, and the lines NestBot says when you're jittery, tipsy or cut off |

After changing anything here, restart the bot. If you add a drink or a latte
art design, also add its pictures (`npm run drink-art`, see
[`../assets/drink-art/README.md`](../assets/drink-art/README.md)).

Most other numbers (prices, rewards, limits) are at the top of the file that
uses them. The table "Where do I change…?" in the main
[README](../../README.md#where-do-i-change) lists them all.
