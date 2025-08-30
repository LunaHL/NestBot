import { Events } from "discord.js";

export const name = Events.ClientReady;   // future-proof
export const once = true;
/** @param {import('discord.js').Client} client */
export async function execute(client) {
  console.log(`Ready as ${client.user.tag}`);
  const { startBirthdayJob } = await import("../jobs/birthdays.js");
  startBirthdayJob(client);
}