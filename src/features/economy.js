import { Events, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { CURRENCIES, fmtBalances, maybeSass } from '../utils.js';
import { gstore, ustore, add } from '../store.js';
import { requireRoom } from '../config.js';

export function setupEconomy(client) {
  client.on(Events.InteractionCreate, async (i) => {
    if (!i.isChatInputCommand()) return;

    // /setrooms
    if (i.commandName === 'setrooms') {
      if (!i.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        return i.reply({ content: 'Missing permission: Manage Server', ephemeral: true });
      }
      const cfg = gstore(i.guildId).config;
      const bank = i.options.getChannel('bank');
      const obedience = i.options.getChannel('obedience');
      const kennel = i.options.getChannel('kennel');
      if (bank) cfg.bankChannelId = bank.id;
      if (obedience) cfg.obedienceChannelId = obedience.id;
      if (kennel) cfg.kennelChannelId = kennel.id;
      return i.reply({
        content: [
          '**Rooms set:**',
          `Bank → ${cfg.bankChannelId ? `<#${cfg.bankChannelId}>` : '`(not set)`'}`,
          `Obedience Hall → ${cfg.obedienceChannelId ? `<#${cfg.obedienceChannelId}>` : '`(not set)`'}`,
          `Kennel → ${cfg.kennelChannelId ? `<#${cfg.kennelChannelId}>` : '`(not set)`'}`
        ].join('\n'),
        ephemeral: true
      });
    }

    // /balance
    if (i.commandName === 'balance') {
      const user = i.options.getUser('user') ?? i.user;
      const currency = i.options.getString('currency');
      const u = ustore(i.guildId, user.id);
      const e = new EmbedBuilder().setTitle(`Balance — ${user.username}`).setColor(0x2ECC71);
      if (!currency) {
        e.setDescription(fmtBalances(u));
        if ((u.coins ?? 0) === 0) maybeSass(i, 'zeroBalance');
      } else {
        const meta = CURRENCIES[currency];
        e.setDescription(`${meta.emoji} **${u[currency]}** ${meta.label}`);
        if (currency === 'coins' && (u.coins ?? 0) === 0) maybeSass(i, 'zeroBalance');
      }
      return i.reply({ embeds: [e], ephemeral: user.id === i.user.id });
    }

    // /daily (Bank)
    if (i.commandName === 'daily') {
      const room = requireRoom(i, 'bank'); if (!room.ok) return;
      const u = ustore(i.guildId, i.user.id);
      const now = Date.now(), DAY = 86_400_000;
      if (now - (u.lastDaily || 0) < DAY) {
        const left = Math.ceil((DAY - (now - u.lastDaily)) / 3_600_000);
        return i.reply({ content: `You already claimed daily. Try again in ~${left}h.`, ephemeral: true });
      }
      const amount = 3 + Math.floor(Math.random() * 3); // 3–5
      u.lastDaily = now; u.coins = (u.coins || 0) + amount;
      return i.reply({ content: `You received **${amount}** ${CURRENCIES.coins.emoji} ${CURRENCIES.coins.label}.`, ephemeral: true });
    }

    // /transfer (Bank)
    if (i.commandName === 'transfer') {
      const room = requireRoom(i, 'bank'); if (!room.ok) return;
      const to = i.options.getUser('to');
      const amount = i.options.getInteger('amount');
      const currency = i.options.getString('currency');
      if (to.id === i.user.id) return i.reply({ content: 'You cannot transfer to yourself.', ephemeral: true });
      const me = ustore(i.guildId, i.user.id);
      if ((me[currency] || 0) < amount) {
        return i.reply({ content: `Not enough ${CURRENCIES[currency].label}.`, ephemeral: true });
      }
      add(i.guildId, i.user.id, currency, -amount);
      add(i.guildId, to.id, currency, amount);
      return i.reply({ content: `${i.user} sent **${amount}** ${CURRENCIES[currency].emoji} ${CURRENCIES[currency].label} to ${to}.` });
    }

    // /grant & /deduct (room-aware)
    if (i.commandName === 'grant' || i.commandName === 'deduct') {
      if (!i.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        return i.reply({ content: 'Missing permission: Manage Server', ephemeral: true });
      }
      const user = i.options.getUser('user');
      const amount = i.options.getInteger('amount');
      const currency = i.options.getString('currency');
      const roomType = currency === 'coins' ? 'bank' : (currency === 'paws' ? 'obedience' : 'kennel');
      const room = requireRoom(i, roomType); if (!room.ok) return;
      const sign = i.commandName === 'grant' ? +1 : -1;
      const val = add(i.guildId, user.id, currency, sign * amount);
      return i.reply({ content: `${i.commandName === 'grant' ? 'Granted' : 'Deducted'} **${Math.abs(amount)}** ${CURRENCIES[currency].emoji} ${CURRENCIES[currency].label} ${sign>0?'to':'from'} ${user}. New: **${val}**` });
    }

    // /burnpain (Kennel)
    if (i.commandName === 'burnpain') {
      const room = requireRoom(i, 'kennel'); if (!room.ok) return;
      const amount = i.options.getInteger('amount');
      const you = ustore(i.guildId, i.user.id);
      if ((you.pain || 0) < amount) {
        return i.reply({ content: `You don't have that many ${CURRENCIES.pain.label}.`, ephemeral: true });
      }
      add(i.guildId, i.user.id, 'pain', -amount);
      return i.reply({ content: `${i.user} burned **${amount}** ${CURRENCIES.pain.emoji} ${CURRENCIES.pain.label}.` });
    }
  });
}
