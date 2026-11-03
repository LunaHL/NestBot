// Runs every *.test.js in this folder, one after another (each in its own
// process, so their fake data can't mix). Part of `npm test`.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const tests = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js'));
let failed = 0;
for (const file of tests) {
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, file)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(out.trim().split('\n').at(-1));
  } catch (e) {
    failed++;
    console.error(
      `❌ ${file} failed:\n${(e.stderr || e.stdout || e.message).toString().trim()}`,
    );
  }
}
if (failed) process.exit(1);
