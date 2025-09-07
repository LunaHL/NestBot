// src/features/nsfwQuota.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
} from "discord.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../../data");

function statePath(guildId) { return path.join(DATA_DIR, `nsfwQuota.${guildId}.json`); }
function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function defaultState() {
  return {
    target: 0, progress: 0, window: "daily", deadline: 0,
    lastSetBy: null, setAt: 0,
    submissiveRoleId: null, mistressRoleId: null,
    nsfwChannelId: null, calloutChannelId: null,
  };
}
function loadState(guildId) {
  ensureDir();
  const p = statePath(guildId);
  if (!fs.existsSync(p)) { const s = defaultState(); fs.writeFileSync(p, JSON.stringify(s, null, 2)); return s; }
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return defaultState(); }
}
function saveState(guildId, s) { ensureDir(); fs.writeFileSync(statePath(guildId), JSON.stringify(s, null, 2)); }
const now = () => Date.now();

function nextDeadline(window, tz = "Europe/Berlin") {
  const date = new Date();
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    const parts = fmt.formatToParts(date);
    const y = parts.find(p=>p.type==="year").value;
    const m = parts.find(p=>p.type==="month").value;
    const d = parts.find(p=>p.type==="day").value;
    const localMidnight = new Date(`${y}-${m}-${d}T00:00:00`);
    const base = localMidnight.getTime();
    if (window === "daily") return base + 86400000;
    if (window === "weekly") {
      const day = new Date(base).getDay(); // 0..6
      const daysToMon = (8 - (day || 7)) % 7;
      return base + (daysToMon || 7) * 86400000;
    }
    return base + 7 * 86400000; // oneoff default 7 days
  } catch {
    return Date.now() + 86400000;
  }
}

function resolveGuildBits(guild, state) {
  const submissive = state.submissiveRoleId
    ? guild.roles.cache.get(state.submissiveRoleId)
    : guild.roles.cache.find(r => r.name.toLowerCase() === "submissive");

  const mistress = state.mistressRoleId
    ? guild.roles.cache.get(state.mistressRoleId)
    : guild.roles.cache.find(r => r.name.toLowerCase() === "mistress");

  const nsfwChan = state.nsfwChannelId
    ? guild.channels.cache.get(state.nsfwChannelId)
    : guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name.toLowerCase() === "nsfw-picture-fun");

  const calloutChan = state.calloutChannelId
    ? guild.channels.cache.get(state.calloutChannelId)
    : nsfwChan;

  return { submissive, mistress, nsfwChan, calloutChan };
}

function isImageAttachment(att) { return (att.contentType || "").startsWith("image/"); }
function imagesInMessage(message) {
  let count = 0;
  for (const att of message.attachments.values()) if (isImageAttachment(att)) count++;
  for (const emb of message.embeds) { if (emb?.image?.url) count++; else if (emb?.thumbnail?.url) count++; }
  return count;
}

const commandData = new SlashCommandBuilder()
  .setName("nsfw-quota")
  .setDescription("Collective Submissive picture quota for #NSFW-Picture-fun")
  .addSubcommand(sc => sc.setName("ping").setDescription("Health check"))
  .addSubcommand(sc => sc.setName("status").setDescription("Show current quota status"))
  .addSubcommand(sc =>
    sc.setName("set")
      .setDescription("Set target (Mistress only, once per window)")
      .addIntegerOption(o => o.setName("amount").setDescription("Target number of images").setMinValue(1).setRequired(true))
      .addStringOption(o => o.setName("window").setDescription("daily | weekly | oneoff").addChoices(
        { name: "daily", value: "daily" }, { name: "weekly", value: "weekly" }, { name: "oneoff", value: "oneoff" }
      ))
  )
  .addSubcommand(sc =>
    sc.setName("config")
      .setDescription("Configure roles/channels (Mistress only)")
      .addRoleOption(o => o.setName("submissive_role").setDescription("Role for submissives"))
      .addRoleOption(o => o.setName("mistress_role").setDescription("Role for mistresses"))
      .addChannelOption(o => o.setName("nsfw_channel").setDescription("Channel for picture counting"))
      .addChannelOption(o => o.setName("callout_channel").setDescription("Channel for callouts"))
  )
  .addSubcommand(sc => sc.setName("reset").setDescription("Reset/clear the current quota (Mistress only)"))
  .toJSON();

function deadlineText(ms) { return ms ? `<t:${Math.floor(ms/1000)}:R>` : "not set"; }

