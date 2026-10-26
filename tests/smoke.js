// Smoke test: runs every subcommand of every command with fake input, starts
// all background jobs once and feeds a fake message through the message
// handler. It reports anything that crashes (typos, missing imports, …).
//
//   npm test
//
// Uses a temporary data folder, so it never touches your real bot data.
// It doesn't talk to Discord or Gemini.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

const ROOT = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nestbot-test-'));
process.env.NESTBOT_DATA_DIR = tmp;
delete process.env.GEMINI_API_KEY; // never call the real AI from tests
fs.writeFileSync(
  path.join(tmp, 'nestbot.json'),
  JSON.stringify({
    nestcoins: { g: { u1: 5000, u2: 5000 } },
    wheel: ['Do 10 pushups'],
  }),
);
fs.writeFileSync(
  path.join(tmp, 'wordlist.json'),
  JSON.stringify({
    pool5: ['apple', 'grape'],
    usedWords: [],
    config: { cooldownDays: 30 },
  }),
);

// ---------- Fake Discord objects ----------
const channel = {
  id: 'c1',
  name: 'general',
  type: 0,
  isTextBased: () => true,
  isThread: () => false,
  send: async () => ({ id: 'm' }),
  sendTyping: async () => {},
  messages: { fetch: async () => new Map() },
  toString: () => '<#c1>',
};
const fakeUser = id => ({
  id,
  username: id,
  bot: false,
  tag: `${id}#0`,
  displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
  toString: () => `<@${id}>`,
});
const fakeMessage = () => ({
  id: 'msg',
  createMessageComponentCollector: () =>
    Object.assign(new EventEmitter(), { stop() {}, resetTimer() {} }),
  edit: async () => {},
});
const guild = {
  id: 'g',
  name: 'Nest',
  members: {
    me: { permissionsIn: () => ({ has: () => true }) },
    fetch: async () => null,
    cache: new Map(),
  },
  channels: { cache: new Map([['c1', channel]]) },
};
const client = {
  ws: { ping: 1 },
  user: fakeUser('BOT'),
  channels: { fetch: async () => channel, cache: new Map([['c1', channel]]) },
  guilds: { cache: new Map([['g', guild]]) },
};

// A plausible value for each option type
function valueFor(option) {
  if (option.choices?.length) return option.choices[0].value;
  switch (option.type) {
    case 3:
      return option.name === 'date'
        ? undefined
        : option.name === 'word'
          ? 'apple'
          : 'test';
    case 4:
      return option.min_value ?? 1;
    case 10:
      return 1;
    case 5:
      return false;
    case 6:
      return fakeUser('u2');
    case 7:
      return channel;
    case 8:
      return { id: 'r1' };
  }
}

function fakeInteraction(commandName, sub, options = []) {
  const values = Object.fromEntries(options.map(o => [o.name, valueFor(o)]));
  const i = {
    id: `i${Math.random()}`,
    guildId: 'g',
    channelId: 'c1',
    channel,
    guild,
    client,
    commandName,
    user: fakeUser('u1'),
    member: {
      id: 'u1',
      displayName: 'U1',
      roles: { cache: new Map() },
      permissions: { has: () => true },
    },
    memberPermissions: { has: () => true }, // run admin paths too
    inGuild: () => true,
    isChatInputCommand: () => true,
    replied: false,
    deferred: false,
    options: {
      getSubcommand: () => sub,
      getSubcommandGroup: () => null,
      getString: k => values[k] ?? null,
      getInteger: k => values[k] ?? null,
      getNumber: k => values[k] ?? null,
      getBoolean: k => values[k] ?? null,
      getUser: k => values[k] ?? null,
      getChannel: k => values[k] ?? null,
      getRole: k => values[k] ?? null,
      getMember: k =>
        values[k] ? { id: values[k].id, displayName: 'U2' } : null,
    },
    reply: async () => {
      i.replied = true;
      return fakeMessage();
    },
    deferReply: async () => {
      i.deferred = true;
    },
    editReply: async () => fakeMessage(),
    followUp: async () => fakeMessage(),
    fetchReply: async () => fakeMessage(),
  };
  return i;
}

// ---------- Run ----------
const problems = [];
const origError = console.error;
console.error = (...args) => {
  // Errors that commands catch and log themselves also count as problems
  problems.push(
    args
      .map(a =>
        a instanceof Error ? `${a.constructor.name}: ${a.message}` : String(a),
      )
      .join(' '),
  );
};
console.log = () => {}; // keep the output short

(async () => {
  const { loadCommands } = require(path.join(ROOT, 'src/utils/commands'));
  // Delete the temp folder at exit, after the bot's own final save. Loading the
  // database first makes sure its exit handler runs before ours.
  require(path.join(ROOT, 'src/utils/db'));
  process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
  const commands = loadCommands();
  client.commands = new Map(commands.map(c => [c.data.name, c]));
  let count = 0;

  for (const cmd of commands) {
    const json = cmd.data.toJSON();
    const subs = (json.options || []).filter(o => o.type === 1);
    const runs = subs.length
      ? subs.map(s => [s.name, s.options || []])
      : [[null, json.options || []]];
    for (const [sub, options] of runs) {
      count++;
      try {
        await cmd.execute(fakeInteraction(json.name, sub, options));
      } catch (e) {
        problems.push(
          `/${json.name} ${sub || ''}: ${e.constructor.name}: ${e.message}`,
        );
      }
    }
  }

  // Event handlers + background jobs
  try {
    require(path.join(ROOT, 'src/events/ready'))(client);
    const onMessage = require(path.join(ROOT, 'src/events/messageCreate'));
    await onMessage({
      guild,
      channel,
      channelId: 'c1',
      client,
      content: 'hello',
      author: fakeUser('u1'),
      member: { displayName: 'U1' },
      attachments: new Map(),
      mentions: { has: () => false },
      delete: async () => {},
      react: async () => {},
    });
    const onInteraction = require(
      path.join(ROOT, 'src/events/interactionCreate'),
    );
    await onInteraction(fakeInteraction('profile', null, []));
  } catch (e) {
    problems.push(`events/jobs: ${e.constructor.name}: ${e.message}`);
  }

  await new Promise(r => setTimeout(r, 300)); // let background jobs run once
  console.error = origError;

  if (problems.length) {
    process.stdout.write(
      `❌ ${problems.length} problem(s) in ${count} subcommands:\n${problems.join('\n')}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `✅ All ${count} subcommands, events and background jobs ran without errors.\n`,
  );
  process.exit(0);
})();
