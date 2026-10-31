# NestBot Changelog

## V 1.10 (November 2026)

Fewer commands, same features: 26 → 22 commands.

**Changed**
- 📊 `/profile` has tabs (menu, or `tab:`): Overview, 🎮 Games (Puzzle, NestWord, Wordle app with result chart), 🍹 Drinks, ⚔️ Duels & fun (duels, tournaments, gags, nicknames, Halloween), 🎬 Movies, 🏅 Achievements. Replaces `/achievements`, `/wordle stats`, `/drinks stats`, `/duel stats`
- 🏆 `/leaderboard` has every ranking with a switch menu: coins, puzzle, Wordle app, drinks (incl. most generous and most rounds), duels, pictures this week, achievements. Replaces `/puzzle leaderboard`, `/wordle leaderboard`, `/drinks leaderboard`, `/pictracker show`
- 📌 `/settings channels` (puzzle + ping role, Wordle app, birthdays, pictures) and `/settings tools` (pay missed Wordle results, reset the picture week, end all paid nicknames). Replaces `/puzzle channel`, `/birthday channel`, `/wordle channel`, `/wordle scan`, `/pictracker setchannel`, `/pictracker reset`
- 🏷️ Paid nicknames moved into `/shop`: 🏷️ Rename someone (pick person → time → type the name) or `/shop nickname`, 🔓 Get your name back. `/settings nicknames end-for:` for admins. Replaces `/nickname`
- 🛍️ Shop categories: `category` when adding/editing (suggested while typing), the shop card is grouped, with a category menu
- 🤺 `/duel @someone bet:` without a subcommand
- Removed commands: `/achievements`, `/wordle` (Wordle rewards stay automatic), `/pictracker`, `/nickname`. Nothing is lost: all data stays
- 🗺️ Roadmap: detailed Christmas, Easter and other season plans; blindfold with several people in the dark

## V 1.9 (November 2026)

**New**
- 🍻 `/drinks round`: buy a drink for everyone in your voice channel, everyone online or the whole server. Price preview first; 5+ people −10%, 10+ −20%, 20+ −30%; people at their daily limit are skipped and cost nothing
- 🏷️ `/nickname`: pay coins to rename someone for 10 min (15 coins) up to 24 h (300 coins). The old name comes back automatically; `buyout` for the same price; `status`, `reset`. Shown in `/profile`
- 🛠️ `/settings nicknames` (admins): paid nicknames on/off, and whether everyone may change their own nickname (edits @everyone)
- ✨ Effects for shop items and wheel entries: 🔇 gag or 🏷️ nickname, chosen with options instead of `[effect:…]` in the text
- 🗺️ `ROADMAP.md`: ideas for Christmas, Easter, blindfolds and more

**Changed**
- 🛍️ New shop: `/shop browse` is a card with a buy menu (pick → target → confirm), `/shop buy` searches while typing, items have emojis, `/shop edit`. Old items are converted, nobody loses anything
- 🎡 New wheel: preview card, 🎡 Spin button with a short animation, entries per server, `remove` searches while typing. The old list is kept
- 🎲 `/gamble`: the "Punishment Roulette" now really spins the wheel for you
- 💰 `/balance`, `/leaderboard`, `/ungag` and the above share one look (`utils/ui.js`)
- Optional Server Members / Presence intents: NestBot falls back to starting without them

## V 1.8 (November 2026)

**New**
- 🍿 Movie nights, step 1 (`/watch`): plan or start movies, series and anime (info from TMDB), calendar in #movies with sign-up buttons, Discord events, reminders, private rooms that open 1 h before (anyone can still join), check-in with countdown, a shared live clock, pause for everyone, `/watch sync`, checkpoints, summary when it ends, rooms close themselves after 24 h
- 🛠️ `/settings watch` for admins
- 🎬 `/profile` Movies tab, 8 movie night achievements (Popcorn Time, Front Row, Host, Cinephile, Otaku, Binge Mode, Critic, Matchmaker), monthly cinema recap in #movies on the 1st
- 💞 Groups (`/group`): couples and fixed groups get a permanent private channel, a shared watchlist with 👍 votes and "up next", and their own series progress; `/watch now`/`plan` inside the group channel; private unless `/group calendar`; admins set the category and an optional limit per person
- 📺 Series & anime: ⏭️ next episode (also across seasons), 🛑 stop here, continue where you left off, `absolute:` episode numbers for long anime, per-person episodes on the watchlist; movie series show "part 2 of 3" and the next part
- 🗳️ Votes: plan without a title or use `/watch vote`; options from everyone's watchlists plus `/watch suggest`, pick as many as you like, winner set automatically (ties: the wheel); duration up to `/settings watch vote-max` or until the start
- 📝 Watchlists (`/watchlist`): public by default, private per entry or for the whole list; "✅ mark as watched?" after movie nights (with ⚠️ I missed part), ⭐ ratings, `/watchlist pending`, your own country and streaming services, DM when your titles get planned, `/watchlist match`, `/watch history`, `/watch top`
- Buttons can now survive bot restarts (routed by their id)

