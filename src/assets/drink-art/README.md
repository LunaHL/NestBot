# Drink pictures

Pictures shown by `/drinks order` and `/drinks gift`. The bot only reads files
from this folder; it never generates pictures while running.

## File names

| File | Used for |
|---|---|
| `<drink>-<art>.png` | that drink with that latte art, e.g. `latte-cat.png` |
| `<drink>-plain.png` | that drink without latte art, e.g. `blacktea-plain.png` |
| `<drink>.png` | fallback for any order of that drink, e.g. `latte.png` |

`.jpg`, `.jpeg`, `.webp` and `.gif` work too. If no picture matches, the
drink is served without one. If a latte-art picture is missing, the plain
picture of that drink is used.

The drink names (keys) and latte art designs are in
`src/config/drinksMenu.js`. Only drinks with `art: true` get latte art
(milky ones: cappuccino, latte, chai, matcha, hot chocolate, …).

## Filling the folder

- `npm run drink-art -- --list` shows which pictures exist and which are missing.
- `npm run drink-art` generates all missing ones once with Gemini
  (needs `GEMINI_API_KEY`; the image model is usually paid-only, about 4 cents
  per picture). `npm run drink-art -- blacktea` does just one drink.
- Café drinks (coffee, tea, hot chocolate) are drawn on a café table, bar
  drinks (cocktails, beer, wine) on a bar counter in the evening.
- Existing files are never overwritten. Delete a file and run it again to redo it.

Commit the pictures afterwards so they ship with the bot.
