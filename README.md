**NESTBOT**

**Features** 

### 🤖 AI Personality (Gemini Powered)
*   **Persona**: Acts as the caretaker of the server: dry, witty and a little sassy, but helpful. Short replies by default.
*   **Context Aware**: Remembers the last few messages in the channel to hold a conversation.
*   **Dynamic**: Reacts to the channel vibe (e.g., acts differently in a lab vs. a kitchen).
*   **Commands**:
    *   Just ping the bot to talk!
    *   `/ai status`: Check AI health, API usage and today's mood.
    *   `/ai roast|compliment|poem <target>`: Pay NestCoins for a roast, a flustered compliment or a poem (refunded if the AI fails).
    *   `/memory add|list|forget`: Tell NestBot things to remember about you (max 10). It uses them in chat. Nothing is saved unless you add it.
    *   `/ai mood <mood>`: Pay NestCoins to set NestBot's personality for the rest of the day (sweet, grumpy, royal, pirate, sleepy, gremlin, poet).

### 💰 Economy (NestCoins)
*   **Currency**: NestCoins are the server's currency.
*   **Daily Rewards**: Claim free coins every 24h with `/daily`.
*   **Management**:
    *   `/balance view`: Check your wallet.
    *   `/balance transfer`: Pay other users.
    *   `/leaderboard`: See the richest members.
    *   *(Admin)* `/balance grant` / `/balance remove`.
*   **Shop**: Buy items with `/shop`. Items can have active effects (like gagging other users).
*   **Loot Drops**: Random pouches of coins appear in chat. First to click wins! Configurable via `/drop`.
*   **Gambling**: Try your luck with `/gamble` (Roulette style).

### 🎮 Games
*   **NestWord (Wordle-like)**:
    *   Guess the daily word (3-7 letters).
    *   Earn coins and build streaks for multipliers.
    *   `/nestword guess`, `/nestword info`.
*   **Puzzle of the Day**:
    *   Solve a daily riddle or code.
    *   `/puzzle solve`, `/puzzle info`, `/puzzle history [user]`.
*   **Punishment Wheel**:
    *   Spin the wheel for random outcomes (`/wheel spin`).
    *   Can target other users (costs coins).
    *   Outcomes can trigger system effects (e.g., gag).

### 🏆 Events & Tournaments
Full-featured tournament manager built-in (`/event`).
*   **Formats**: Supports **Single Elimination** and **Swiss System**.
*   **Management**:
    *   Create events with prize pools (`/event create`).
    *   Users join via `/event join`.
    *   Automated pairings generation (`/event pairings`).
    *   Track wins (`/event win`).
    *   Visual bracket status (`/event bracket`).
    *   Leaderboards/Standings for Swiss format (`/event standings`).
*   **Prizes**: Automatically distributes NestCoins to the Top 3 winners upon completion.

### ☕ The Nest Café
*   `/coffee menu` - See the drinks and prices.
*   `/coffee order <drink>` - Buy yourself a coffee with NestCoins. Random serving lines, latte art, and a 5% "lucky bean" chance that makes it free.
*   `/coffee gift <user> <drink> [note]` - Treat someone to a coffee.
*   `/coffee stats [user]` and `/coffee leaderboard` - Cups, streaks, favorite drink, gifts.
*   Every coffee comes with a premade picture of the cup and its latte art, from `src/assets/coffee-art/` (see the README in that folder). Create them yourself, or once with `npm run coffee-art`, then commit them.
*   Max 6 cups per person per day. Coffee stats also show in `/profile`, and NestBot knows your coffee habits in chat.

### 🏅 Achievements
*   30 achievements across puzzles, NestWord, the café, tournaments, duels, gags and Halloween (some secret). Each pays a small coin reward.
*   Unlocked automatically and announced in chat. `/achievements [user]` shows all of them; `/profile` shows the badges.

### 🤺 Duels
*   `/duel challenge <opponent> [bet]` - Rock · Paper · Scissors, both bet the same amount (0–500), winner takes all. Ties replay (3 ties = draw, bets returned).
*   `/duel stats [user]` - Win/loss record.

### 🎃 Halloween (October 31 only)
*   `/trickortreat` - 3 tries per day: candy coins, a rare jackpot, or tricks (a ghost steals coins, a witch gags you for a minute…).
*   Café specials (🧪 Witch's Brew, 🩸 Vampire Latte), haunted loot drops twice as often, a spooky NestBot, and a morning announcement in the scoreboard channel.
*   Test it on any day with `FORCE_HALLOWEEN=true` in `.env`.

### 🎂 Social & Utility
*   **Profiles**: `/profile` shows coins, rank, birthday, puzzle and NestWord stats (streaks, win rate, average tries), tournament wins and this week's pictures.
*   **Birthdays**:
    *   Track user birthdays (`/birthday add`).
    *   Automated announcements and coin gifts on your special day.
*   **Picture Tracker**:
    *   Tracks who posts the most images weekly (`/pictracker`).
    *   Weekly leaderboard with coin rewards for top contributors.

### 🔇 Fun Moderation (The Gag System)
*   **Gagging**: Users can be "gagged" (via Shop items or Wheel spins).
*   **Effect**: Gagged users have their messages garbled (e.g., "Hello" -> "Hmph").
*   **Anti-Spam**: If a gagged user spams, the bot doubles their punishment duration.
*   **Commands**: `/ungag` (Admin) to remove it early.

## 🛠️ Commands List

### General
*   `/profile` - View your stats.
*   `/daily` - Claim daily coins.
*   `/balance` - View or transfer coins.
*   `/leaderboard` - Economy rankings.
*   `/shop` - Buy items.
*   `/gamble` - Bet 5 coins.

### Games
*   `/nestword guess <word>` - Play the daily word game.
*   `/puzzle solve <code>` - Solve the daily puzzle.
*   `/puzzle history [user] [page]` - Browse past puzzles.
*   `/wheel spin [target]` - Spin the punishment wheel.

### Events
*   `/event list` - See active events.
*   `/event join <id>` - Join an event.
*   `/event bracket <id>` - View tournament state.
*   `/event standings <id>` - View Swiss standings.

### Admin / Configuration
*   `/event create` - Start a tournament.
*   `/event pairings` - Generate matches.
*   `/event win` - Declare match results.
*   `/drop blacklist` - Stop loot drops in specific channels.
*   `/birthday add/remove` - Manage birthdays.
*   `/pictracker setchannel` - Configure picture tracker output.
*   `/puzzle set` - Configure the daily puzzle.
*   `/nestword set` - Configure the daily word.
*   `/wheel add/remove` - Manage wheel options.
*   `/shop add/remove` - Manage shop items.
*   `/ungag` - Remove a gag.


**Nest Bot Changelog**

*V 1.1*
Major:
- Removed PicQuota 
- Added Pictracker

Minor:
- Puzzle code isnt case sensitive anymore


*V 1.1.1*

Major: 
- Changed the gamble odds
- Added Loot Drops

## 💾 Data & Archive
*   Live data is in `src/data/nestbot.json`. It's saved safely (temp file + rename) and backed up daily to `src/data/backups/` (last 7 kept).
*   Every hour, NestWord days and puzzles older than 7 days, and tournaments finished more than 30 days ago, are moved to `src/data/archive/` (one file per month) to keep the main file small. Nothing is deleted except expired gags and old entries of NestWord's used-words list.
