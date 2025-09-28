require('dotenv').config();
const fs = require('fs');
const path = require('path');


const { Client, GatewayIntentBits, Guild } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
})

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});


//*Bot start and deploy commands
const { deployCommands } = require('./deploy-commands');
console.log("▶ deploy-commands imported");
(async () => {
  await deployCommands();
  console.log("✅ Deploy finished, now logging in...");
  console.log("Using token:", process.env.BOT_TOKEN ? "✅ Loaded" : "❌ Missing");
  client.login(process.env.BOT_TOKEN);
})();


client.commands = new Map();


const commandsPath = path.join(__dirname, 'commands');

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing "data" or "execute".`);
    }
}

client.on('interactionCreate', async interaction => {
    //* Only handle slash commands
    if (!interaction.isChatInputCommand()) return;

    //* Lookup command in map
    const command = interaction.client.commands.get(interaction.commandName);

    //* Safety check
    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    //* Execute command
    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
});