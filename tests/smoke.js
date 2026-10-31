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
const fakeSent = () => ({ id: 'm', edit: async () => {}, pin: async () => {} });
const channel = {
  id: 'c1',
  name: 'general',
  type: 0,
  isTextBased: () => true,
  isThread: () => false,
  send: async () => fakeSent(),
  sendTyping: async () => {},
  // fetch('id') → one message, fetch({ limit }) → a collection, like Discord
  messages: {
    fetch: async arg => (typeof arg === 'string' ? fakeSent() : new Map()),
  },
  permissionOverwrites: { edit: async () => {}, delete: async () => {} },
  delete: async () => {},
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
  roles: {
    everyone: {
      id: 'g',
      permissions: { has: () => true, add: () => 0n, remove: () => 0n },
      setPermissions: async () => {},
    },
    cache: new Map(),
  },
  scheduledEvents: {
    create: async () => ({
      id: 'ev',
      edit: async () => {},
      delete: async () => {},
    }),
    fetch: async () => null,
  },
  members: {
    me: { permissionsIn: () => ({ has: () => true }) },
    fetch: async () => null,
    cache: new Map(),
  },
  channels: {
    cache: new Map([['c1', channel]]),
    // Rooms for movie nights
    create: async () => ({
      ...channel,
      id: 'room',
      permissionOverwrites: { edit: async () => {}, delete: async () => {} },
      delete: async () => {},
    }),
  },
};
const client = {
  ws: { ping: 1 },
  user: fakeUser('BOT'),
  channels: { fetch: async () => channel, cache: new Map([['c1', channel]]) },
  guilds: { cache: new Map([['g', guild]]) },
  users: { fetch: async id => fakeUser(id) },
};
guild.client = client;

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

function fakeInteraction(commandName, sub, options = [], group = null) {
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
      getSubcommandGroup: () => group,
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
    const subGroups = (json.options || []).filter(o => o.type === 2);
    const runs = [
      ...subs.map(x => [x.name, x.options || [], null]),
      ...subGroups.flatMap(g =>
        (g.options || []).map(x => [x.name, x.options || [], g.name]),
      ),
    ];
    if (!runs.length) runs.push([null, json.options || [], null]);
    for (const [sub, options, group] of runs) {
      count++;
      try {
        await cmd.execute(fakeInteraction(json.name, sub, options, group));
      } catch (e) {
        problems.push(
          `/${json.name} ${sub || ''}: ${e.constructor.name}: ${e.message}`,
        );
      }
    }
  }

  // Autocomplete (suggestions while typing): every option that has it, in
  // every subcommand, like Discord sends it
  for (const cmd of commands.filter(c => c.autocomplete)) {
    const json = cmd.data.toJSON();
    const subs = (json.options || []).filter(o => o.type === 1);
    const groupSubs = (json.options || [])
      .filter(o => o.type === 2)
      .flatMap(g => g.options || []);
    const allSubs = [...subs, ...groupSubs];
    const targets = allSubs.length
      ? allSubs.flatMap(sub =>
          (sub.options || [])
            .filter(o => o.autocomplete)
            .map(o => [sub.name, o.name]),
        )
      : (json.options || [])
          .filter(o => o.autocomplete)
          .map(o => [null, o.name]);
    for (const [sub, option] of targets) {
      count++;
      try {
        await cmd.autocomplete({
          client,
          guild,
          guildId: 'g',
          commandName: json.name,
          user: fakeUser('u1'),
          locale: 'de',
          options: {
            getSubcommand: () => sub,
            getSubcommandGroup: () => null,
            getString: () => null,
            getFocused: full => (full ? { name: option, value: 'co' } : 'co'),
          },
          respond: async () => {},
        });
      } catch (e) {
        problems.push(
          `/${json.name} ${sub || ''} autocomplete ${option}: ${e.constructor.name}: ${e.message}`,
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
