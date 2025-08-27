import { Client, GatewayIntentBits, Partials } from 'discord.js';
import 'dotenv/config';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,   // welcome
    GatewayIntentBits.GuildMessages,  // enforcement + sass
    GatewayIntentBits.MessageContent  // content checks
  ],
  partials: [Partials.Channel]
});

export async function startClient() {
  await client.login(process.env.DISCORD_TOKEN);
  console.log(`Logged in as ${client.user.tag}`);
}
