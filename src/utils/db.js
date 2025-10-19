const fs = require('fs');
const path = require('path');

//* Path to the data folder
const dataPath = path.join(__dirname, '..', 'data');
const filePath = path.join(dataPath, 'nestbot.json');

//* Load JSON once to memory at startup
let database = {};
if (fs.existsSync(filePath)) {
  database = JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Helper to save the current state
function save() {
  fs.writeFileSync(filePath, JSON.stringify(database, null, 2));
}

// Perform pattern: safely modify the DB
function perform(callback) {
  callback(database);
  save();
}

module.exports = { perform, database };
