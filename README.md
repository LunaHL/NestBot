**NESTBOT**

**Features** 

### 🤖 AI Personality (Gemini Powered)
*   **Persona**: Acts as the caretaker of the server. She is helpful but sassy/reluctant (mild tsundere).
*   **Context Aware**: Remembers the last few messages in the channel to hold a conversation.
*   **Dynamic**: Reacts to the channel vibe (e.g., acts differently in a lab vs. a kitchen).
*   **Commands**:
    *   Just ping the bot to talk!
    *   `/ai status`: Check AI health and API usage.

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
    *   `/puzzle solve`, `/puzzle info`.
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

### 🎂 Social & Utility
*   **Profiles**: View your rank, balance, and birthday with `/profile`.
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
