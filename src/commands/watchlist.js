// /watchlist: everyone's personal watchlist and movie settings.
// Logic: src/services/watchlist.js. Buttons ("watchlist:…") are routed here
// by events/interactionCreate.js, so they keep working after restarts.
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const wl = require('../services/watchlist');
const tmdb = require('../services/tmdb');
const achievements = require('../services/achievements');

const PAGE_SIZE = 10;
const COLOR = 0x5865f2;

// Streaming services (names as TMDB writes them) and countries for suggestions
const SERVICES = [
  'Netflix',
  'Amazon Prime Video',
  'Disney Plus',
  'Crunchyroll',
  'Apple TV Plus',
  'Paramount Plus',
  'WOW',
  'Joyn Plus',
  'RTL+',
  'MagentaTV',
  'Max',
  'ADN',
  'YouTube Premium',
  'Sky Go',
  'MUBI',
  'Hulu',
  'Peacock',
  'Canal+',
  'ZDF',
  'ARD Mediathek',
  'Plex',
  'Pluto TV',
];
const REGIONS = {
  DE: 'Germany',
  AT: 'Austria',
  CH: 'Switzerland',
  US: 'United States',
  GB: 'United Kingdom',
  NL: 'Netherlands',
  BE: 'Belgium',
  FR: 'France',
  IT: 'Italy',
  ES: 'Spain',
  PL: 'Poland',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  IE: 'Ireland',
  CA: 'Canada',
  AU: 'Australia',
  NZ: 'New Zealand',
  JP: 'Japan',
  BR: 'Brazil',
  MX: 'Mexico',
  CZ: 'Czechia',
  PT: 'Portugal',
  TR: 'Turkey',
};
const flag = code =>
  String.fromCodePoint(...[...code].map(c => 0x1f1a5 + c.charCodeAt(0)));

const ephemeral = content => ({ content, flags: 64 });
const stars = n => '⭐'.repeat(n || 0) || '–';
const emojiOf = i => tmdb.kindEmoji(i.type, i.anime);
const label = i => `${emojiOf(i)} ${i.title}${i.year ? ` (${i.year})` : ''}`;

/** The person's own services and region. */
function profileOf(guildId, userId, locale) {
  const s = wl.getList(guildId, userId).settings;
  return { ...s, region: s.region || tmdb.regionFromLocale(locale) };
}

const sameService = (a, b) =>
  a.toLowerCase().replace(/[^a-z0-9]/g, '') ===
  b.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Is the title on one of my services in my country? */
async function onMyServices(item, profile) {
  if (!item.tmdbId || !profile.services.length) return false;
  const p = await tmdb.providers(item.type, item.tmdbId, profile.region);
  return (
    !!p &&
    [...p.stream, ...p.free].some(s =>
      profile.services.some(m => sameService(s, m)),
    )
  );
}

/** Turn the chosen title into item fields (TMDB or plain text). */
async function fieldsFor(value) {
  const m = /^(movie|tv):(\d+)$/.exec(String(value || ''));
  const info = m ? await tmdb.details(m[1], Number(m[2])) : null;
  return wl.titleFields(info, String(value).slice(0, 100));
}

function ratingButtons(key) {
  const enc = wl.encodeKey(key);
  return [
    new ActionRowBuilder().addComponents(
      [1, 2, 3, 4, 5].map(n =>
        new ButtonBuilder()
          .setCustomId(`watchlist:rate:${enc}:${n}`)
          .setLabel(`${n}`)
          .setEmoji('⭐')
          .setStyle(ButtonStyle.Secondary),
      ),
    ),
  ];
}

