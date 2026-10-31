# NestBot Roadmap

What's done, what's next, and ideas for later. Nothing below "Next" is
promised; it's a list to pick from. Newest changes: [CHANGELOG.md](CHANGELOG.md).

**Legend:** ✅ done · 🚧 in progress · 📋 planned · 💡 idea

---

## ✅ Recently done

| Version | What |
|---|---|
| V 1.9 | 🍻 Drink rounds, 🏷️ paid nicknames, new shop and wheel, shared look for economy commands |
| V 1.8 | 🍿 Movie nights: `/watch`, watchlists, votes, series & anime, groups, Movies tab |
| V 1.7 | 🎉 Free mode |
| V 1.6 | 🟩 Wordle app rewards |
| V 1.5 | 🔥 Streak mode switch |
| V 1.4 | 🧩 Puzzle announcements, first-solver bonus, leaderboard |

---

## 📋 Next

### 🙈 Blindfold (`/blindfold`)
A partner for the gag: the gag takes your voice, the blindfold takes your
sight. Bought in the shop, won on the wheel, or given by admins.

How it works:
- A **"🙈 Blindfolded"** role that is not allowed to see the server's channels
  (`View Channel` denied on the categories) except one **"🕶️ In the dark"**
  channel. Admins set this up once with `/settings blindfold`; NestBot creates
  the role and the channel overwrites itself.
- In the dark channel the blindfolded person can still chat, and NestBot
  "whispers" what's going on: *"You hear 3 people laughing in #general…"*,
  *"Someone mentioned you!"* (without the content).
- Time runs like the gag (10 min … 1 h), stacks, and ends automatically.
- **Peek:** pay coins to peek for 30 seconds (the role is removed briefly).
- **Full package:** gag + blindfold at the same time = achievement 🎭.
- 🔊 Variant **Earmuffs**: server-deafen someone in voice for a few minutes.

Limits (Discord): admins always see everything, so admins can't be
blindfolded. Channels that explicitly allow a role override the blindfold;
`/settings blindfold` lists those so they can be fixed.

### 🛡️ Protection shield
An item that blocks the next gag, nickname or targeted wheel spin, and tells
the attacker *"🛡️ Blocked!"*. A good use for coins, and a fair answer to
pranks.

---

## 🎄 Christmas (December)

Same idea as Halloween: everything turns on and off by itself.

- **🗓️ Advent calendar** (Dec 1–24): `/advent` opens today's door once a day.
  Coins, a drink voucher, a hint for the puzzle, a rare item. Door 24 is big.
  Open all 24 → achievement 🎁.
- **🎅 Secret Santa** (`/wichteln`): sign up by Dec 10, NestBot draws pairs and
  DMs everyone their person; you send a gift (coins, drink, item) anonymously,
  revealed on Christmas Eve.
- **❄️ Snowball fight**: `/snowball @user`. Hit or miss, a hit person is
  "❄️ frozen" (snowflakes in their nickname for 10 min). Leaderboard for the
  month.
- **🍪 Christmas drinks**: Glühwein, eggnog, gingerbread latte, hot chocolate
  with marshmallows (only in December).
- **🎄 Server tree**: everyone can hang one ornament per day
  (`/tree decorate`); the tree card grows in #general. All together reach
  goals → coins for everyone.
- Snowy loot drops, festive NestBot.

## 🐣 Easter (Easter weekend)

- **🥚 Egg hunt**: during the weekend, eggs appear as buttons under random
  messages and in random channels. Click first to collect. Golden eggs are
  rare and worth more. Leaderboard and achievement 🧺.
- **🐰 Bunny girl**: an Easter item and a wheel entry. You get the pink
  **"🐰 Bunny Girl"** role for a day, 🐰 ears in front of your nickname, and
  now and then NestBot adds *\*hops\** to your messages (like the gag, but
  cute). Buy it for a friend, or win it in the Easter wheel.
- **🎨 Egg painting**: `/egg paint` gives you a random egg pattern; collect
  all patterns.
- **Easter drinks**: carrot cake latte, Easter punch.

## 🔮 Other seasons
- 💘 Valentine's Day: anonymous valentines, couple drinks, a heart for groups
- 🎆 New Year's Eve: countdown in #general, resolutions you get reminded of in a
  year, champagne for everyone
- 🎂 Server birthday: a cake everyone gets a slice of

---

## 💡 Quality-of-life ideas

**Economy**
- `/balance history`: the last 20 coin changes (what for)
- 🎒 `/inventory`: items you own and haven't used yet (e.g. "1 gag voucher")
- Shop: limited items (only 3 in stock), sales (−20% this weekend)
- `/daily` DM reminder when you can claim again (opt-in)

**Drinks**
- "🔁 Same again" button under your drink
- "🍻 Round on me" button under a drink: buy the same for everyone in voice
- Favorites at the top of the search

**Fun moderation**
- Per-person opt-out for pranks (costs a shield per day, or admins allow it)
- Wheel with categories (light, medium, spicy) and weights

**Everywhere**
- `/help` with buttons per category instead of a menu
- One settings overview: `/settings` without a subcommand shows everything
- All lists with ◀ ▶ pages instead of cut-off text

---

Ideas? Write them in the server or open an issue on GitHub.
