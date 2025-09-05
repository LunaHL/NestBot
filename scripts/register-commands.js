// ESM, cross-platform, safe registrar
import "dotenv/config";
import { REST, Routes } from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ---- env (robust to naming differences) ----
const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? process.env.CLIENT_ID;
const GUILD_ID  = process.env.DISCORD_GUILD_ID  ?? process.env.GUILD_ID;
const MODE      = (process.env.NODE_ENV || "production").toLowerCase();

if (!TOKEN)     throw new Error("Missing DISCORD_TOKEN in .env");
if (!CLIENT_ID) throw new Error("Missing DISCORD_CLIENT_ID (or CLIENT_ID) in .env");

// ---- discover commands from src/commands/**.js (exporting .data) ----
const commands = [];
const base = path.resolve("src/commands");

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.endsWith(".js")) yield full;
  }
}

for (const file of walk(base)) {
  const mod = await import(pathToFileURL(file).href);  // windows-safe import
  if (mod.data) commands.push(mod.data);
}

const rest = new REST({ version: "10" }).setToken(TOKEN);
const isDev = MODE === "development";

(async () => {
  try {
    if (isDev) {
      if (!GUILD_ID) throw new Error("Missing DISCORD_GUILD_ID (or GUILD_ID) for development/guild registration");
      console.log(`Registering ${commands.length} GUILD commands for ${GUILD_ID}…`);
      const res = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log(`✓ Registered ${Array.isArray(res) ? res.length : commands.length} guild commands`);
    } else {
      console.log(`Registering ${commands.length} GLOBAL commands…`);
      const res = await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log(`✓ Registered ${Array.isArray(res) ? res.length : commands.length} global commands (may take up to ~1h to appear)`);
    }
  } catch (err) {
    console.error("✗ Failed to register commands:");
    if (err?.rawError) console.error(JSON.stringify(err.rawError, null, 2));
    console.error(err);
    process.exit(1);
  }
})();
