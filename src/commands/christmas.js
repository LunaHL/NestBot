// /christmas: the advent calendar, snowballs, the server tree and Secret
// Santa. Only shown in Discord Dec 1–26 (or in test mode, /settings holidays).
// Logic: src/services/christmas.js. Buttons ("christmas:…") are routed here.
const { SlashCommandBuilder } = require('discord.js');
const christmas = require('../services/christmas');
const seasons = require('../services/seasons');
const drinks = require('../services/drinks');
const achievements = require('../services/achievements');
const { discordTime } = require('../utils/time');
const ui = require('../utils/ui');

async function handleComponent(interaction) {
  const [, action, value] = interaction.customId.split(':');
  const guildId = interaction.guildId;

  if (action === 'ornament') {
    if (!seasons.active('christmas'))
      return interaction.reply(
        ui.fail('The tree is packed away until December. 🎄'),
      );
    const r = christmas.decorate(guildId, interaction.user.id, value);
    if (r.error)
      return interaction.reply(
        ui.info('🎄 You already hung an ornament today. Come back tomorrow!'),
      );
    if (r.goal) christmas.payGoal(guildId, r.goal, r.decorators);
    await interaction
      .update({
        embeds: [christmas.treeCard(guildId)],
        components: christmas.ornamentButtons(),
      })
      .catch(() => {});
    await interaction.followUp({
      content:
        `${christmas.ORNAMENTS[value]?.emoji || '✨'} <@${interaction.user.id}> hung a ${christmas.ORNAMENTS[value]?.name.toLowerCase() || 'something shiny'} on the tree!` +
        (r.goal === christmas.GOAL_SMALL
          ? `\n🎉 **${r.goal} ornaments!** Everyone who helped gets 20 coins.`
          : '') +
        (r.goal === christmas.GOAL_BIG
          ? `\n🌟 **${r.goal} ornaments! The star lights up**, and loot drops are doubled for a day!`
          : ''),
      allowedMentions: { parse: [] },
    });
    return achievements.announce(interaction, [
      interaction.user.id,
      ...(r.goal ? r.decorators : []),
    ]);
  }

  if (action === 'cheers') {
    const r = christmas.cheers(guildId, Number(value), interaction.user.id);
    return interaction.reply(
      ui.info(
        r === 'ok'
          ? '🥂 Cheers! +25 coins. Happy New Year! 🎆'
          : '🥂 You already toasted. Happy New Year!',
      ),
    );
  }
  return interaction.reply(ui.fail('Unknown button.'));
}

