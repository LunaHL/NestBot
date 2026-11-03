// A small fake Discord for scenario tests: one server ("g") with channels,
// members, roles, DMs, and helpers to run commands, click buttons and send
// forms the way Discord would. Data goes to a temporary folder, so the real
// nestbot.json is never touched. Used by the *.test.js files next to it.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NESTBOT_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), 'nestbot-test-'),
);
process.env.TIMEZONE ||= 'Europe/Berlin';
delete process.env.TMDB_TOKEN; // no real TMDB calls in tests
delete process.env.GEMINI_API_KEY;

const SRC = path.join(__dirname, '..', '..', 'src');
const load = p => require(path.join(SRC, p));

let msgId = 0;
const channels = new Map();
const dms = [];

function makeMessage(ch, payload) {
  const m = {
    id: `m${++msgId}`,
    channelId: ch.id,
    payload,
    pinned: false,
    deleted: false,
    reactions: [],
    async edit(p) {
      m.payload = p;
      return m;
    },
    async pin() {
      m.pinned = true;
    },
    async delete() {
      m.deleted = true;
    },
  };
  return m;
}

function makeChannel(id, name, opts = {}) {
  const ch = {
    id,
    name,
    guildId: 'g',
    parentId: opts.parent || null,
    sent: [],
    overwrites: new Map(opts.overwrites || []),
    get lastMessageId() {
      return ch.sent.at(-1)?.id || null;
    },
    isTextBased: () => true,
    isThread: () => false,
    async send(p) {
      const m = makeMessage(ch, typeof p === 'string' ? { content: p } : p);
      ch.sent.push(m);
      return m;
    },
    messages: {
      fetch: async mid =>
        typeof mid === 'string'
          ? ch.sent.find(m => m.id === mid) || null
          : new Map(),
    },
    permissionOverwrites: {
      cache: new Map(),
      edit: async (uid, p) => ch.overwrites.set(uid, p),
      delete: async uid => ch.overwrites.delete(uid),
    },
    async delete() {
      channels.delete(id);
    },
  };
  channels.set(id, ch);
  return ch;
}

const general = makeChannel('general', 'general');
const hub = makeChannel('hub', 'front-desk');

const roles = new Map();
let roleId = 0;
const memberRoles = {};
const nicknames = {};

function makeMember(id, { admin = false, bot = false } = {}) {
  return {
    id,
    displayName: id.toUpperCase(),
    get nickname() {
      return nicknames[id] ?? null;
    },
    manageable: !admin,
    user: {
      id,
      username: id,
      bot,
      displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
    },
    permissions: { has: () => admin },
    roles: {
      cache: new Map(),
      add: async r => (memberRoles[id] ||= new Set()).add(r),
      remove: async r => memberRoles[id]?.delete(r),
    },
    async setNickname(n) {
      nicknames[id] = n;
    },
    async send(t) {
      dms.push({ to: id, payload: t });
    },
    async react() {},
  };
}
const MEMBERS = {};
for (const id of ['a', 'b', 'c', 'd', 'e']) MEMBERS[id] = makeMember(id);
MEMBERS.admin = makeMember('admin', { admin: true });

const guild = {
  id: 'g',
  name: 'Nest',
  roles: {
    everyone: {
      id: 'g',
      permissions: { has: () => true, add: () => 0n, remove: () => 0n },
      setPermissions: async () => {},
    },
    cache: roles,
    fetch: async id => roles.get(id) || null,
    create: async o => {
      const r = {
        id: `role${++roleId}`,
        name: o.name,
        delete: async () => roles.delete(r.id),
      };
      roles.set(r.id, r);
      return r;
    },
  },
  members: {
    cache: new Map(Object.entries(MEMBERS)),
    fetch: async id =>
      typeof id === 'string'
        ? MEMBERS[id] || null
        : new Map(Object.entries(MEMBERS)),
    me: { permissionsIn: () => ({ has: () => true }) },
  },
  channels: {
    cache: channels,
    create: async o => makeChannel(`ch${++msgId}`, o.name),
  },
  scheduledEvents: {
    create: async () => ({
      id: 'ev',
      edit: async () => {},
      delete: async () => {},
    }),
    fetch: async () => null,
  },
};

const client = {
  user: { id: 'BOT', tag: 'NestBot#0' },
  guilds: { cache: new Map([['g', guild]]) },
  channels: { fetch: async id => channels.get(id) || null, cache: channels },
  users: {
    fetch: async id =>
      MEMBERS[id] ? { ...MEMBERS[id].user, send: MEMBERS[id].send } : null,
  },
  commands: new Map(),
  privilegedIntents: true,
};
guild.client = client;

