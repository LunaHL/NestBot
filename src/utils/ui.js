// Shared look for NestBot's messages, so every command feels the same:
// one color per area, cards with the same layout, and the same wording for
// "done" and "didn't work".
const { EmbedBuilder } = require('discord.js');

const COLORS = {
  primary: 0x5865f2, // general
  success: 0x2ecc71,
  danger: 0xe74c3c,
  warning: 0xf1c40f,
  muted: 0x95a5a6,
  coins: 0xf1c40f, // economy
  shop: 0x00aaff,
  wheel: 0x9b59b6,
  gamble: 0xe67e22,
  nickname: 0xff79c6,
};

/**
 * A card (embed) in the shared style.
 * card({ title, text, color, fields, footer, thumbnail, image })
 */
function card({
  title,
  text,
  color = COLORS.primary,
  fields = [],
  footer,
  thumbnail,
  image,
} = {}) {
  const embed = new EmbedBuilder().setColor(color);
  if (title) embed.setTitle(title);
  if (text) embed.setDescription(text);
  if (fields.length) embed.addFields(fields);
  if (footer) embed.setFooter({ text: footer });
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  return embed;
}

/** Only visible to the person who used the command. */
const ok = text => ({ content: `✅ ${text}`, flags: 64 });
const fail = text => ({ content: `❌ ${text}`, flags: 64 });
const info = text => ({ content: text, flags: 64 });

/** "💰 **120**" */
const coins = n => `💰 **${n}**`;

/** 90 → "1 h 30 min", 45 → "45 min", 30 s → "30 s" */
function duration(seconds) {
  if (seconds < 60) return `${seconds} s`;
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

const MEDALS = ['🥇', '🥈', '🥉'];
const rank = i => MEDALS[i] || `**${i + 1}.**`;

module.exports = {
  COLORS,
  card,
  ok,
  fail,
  info,
  coins,
  duration,
  rank,
  MEDALS,
};
