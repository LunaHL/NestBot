import cron from "node-cron";
import { db } from "../db/index.js";

export function startBirthdayJob(client) {
  cron.schedule("0 9 * * *", async () => {
    const today = new Date().toISOString().slice(5, 10); // 'MM-DD'
    const rows = db.prepare("SELECT user_id, date FROM birthdays").all();
    const todays = rows.filter(r => r.date.slice(5,10) === today);
    if (todays.length === 0) return;

    // TODO: Kanal-ID anpassen
    const channel = await client.channels.fetch("CHANNEL_ID_FOR_BIRTHDAYS");
    for (const r of todays) {
      await channel.send(`ðŸŽ‚ Alles Gute, <@${r.user_id}>!`);
    }
  }, { timezone: "Europe/Berlin" });
}