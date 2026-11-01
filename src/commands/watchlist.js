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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
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

// ---------- The interactive list ----------

const FILTER_NONE = '-';

/** Filtered entries of a list, as the viewer may see them. */
async function filteredEntries(guildId, viewerId, ownerId, f, locale) {
  const own = viewerId === ownerId;
  let entries = wl.items(guildId, ownerId, { publicOnly: !own });
  if (f.status) entries = entries.filter(i => i.status === f.status);
  if (f.type === 'anime') entries = entries.filter(i => i.anime);
  else if (f.type) entries = entries.filter(i => i.type === f.type && !i.anime);
  if (f.available) {
    const profile = profileOf(guildId, viewerId, locale);
    const keep = [];
    for (const i of entries) if (await onMyServices(i, profile)) keep.push(i);
    entries = keep;
  }
  return entries;
}

const filterId = f =>
  `${f.status || FILTER_NONE}:${f.type || FILTER_NONE}:${f.available ? 1 : 0}`;
const parseFilter = ([status, type, available]) => ({
  status: status && status !== FILTER_NONE ? status : null,
  type: type && type !== FILTER_NONE ? type : null,
  available: available === '1',
});

/** The list card with a menu (open / copy an entry) and buttons (pages, random, pending). */
async function listView(interaction, ownerId, f, pageWanted) {
  const guildId = interaction.guildId;
  const viewerId = interaction.user.id;
  const own = viewerId === ownerId;
  const owner = own
    ? interaction.user
    : await interaction.client.users
        .fetch(ownerId)
        .catch(() => ({ username: 'Someone' }));
  const settings = wl.getList(guildId, ownerId).settings;
  const entries = await filteredEntries(
    guildId,
    viewerId,
    ownerId,
    f,
    interaction.locale,
  );
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, pageWanted || 1), pages);
  const slice = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const name = own ? 'Your watchlist' : `${owner.username}'s watchlist`;
  const embed = listEmbed(`📝 ${name} (${entries.length})`, slice, {
    page,
    pages,
    showPrivacy: own,
    settings,
  });
  if (!slice.length)
    embed.setDescription(
      own
        ? 'Nothing here yet. Add something with `/watchlist add`!'
        : 'Nothing public here.',
    );

  const components = [];
  if (slice.length) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(
            own ? `watchlist:pick:${ownerId}` : `watchlist:copy:${ownerId}`,
          )
          .setPlaceholder(
            own
              ? '✏️ Open an entry: watched, rate, private, remove…'
              : '📋 Copy to my watchlist…',
          )
          .addOptions(
            slice.map(i => ({
              label: `${i.title}${i.year ? ` (${i.year})` : ''}`.slice(0, 100),
              value: i.key,
              emoji: emojiOf(i),
              description:
                `${wl.STATUS[i.status]?.label || ''}${i.rating ? ` · ${'⭐'.repeat(i.rating)}` : ''}`.slice(
                  0,
                  100,
                ) || undefined,
            })),
          ),
      ),
    );
  }
  const buttons = [];
  if (page > 1)
    buttons.push(
      btn(`watchlist:page:${ownerId}:${page - 1}:${filterId(f)}`, 'Back', '◀️'),
    );
  if (page < pages)
    buttons.push(
      btn(`watchlist:page:${ownerId}:${page + 1}:${filterId(f)}`, 'Next', '▶️'),
    );
  if (entries.some(i => i.status !== 'watched'))
    buttons.push(
      btn(`watchlist:random:${ownerId}:${filterId(f)}`, 'Pick for me', '🎲'),
    );
  if (own) {
    const pending = wl.getPending(guildId, ownerId).length;
    if (pending)
      buttons.push(
        btn(
          'watchlist:pending',
          `Watched? (${pending})`,
          '📬',
          ButtonStyle.Primary,
        ),
      );
  }
  if (buttons.length)
    components.push(new ActionRowBuilder().addComponents(buttons));
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

const btn = (customId, label, emoji, style = ButtonStyle.Secondary) =>
  new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setEmoji(emoji)
    .setStyle(style);

