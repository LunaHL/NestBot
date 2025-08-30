import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { db } from "../../db/index.js";

// TODO: anpassen
const STAFF_ROLES = ["ROLE_ID_1","ROLE_ID_2"];

export const data = new SlashCommandBuilder()
  .setName("award")
  .setDescription("WÃ¤hrung vergeben (Staff)")
  .addUserOption(o => o.setName("user").setDescription("Nutzer").setRequired(true))
  .addStringOption(o =>
    o.setName("currency").setDescription("NC/PP/PT").addChoices(
      { name: "NestCoins", value: "NC" },
      { name: "PawPoints", value: "PP" },
      { name: "PainTokens", value: "PT" }
    ).setRequired(true))
  .addIntegerOption(o => o.setName("amount").setDescription("+/- Betrag").setRequired(true))
  .addStringOption(o => o.setName("reason").setDescription("Grund").setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
  .toJSON();

export const ephemeral = true;

export async function execute(interaction) {
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.roles.cache.some(r => STAFF_ROLES.includes(r.id))) {
    return interaction.editReply({ content: "Keine Berechtigung." });
  }

  const target = interaction.options.getUser("user", true);
  const currency = interaction.options.getString("currency", true);
  const amount = interaction.options.getInteger("amount", true);
  const reason = interaction.options.getString("reason") ?? null;

  const tx = db.transaction((uid, currency, delta, reason) => {
    db.prepare("INSERT OR IGNORE INTO users (id, created_at) VALUES (?, ?)").run(uid, Date.now());
    db.prepare("INSERT OR IGNORE INTO balances (user_id) VALUES (?)").run(uid);

    const column = currency === "NC" ? "nestcoins" : currency === "PP" ? "pawpoints" : "paintokens";
    db.prepare(`UPDATE balances SET ${column} = ${column} + ? WHERE user_id=?`).run(delta, uid);
    db.prepare("INSERT INTO transactions (user_id, currency, delta, reason, created_at) VALUES (?,?,?,?,?)")
      .run(uid, currency, delta, reason, Date.now());
    return db.prepare(`SELECT ${column} AS val FROM balances WHERE user_id=?`).get(uid).val;
  });

  const newVal = tx(target.id, currency, amount, reason);
  await interaction.editReply({ content: `OK. Neuer Stand (${currency}) fÃ¼r ${target.username}: ${newVal}` });
}