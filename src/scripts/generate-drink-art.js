// One-time helper to create the premade /drinks pictures.
//
//   npm run drink-art -- --list     show which pictures exist / are missing
//   npm run drink-art               generate all missing pictures with Gemini
//   npm run drink-art -- latte      only missing pictures for one drink
//
// Existing files are never overwritten, so you can mix your own pictures with
// generated ones. To redo a picture, delete its file and run this again.
// Needs GEMINI_API_KEY in .env (the image model is usually paid-only).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { MENU, LATTE_ART, CATEGORIES } = require('../config/drinksMenu');
const { findFile, ART_DIR } = require('../services/drinkArt');

const MODEL =
  process.env.DRINK_IMAGE_MODEL ||
  process.env.COFFEE_IMAGE_MODEL || // older name, still works
  'gemini-2.5-flash-image';

// Every picture the bot can use: one per drink + latte art, plus a plain one
function allPictures() {
  const list = [];
  for (const [drinkKey, drink] of Object.entries(MENU)) {
    list.push({ base: `${drinkKey}-plain`, drink, art: null });
    if (drink.art) {
      for (const art of LATTE_ART)
        list.push({ base: `${drinkKey}-${art.key}`, drink, art });
    }
  }
  return list;
}

// Café drinks sit on a café table in the morning; bar drinks on a bar
// counter in the evening (see `place` in CATEGORIES in drinksMenu.js).
const SCENES = {
  cafe: 'Sitting on a wooden table in a cozy café, soft warm morning light, gentle steam, ',
  bar: 'Standing on a polished wooden bar counter in a cozy bar in the evening, warm dim fairy lights in the background, ',
};

function buildPrompt(drink, art) {
  const place = CATEGORIES[drink.category]?.place || 'cafe';
  return (
    `Anime-style illustration of ${drink.imagePrompt}, ` +
    (art
      ? `with beautiful latte art in the milk foam shaped like ${art.imagePrompt}, clearly visible from above. `
      : 'without any latte art. ') +
    SCENES[place] +
    `pastel colors, clean anime lineart, cute cozy aesthetic, slightly top-down view. ` +
    `No text, no letters, no logos, no people. Square image.`
  );
}

async function generate(client, { base, drink, art }) {
  const result = await client.models.generateContent({
    model: MODEL,
    contents: buildPrompt(drink, art),
    config: { responseModalities: ['TEXT', 'IMAGE'] },
  });
  const parts = result.candidates?.[0]?.content?.parts || [];
  const image = parts.find(p => p.inlineData?.data);
  if (!image) throw new Error('No image in the response');

  const ext = (image.inlineData.mimeType || 'image/png')
    .split('/')[1]
    .replace('jpeg', 'jpg');
  const file = path.join(ART_DIR, `${base}.${ext}`);
  fs.writeFileSync(file, Buffer.from(image.inlineData.data, 'base64'));
  return file;
}

async function main() {
  const args = process.argv.slice(2);
  const onlyDrink = args.find(a => !a.startsWith('--'));
  if (onlyDrink && !MENU[onlyDrink]) {
    console.error(
      `Unknown drink "${onlyDrink}". Drinks: ${Object.keys(MENU).join(', ')}`,
    );
    process.exit(1);
  }

  const pictures = allPictures().filter(
    p => !onlyDrink || p.base.startsWith(`${onlyDrink}-`),
  );
  const missing = pictures.filter(p => !findFile(p.base));

  if (args.includes('--list')) {
    for (const p of pictures) {
      const file = findFile(p.base);
      console.log(
        `${file ? '✅' : '❌'} ${file ? path.basename(file) : `${p.base}.png`}`,
      );
    }
    console.log(
      `\n${pictures.length - missing.length} of ${pictures.length} pictures present in ${ART_DIR}`,
    );
    return;
  }

  if (missing.length === 0)
    return console.log('All pictures already exist. Nothing to do.');
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is missing in .env');
    process.exit(1);
  }

  fs.mkdirSync(ART_DIR, { recursive: true });
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  console.log(`Generating ${missing.length} picture(s) with ${MODEL}...`);
  let done = 0;
  for (const p of missing) {
    try {
      const file = await generate(client, p);
      done++;
      console.log(`[${done}/${missing.length}] ✅ ${path.basename(file)}`);
    } catch (e) {
      console.error(`❌ ${p.base}: ${e.message}`);
      if (e.status === 429 || e.status === 403 || e.status === 400) {
        console.error(
          'Stopping. Check your API key, billing/quota and the model name, then run again.',
        );
        break; // it'll pick up where it left off next time
      }
    }
  }
  console.log(
    `\nDone: ${done} new picture(s). Check them in ${ART_DIR}, then commit the folder.`,
  );
}

main();
