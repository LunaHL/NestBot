import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional(),
  NODE_ENV: z.enum(["development", "production"]).default("production"),
  TZ: z.string().default("Europe/Berlin"),
  LOG_LEVEL: z.string().default("info")
});
export const env = Env.parse(process.env);