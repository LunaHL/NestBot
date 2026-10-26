# NestBot Changelog

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
