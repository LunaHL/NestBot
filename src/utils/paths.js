// Where the bot keeps its files. NESTBOT_DATA_DIR in the environment moves the
// data folder somewhere else (the tests use this so they never touch real data).
const path = require('path');

const SRC_DIR = path.join(__dirname, '..');
const DATA_DIR = process.env.NESTBOT_DATA_DIR || path.join(SRC_DIR, 'data');
const ASSETS_DIR = path.join(SRC_DIR, 'assets');

module.exports = { SRC_DIR, DATA_DIR, ASSETS_DIR };
