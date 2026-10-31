# NestBot Changelog

## V 1.8 (November 2026)

**New**
- 🍿 Movie nights, step 1 (`/watch`): plan or start movies, series and anime (info from TMDB), calendar in #movies with sign-up buttons, Discord events, reminders, private rooms that open 1 h before (anyone can still join), check-in with countdown, a shared live clock, pause for everyone, `/watch sync`, checkpoints, summary when it ends, rooms close themselves after 24 h
- 🛠️ `/settings watch` for admins
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
