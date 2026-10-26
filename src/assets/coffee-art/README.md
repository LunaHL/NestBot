# Coffee pictures

Pictures shown by `/coffee order` and `/coffee gift`. The bot only reads files
from this folder; it never generates pictures while running.

## File names

| File | Used for |
|---|---|
| `<drink>-<art>.png` | that drink with that latte art, e.g. `latte-cat.png` |
| `<drink>-plain.png` | that drink without latte art, e.g. `espresso-plain.png` |
| `<drink>.png` | fallback for any order of that drink, e.g. `latte.png` |

`.jpg`, `.jpeg`, `.webp` and `.gif` work too. If no picture matches, the
coffee is served without one. If a latte-art picture is missing, the plain
picture of that drink is used.

**Drinks:** espresso, americano, cappuccino, latte, flatwhite, mocha, caramel,
iced, pumpkin, special, decaf, witchbrew, vampire (the last two are Halloween only)
**Latte art** (only cappuccino, latte, flatwhite, mocha, caramel, pumpkin,
special, vampire): heart, bird, nest, cat, leaf, star, swan, moon

## Filling the folder

- `npm run coffee-art -- --list` shows which pictures exist and which are missing.
- `npm run coffee-art` generates all missing ones once with Gemini
  (needs `GEMINI_API_KEY`; the image model is usually paid-only, about 4 cents
  per picture). `npm run coffee-art -- latte` does just one drink.
- Existing files are never overwritten. Delete a file and run it again to redo it.

Commit the pictures afterwards so they ship with the bot.
