import { Events } from "discord.js";
import { logger } from "../lib/logger.js";
import { hitCooldown } from "../lib/cooldowns.js";

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(client, interaction) {
  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;

  try {
    const cdKey = `${interaction.user.id}:${interaction.commandName}`;
    if (hitCooldown(cdKey, 3000)) {
      return interaction.reply({ content: "Slow down 😉", ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: !!cmd.ephemeral });
    await cmd.execute(interaction);
  } catch (err) {
    logger.error({ err }, "Command failed");
    const content = "Oops—something went wrong. Try again later.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  }
}
