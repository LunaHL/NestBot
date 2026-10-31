# NestBot Roadmap

What's done, what's next, and ideas for later. Nothing below "Next" is
promised; it's a list to pick from. Newest changes: [CHANGELOG.md](CHANGELOG.md).

**Legend:** ✅ done · 🚧 in progress · 📋 planned · 💡 idea

---

## ✅ Recently done

| Version | What |
|---|---|
| V 1.10 | 🧹 Fewer commands: stats in `/profile` tabs, all rankings in `/leaderboard`, channels in `/settings channels`, nicknames in `/shop`, shop categories |
| V 1.9 | 🍻 Drink rounds, 🏷️ paid nicknames, new shop and wheel, shared look for economy commands |
| V 1.8 | 🍿 Movie nights: `/watch`, watchlists, votes, series & anime, groups, Movies tab |
| V 1.7 | 🎉 Free mode |
| V 1.6 | 🟩 Wordle app rewards |
| V 1.5 | 🔥 Streak mode switch |
| V 1.4 | 🧩 Puzzle announcements, first-solver bonus, leaderboard |

---

## 📋 Next

### 🙈 Blindfold

The partner of the gag: the gag takes your voice, the blindfold takes your
sight. A shop item (category "🔇 Punishments"), a wheel effect, and something
admins can give.

**How it works**
- A **🙈 Blindfolded** role is not allowed to see the server's channels
  (`View Channel` denied on every category). The only channel it sees is
  **🕶️ In the dark**. Admins set this up once with `/settings blindfold`;
  NestBot creates the role, the channel and all the overwrites itself, and
  lists channels that would still be visible (channels that explicitly allow
  a role) so they can be fixed.
- Time works like the gag: 10 min … 1 h, a second blindfold adds time, it ends
  by itself.
- Admins always see everything in Discord, so admins can't be blindfolded.

**NestBot whispers what's going on.** In the dark channel she tells the
blindfolded person what they're missing, without showing anything:
- *"🗣️ You hear 5 people chatting in #general…"* (every few minutes, only
  if something happened)
- *"👂 Someone just said your name!"* when they're mentioned
- *"🍹 You smell coffee… someone just ordered a drink."*
- *"😂 Loud laughter from #memes!"* when a message gets lots of 😂 reactions
- *"🎡 You hear the wheel spinning…"*
- When it ends: *"🌅 The blindfold slips off. You missed 47 messages. Good luck."*

**When several people are blindfolded at the same time**
- They all end up in the same **🕶️ In the dark** channel, and that is part of
  the fun: they can't see the server, only each other.
- But in the dark, nobody knows who is talking. NestBot deletes their
  messages and reposts them anonymously: *"🗣️ A voice in the dark: who's
  there??"*. Each person gets a fixed mystery voice for that session ("a deep
  voice", "a giggling voice", "a whisper"), so you can tell voices apart but
  not who they are.
- 🎭 **Guess who:** a blindfolded person can guess `/blindfold guess voice:
  giggling user:@Mia`. Right guess: coins and the voice is revealed to
  everyone in the dark. Wrong guess: +2 minutes in the dark.
- NestBot's whispers go to everyone in the dark at once, so it feels like a
  shared "room".
- Gagged *and* blindfolded: your anonymous messages come out garbled too
  ("🗣️ A muffled voice: mmph mmmh!"). Both at once = achievement 🎭 Full
  Package.
- If the dark gets crowded (5+ people), NestBot opens a second room so it
  doesn't turn into chaos.

**Extras**
- 👀 **Peek:** pay coins to see the server for 30 seconds (the role is lifted
  briefly), once per blindfold.
- 🤝 **Lead the way:** someone outside can pay to "describe" a channel to a
  blindfolded friend: NestBot posts a short AI summary of the last messages in
  the dark ("In #general they're arguing about pineapple pizza").
- 🔊 **Earmuffs** (variant): server-deafen someone in voice for a few minutes.

### 🛡️ Protection shield
An item that blocks the next gag, nickname, blindfold or targeted wheel spin,
and tells the attacker *"🛡️ Blocked!"*. A fair answer to pranks and a good
use for coins. Max 1 at a time; shown in the profile.

