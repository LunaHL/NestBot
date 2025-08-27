import crypto from 'node:crypto';
import { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType, PermissionFlagsBits } from 'discord.js';
import { add, gstore } from '../store.js';
import { setPunishment, getPunishment, clearPunishment } from './punishments.js';
import { maybeSass } from '../utils.js';

const DEFAULT_WHEEL = [
  'Only use emojis for 10 minutes',
  'Stay silent for 5 minutes',
  'Timeout 1 minute',
  'Get renamed to "Pet" for 10 minutes',
  'Receive the "Clown" role for 10 minutes',
  'Compliment 3 different members (RP)',
  'Do 5 kneeling emojis 🙇🙇🙇🙇🙇 (RP)',
  'Stand in the corner for 5 minutes (RP)'
];

const SPINS = new Map();            // token -> { entries, targetId, expiresAt }
const SPIN_TTL_MS = 10 * 60 * 1000; // 10 min

export function setupWheel(client) {
  client.on(Events.InteractionCreate, async (i) => {
    if (!i.isChatInputCommand()) return;

    // /wheel
    if (i.commandName === 'wheel') {
      const target = i.options.getUser('target') ?? i.user;
      const custom = i.options.getString('custom');
      const entries = (custom ? custom.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_WHEEL).slice(0, 30);
      if (entries.length < 2) {
        return i.reply({ content: 'Wheel needs at least 2 entries.', ephemeral: true });
      }

      const token = crypto.randomUUID();
      SPINS.set(token, { entries, targetId: target.id, expiresAt: Date.now() + SPIN_TTL_MS });

      const embed = new EmbedBuilder()
        .setTitle('🎡 Punishment Wheel')
        .setDescription([`**Target:** ${target}`, '', '**Entries:**', entries.map((e, idx) => `\`${idx + 1}.\` ${e}`).join('\n')].join('\n'))
        .setColor(0xE67E22);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`spin:${token}`).setLabel('Spin').setStyle(ButtonStyle.Primary)
      );

      return i.reply({ embeds: [embed], components: [row] });
    }

    // /endrule
    if (i.commandName === 'endrule') {
      const target = i.options.getUser('target');
      const p = getPunishment(i.guildId, target.id);
      if (!p) return i.reply({ content: `${target} has no active punishment.`, ephemeral: true });
      const member = await i.guild.members.fetch(target.id).catch(()=>null);
      if (!member) return i.reply({ content: 'Target not found.', ephemeral: true });

      if (p.type === 'rename') await member.setNickname(p.oldNick ?? null).catch(()=>{});
      if (p.type === 'role') await member.roles.remove(p.role).catch(()=>{});
      if (p.timer) clearTimeout(p.timer);
      clearPunishment(i.guildId, target.id);

      maybeSass(i, 'endrule');
      return i.reply({ content: `Punishment for ${target} has been ended early.`, ephemeral: true });
    }
  });

  // Spin button
  client.on(Events.InteractionCreate, async (i) => {
    if (!i.isButton() || !i.customId.startsWith('spin:')) return;

    const [, token] = i.customId.split(':');
    const data = SPINS.get(token);
    if (!data) return i.reply({ content: 'This wheel expired. Use /wheel again.', ephemeral: true });

    const { entries, targetId } = data;
    const winner = entries[Math.floor(Math.random() * entries.length)];
    const targetMention = `<@${targetId}>`;
    const result = new EmbedBuilder().setTitle('🎯 Punishment Assigned').setDescription(`${targetMention}\n**→ ${winner}**`).setColor(0xC0392B);

    const member = await i.guild.members.fetch(targetId).catch(()=>null);
    let enforced = false;

    if (member) {
      // Timeout
      if (/timeout/i.test(winner)) {
        await member.timeout(60_000, 'Wheel punishment').catch(()=>{});
        result.addFields({ name: 'Enforced', value: 'Timeout for 1 minute.' });
        enforced = true;
      }
      // Rename to "Pet"
      if (/rename|nick/i.test(winner)) {
        const me = i.guild.members.me;
        if (!me?.permissions.has(PermissionFlagsBits.ManageNicknames)) {
          result.addFields({ name: 'Not enforced', value: 'Missing **Manage Nicknames**.' });
        } else if (!member.manageable) {
          result.addFields({ name: 'Not enforced', value: 'My role must be above target’s role (or target is owner).' });
        } else {
          const oldNick = member.nickname ?? null;
          try {
            await member.setNickname('Pet');
            const timer = setTimeout(async () => {
              try { await member.setNickname(oldNick); } catch {}
              clearPunishment(i.guildId, member.id);
            }, 10*60*1000);
            setPunishment(i.guildId, member.id, { type: 'rename', oldNick, timer });
            result.addFields({ name: 'Enforced', value: 'Renamed to **"Pet"** for 10 minutes.' });
            enforced = true;
          } catch {}
        }
      }
      // Clown role
      if (/clown/i.test(winner)) {
        let role = i.guild.roles.cache.find(r => r.name === 'Clown');
        if (!role) role = await i.guild.roles.create({ name: 'Clown', color: 0xE67E22 }).catch(()=>null);
        if (role) {
          await member.roles.add(role).catch(()=>{});
          const timer = setTimeout(async () => {
            try { await member.roles.remove(role); } catch {}
            clearPunishment(i.guildId, member.id);
          }, 10*60*1000);
          setPunishment(i.guildId, member.id, { type: 'role', role, timer });
          result.addFields({ name: 'Enforced', value: 'Gave **Clown** role for 10 minutes.' });
          enforced = true;
        } else {
          result.addFields({ name: 'Not enforced', value: 'Could not create/apply role.' });
        }
      }
      // Emoji-only
      if (/emoji/i.test(winner)) {
        const timer = setTimeout(() => clearPunishment(i.guildId, member.id), 10*60*1000);
        setPunishment(i.guildId, member.id, { type: 'emoji_only', timer });
        result.addFields({ name: 'Enforced', value: 'Emoji-only for 10 minutes.' });
        enforced = true;
      }
      // Silence
      if (/\bstay silent\b|\bsilent\b/i.test(winner)) {
        const timer = setTimeout(() => clearPunishment(i.guildId, member.id), 5*60*1000);
        setPunishment(i.guildId, member.id, { type: 'silence', timer });
        result.addFields({ name: 'Enforced', value: 'Silence for 5 minutes.' });
        enforced = true;
      }
    }

    // PainTokens on enforced only
    if (enforced) {
      const val = add(i.guildId, targetId, 'pain', 2);
      const kennelId = gstore(i.guildId).config.kennelChannelId;
      if (kennelId) {
        const ch = i.guild.channels.cache.get(kennelId);
        ch?.isTextBased() && ch.send(`🔒 ${targetMention} endured a punishment. **+2 PainTokens** (now **${val}**).`).catch(()=>{});
      }
    }

    // disable button
    const rows = i.message.components.map(row => {
      const newRow = new ActionRowBuilder();
      for (const comp of row.components) if (comp.type === ComponentType.Button) newRow.addComponents(ButtonBuilder.from(comp).setDisabled(true));
      return newRow;
    });

    SPINS.delete(token);
    try { await i.update({ components: rows }); } catch {}
    maybeSass(i, 'punishment');
    return i.followUp({ embeds: [result] });
  });
}
