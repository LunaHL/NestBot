// Premade pictures for /coffee, stored in src/assets/coffee-art/.
//
// File names (png, jpg, jpeg, webp or gif):
//   <drink>-<art>.png   e.g. latte-cat.png      (a drink with that latte art)
//   <drink>-plain.png   e.g. espresso-plain.png (a drink without latte art)
//   <drink>.png         e.g. latte.png          (fallback for that drink)
// Missing pictures are fine: the coffee is then served without one.
// Run `npm run coffee-art -- --list` to see every file name the bot looks for.
const fs = require('fs');
const path = require('path');

const ART_DIR = path.join(__dirname, '..', 'assets', 'coffee-art');
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

function findFile(base) {
  for (const ext of EXTENSIONS) {
    const file = path.join(ART_DIR, `${base}.${ext}`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/** Best matching picture for a drink and latte art, or null. */
function getPicture(drinkKey, artKey) {
  return (
    findFile(`${drinkKey}-${artKey || 'plain'}`) ||
    (artKey ? findFile(`${drinkKey}-plain`) : null) ||
    findFile(drinkKey)
  );
}

module.exports = { getPicture, findFile, ART_DIR };
