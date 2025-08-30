import "dotenv/config";
import { REST, Routes } from "discord.js";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const Env = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional(),
  NODE_ENV: z.enum(["development", "production"]).default("production")
});
const env = Env.parse(process.env);

const commands = [];
const base = path.resolve("src/commands");
for (const dir of fs.readdirSync(base)) {
  const dirPath = path.join(base, dir);
  if (!fs.statSync(dirPath).isDirectory()) continue;
  for (const file of fs.readdirSync(dirPath).filter(f => f.endsWith(".js"))) {
    const full = path.join(dirPath, file);
    const mod = await import(pathToFileURL(full).href);   // <-- changed
    if (mod.data) commands.push(mod.data);
  }
}

const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
if (env.NODE_ENV === "development" && env.DISCORD_GUILD_ID) {
  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), { body: commands });
  console.log(`Registered ${commands.length} guild commands (dev)`);
} else {
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: commands });
  console.log(`Registered ${commands.length} global commands (prod)`);
}