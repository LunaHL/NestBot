# Scripts

Tools you run by hand. They're not part of the running bot.

## `generate-drink-art.js`

Creates the drink pictures in `src/assets/drink-art/` with Gemini's image
model. Only needed once (and after adding drinks or latte art designs).

```bash
npm run drink-art -- --list     # what exists / what's missing
npm run drink-art -- blacktea   # only one drink (good for testing the style)
npm run drink-art               # everything that's missing
```

- Never overwrites existing pictures. To redo one, delete its file and run again.
- Needs `GEMINI_API_KEY` with billing enabled (image generation is usually
  paid-only, about 4 cents per picture). Stops on quota or permission errors;
  just run it again later to continue.
- The picture style is described in `buildPrompt()` in this file; each drink's
  own description is `imagePrompt` in `src/config/drinksMenu.js`. Café drinks
  get a café scene, bar drinks a bar scene (`SCENES` in this file).
- Other model: `DRINK_IMAGE_MODEL=` in `.env`.
- Afterwards, commit the pictures (`git add src/assets/drink-art`) so they
  ship with the bot.

It's safe to run while the bot is running; the bot picks up new pictures
immediately.