---

## 🎄 Christmas (December 1–26)

Like Halloween, everything turns on and off by itself, and `/help` shows a
🎄 Christmas section only in December.

### 🗓️ Advent calendar (Dec 1–24)
- `/advent` opens today's door, once per day per person. Missed doors can't
  be opened later (that's what makes it a calendar).
- A card shows the calendar as a grid: 🎁 opened, 🔒 still closed, ⭐ today.
- Behind the doors (random, but every door has something):
  - 💰 coins (10–50)
  - 🍹 a free drink voucher (redeemed with the next `/drinks order`)
  - 🧩 a hint for today's puzzle
  - 🏷️ a free nickname prank
  - 🎡 a free targeted wheel spin
  - ✨ rare: a seasonal item (🎅 Santa hat nickname prefix for 3 days)
- Door 6 (St. Nicholas): a 🥾 boot full of sweets, bigger reward.
- Door 24: the big one (100+ coins and a special achievement).
- Open all 24 → achievement 🎁 **Advent Champion**. Open 20+ → 🎄 **Festive**.

### 🎅 Secret Santa (Wichteln)
1. From Dec 1 to Dec 10: `/santa join` (optional wish: "I like tea and cats").
2. On Dec 10 NestBot draws the pairs (nobody gets themselves, couples from
   `/group` can be kept apart if wanted) and DMs everyone their person and
   their wish.
3. Until Dec 23 you prepare a gift with `/santa gift`: coins, a drink, a shop
   item, and a note. It stays secret.
4. On Christmas Eve at 18:00 NestBot opens all gifts in #general one after
   another, with the note, and at the end reveals who was whose Santa.
- Forgot to give something? NestBot gives a small backup gift so nobody goes
  without, and the forgetful Santa gets a 🪨 lump of coal in their profile.

### ❄️ Snowball fight
- `/snowball @someone`: 60% hit, 40% miss (or it hits a random bystander 😅).
- A hit person is **❄️ frozen**: snowflakes around their nickname for 10
  minutes (❄️Mia❄️), using the nickname system.
- A frozen person can't throw back until they've thawed (or someone gives
  them a ☕ hot drink, which thaws instantly).
- 3 free snowballs per day; more cost a few coins.
- Monthly snowball leaderboard (`/leaderboard board:Snowballs` in December):
  most hits, most frozen, best accuracy.

### 🎄 The server tree
- One shared Christmas tree card in #general.
- `/tree decorate`: everyone may hang one ornament per day (🔴 ball, ⭐ star,
  🕯️ candle, 🍬 candy cane, 🔔 bell). The card shows the tree growing with
  everyone's ornaments and names.
- Goals for the whole server: 50 ornaments → everyone gets 20 coins; 150 →
  the ⭐ top star lights up and loot drops are doubled for a day.
- On Dec 24 the finished tree is posted with everyone who helped.

### ☕ Christmas drinks (December only)
- 🍷 Glühwein (mulled wine), 🥛 Eggnog, 🍪 Gingerbread latte, 🍫 Hot chocolate
  with marshmallows, 🍊 Kinderpunsch (alcohol-free mulled punch), 🎄 Christmas
  tea (black tea with cinnamon and orange).
- Each with its own picture (generated like the other drinks).

### And also
- ❄️ Snowy loot drops ("🎁 A present appeared!"), a bit more often.
- NestBot in Christmas mood: Santa hat in her messages, cozy and slightly
  sarcastic about Christmas songs.
- 🎆 Dec 31: countdown message in #general at midnight, everyone who reacts
  gets 🥂 Happy New Year coins.

---

## 🐣 Easter (Good Friday to Easter Monday)

### 🥚 Egg hunt
- During the weekend, eggs appear as a 🥚 button under random messages and in
  random channels, a few times per hour. First click collects it.
- Kinds of eggs:
  - 🥚 normal egg: 5 coins
  - 🌈 painted egg: 15 coins
  - 🥇 golden egg: 50 coins (rare)
  - 💣 prank egg: it explodes in confetti, and you're gagged for 1 minute 😄
  - 🐰 bunny egg: very rare, contains the Bunny Girl outfit (see below)
- Eggs disappear after 2 minutes if nobody finds them.
- `/profile` shows your 🧺 basket; `/leaderboard board:Eggs` during Easter.
- Achievements: 🧺 **Egg Hunter** (20 eggs), 🥇 **Golden Touch** (a golden
  egg), 🐰 **Lucky Bunny** (find the bunny egg).
- On Easter Monday NestBot announces the best egg hunters.

### 🐰 Bunny Girl
A cute Easter outfit you can wear yourself or put on a friend.
- **What happens:**
  - The pink **🐰 Bunny Girl** role (pink name color) for 24 hours
  - 🐰 bunny ears in front of your nickname ("🐰 Mia"), using the nickname
    system; it comes off by itself
  - Now and then NestBot adds *\*hops\** or *\*wiggles nose\** to your
    messages (like the gag, but cute and only every few messages)
  - Your drinks are served as 🥕 carrot versions ("Carrot latte for Mia")
- **How to get it:**
  - Easter shop item 🐰 **Bunny Girl outfit** (buy it for yourself or someone
    else, with a confirm step)
  - Easter wheel entry
  - The rare 🐰 bunny egg in the egg hunt
- **Bunny party:** if 3+ people are bunnies at the same time, NestBot
  announces a 🐰 bunny party and every bunny gets 10 coins.
- The renamed person can take it off early with 🔓 **Get your name back**
  (same as nicknames), and admins can turn the whole thing off.
- Achievement 🐰 **Hop Hop** for wearing it, 🎀 **Dress-up** for putting it on
  3 people.

### 🎨 Egg painting
- `/egg paint`: once per day during Easter, NestBot paints you a random egg
  (pattern × color, e.g. "🟣 purple zigzag egg").
- Collect patterns; 10 different ones → achievement 🎨 **Egg Artist**.
- Trade or gift eggs to friends.

### 🥕 Easter drinks
- 🥕 Carrot cake latte, 🍫 Chocolate bunny hot chocolate, 🌸 Easter punch
  (alcohol-free), 🍋 Lemon egg liqueur cocktail.

---

## 🔮 Other seasons

### 💘 Valentine's Day (Feb 14)
- `/valentine @someone`: send an anonymous valentine with a note; NestBot
  delivers it in #general ("💌 Someone has a crush on Mia…"). The receiver can
  guess who sent it (right guess: both get coins).
- 💑 Couple drinks: one order, two glasses (for both, half price each).
- Groups from `/group` get a little 💞 heart in their channel.

### 🎆 New Year
- Countdown in #general, 🥂 champagne for everyone who's online at midnight.
- `/resolution`: write a New Year's resolution; NestBot reminds you of it
  exactly one year later and asks if you kept it.
- 📊 Year in review: everyone's year in numbers (drinks, puzzles, movie
  nights, most-used words) as a card on Jan 1.

### 🎂 Server birthday
- A cake card on the server's birthday; everyone gets a 🍰 slice (coins) by
  clicking. Stats about the server's year.

### ☀️ Summer
- 🍦 Ice cream menu and cold drinks, 🏖️ "vacation mode" (no streak loss while
  you're away for up to 7 days).

---

## 💡 Quality-of-life ideas

**Fewer commands**
- `/coins`: `/daily`, `/gamble` and `/balance` as one command
  (`/coins daily`, `/coins gamble`, `/coins send`)
- Seasonal commands (`/trickortreat`, later `/advent`, `/snowball`) only
  visible during their season
- `/ungag` → a ✅ button for admins under the gag message

**Economy**
- `/balance history`: the last 20 coin changes (what for)
- 🎒 Inventory in `/profile`: items you own and haven't used yet (vouchers)
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
- `/settings` without a subcommand shows every setting on one page
- All long lists with ◀ ▶ pages instead of cut-off text

---

Ideas? Write them in the server or open an issue on GitHub.
