# NestBot Changelog

## V 1.21 (November 2026)

**New**
- ⏰ `/remind`: pick a time for the 🧩 puzzle, 🟩 NestWord and 💰 daily coins. If it's not done by then, NestBot sends a DM; if it's done, nothing comes. Also in the hub menu

## V 1.20 (November 2026)

**New**
- 🎂 Birthdays, simpler and nicer: `/birthday set date:` understands “24.12.”, “Dec 24”, “24. Dezember” (year optional, for “turns 25”); `list` shows who's next; `remove` without IDs. On the day: a card at 9:00 (configurable) with 🎉 wishes (+5 coins each), coins, an optional birthday role, and a reminder the day before. NestBot knows it's your birthday. Old birthdays keep working
- 💡 `/suggest`: ideas for NestBot with 👍/👎 votes and a discussion thread; admins set the status (planned, in progress, done, declined) and the author gets a DM. Also in the hub menu
- `/settings birthdays` (channel, hour, coins, role, reminder), `/settings channels suggestions:`, `/admin birthday add-for / remove-for / announce`

**Changed**
- 🔌 Christmas, New Year and Easter are **off by default**: nothing shows up until an admin runs `/settings holidays enabled:true` (test mode still works)
- Roadmap: costume ideas (Bunny Girl downsides, Santa's Little Helper), the tree as a picture and mistletoe noted as future ideas

## V 1.19 (November 2026)

**New: 🎄 Christmas & 🐣 Easter** (only in their season; admins can test them any time with `/settings holidays test:`)
- 🗓️ Advent calendar (`/christmas advent`): a door a day with coins, 🎟️ free drinks, 🎡 free wheel spins or a 🎅 Santa hat; St. Nicholas' boot on the 6th, the big one on the 24th
- 🎅 Secret Santa: sign up until Dec 10, names drawn by DM, gifts opened on Christmas Eve at 18:00, coal for forgetful Santas
- ❄️ Snowball fights: hits freeze people for 10 minutes, a warm drink thaws them
- 🎄 The server tree: one ornament a day, goals at 50 and 150 (coins, a shining star, double loot drops)
- 🎁 Snowy loot drops, festive NestBot, 🎆 New Year countdown and 🥂 New Year coins
- 🥚 Easter egg hunt in the chat (normal, painted, golden, prank and the rare bunny egg)
- 🐰 Bunny Girl outfit (shop, bunny egg, wheel effect): pink role, 🐰 name, *hops*, carrot drinks, bunny parties
- 🎨 Egg painting and gifting (`/easter`)
- 🍷 10 holiday drinks (need pictures: `npm run drink-art`)
- 11 new achievements (60 in total), holiday stats and vouchers in `/profile`
- `/settings holidays` (channel, egg hunt, bunny, test mode), new `/settings tools` actions

**Tests**
- Scenario tests now live in the repo (`tests/scenarios/`) and run with `npm test`

## V 1.18 (November 2026)

**Fixed**
- 📺 Anime that TMDB puts into one long “Season 1” (e.g. Frieren: its 2nd season is S1E29–S1E38 there) are shown and entered with their real seasons (“S2E1”), using TMDB's episode groups. Everywhere: movie night cards, the clock, watchlists, groups, overviews and alerts. Saved progress keeps working
- 🗓️ Planning a series that nobody has watched here yet continues from **your own watchlist** (“▶️ Continuing from your watchlist”); otherwise it says it starts at the first episode and how to change it

## V 1.17 (November 2026)

**New**
- 📢 Groups get a message when a series they watch gets a new season (with start date) or a 🆕 new episode is out and they're caught up (with ▶️ Watch it now and 📋 Episodes). Checked every 6 hours
- ⬇️ The group panel moves back to the bottom after people chat (after 8 s of quiet, at most every 30 s); during a movie night the clock has the bottom. It's no longer pinned

## V 1.16 (November 2026)

**New**
- 📺 Groups: **Where are we?** in the shared list: the group's series progress (also in the pinned panel), ⏭️ we watched the next one (also marked on your own list), ⏮️ back one, 📺 set episode, ▶️ watch the next episode right away, changes posted in the group channel
- 📋 Episode overview with ✅ and episode names, 📚 movie series overview with ✅ for watched parts (in your watchlist and in groups)
- 📺 Series in the watchlist: open one in `/watchlist show` → ⏭️ **next episode watched** (into the next season; after the last episode it's marked watched and asks for a rating), ⏮️ back one, 📺 **set episode** (season + episode, or one overall number for long anime). `/watchlist add` has `season:` and `episode:`

## V 1.15 (November 2026)

Simpler for members: they only see what they can use.

**New**
- 🛠️ `/admin`: all admin parts in one command that only admins see (`shop`, `wheel`, `puzzle`, `nestword`, `coins`, `birthday`, `event`). `/shop`, `/wheel`, `/puzzle`, `/nestword`, `/balance`, `/birthday`, `/event` only show what everyone can use
- 🖱️ Right-click a member → Apps: View profile, Gift a drink, Challenge to a duel, Rename, Blindfold
- 🔑 **Enter code** button on every puzzle card (replaces `/puzzle solve`)
- 📝 “@NestBot remember that …”, “forget …”, “what do you know about me?” (with a 🗑️ menu). Works without Gemini. Replaces `/memory`
- 🎃 Seasonal commands: `/trickortreat` only shows up on Halloween
- 🙋 **Me too** under drinks, 🎲 **Again** under `/gamble`
- Explained in `/help`, the hub menu and the tips

## V 1.14 (November 2026)

**New**
- 📌 Pinned panel in every group channel: members, up next, shared watchlist (👍 vote, watch now, ✅ watched, 🗑️ remove), ➕ add a title, 🍿 watch now or plan (a form), 👋 leave; owner: invite, remove someone, rename, public calendar, delete. Existing groups get it on the next start
- ⬇️ The check-in and the live clock move back to the bottom of the room when people chat (bundled: after 4 s of quiet, at most every 15 s)

**Changed**
- `/group` is just `create` and `list`; everything else is in the panel

## V 1.13 (November 2026)

**New**
- 💬 Ask NestBot: “@NestBot how do movie nights work?”. When a message looks like a question about the bot, she gets a guide to every feature (built from `/help`) and answers with the right command
- 💡 Tips: now and then a short private tip after a command about a related feature. `/settings hub tips:` off / rarely (default) / sometimes / often; at most one per person every 15 min
- 🪺 Hub menu: `/settings hub channel:` posts and pins a menu with buttons (daily, profile, leaderboards, shop, drinks, puzzle, NestWord, movie nights, watchlist, help). Answers are private, no commands needed
- 📅 Weekly “💡 Did you know?” in the hub channel every Monday at 18:00, going through all features
- 🙈 **Blindfold someone** in `/shop`: pick a person and a time (5 min = 20 coins … 1 h = 150), stacks, refunded if it doesn't work

## V 1.12 (November 2026)

Movie nights got simpler: buttons instead of commands. `/watch` 11 → 2 subcommands, `/watchlist` 10 → 4.

**Changed**
- 🗓️ `/watch plan when:` understands "tomorrow 20:00", "friday", "fr 21:00", "6.11. 20:00" and suggests the next days while typing (replaces `date` + `time`)
- ⚙️ **Manage** button on the movie card, the check-in and the clock (planner, admins, mod role): ✏️ change time or title (a form), 🗳️ start a vote, ❌ cancel (asks first), 🏁 end. Replaces `/watch edit`, `cancel`, `vote`, `end`
- 🔄 **I'm at…** button on the clock (replaces `/watch sync`), 💡 **Suggest** opens a form (replaces `/watch suggest`)
- 🎞️ History and 🏆 Nest Top 10 are buttons under the calendar in #movies; 🍿 Movie nights board in `/leaderboard`. Replaces `/watch calendar`, `history`, `top`
- 📝 `/watchlist show` is interactive: open an entry to set 📌/▶️/✅, ⭐ rate, 🔒/🌐, ❗, ✏️ note or episode, 🗑️ remove; ◀️ ▶️ pages, 🎲 pick for me, 📬 movie nights waiting for your answer. `/watchlist add watched:/rating:` for things you already saw. Replaces `/watchlist remove`, `edit`, `seen`, `rate`, `pending`, `random`

**Fixed**
- Menus/buttons that open a form no longer risk a second reply

## V 1.11 (November 2026)

**New**
- 🙈 Blindfolds: a blindfolded member only sees **🕶️ in-the-dark**. NestBot whispers what they miss (someone said their name, busy channels) and DMs a summary when it comes off. Several blindfolded people share the dark. Stacks up to 3 h. Admins can't be blindfolded
- 🙈 New effect for shop items and wheel entries
- `/settings blindfold` (admins): set up / remove (role, channel, overwrites), give, take off, status
- Blindfold stats and status in `/profile` (⚔️ Duels & fun)

**Fixed**
- `/drinks round` for online/everyone: the member list is loaded at most every 10 minutes (Discord rate limit)

## V 1.10 (November 2026)

Fewer commands, same features: 27 → 23 commands, 158 → 145 subcommands.

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