for (const c of load('utils/commands').loadCommands())
  client.commands.set(c.data.name, c);
const onInteraction = load('events/interactionCreate');

/** A fake interaction. kind: 'command' | 'button' | 'select' | 'modal'. */
function interaction(
  kind,
  {
    user = 'a',
    channelId = 'general',
    commandName,
    sub = null,
    group = null,
    opts = {},
    customId,
    values,
    fields = {},
  } = {},
) {
  const out = [];
  const push = r => {
    out.push(typeof r === 'string' ? { content: r } : r);
    return { createMessageComponentCollector: () => ({ on() {}, stop() {} }) };
  };
  const i = {
    id: `i${Math.random()}`,
    guildId: 'g',
    guild,
    client,
    channelId,
    channel: channels.get(channelId),
    locale: 'en-US',
    commandName,
    customId,
    values,
    user: MEMBERS[user].user,
    member: MEMBERS[user],
    memberPermissions: { has: () => MEMBERS[user].permissions.has() },
    message: { id: 'msg' },
    replied: false,
    deferred: false,
    inGuild: () => true,
    isAutocomplete: () => false,
    isChatInputCommand: () => kind === 'command',
    isUserContextMenuCommand: () => false,
    isButton: () => kind === 'button',
    isStringSelectMenu: () => kind === 'select',
    isUserSelectMenu: () => false,
    isModalSubmit: () => kind === 'modal',
    options: {
      getSubcommand: () => sub,
      getSubcommandGroup: () => group,
      getString: k => opts[k] ?? null,
      getInteger: k => opts[k] ?? null,
      getBoolean: k => opts[k] ?? null,
      getChannel: k => opts[k] ?? null,
      getRole: k => opts[k] ?? null,
      getUser: k =>
        opts[k]
          ? MEMBERS[opts[k]]?.user || {
              id: opts[k],
              username: opts[k],
              bot: false,
            }
          : null,
      getMember: k => (opts[k] ? MEMBERS[opts[k]] || null : null),
      getFocused: full =>
        full
          ? { name: opts._focus, value: opts[opts._focus] || '' }
          : opts[opts._focus] || '',
    },
    fields: { getTextInputValue: k => fields[k] ?? '' },
    reply: async r => ((i.replied = true), push(r)),
    deferReply: async () => {
      i.deferred = true;
    },
    editReply: async r => push(r),
    followUp: async r => push(r),
    update: async r => push(r),
    deferUpdate: async () => {
      i.deferred = true;
    },
    showModal: async m => push({ modal: m }),
    respond: async r => push({ choices: r }),
  };
  return [i, out];
}

/** Run a slash command; returns everything it answered. */
async function run(
  commandName,
  sub,
  opts = {},
  user = 'a',
  { group = null, channelId } = {},
) {
  const [i, out] = interaction('command', {
    user,
    commandName,
    sub,
    group,
    opts,
    channelId,
  });
  await onInteraction(i);
  return out;
}
/** Click a button (or pick menu values). */
async function click(customId, user = 'a', values) {
  const [i, out] = interaction(values ? 'select' : 'button', {
    user,
    customId,
    values,
  });
  await onInteraction(i);
  return out;
}
/** Send a form. */
async function submit(customId, user = 'a', fields = {}) {
  const [i, out] = interaction('modal', { user, customId, fields });
  await onInteraction(i);
  return out;
}
/** A chat message (for messageCreate). */
function chat(user, content = 'hi', channelId = 'general') {
  const ch = channels.get(channelId);
  const replies = [];
  return {
    msg: {
      id: `chat${++msgId}`,
      content,
      guild,
      client,
      channel: ch,
      author: MEMBERS[user].user,
      member: MEMBERS[user],
      components: [],
      mentions: { users: new Map(), has: () => false },
      attachments: new Map(),
      reply: async p => {
        const m = makeMessage(ch, typeof p === 'string' ? { content: p } : p);
        replies.push(m);
        return m;
      },
      react: async () => {},
      delete: async () => {},
    },
    replies,
  };
}

const text = out => JSON.stringify(out);
const db = load('utils/db');

module.exports = {
  load,
  db,
  guild,
  client,
  channels,
  general,
  hub,
  MEMBERS,
  memberRoles,
  nicknames,
  dms,
  roles,
  run,
  click,
  submit,
  chat,
  text,
};