/** One entry of your own list, with everything you can do with it. */
function itemPanel(
  guildId,
  userId,
  item,
  { note = '', withRating = false } = {},
) {
  const settings = wl.getList(guildId, userId).settings;
  const enc = wl.encodeKey(item.key);
  const pub = wl.isPublic(item, settings);
  const st = wl.STATUS[item.status];
  const lines = [
    `${note ? `${note}\n\n` : ''}**${label(item)}**`,
    `${st.emoji} ${st.label}` +
      (item.type === 'tv' && item.progress
        ? ` · S${item.progress.season}E${item.progress.episode}`
        : '') +
      (item.rating ? ` · ${stars(item.rating)}` : '') +
      (item.must ? ' · ❗ must-watch' : '') +
      ` · ${pub ? '🌐 public' : '🔒 private'}`,
  ];
  if (item.note) lines.push(`↳ *${item.note}*`);
  const status = s =>
    btn(
      `watchlist:i:${s}:${enc}`,
      wl.STATUS[s].label,
      wl.STATUS[s].emoji,
      item.status === s ? ButtonStyle.Primary : ButtonStyle.Secondary,
    );
  const rows = [
    new ActionRowBuilder().addComponents(
      status('want'),
      status('watching'),
      status('watched'),
      btn(`watchlist:i:ratemenu:${enc}`, 'Rate', '⭐'),
    ),
    new ActionRowBuilder().addComponents(
      btn(
        `watchlist:i:privacy:${enc}`,
        pub ? 'Make private' : 'Make public',
        pub ? '🔒' : '🌐',
      ),
      btn(
        `watchlist:i:must:${enc}`,
        item.must ? 'Not a must' : 'Must-watch',
        '❗',
      ),
      btn(
        `watchlist:i:editform:${enc}`,
        item.type === 'tv' ? 'Note / episode' : 'Note',
        '✏️',
      ),
      btn(`watchlist:i:remove:${enc}`, 'Remove', '🗑️', ButtonStyle.Danger),
    ),
  ];
  if (withRating) rows.push(...ratingButtons(item.key));
  return { content: lines.join('\n'), components: rows, embeds: [], flags: 64 };
}

const LIST_ACTIONS = ['page', 'random', 'pending', 'pick', 'i'];

/** Buttons of the list and the entry panel (actions in LIST_ACTIONS). */
async function listAction(interaction, action, rest) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (action === 'page') {
    const [ownerId, page, ...f] = rest;
    return interaction.update(
      await listView(interaction, ownerId, parseFilter(f), Number(page)),
    );
  }
  if (action === 'random') {
    const [ownerId, ...f] = rest;
    const entries = (
      await filteredEntries(
        guildId,
        userId,
        ownerId,
        parseFilter(f),
        interaction.locale,
      )
    ).filter(i => i.status !== 'watched');
    if (!entries.length)
      return interaction.reply(ephemeral('🎲 Nothing to pick from.'));
    const pick = entries[Math.floor(Math.random() * entries.length)];
    return interaction.reply(
      ephemeral(
        `🎲 How about **${label(pick)}**?${pick.note ? `\n↳ *${pick.note}*` : ''}`,
      ),
    );
  }
  if (action === 'pending')
    return interaction.reply(pendingView(guildId, userId));
  if (action === 'pick') {
    const item = wl.getItem(guildId, userId, interaction.values?.[0]);
    if (!item) return interaction.reply(ephemeral('That entry is gone.'));
    return interaction.reply(itemPanel(guildId, userId, item));
  }

  const [what, enc] = rest;
  const key = wl.decodeKey(enc);
  const item = wl.getItem(guildId, userId, key);
  if (!item)
    return interaction.reply(
      ephemeral('That entry isn’t on your watchlist anymore.'),
    );
  const show = (it, opts) =>
    interaction.isModalSubmit?.()
      ? interaction.reply(itemPanel(guildId, userId, it, opts))
      : interaction.update(itemPanel(guildId, userId, it, opts));

  if (wl.STATUS[what]) {
    const updated = wl.editItem(guildId, userId, key, { status: what });
    if (what === 'watched') {
      await show(updated, {
        note: '✅ Marked as watched. How was it?',
        withRating: !updated.rating,
      });
      return achievements.announce(interaction, [userId]);
    }
    return show(updated);
  }
  if (what === 'ratemenu')
    return show(item, { note: '⭐ Your rating:', withRating: true });
  if (what === 'privacy') {
    const settings = wl.getList(guildId, userId).settings;
    return show(
      wl.editItem(guildId, userId, key, {
        visibility: wl.isPublic(item, settings) ? 'private' : 'public',
      }),
    );
  }
  if (what === 'must')
    return show(wl.editItem(guildId, userId, key, { must: !item.must }));
  if (what === 'remove') {
    wl.removeItem(guildId, userId, key);
    return interaction.update({
      content: `🗑️ Removed **${label(item)}**.`,
      components: [],
    });
  }
  if (what === 'editform') {
    const fields = [
      { id: 'note', label: 'Note (empty = none)', value: item.note, max: 200 },
    ];
    if (item.type === 'tv') {
      fields.push(
        {
          id: 'season',
          label: 'Season you are at',
          value: item.progress?.season,
        },
        {
          id: 'episode',
          label: 'Last episode you watched',
          value: item.progress?.episode,
        },
      );
    }
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`watchlist:i:edit:${enc}`)
        .setTitle(item.title.slice(0, 45))
        .addComponents(
          fields.map(f => {
            const input = new TextInputBuilder()
              .setCustomId(f.id)
              .setLabel(f.label)
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(f.max || 4);
            if (f.value) input.setValue(String(f.value));
            return new ActionRowBuilder().addComponents(input);
          }),
        ),
    );
  }
  if (what === 'edit') {
    const get = id => {
      try {
        return interaction.fields.getTextInputValue(id)?.trim() || '';
      } catch {
        return '';
      }
    };
    const changes = { note: get('note') || null };
    if (item.type === 'tv') {
      const season = parseInt(get('season'), 10);
      const episode = parseInt(get('episode'), 10);
      if (season > 0 || episode > 0) {
        changes.progress = {
          season: season > 0 ? season : item.progress?.season || 1,
          episode: episode > 0 ? episode : item.progress?.episode || 1,
        };
        if (item.status === 'want') changes.status = 'watching';
      }
    }
    return show(wl.editItem(guildId, userId, key, changes), {
      note: '✏️ Saved.',
    });
  }
  return interaction.reply(ephemeral('🤔 Unknown button.'));
}