function listEmbed(
  title,
  entries,
  { page, pages, owner, showPrivacy, settings },
) {
  const lines = entries.map(i => {
    const status = wl.STATUS[i.status]?.emoji || '📌';
    const lock = showPrivacy && !wl.isPublic(i, settings) ? ' 🔒' : '';
    const progress =
      i.type === 'tv' && i.progress
        ? ` · S${i.progress.season}E${i.progress.episode}`
        : '';
    const rating = i.rating ? ` · ${stars(i.rating)}` : '';
    const must = i.must ? ' ❗' : '';
    const note = i.note ? `\n   ↳ *${i.note}*` : '';
    return `${status} ${label(i)}${progress}${rating}${must}${lock}${note}`;
  });
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setDescription(lines.join('\n') || 'Nothing here yet.')
    .setFooter({
      text:
        `Page ${page}/${pages} · 📌 want · ▶️ watching · ✅ watched · ❗ must-watch` +
        (showPrivacy ? ' · 🔒 private' : '') +
        (owner ? '' : ''),
    });
}

// ---------- Buttons ----------

async function handleComponent(interaction) {
  const [, action, ...rest] = interaction.customId.split(':');
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  // After a movie night: "did you watch it?"
  if (action === 'night') {
    const [nightId, answer] = rest;
    const watch = require('../services/watch');
    const n = watch.getNight(guildId, Number(nightId));
    if (!n) return interaction.reply(ephemeral('This movie night is gone.'));
    const result = watch.confirmWatched(guildId, n, userId, answer === 'yes');
    if (result === 'not-there') {
      const missed = (n.session.missed || []).includes(userId);
      return interaction.reply(
        ephemeral(
          missed
            ? "⚠️ You said you missed part of it, so it won't be marked as watched."
            : "You didn't check in for this one, so there's nothing to mark.",
        ),
      );
    }
    if (answer !== 'yes')
      return interaction.reply(
        ephemeral("👍 Okay, it won't be marked as watched."),
      );
    await interaction.reply({
      content: `✅ **${result.label || watch.fullTitle(n)}** is marked as watched on your watchlist. How was it?`,
      components: ratingButtons(result.key),
      flags: 64,
    });
    return achievements.announce(interaction, [userId]);
  }

  // Pending list: confirm / dismiss
  if (action === 'confirm' || action === 'dismiss') {
    const key = wl.decodeKey(rest[0]);
    const entry = wl.resolvePending(guildId, userId, key, action === 'confirm');
    if (!entry) return interaction.reply(ephemeral('Already done.'));
    if (action === 'dismiss')
      return interaction.reply(
        ephemeral(`👍 **${entry.fields.title}** won't be marked as watched.`),
      );
    return interaction.reply({
      content: `✅ **${entry.fields.title}** marked as watched. How was it?`,
      components: ratingButtons(key),
      flags: 64,
    });
  }

  if (action === 'rate') {
    const key = wl.decodeKey(rest[0]);
    const rating = Number(rest[1]);
    const item = wl.rate(guildId, userId, key, rating);
    if (!item)
      return interaction.reply(
        ephemeral("That title isn't on your watchlist anymore."),
      );
    await interaction.update({
      content: `${stars(rating)} Rated **${item.title}**. Thanks!`,
      components: [],
    });
    return achievements.announce(interaction, [userId]);
  }

  // Copy something from someone else's public list
  if (action === 'copy') {
    const [ownerId] = rest;
    const key = interaction.values?.[0];
    const source = wl.getItem(guildId, ownerId, key);
    if (!source) return interaction.reply(ephemeral('That title is gone.'));
    const { titleFields } = wl;
    const fields = { ...titleFields(null, source.title), ...source };
    for (const k of [
      'status',
      'visibility',
      'must',
      'note',
      'addedAt',
      'watchedAt',
      'rating',
      'progress',
      'watchedWith',
      'key',
    ])
      delete fields[k];
    const r = wl.addItem(guildId, userId, fields);
    return interaction.reply(
      ephemeral(
        r.existed
          ? `📋 **${source.title}** is already on your watchlist.`
          : `📋 Added **${source.title}** to your watchlist.`,
      ),
    );
  }

  return interaction.reply(ephemeral('🤔 Unknown button.'));
}

