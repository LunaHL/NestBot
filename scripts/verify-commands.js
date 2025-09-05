import "dotenv/config";
import { REST, Routes } from "discord.js";

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? process.env.CLIENT_ID;
const GUILD_ID  = process.env.DISCORD_GUILD_ID  ?? process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
  throw new Error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID");
}

const rest = new REST({ version: "10" }).setToken(TOKEN);

const guild = GUILD_ID ? await rest.get(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)) : [];
const global = await rest.get(Routes.applicationCommands(CLIENT_ID));

console.log("Guild commands:", Array.isArray(guild) ? guild.map(c => c.name) : guild);
console.log("Global commands:", Array.isArray(global) ? global.map(c => c.name) : global);
