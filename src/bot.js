import { Client, GatewayIntentBits, Partials, Collection } from "discord.js";
import { pathToFileURL } from "node:url";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { migrate } from "./db/migrate.js";
import "./db/index.js";

migrate();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember]
});

client.commands = new Collection();

import fs from "node:fs";
import path from "node:path";

const commandsPath = path.resolve("src/commands");
for (const dir of fs.readdirSync(commandsPath)) {
  const dirPath = path.join(commandsPath, dir);
  if (!fs.statSync(dirPath).isDirectory()) continue;
  for (const file of fs.readdirSync(dirPath).filter(f => f.endsWith(".js"))) {
    const full = path.join(dirPath, file);
    const mod = await import(pathToFileURL(full).href);   // <-- changed
    if (mod.data && mod.execute) client.commands.set(mod.data.name, mod);
  }
}

const eventsPath = path.resolve("src/events");
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith(".js"))) {
  const full = path.join(eventsPath, file);
  const mod = await import(pathToFileURL(full).href);     // <-- changed
  if (mod.name && mod.once) client.once(mod.name, (...args) => mod.execute(client, ...args));
  else if (mod.name) client.on(mod.name, (...args) => mod.execute(client, ...args));
}

client.login(env.DISCORD_TOKEN).then(() => logger.info("Bot logging in..."));