## V 1.7 (October 2026)

**New**
- 🎉 `/settings free` (admins): free mode. Drinks, shop items, AI extras and targeted wheel spins cost nothing while it's on; earning works as usual. Menus, autocomplete and `/help` show it live. Gamble and duel bets and transfers still cost

## V 1.6 (October 2026)

**New**
- 🟩 Coins for the Discord **Wordle app**: NestBot reads the app's daily results in the Wordle channel (`/wordle channel`) and pays automatically (1/6 = 50 … 6/6 = 5, X/6 = 2, 👑 best of the day +10). Missed days are paid later, each day only once
- `/wordle stats`, `/wordle leaderboard`, `/wordle rewards`, `/wordle scan` (admins)
- 5 Wordle achievements (one secret), Wordle stats in `/profile`, rewards table in `/help`

## V 1.5 (October 2026)

**New**
- 🛠️ `/settings streak` (admins): switch Puzzle and NestWord streak rewards between the new capped bonus and the old multiplier (reward × streak days), with a comparison table. `/help` and the puzzle announcement follow the active mode

## V 1.4 (October 2026)

**New**
- 🧩 Daily puzzle announcement in a puzzle channel (`/puzzle channel`, optional role ping): a card with difficulty, reward, first-solver bonus, an "Open puzzle" button and yesterday's top solvers
- 🥇 First-solver bonus (+15 / +10 / +5) and a public "X solved today's puzzle" notice (without the code)
- 🏆 `/puzzle leaderboard`: most solved, most first places, longest streaks
- 🗓️ `/puzzle queue` and `/puzzle remove` for admins

**Fixed / changed**
- Setting a puzzle again for the same day keeps its solvers instead of wiping them
- Dates and links are checked when setting a puzzle; past dates are refused
- Max 10 wrong codes per person per day
- `/puzzle info` shows the real current streak; `append` also fills today if it's free

## V 1.3 (October 2026)

**New**
- 🍹 `/coffee` is now `/drinks`: the Nest Café & Bar with 40 drinks
  - 🫖 10 teas, including 5 black teas (Black Tea, Earl Grey, English Breakfast, Darjeeling, Chai Latte)
  - 🍫 3 hot chocolates, 🍹 6 cocktails + an alcohol-free one, 🍺 3 beers, 🍷 4 wines
  - Drinks are picked by typing (search), the menu can be filtered by section
  - Daily limits: 6 with caffeine, 3 with alcohol, 12 in total
- 🏅 6 new achievements (Tried Everything, Tea Time, Black Tea Devotee, Cozy, Cheers!, Last Call), 36 in total

**Changed**
- Existing drink stats and achievements are kept; "Tried Everything" for coffees is now "Coffee Connoisseur"
- Picture folder `src/assets/coffee-art/` → `src/assets/drink-art/`, script `npm run coffee-art` → `npm run drink-art`

## V 1.2 (October 2026)

**New**
- ☕ Nest Café (`/coffee`): order and gift drinks, pictures with latte art, streaks, leaderboard
- 🏅 30 achievements with coin rewards (`/achievements`), badges in `/profile`
- 🤺 Duels (`/duel`): rock-paper-scissors with bets
- 🧠 AI memory (`/memory`), paid AI extras (`/ai roast/compliment/poem/mood`)
- 🎃 Halloween event on October 31 (`/trickortreat`, spooky drinks and loot drops)
- 🧩 `/puzzle history`, much bigger `/profile`
- 💾 Archive for old data, daily backups, crash-safe saving
- 🧪 `npm test` smoke test
- ❓ `/help`: all features explained, by category, with a command search

**Changed**
- Puzzle and NestWord streaks: +10% per day (max +50%) plus milestone bonuses, instead of multiplying the reward by the streak
- Calmer AI personality; the bot no longer answers replies to its own messages
- Moved to Google's new Gemini package (`@google/genai`), models configurable with `AI_MODELS`
- Code reorganized: `events/`, `config/`, shared helpers in `utils/`, READMEs in every folder

**Fixed**
- `/daily` crashed when already claimed
- Loot drops could pay out twice on fast double clicks
- Wheel gags were applied twice (double duration)
- Picture tracker counted the first picture of a new week on the old week
- Database could get corrupted by a crash while saving, and grew forever

## V 1.1.1

Major:
- Changed the gamble odds
- Added Loot Drops

## V 1.1

Major:
- Removed PicQuota
- Added Pictracker

Minor:
- Puzzle code isn't case sensitive anymore
