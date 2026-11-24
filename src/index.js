// NestBot entry point: loads commands, connects the event handlers and logs in.
// What happens where is explained in src/README.md.
require('dotenv').config();
const { version } = require('../package.json');
const maintainer = require('./services/maintainer');

// A crash: remember why (DM to the maintainer after pm2's restart) and stop.
// After an uncaught error the bot could be in a weird state, so it's better
// to start fresh. Data is saved on exit (utils/db.js).
process.on('uncaughtException', error => {
  console.error('💥 Uncaught error, NestBot stops:', error);
  maintainer.recordCrash(error);
  process.exit(1);
});
// A promise nobody waited for failed: log and DM, but keep running
process.on('unhandledRejection', error => {
  console.error('❌ Unhandled error:', error);
  maintainer.reportError('Unhandled error', error);
});
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { loadCommands } = require('./utils/commands');
const { deployCommands } = require('./deploy-commands');
const onReady = require('./events/ready');
const onInteraction = require('./events/interactionCreate');
const onMessage = require('./events/messageCreate');
const onMemberUpdate = require('./events/guildMemberUpdate');

// "Server Members" and "Presence" are privileged intents: they must be
// switched on in the Discord Developer Portal (Bot → Privileged Gateway
// Intents). They power "/drinks round for:everyone/online" and keep paid
// nicknames in place. If they're off, NestBot starts without them.
const BASE_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildVoiceStates,
];
const PRIVILEGED_INTENTS = [
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildPresences,
];

function makeClient(privileged) {
  const client = new Client({
    intents: privileged
      ? [...BASE_INTENTS, ...PRIVILEGED_INTENTS]
      : BASE_INTENTS,
  });
  client.privilegedIntents = privileged;
  client.commands = new Map(loadCommands().map(c => [c.data.name, c]));
  client.once(Events.ClientReady, onReady);
  client.on(Events.InteractionCreate, onInteraction);
  client.on(Events.MessageCreate, onMessage);
  client.on(Events.GuildMemberUpdate, onMemberUpdate);
  return client;
}

async function login(privileged = true) {
  const client = makeClient(privileged);
  try {
    await client.login(process.env.BOT_TOKEN);
  } catch (e) {
    if (privileged && /disallowed intents/i.test(e.message)) {
      console.warn(
        '⚠️ The "Server Members" / "Presence" intents are off in the Developer Portal. ' +
          'Starting without them: /drinks round only works for voice channels, ' +
          'and people can change a paid nickname back themselves.',
      );
      await client.destroy();
      return login(false);
    }
    throw e;
  }
}

(async () => {
  console.log(`▶ NestBot v${version}. Deploying commands...`);
  await deployCommands();
  console.log('✅ Commands deployed. Logging in...');
  if (!process.env.BOT_TOKEN) console.error('❌ BOT_TOKEN is missing in .env');
  await login();
})().catch(error => {
  // e.g. a wrong BOT_TOKEN: stop, so pm2 shows it (and restarts)
  console.error('💥 Start failed:', error);
  maintainer.recordCrash(error);
  process.exit(1);
});