module.exports = {
  handleComponent,
  // Only shown in Discord during Christmas (see deploy-commands.js)
  season: () => seasons.active('christmas'),

  data: new SlashCommandBuilder()
    .setName('christmas')
    .setDescription(
      '🎄 Christmas: advent calendar, snowballs, the tree, Secret Santa',
    )
    .addSubcommand(s =>
      s
        .setName('advent')
        .setDescription('🗓️ Open today’s door of the advent calendar'),
    )
    .addSubcommand(s =>
      s
        .setName('snowball')
        .setDescription('❄️ Throw a snowball at someone (3 free a day)')
        .addUserOption(o =>
          o.setName('user').setDescription('Who you aim at').setRequired(true),
        ),
    )
    .addSubcommand(s =>
      s
        .setName('tree')
        .setDescription('🎄 The server tree: hang one ornament a day'),
    )
    .addSubcommandGroup(g =>
      g
        .setName('santa')
        .setDescription('🎅 Secret Santa')
        .addSubcommand(s =>
          s
            .setName('join')
            .setDescription(
              `Join Secret Santa (until Dec ${christmas.SANTA_JOIN_UNTIL})`,
            )
            .addStringOption(o =>
              o
                .setName('wish')
                .setDescription('A little wish for your Santa')
                .setMaxLength(200),
            ),
        )
        .addSubcommand(s =>
          s
            .setName('leave')
            .setDescription('Leave Secret Santa (before the draw)'),
        )
        .addSubcommand(s =>
          s
            .setName('gift')
            .setDescription('Prepare your gift (secret until Christmas Eve)')
            .addIntegerOption(o =>
              o
                .setName('coins')
                .setDescription('Coins to give')
                .setMinValue(0)
                .setMaxValue(1000),
            )
            .addStringOption(o =>
              o
                .setName('drink')
                .setDescription('A drink to give (start typing)')
                .setAutocomplete(true),
            )
            .addStringOption(o =>
              o
                .setName('note')
                .setDescription('A note with your gift')
                .setMaxLength(300),
            ),
        )
        .addSubcommand(s =>
          s
            .setName('status')
            .setDescription('Who you’re Santa for, and your gift'),
        ),
    ),

  async autocomplete(interaction) {
    return interaction.respond(
      drinks.searchDrinks(
        interaction.options.getFocused(),
        interaction.guildId,
      ),
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup(false);
    const guild = interaction.guild;
    const guildId = interaction.guildId;
    const me = interaction.user.id;
    const o = interaction.options;
    if (!seasons.active('christmas'))
      return interaction.reply(ui.info('🎄 Christmas starts on December 1st!'));

    // ---------- 🗓️ advent ----------
    if (sub === 'advent') {
      const r = await christmas.openDoor(guild, interaction.member);
      const grid = christmas.adventGrid(guildId, me);
      if (r.error === 'closed')
        return interaction.reply(
          ui.info('🗓️ The advent calendar is only open December 1–24.'),
        );
      if (r.error === 'opened') {
        return interaction.reply({
          embeds: [
            ui.card({
              title: '🗓️ Your advent calendar',
              color: christmas.COLOR,
              text: `You already opened door **${r.day}** today. Come back tomorrow!\n\n${grid.text}`,
            }),
          ],
          flags: 64,
        });
      }
      await interaction.reply({
        embeds: [
          ui.card({
            title: `🗓️ Door ${r.day}`,
            color: christmas.COLOR,
            text: `${r.text}\n\n${grid.text}`,
            footer: `${grid.opened}/24 doors · 🎁 opened · ⭐ today · ❌ missed · 🔒 later`,
          }),
        ],
      });
      return achievements.announce(interaction, [me]);
    }

    // ---------- ❄️ snowball ----------
    if (sub === 'snowball') {
      const target = o.getUser('user');
      if (target.bot)
        return interaction.reply(
          ui.fail('Bots are made of metal. The snowball just melts. 🤖'),
        );
      if (target.id === me)
        return interaction.reply(
          ui.fail('Throwing it straight up? Bold. Pick someone else.'),
        );
      const r = await christmas.throwSnowball(guild, me, target.id);
      if (r.error === 'frozen')
        return interaction.reply(
          ui.fail(
            `You’re frozen solid until ${discordTime(r.until, 't')}! A hot drink from a friend thaws you. ☕`,
          ),
        );
      if (r.error === 'coins')
        return interaction.reply(
          ui.fail(
            `Your free snowballs are used up. One more costs ${christmas.SNOWBALL_PRICE} coins, you have ${r.balance}.`,
          ),
        );
      const text = {
        hit: `❄️ **SPLAT!** <@${me}> hit <@${target.id}> right in the face! They’re **frozen** for ${christmas.FROZEN_MIN} minutes. 🥶`,
        bystander: `❄️ <@${me}> aimed at <@${target.id}>… and hit <@${r.victimId}> instead! 😅 They’re **frozen** for ${christmas.FROZEN_MIN} minutes.`,
        miss: `❄️ <@${me}> threw at <@${target.id}>… and missed completely. The snowman behind them is offended. ⛄`,
      }[r.outcome];
      await interaction.reply({
        content: text,
        allowedMentions: { users: r.victimId ? [r.victimId] : [] },
      });
      await interaction.followUp(
        ui.info(
          r.paid
            ? `❄️ That one cost ${r.paid} coins.`
            : `❄️ ${r.left} free snowball${r.left === 1 ? '' : 's'} left today.${r.victimId ? ' (A hot drink gift thaws a frozen friend.)' : ''}`,
        ),
      );
      return achievements.announce(interaction, [me]);
    }

    // ---------- 🎄 tree ----------
    if (sub === 'tree') {
      return interaction.reply({
        embeds: [christmas.treeCard(guildId)],
        components: christmas.ornamentButtons(),
        allowedMentions: { parse: [] },
      });
    }

    // ---------- 🎅 santa ----------
    if (group === 'santa') {
      const s = christmas.read(guildId).santa;
      if (sub === 'join') {
        const r = christmas.santaJoin(guildId, me, o.getString('wish'));
        if (r.error)
          return interaction.reply(
            ui.fail('The names are already drawn. Next year! 🎅'),
          );
        return interaction.reply(
          ui.ok(
            `${r.joined ? 'You’re in' : 'Updated'}! **${r.count}** people are playing. On December ${christmas.SANTA_JOIN_UNTIL} I draw the names and DM you who you’re Santa for.`,
          ),
        );
      }
      if (sub === 'leave') {
        const r = christmas.santaLeave(guildId, me);
        if (r.error)
          return interaction.reply(
            ui.fail('The names are already drawn, so you can’t leave anymore.'),
          );
        return interaction.reply(
          ui.info(
            r.left ? '👋 You left Secret Santa.' : 'You weren’t signed up.',
          ),
        );
      }
      if (sub === 'gift') {
        const coins = o.getInteger('coins') || 0;
        const drink = o.getString('drink');
        const { MENU } = require('../config/drinksMenu');
        if (drink && !MENU[drink])
          return interaction.reply(
            ui.fail('Pick the drink from the list while typing.'),
          );
        const r = christmas.santaGift(guildId, me, {
          coins,
          drink,
          note: o.getString('note'),
        });
        const why = {
          'not-drawn': `The names aren’t drawn yet (on December ${christmas.SANTA_JOIN_UNTIL}).`,
          'not-santa': 'You’re not a Santa this year.',
          revealed: 'The presents are already open!',
          coins: `You don’t have that many coins (you have ${r.balance}).`,
        };
        if (r.error) return interaction.reply(ui.fail(why[r.error]));
        return interaction.reply(
          ui.ok(
            `Your gift for <@${r.recipientId}> is wrapped: ${[coins ? `💰 ${coins} coins` : null, drink ? `🎟️ ${MENU[drink].name}` : null].filter(Boolean).join(' + ') || 'a warm hug'}` +
              `${r.gift.note ? ` and a note` : ''}. 🎁 It’s opened on Christmas Eve at ${christmas.REVEAL_HOUR}:00. The coins are put aside already; change the gift any time before.`,
          ),
        );
      }
      if (sub === 'status') {
        const players = Object.keys(s.participants).length;
        if (!s.drawn) {
          return interaction.reply(
            ui.info(
              `🎅 **${players}** people signed up${s.participants[me] ? ' (you too!)' : ''}. Names are drawn on December ${christmas.SANTA_JOIN_UNTIL}.` +
                (s.participants[me]
                  ? ''
                  : ' Join with `/christmas santa join`.'),
            ),
          );
        }
        const recipient = s.pairs[me];
        if (!recipient)
          return interaction.reply(ui.info('🎅 You’re not a Santa this year.'));
        const gift = s.gifts[me];
        return interaction.reply(
          ui.info(
            `🎅 You’re the Santa of <@${recipient}>.` +
              (s.participants[recipient]?.wish
                ? `\n🎁 Their wish: *${s.participants[recipient].wish}*`
                : '') +
              (gift
                ? `\n✅ Your gift: ${gift.coins ? `${gift.coins} coins` : ''}${gift.drink ? ' + a drink' : ''}${gift.note ? ' + a note' : ''}.`
                : '\n⚠️ No gift yet! `/christmas santa gift`'),
          ),
        );
      }
    }
  },
};
