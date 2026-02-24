import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const commands = [
  // Setup command
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure which channel receives Void Cascade alerts')
    .addChannelOption(option => 
      option.setName('channel')
        .setDescription('The text channel to post alerts in')
        .setRequired(true))
    .addRoleOption(option => 
      option.setName('role')
        .setDescription('An optional role to ping when a cascade is active')
        .setRequired(false)),

  // Guide command
  new SlashCommandBuilder()
    .setName('guide')
    .setDescription('Displays the cross-server LFG rules and Void Cascade guides'),

  // Whitelist command (Owner Only)
  new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage the bot server whitelist (Owner only)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a server to the whitelist')
        .addStringOption(option =>
          option.setName('server_id')
            .setDescription('The Discord ID of the server to add')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a server from the whitelist')
        .addStringOption(option =>
          option.setName('server_id')
            .setDescription('The Discord ID of the server to remove')
            .setRequired(true)
        )
    )
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands...`);
    
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands },
    );
    
    console.log(`Successfully reloaded application (/) commands.`);
  } catch (error) {
    console.error("Failed to register commands:", error);
  }
})();