export function setupNsfwQuota(client) {
  // 1) Register on each guild directly (no REST/envs needed)
  client.once("ready", async () => {
    const guilds = [...client.guilds.cache.values()];
    if (guilds.length === 0) {
      console.warn("[nsfwQuota] No guilds cached on ready. Is the bot in a server?");
    }
    for (const g of guilds) {
      try {
        // Upsert: if a command named nsfw-quota already exists, edit it; else create it
        const existing = await g.commands.fetch().then(col => col.find(c => c.name === "nsfw-quota"));
        if (existing) {
          await g.commands.edit(existing.id, commandData);
          console.log(`[nsfwQuota] Updated command in guild ${g.id} (${g.name}).`);
        } else {
          await g.commands.create(commandData);
          console.log(`[nsfwQuota] Created command in guild ${g.id} (${g.name}).`);
        }
      } catch (e) {
        console.error(`[nsfwQuota] Guild command upsert failed for ${g.id} (${g.name}):`, e?.code || "", e?.message || e);
      }
    }
    startTicker(client);
    console.log("[nsfwQuota] Ticker started.");
  });

  // 2) Interactions
  client.on("interactionCreate", async (interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName !== "nsfw-quota") return;

      const guild = interaction.guild;
      if (!guild) return;
      const state = loadState(guild.id);
      const bits = resolveGuildBits(guild, state);
      const isMistress = bits.mistress && interaction.member?.roles?.cache?.has(bits.mistress.id);
      const sub = interaction.options.getSubcommand();

      if (sub === "ping") { await interaction.reply({ content: "🏓 nsfw-quota alive.", ephemeral: true }); return; }

      if (sub === "status") {
        const remain = Math.max(0, state.target - state.progress);
        const embed = new EmbedBuilder()
          .setTitle("📸 Submissive Picture Quota")
          .setDescription(
            `Channel: ${bits.nsfwChan ? `<#${bits.nsfwChan.id}>` : "*not configured*"}\n` +
            `Submissive role: ${bits.submissive ? `<@&${bits.submissive.id}>` : "*not configured*"}`
          )
          .addFields(
            { name: "Target", value: String(state.target), inline: true },
            { name: "Progress", value: String(state.progress), inline: true },
            { name: "Window", value: state.window || "daily", inline: true },
            { name: "Deadline", value: deadlineText(state.deadline), inline: true },
            { name: "Remaining", value: String(remain), inline: true },
          )
          .setTimestamp(new Date());
        await interaction.reply({ embeds: [embed] });
        return;
      }

      if (sub === "config") {
        if (!isMistress) { await interaction.reply({ content: "Only **Mistress** may configure.", ephemeral: true }); return; }
        const subRole = interaction.options.getRole("submissive_role");
        const misRole = interaction.options.getRole("mistress_role");
        const nsfw = interaction.options.getChannel("nsfw_channel");
        const callout = interaction.options.getChannel("callout_channel");
        if (subRole) state.submissiveRoleId = subRole.id;
        if (misRole) state.mistressRoleId = misRole.id;
        if (nsfw) state.nsfwChannelId = nsfw.id;
        if (callout) state.calloutChannelId = callout.id;
        saveState(guild.id, state);
        await interaction.reply("✅ Quota configuration updated.");
        return;
      }

      if (sub === "set") {
        if (!isMistress) { await interaction.reply({ content: "Only **Mistress** may set the quota.", ephemeral: true }); return; }
        if (state.target > 0 && state.deadline && now() < state.deadline) {
          await interaction.reply({ content: "A quota is already active. Use `/nsfw-quota reset` to override.", ephemeral: true });
          return;
        }
        const amount = interaction.options.getInteger("amount", true);
        const window = interaction.options.getString("window") || "daily";
        const deadline = nextDeadline(window);
        Object.assign(state, { target: amount, progress: 0, window, deadline, lastSetBy: interaction.user.id, setAt: now() });
        saveState(guild.id, state);
        await interaction.reply(`Set quota to **${amount}** images (${window}). Deadline ${deadlineText(deadline)}.`);
        return;
      }

      if (sub === "reset") {
        if (!isMistress) { await interaction.reply({ content: "Only **Mistress** may reset the quota.", ephemeral: true }); return; }
        Object.assign(state, { target: 0, progress: 0, deadline: 0, setAt: 0, lastSetBy: null });
        saveState(guild.id, state);
        await interaction.reply("🔄 Quota has been reset. You may `/nsfw-quota set` again.");
        return;
      }
    } catch (e) {
      console.error("[nsfwQuota] interaction error:", e);
      try { await interaction.reply({ content: "Error processing command.", ephemeral: true }); } catch {}
    }
  });

  // 3) Message counter
  client.on("messageCreate", async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      const state = loadState(message.guild.id);
      if (!state.target || !state.deadline || now() > state.deadline) return;

      const { submissive, nsfwChan } = resolveGuildBits(message.guild, state);
      if (!submissive || !nsfwChan) return;
      if (message.channel.id !== nsfwChan.id) return;
      if (!message.member?.roles.cache.has(submissive.id)) return;

      const count = imagesInMessage(message);
      if (count > 0) { state.progress += count; saveState(message.guild.id, state); }
    } catch (e) {
      console.error("[nsfwQuota] message handler error:", e);
    }
  });
}

let _ticker = null;
function startTicker(client) {
  if (_ticker) clearInterval(_ticker);
  _ticker = setInterval(async () => {
    try {
      for (const guild of client.guilds.cache.values()) {
        const state = loadState(guild.id);
        if (!state.deadline || state.target <= 0) continue;
        if (now() < state.deadline) continue;

        const { calloutChan } = resolveGuildBits(guild, state);
        if (!calloutChan) continue;

        if (state.progress < state.target) {
          const remaining = state.target - state.progress;
          await calloutChan.send(`⛓️ **Quota missed!** Submissives fell short by **${remaining}** image(s). Prepare for consequences.`);
        } else {
          await calloutChan.send(`🎉 **Quota met!** Good pets. You may bask in Mistress' approval.`);
        }

        if (state.window === "oneoff") {
          Object.assign(state, { target: 0, progress: 0, deadline: 0, setAt: 0, lastSetBy: null });
        } else {
          state.progress = 0;
          state.deadline = nextDeadline(state.window);
        }
        saveState(guild.id, state);
      }
    } catch (e) {
      console.error("[nsfwQuota] ticker error:", e);
    }
  }, 60 * 1000);
}
