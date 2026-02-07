const fs = require('fs');
const path = require('path');

//* Path to the data folder
const dataPath = path.join(__dirname, '..', 'data');
const filePath = path.join(dataPath, 'nestbot.json');

//* Load JSON once to memory at startup
let database = {};
if (fs.existsSync(filePath)) {
  try {
    database = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error('[DB] Failed to load database:', error);
  }
}

// Write queue to prevent race conditions
let saveQueue = Promise.resolve();

// Helper to save the current state
function save() {
  const data = JSON.stringify(database, null, 2);
  saveQueue = saveQueue.then(() => fs.promises.writeFile(filePath, data))
    .catch(err => console.error('[DB] Save failed:', err));
}

// Perform pattern: safely modify the DB
function perform(callback) {
  callback(database);
  save();
}

module.exports = { perform, database };