function pendingView(guildId, userId) {
  const pending = wl.getPending(guildId, userId);
  if (!pending.length)
    return ephemeral('✅ Nothing waiting. All movie nights are sorted.');
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
  return {
    content:
      `🍿 **${pending.length}** movie night${pending.length === 1 ? '' : 's'} waiting for your answer` +
      (pending.length > 5 ? ' (showing 5)' : '') +
      `. They expire after ${wl.PENDING_DAYS} days.`,
    components: rows,
    flags: 64,
  };
}

// ---------- Buttons ----------

async function handleComponent(interaction) {
  const [, action, ...rest] = interaction.customId.split(':');
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (LIST_ACTIONS.includes(action)) {
    await listAction(interaction, action, rest);
    return;
  }

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
        )
        .addBooleanOption(o =>
          o
            .setName('watched')
            .setDescription('Already watched it? (outside a movie night)'),
        )
        .addIntegerOption(o =>
          o
            .setName('rating')
            .setDescription('Your rating (marks it as watched)')
            .addChoices(
              ...[1, 2, 3, 4, 5].map(n => ({ name: '⭐'.repeat(n), value: n })),
            ),
        ),
    )
    .addSubcommand(s =>
      s
        .setName('show')
        .setDescription(
          "Your watchlist (open entries to mark, rate, edit), or someone else's",
        )
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
        ),
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

    const found = tmdb.isEnabled() ? await tmdb.search(q) : [];
    const choices = found.map(r => ({
      name: `${tmdb.kindEmoji(r.type, r.anime)} ${r.title}${r.year ? ` (${r.year})` : ''}${r.original && r.original !== r.title ? ` · ${r.original}` : ''}`.slice(
        0,
        100,
      ),
      value: `${r.type}:${r.id}`,
    }));
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
      const rating = o.getInteger('rating');
      if (o.getBoolean('watched') || rating) {
        const item = wl.markWatched(guildId, userId, fields, { rating });
        if (item.type === 'tv' && item.status !== 'watched')
          wl.editItem(guildId, userId, item.key, { status: 'watched' });
        if (
          o.getString('note') ||
          o.getString('visibility') ||
          o.getBoolean('must')
        ) {
          wl.editItem(guildId, userId, item.key, {
            note: o.getString('note') ?? undefined,
            visibility: o.getString('visibility') ?? undefined,
            must: o.getBoolean('must') ?? undefined,
          });
        }
        await interaction.editReply({
          content:
            `✅ **${label(item)}** is on your list as watched.` +
            (rating ? ` ${stars(rating)}` : ' How was it?'),
          components: rating ? [] : ratingButtons(item.key),
        });
        return achievements.announce(interaction, [userId]);
      }
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

    // ---------- show ----------
    if (sub === 'show') {
      const target = o.getUser('user') || interaction.user;
      const own = target.id === userId;
      const f = {
        status: o.getString('status'),
        type: o.getString('type'),
        available: !!o.getBoolean('available'),
      };
      if (
        f.available &&
        !profileOf(guildId, userId, interaction.locale).services.length
      )
        return interaction.reply(
          ephemeral(
            '📺 Set your services first: `/watchlist settings services:`',
          ),
        );
      await interaction.deferReply({ flags: own ? 64 : undefined });
      return interaction.editReply(
        await listView(interaction, target.id, f, 1),
      );
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
  },
};
