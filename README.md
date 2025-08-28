# 🪶 NestBot
**A playful Discord bot built for the Nest** — featuring punishments, an economy with three currencies, daily Wordle, a shop system, sass mode, birthdays, and more.  

---

## ✨ Features
- 🎡 **Punishment Wheel**  
  `/wheel` spins random punishments (emoji-only mode, silence, clown role, timeout…).  
  `/endrule` lets staff end punishments early.  
  Punishments even **reward PainTokens** when endured.  

- 💰 **Nest Economy**  
  - 🪙 NestCoins – everyday currency  
  - 🐾 PawPoints – prestige & obedience  
  - 🔒 PainTokens – shameful punishment debt  
  Room-based:  
  - `#bank` → money & trading  
  - `#obedience-hall` → prestige  
  - `#kennel` → punishments & suffering  

- 🟩 **Daily Wordle**  
  `/wordle guess <word>` → solve today’s word for bonus NestCoins.  

- 🛒 **Shop System**  
  `/shop`, `/buy`, `/inventory`, `/use`  
  Buy coupons (skip/re-roll/reverse punishments) and cosmetic roles.  

- 🐍 **Sass Mode**  
  NestBot randomly taunts you when you complain, run out of money, or even ping it with garbled nonsense like  
  *“ehh yous gwot swomtheings to sway wobot!?”*  

- 🎂 **Birthday Announcements**  
  `/birthday set date: YYYY-MM-DD` to store your birthday.  
  NestBot announces in `#birthday` at 09:00 Berlin time, pinging **@everyone**.  

- 👋 **Welcome Messages**  
  New members are greeted warmly (or suspiciously).  

---

## 🚀 Getting Started

### Requirements
- Node.js v20+  
- A Discord Bot Application (with token, client ID, guild ID)  
- Optional: Raspberry Pi or VM to host permanently  

### Installation
```bash
git clone https://github.com/LunaHL/NestBot.git
cd NestBot
npm install
cp .env.example .env   # fill with your secrets