// ---------- Command ----------

const titleOpt = (o, desc = 'Movie, series or anime (start typing)') =>
  o
    .setName('title')
    .setDescription(desc)
    .setRequired(true)
    .setAutocomplete(true);
const visibilityChoices = o =>
  o.addChoices(
    { name: '🌐 Public', value: 'public' },
    { name: '🔒 Private', value: 'private' },
  );

module.exports = {
  handleComponent,
  SERVICES,

  data: new SlashCommandBuilder()
    .setName('watchlist')
    .setDescription(
      'Your watchlist: movies, series and anime you want to watch',
    )
    .addSubcommand(s =>
      s
        .setName('add')
        .setDescription('Add something to your watchlist')
        .addStringOption(o => titleOpt(o))
        .addStringOption(o =>
          visibilityChoices(
            o
              .setName('visibility')
              .setDescription('Default: your list setting'),
          ),
        )
        .addBooleanOption(o =>
          o.setName('must').setDescription('Mark as must-watch ❗'),
        )
        .addStringOption(o =>
          o
            .setName('note')
            .setDescription('A note, e.g. "Mia recommended it"')
            .setMaxLength(200),
        ),
    )
    .addSubcommand(s =>
      s
        .setName('remove')
        .setDescription('Remove something')
        .addStringOption(o =>
          titleOpt(o, 'From your watchlist (start typing)'),
        ),
    )
    .addSubcommand(s =>
      s
        .setName('edit')
        .setDescription('Change status, privacy, note or series progress')
        .addStringOption(o => titleOpt(o, 'From your watchlist (start typing)'))
        .addStringOption(o =>
          o
            .setName('status')
            .setDescription('Status')
            .addChoices(
              ...Object.entries(wl.STATUS).map(([value, st]) => ({
                name: `${st.emoji} ${st.label}`,
                value,
              })),
            ),
        )
        .addStringOption(o =>
          o
            .setName('visibility')
            .setDescription('Who can see this entry')
            .addChoices(
              { name: '🌐 Public', value: 'public' },
              { name: '🔒 Private', value: 'private' },
              { name: '↩️ Like my list', value: 'default' },
            ),
        )
        .addBooleanOption(o =>
          o.setName('must').setDescription('Must-watch ❗'),
        )
        .addStringOption(o =>
          o
            .setName('note')
            .setDescription('Note (write "-" to remove)')
            .setMaxLength(200),
        )
        .addIntegerOption(o =>
          o
            .setName('season')
            .setDescription('Series: season you are at')
            .setMinValue(1),
        )
        .addIntegerOption(o =>
          o
            .setName('episode')
            .setDescription('Series: last episode you watched')
            .setMinValue(1),
        ),
    )
    .addSubcommand(s =>
      s
        .setName('show')
        .setDescription("Your watchlist, or someone else's public one")
        .addUserOption(o =>
          o.setName('user').setDescription('Whose list (default: yours)'),
        )
        .addStringOption(o =>
          o
            .setName('status')
            .setDescription('Only this status')
            .addChoices(
              ...Object.entries(wl.STATUS).map(([value, st]) => ({
                name: `${st.emoji} ${st.label}`,
                value,
              })),
            ),
        )
        .addStringOption(o =>
          o
            .setName('type')
            .setDescription('Only this type')
            .addChoices(
              { name: '🎬 Movies', value: 'movie' },
              { name: '📺 Series', value: 'tv' },
              { name: '🎌 Anime', value: 'anime' },
            ),
        )
        .addBooleanOption(o =>
          o
            .setName('available')
            .setDescription('Only what runs on my streaming services'),
        )
        .addIntegerOption(o =>
          o.setName('page').setDescription('Page').setMinValue(1),
        ),
    )
    .addSubcommand(s =>
      s
        .setName('seen')
        .setDescription('Mark something as watched (outside movie nights)')
        .addStringOption(o => titleOpt(o))
        .addIntegerOption(o =>
          o
            .setName('rating')
            .setDescription('Your rating')
            .addChoices(
              ...[1, 2, 3, 4, 5].map(n => ({ name: '⭐'.repeat(n), value: n })),
            ),
        ),
    )
    .addSubcommand(s =>
      s
        .setName('rate')
        .setDescription('Rate something you watched')
        .addStringOption(o => titleOpt(o, 'From your watchlist (start typing)'))
        .addIntegerOption(o =>
          o
            .setName('rating')
            .setDescription('Your rating')
            .setRequired(true)
            .addChoices(
              ...[1, 2, 3, 4, 5].map(n => ({ name: '⭐'.repeat(n), value: n })),
            ),
        ),
    )
    .addSubcommand(s =>
      s
        .setName('pending')
        .setDescription('Movie nights waiting for your "✅ yes, I watched it"'),
    )
    .addSubcommand(s =>
      s
        .setName('settings')
        .setDescription('Your movie settings. Leave empty to see them')
        .addStringOption(o =>
          visibilityChoices(
            o
              .setName('visibility')
              .setDescription('Is your whole list public or private?'),
          ),
        )
        .addStringOption(o =>
          o
            .setName('region')
            .setDescription('Your country, for "where can I watch it"')
            .setAutocomplete(true),
        )
        .addStringOption(o =>
          o
            .setName('services')
            .setDescription(
              'Your streaming services, comma-separated (start typing)',
            )
            .setAutocomplete(true),
        )
        .addBooleanOption(o =>
          o
            .setName('notify')
            .setDescription(
              'DM me when something from my watchlist is planned',
            ),
        ),
    )
    .addSubcommand(s =>
      s
        .setName('match')
        .setDescription('What do you all want to watch?')
        .addUserOption(o =>
          o.setName('user1').setDescription('Person').setRequired(true),
        )
        .addUserOption(o => o.setName('user2').setDescription('Person'))
        .addUserOption(o => o.setName('user3').setDescription('Person'))
        .addUserOption(o => o.setName('user4').setDescription('Person'))
        .addUserOption(o => o.setName('user5').setDescription('Person')),
    )
    .addSubcommand(s =>
      s
        .setName('random')
        .setDescription('🎲 Pick something from your watchlist')
        .addStringOption(o =>
          o
            .setName('type')
            .setDescription('Only this type')
            .addChoices(
              { name: '🎬 Movies', value: 'movie' },
              { name: '📺 Series', value: 'tv' },
              { name: '🎌 Anime', value: 'anime' },
            ),
        )
        .addBooleanOption(o =>
          o
            .setName('available')
            .setDescription('Only what runs on my streaming services'),
        ),
    ),

  async autocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused(true);
    const q = String(focused.value || '').trim();
    const ql = q.toLowerCase();

    if (focused.name === 'region') {
      return interaction.respond(
        Object.entries(REGIONS)
          .filter(
            ([code, name]) =>
              !q ||
              code.toLowerCase().includes(ql) ||
              name.toLowerCase().includes(ql),
          )
          .slice(0, 25)
          .map(([code, name]) => ({
            name: `${flag(code)} ${name} (${code})`,
            value: code,
          })),
      );
    }

    if (focused.name === 'services') {
      // "Netflix, Crun" → suggest "Netflix, Crunchyroll"
      const parts = q.split(',').map(s => s.trim());
      const last = (parts.pop() || '').toLowerCase();
      const done = parts.filter(Boolean);
      const choices = SERVICES.filter(
        s => !done.includes(s) && s.toLowerCase().includes(last),
      )
        .slice(0, 24)
        .map(s => {
          const value = [...done, s].join(', ');
          return { name: value.slice(0, 100), value: value.slice(0, 100) };
        });
      if (q)
        choices.unshift({
          name: `✔️ ${q}`.slice(0, 100),
          value: q.slice(0, 100),
        });
      return interaction.respond(choices.slice(0, 25));
    }

    // Title: own list for remove/edit/rate, TMDB search for add/seen
    const own = wl
      .items(interaction.guildId, interaction.user.id)
      .filter(i => !q || i.title.toLowerCase().includes(ql))
      .map(i => ({
        name: `${wl.STATUS[i.status].emoji} ${label(i)}`.slice(0, 100),
        value: i.key,
      }));
    if (['remove', 'edit', 'rate'].includes(sub))
      return interaction.respond(own.slice(0, 25));

    const found = tmdb.isEnabled() ? await tmdb.search(q) : [];
    const choices = found.map(r => ({
      name: `${tmdb.kindEmoji(r.type, r.anime)} ${r.title}${r.year ? ` (${r.year})` : ''}${r.original && r.original !== r.title ? ` · ${r.original}` : ''}`.slice(
        0,
        100,
      ),
      value: `${r.type}:${r.id}`,
    }));
    if (sub === 'seen') choices.unshift(...own.slice(0, 5));
    if (q && choices.length < 25)
      choices.push({
        name: `✏️ Use “${q}”`.slice(0, 100),
        value: q.slice(0, 100),
      });
    return interaction.respond(choices.slice(0, 25));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const o = interaction.options;

    // ---------- add ----------
    if (sub === 'add') {
      await interaction.deferReply({ flags: 64 });
      const fields = await fieldsFor(o.getString('title'));
      const r = wl.addItem(guildId, userId, fields, {
        visibility: o.getString('visibility'),
        must: o.getBoolean('must'),
        note: o.getString('note'),
      });
      const others =
        wl.wantCount(guildId, r.item.key) -
        (wl.isPublic(r.item, wl.getList(guildId, userId).settings) ? 1 : 0);
      return interaction.editReply(
        (r.existed
          ? `📌 **${label(r.item)}** was already on your watchlist (updated).`
          : `📌 Added **${label(r.item)}** to your watchlist.`) +
          (wl.isPublic(r.item, wl.getList(guildId, userId).settings)
            ? ''
            : ' 🔒 (private)') +
          (others > 0
            ? `\n👀 ${others} other ${others === 1 ? 'person wants' : 'people want'} to watch it too!`
            : ''),
      );
    }

    // ---------- remove ----------
    if (sub === 'remove') {
      const removed = wl.removeItem(guildId, userId, o.getString('title'));
      return interaction.reply(
        ephemeral(
          removed
            ? `🗑️ Removed **${label(removed)}**.`
            : "❓ That's not on your watchlist. Pick it from the list while typing.",
        ),
      );
    }

    // ---------- edit ----------
    if (sub === 'edit') {
      const key = o.getString('title');
      const item = wl.getItem(guildId, userId, key);
      if (!item)
        return interaction.reply(
          ephemeral(
            "❓ That's not on your watchlist. Pick it from the list while typing.",
          ),
        );
      const vis = o.getString('visibility');
      const note = o.getString('note');
      const season = o.getInteger('season');
      const episode = o.getInteger('episode');
      const changes = {
        status: o.getString('status') ?? undefined,
        visibility: vis === null ? undefined : vis === 'default' ? null : vis,
        must: o.getBoolean('must') ?? undefined,
        note: note === null ? undefined : note === '-' ? null : note,
        progress:
          season || episode
            ? {
                season: season || item.progress?.season || 1,
                episode: episode || item.progress?.episode || 1,
              }
            : undefined,
      };
      if (changes.progress && !changes.status) changes.status = 'watching';
      const updated = wl.editItem(guildId, userId, key, changes);
      const settings = wl.getList(guildId, userId).settings;
      return interaction.reply(
        ephemeral(
          `✏️ **${label(updated)}**: ${wl.STATUS[updated.status].emoji} ${wl.STATUS[updated.status].label}` +
            (updated.progress
              ? ` · S${updated.progress.season}E${updated.progress.episode}`
              : '') +
            ` · ${wl.isPublic(updated, settings) ? '🌐 public' : '🔒 private'}` +
            (updated.must ? ' · ❗ must-watch' : '') +
            (updated.note ? `\n↳ *${updated.note}*` : ''),
        ),
      );
    }

    // ---------- show ----------
    if (sub === 'show') {
      const target = o.getUser('user') || interaction.user;
      const own = target.id === userId;
      const settings = wl.getList(guildId, target.id).settings;
      let entries = wl.items(guildId, target.id, { publicOnly: !own });
      const status = o.getString('status');
      const type = o.getString('type');
      if (status) entries = entries.filter(i => i.status === status);
      if (type === 'anime') entries = entries.filter(i => i.anime);
      else if (type) entries = entries.filter(i => i.type === type && !i.anime);

      await interaction.deferReply({ flags: own ? 64 : undefined });
      if (o.getBoolean('available')) {
        const profile = profileOf(guildId, userId, interaction.locale);
        if (!profile.services.length)
          return interaction.editReply(
            '📺 Set your services first: `/watchlist settings services:`',
          );
        const keep = [];
        for (const i of entries)
          if (await onMyServices(i, profile)) keep.push(i);
        entries = keep;
      }

      const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
      const page = Math.min(o.getInteger('page') || 1, pages);
      const slice = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      const name = own ? 'Your watchlist' : `${target.username}'s watchlist`;
      const embed = listEmbed(`📝 ${name} (${entries.length})`, slice, {
        page,
        pages,
        showPrivacy: own,
        settings,
      });
      if (!own && !slice.length) embed.setDescription('Nothing public here.');

      const components = [];
      if (!own && slice.length) {
        components.push(
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`watchlist:copy:${target.id}`)
              .setPlaceholder('📋 Copy to my watchlist…')
              .addOptions(
                slice.map(i => ({
                  label: `${i.title}${i.year ? ` (${i.year})` : ''}`.slice(
                    0,
                    100,
                  ),
                  value: i.key,
                  emoji: emojiOf(i),
                })),
              ),
          ),
        );
      }
      return interaction.editReply({
        embeds: [embed],
        components,
        allowedMentions: { parse: [] },
      });
    }

    // ---------- seen ----------
    if (sub === 'seen') {
      await interaction.deferReply({ flags: 64 });
      const value = o.getString('title');
      const existing = wl.getItem(guildId, userId, value);
      const fields = existing
        ? (({ type, tmdbId, title, year, anime, poster, runtime, genres }) => ({
            type,
            tmdbId,
            title,
            year,
            anime,
            poster,
            runtime,
            genres,
          }))(existing)
        : await fieldsFor(value);
      const rating = o.getInteger('rating');
      const item = wl.markWatched(guildId, userId, fields, { rating });
      if (item.type === 'tv' && item.status !== 'watched')
        wl.editItem(guildId, userId, item.key, { status: 'watched' });
      return interaction.editReply({
        content:
          `✅ **${label(item)}** marked as watched.` +
          (rating ? ` ${stars(rating)}` : ' How was it?'),
        components: rating ? [] : ratingButtons(item.key),
      });
    }

    // ---------- rate ----------
    if (sub === 'rate') {
      const item = wl.rate(
        guildId,
        userId,
        o.getString('title'),
        o.getInteger('rating'),
      );
      return interaction.reply(
        ephemeral(
          item
            ? `${stars(item.rating)} Rated **${label(item)}**.`
            : "❓ That's not on your watchlist.",
        ),
      );
    }

    // ---------- pending ----------
    if (sub === 'pending') {
      const pending = wl.getPending(guildId, userId);
      if (!pending.length)
        return interaction.reply(
          ephemeral('✅ Nothing waiting. All movie nights are sorted.'),
        );
      const rows = pending.slice(0, 5).map(p =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`watchlist:confirm:${wl.encodeKey(p.key)}`)
            .setLabel(`Watched: ${p.label || p.fields.title}`.slice(0, 80))
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`watchlist:dismiss:${wl.encodeKey(p.key)}`)
            .setLabel('No')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Secondary),
        ),
      );
      return interaction.reply({
        content:
          `🍿 **${pending.length}** movie night${pending.length === 1 ? '' : 's'} waiting for your answer` +
          (pending.length > 5 ? ' (showing 5)' : '') +
          `. They expire after ${wl.PENDING_DAYS} days.`,
        components: rows,
        flags: 64,
      });
    }

    // ---------- settings ----------
    if (sub === 'settings') {
      const services = o.getString('services');
      const region = o.getString('region');
      if (region && !/^[A-Za-z]{2}$/.test(region))
        return interaction.reply(
          ephemeral('❌ Pick a country from the list (e.g. DE, AT, US).'),
        );
      const s = wl.setSettings(guildId, userId, {
        visibility: o.getString('visibility') ?? undefined,
        region: region ? region.toUpperCase() : undefined,
        services:
          services === null
            ? undefined
            : services
                .split(',')
                .map(x => x.trim())
                .filter(Boolean),
        notify: o.getBoolean('notify') ?? undefined,
      });
      const r = s.region || tmdb.regionFromLocale(interaction.locale);
      const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle('🎬 Your movie settings')
        .addFields(
          {
            name: 'Watchlist',
            value:
              s.visibility === 'public'
                ? '🌐 Public (single entries can be 🔒)'
                : '🔒 Private (single entries can be 🌐)',
            inline: true,
          },
          {
            name: 'Region',
            value: `${flag(r)} ${REGIONS[r] || r}${s.region ? '' : ' (guessed)'}`,
            inline: true,
          },
          {
            name: 'Notify',
            value: s.notify ? '🔔 DM when your titles get planned' : '🔕 off',
            inline: true,
          },
          {
            name: 'Services',
            value: s.services.length ? s.services.join(', ') : 'none set',
          },
        );
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // ---------- match ----------
    if (sub === 'match') {
      const users = [
        interaction.user,
        ...['user1', 'user2', 'user3', 'user4', 'user5']
          .map(k => o.getUser(k))
          .filter(Boolean),
      ];
      const ids = [...new Set(users.filter(u => !u.bot).map(u => u.id))];
      const results = wl.match(guildId, ids).slice(0, 15);
      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`🎯 Watchlist match (${ids.length} people)`);
      embed.setDescription(
        results.length
          ? results
              .map(
                r =>
                  `${r.count === ids.length ? '🎯' : '▫️'} **${label(r)}** · ${r.count}/${ids.length}${r.must ? ' ❗' : ''} · ${r.users.map(u => `<@${u}>`).join(' ')}`,
              )
              .join('\n')
          : 'No public titles in common yet. Add some with `/watchlist add`!',
      );
      embed.setFooter({
        text: 'Only public, not-yet-watched entries count. 🎯 = everyone wants it.',
      });
      return interaction.reply({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
    }

    // ---------- random ----------
    if (sub === 'random') {
      await interaction.deferReply({ flags: 64 });
      let entries = wl
        .items(guildId, userId)
        .filter(i => i.status !== 'watched');
      const type = o.getString('type');
      if (type === 'anime') entries = entries.filter(i => i.anime);
      else if (type) entries = entries.filter(i => i.type === type && !i.anime);
      if (o.getBoolean('available')) {
        const profile = profileOf(guildId, userId, interaction.locale);
        const keep = [];
        for (const i of entries)
          if (await onMyServices(i, profile)) keep.push(i);
        entries = keep;
      }
      if (!entries.length)
        return interaction.editReply(
          '🎲 Nothing to pick from. Add something with `/watchlist add`!',
        );
      const pick = entries[Math.floor(Math.random() * entries.length)];
      return interaction.editReply(
        `🎲 How about **${label(pick)}**?${pick.note ? `\n↳ *${pick.note}*` : ''}`,
      );
    }
  },
};
