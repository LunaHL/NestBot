import { Events, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { cfg } from '../config.js';
import { CURRENCIES, describeItem } from '../utils.js';
import { ustore, add, pushInventory, popInventory, save } from '../store.js';

/** Apply item effects immediately if applicable. Some items go to inventory for later use. */
async function applyItemEffect(i, item, userStore) {
  const gid = i.guildId;
  const uid = i.user.id;

  switch (item.type) {
    case 'coupon_skip':
    case 'coupon_reroll':
    case 'coupon_reverse': {
      // Goes to inventory (consumable)
      pushInventory(gid, uid, { id: item.id + ':' + Date.now(), type: item.type, name: item.name, meta: {} });
      return `Purchased **${item.name}**. It’s in your inventory. Use with \`/use item:<id>\`.`;
    }
    case 'role_cosmetic': {
      // Try to grant role (create if missing)
      let role = i.guild.roles.cache.find(r => r.name === (item.meta?.roleName || 'Good Pet'));
      if (!role) role = await i.guild.roles.create({ name: item.meta?.roleName || 'Good Pet', color: 0x2ECC71 }).catch(()=>null);
      if (!role) return 'Could not create/apply role.';
      const member = await i.guild.members.fetch(uid).catch(()=>null);
      if (!member) return 'User not found.';
      await member.roles.add(role).catch(()=>{});
      // Optional expiry not implemented here; could be a timed job
      return `Granted role **${role.name}**.`;
    }
    default:
      // Unknown types go to inventory by default
      pushInventory(gid, uid, { id: item.id + ':' + Date.now(), type: item.type, name: item.name, meta: item.meta || {} });
      return `Purchased **${item.name}**. It’s in your inventory.`;
  }
}

export function setupShop(client) {
  client.on(Events.InteractionCreate, async (i) => {
    if (!i.isChatInputCommand()) return;

    // /shop
    if (i.commandName === 'shop') {
      const items = cfg(i.guildId).shop.items || [];
      if (!items.length) return i.reply({ content: 'The shop is empty. Ask staff to add items on the dashboard.', ephemeral: true });

      const e = new EmbedBuilder().setTitle('🛒 Shop').setColor(0xF39C12);
      e.setDescription(items.map(describeItem).join('\n'));
      return i.reply({ embeds: [e] });
    }

    // /buy
    if (i.commandName === 'buy') {
      const id = i.options.getString('item');
      const items = cfg(i.guildId).shop.items || [];
      const item = items.find(x => x.id === id);
      if (!item) return i.reply({ content: 'Item not found.', ephemeral: true });

      const u = ustore(i.guildId, i.user.id);
      const field = item.priceCurrency || 'coins';
      const price = item.price ?? 0;

      if ((u[field] || 0) < price) {
        return i.reply({ content: `Not enough ${CURRENCIES[field].label}.`, ephemeral: true });
      }

      add(i.guildId, i.user.id, field, -price);
      const msg = await applyItemEffect(i, item, u);
      return i.reply({ content: `✅ ${msg}` });
    }

    // /inventory
    if (i.commandName === 'inventory') {
      const u = ustore(i.guildId, i.user.id);
      if (!u.inventory?.length) return i.reply({ content: 'Your inventory is empty.', ephemeral: true });

      const e = new EmbedBuilder().setTitle('🎒 Inventory').setColor(0x9B59B6);
      e.setDescription(u.inventory.map(it => `\`${it.id}\` — **${it.name}** — *${it.type}*`).join('\n'));
      return i.reply({ embeds: [e], ephemeral: true });
    }

    // /use
    if (i.commandName === 'use') {
      const itemId = i.options.getString('item');
      const it = popInventory(i.guildId, i.user.id, itemId);
      if (!it) return i.reply({ content: 'Item not found in your inventory.', ephemeral: true });

      // For demo: coupons don’t auto-execute here; they are consumed later by wheel logic (not implemented).
      // You could set a flag on user so wheel respects it.
      return i.reply({ content: `Used **${it.name}**. (Effect will be applied when relevant.)`, ephemeral: true });
    }
  });
}
