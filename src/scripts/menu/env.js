// Menu → Settings: view and change the bot's .env without an editor.
// Lists every setting from .env.example (with its explanation) plus anything
// else that's in .env. Tokens and keys are never printed in full.
// Your .env keeps its comments and order; the previous version is kept as
// .env.bak.
const fs = require('fs');
const path = require('path');
const { ROOT, c, ask, yes } = require('./ui');

const ENV = path.join(ROOT, '.env');
const EXAMPLE = path.join(ROOT, '.env.example');
const LINE_RE = /^(\s*#\s*)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/;
const SECRET_RE = /TOKEN|KEY|SECRET|PASSWORD/;

// Settings described in .env.example: [{ key, help, example }]
function knownSettings() {
  if (!fs.existsSync(EXAMPLE)) return [];
  const out = [];
  let help = [];
  for (const line of fs.readFileSync(EXAMPLE, 'utf8').split('\n')) {
    const m = line.match(LINE_RE);
    if (m) {
      out.push({ key: m[2], help: help.join('\n'), example: m[3].trim() });
      help = [];
    } else if (/^\s*#/.test(line)) help.push(line.replace(/^\s*#\s?/, ''));
    else help = [];
  }
  return out;
}

const readLines = () =>
  fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8').split('\n') : [];

// "value", 'value' or value # comment → value (like dotenv reads it)
function unquote(raw) {
  const v = raw.trim();
  const q = v.match(/^(["'`])(.*)\1$/);
  if (q) return q[2];
  return v.replace(/\s+#.*$/, '').trim();
}
function quote(value) {
  if (!/[#"'`\s]/.test(value)) return value;
  return value.includes("'") ? `"${value.replace(/"/g, '\\"')}"` : `'${value}'`;
}

/** Current values in .env (active lines only): Map key → value */
function currentValues(lines = readLines()) {
  const values = new Map();
  for (const line of lines) {
    const m = line.match(LINE_RE);
    if (m && !m[1]) values.set(m[2], unquote(m[3]));
  }
  return values;
}

function show(key, value) {
  if (value === undefined) return c.dim('not set');
  if (value === '') return c.dim('empty');
  if (SECRET_RE.test(key))
    return `${'•'.repeat(8)}${value.slice(-4)} ${c.dim(`(hidden, ${value.length} characters)`)}`;
  return value;
}

/**
 * Set (value = string) or remove (value = null) a key in .env.
 * Keeps all other lines. An active line is changed in place; a commented
 * line ("# KEY= …") is switched on; otherwise it's added at the end.
 */
function setValue(key, value, help = '') {
  const lines = readLines();
  const active = lines.findIndex(l => {
    const m = l.match(LINE_RE);
    return m && !m[1] && m[2] === key;
  });
  const commented = lines.findIndex(l => {
    const m = l.match(LINE_RE);
    return m && m[1] && m[2] === key;
  });

  if (value === null) {
    if (active === -1) return false;
    lines[active] = `# ${lines[active]}`; // switched off, not deleted
  } else if (active !== -1) {
    lines[active] = `${key}=${quote(value)}`;
  } else if (commented !== -1) {
    lines[commented] = `${key}=${quote(value)}`;
  } else {
    while (lines.length && lines.at(-1).trim() === '') lines.pop();
    lines.push('');
    if (help) lines.push(...help.split('\n').map(h => `# ${h}`.trimEnd()));
    lines.push(`${key}=${quote(value)}`, '');
  }

  if (fs.existsSync(ENV)) fs.copyFileSync(ENV, `${ENV}.bak`);
  const tmp = `${ENV}.tmp`;
  fs.writeFileSync(tmp, lines.join('\n'), { mode: 0o600 });
  fs.renameSync(tmp, ENV);
  return true;
}

async function editEnv({ restart }) {
  let changed = false;
  for (;;) {
    const known = knownSettings();
    const values = currentValues();
    const keys = [
      ...known.map(k => k.key),
      ...[...values.keys()].filter(k => !known.some(s => s.key === k)),
    ];
    console.log(c.bold('\nSettings (.env)\n'));
    keys.forEach((key, i) =>
      console.log(
        `  ${String(i + 1).padStart(2)}  ${key.padEnd(24)} ${show(key, values.get(key))}`,
      ),
    );
    console.log(`   +  ${c.dim('add another setting')}`);
    const pick = await ask(
      `\nWhich one to change? (number, Enter = ${changed ? 'done' : 'back'}) `,
    );

    let key = keys[Number(pick) - 1];
    if (pick === '+') {
      key = (await ask('Name (CAPITALS_AND_UNDERSCORES): ')).toUpperCase();
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
    }
    if (!key) break;

    const info = known.find(k => k.key === key);
    console.log(`\n${c.bold(key)}`);
    if (info?.help) console.log(c.dim(info.help.replace(/^/gm, '  ')));
    console.log(`  now: ${show(key, values.get(key))}`);
    const input = await ask(
      `New value (Enter = keep${values.has(key) ? ', - = switch off' : ''}): `,
    );
    if (input === '') continue;
    if (input === '-') {
      if (setValue(key, null))
        console.log(c.green(`✅ ${key} switched off (commented out).`));
    } else {
      setValue(key, input, info?.help); // a new line gets its explanation
      console.log(c.green(`✅ ${key} = ${show(key, input)}`));
    }
    changed = true;
  }

  if (changed) {
    console.log(
      c.dim('The previous .env is kept as .env.bak.') +
        '\nThe bot reads .env only when it starts.',
    );
    if (await yes('Restart the bot now?')) await restart();
  }
}

module.exports = { editEnv, setValue, currentValues, knownSettings, unquote };
