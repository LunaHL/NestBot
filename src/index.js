// NestBot entry point: loads commands, connects the event handlers and logs in.
// What happens where is explained in src/README.md.
require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { loadCommands } = require('./utils/commands');
const { deployCommands } = require('./deploy-commands');
const onReady = require('./events/ready');
const onInteraction = require('./events/interactionCreate');
const onMessage = require('./events/messageCreate');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Map(loadCommands().map(c => [c.data.name, c]));

client.once(Events.ClientReady, onReady);
client.on(Events.InteractionCreate, onInteraction);
client.on(Events.MessageCreate, onMessage);

(async () => {
  console.log('▶ Deploying commands...');
  await deployCommands();
  console.log('✅ Commands deployed. Logging in...');
  if (!process.env.BOT_TOKEN) console.error('❌ BOT_TOKEN is missing in .env');
  client.login(process.env.BOT_TOKEN);
})();
