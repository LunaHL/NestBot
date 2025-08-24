import { startClient, client } from './client.js';
import { setupWelcome } from './features/welcome.js';
import { setupPunishmentEnforcement } from './features/punishments.js';
import { setupWheel } from './features/wheel.js';
import { setupEconomy } from './features/economy.js';
import { setupSass } from './features/sass.js';
import { setupCallouts } from './features/callouts.js';
import { setupWordle } from './features/wordle.js';
import { setupShop } from './features/shop.js';
import { startWebServer } from './web/server.js';

await startClient();

setupWelcome(client);
setupPunishmentEnforcement(client);
setupWheel(client);
setupEconomy(client);
setupSass(client);
setupCallouts(client);
setupWordle(client);
setupShop(client);

// Start admin dashboard (Express)
startWebServer();
