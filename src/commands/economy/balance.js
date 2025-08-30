import { SlashCommandBuilder } from "discord.js";
import { db } from "../../db/index.js";

export const data = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("Zeigt dein Guthaben an")
  .addUserOption(o => o.setName("user").setDescription("Anderen Nutzer prÃ¼fen").setRequired(false))
  .toJSON();

export const ephemeral = false;

export async function execute(interaction) {
  const user = interaction.options.getUser("user") ?? interaction.user;
  const userId = user.id;

  const tx = db.transaction((uid) => {
    db.prepare("INSERT OR IGNORE INTO users (id, created_at) VALUES (?, ?)").run(uid, Date.now());
    db.prepare("INSERT OR IGNORE INTO balances (user_id) VALUES (?)").run(uid);
    return db.prepare("SELECT nestcoins, pawpoints, paintokens FROM balances WHERE user_id=?").get(uid);
  });

  const row = tx(userId);
  await interaction.editReply({
    content: `**${user.username}**\nâ€¢ NestCoins: ${row.nestcoins}\nâ€¢ PawPoints: ${row.pawpoints}\nâ€¢ PainTokens: ${row.paintokens}`
  });
}