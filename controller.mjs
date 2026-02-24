import http from 'http';
import { Client, GatewayIntentBits, Events } from 'discord.js';
import { startPolling, cascadeEvents } from './poll.mjs';
import { handleInteraction } from './commands.mjs';
import { initBroadcaster, handleBoardingInteractions } from './post.mjs';
import { isGuildWhitelisted } from './storage.mjs';

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error("CRITICAL ERROR: TOKEN is not defined in environment variables!");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // --- Startup Whitelist Purge ---
  console.log("Running startup whitelist check...");
  for (const [guildId, guild] of client.guilds.cache) {
    if (!isGuildWhitelisted(guildId)) {
      console.log(`Found unauthorized server on startup. Leaving ${guild.name} (${guildId})...`);
      await guild.leave().catch(console.error);
    }
  }
  console.log("Startup whitelist check complete.");
  // -------------------------------

  console.log("Starting 60-second API polling");
  
  // Initialize the broadcaster with the client and event emitter
  initBroadcaster(client, cascadeEvents);
  
  // Start polling the API
  startPolling();
});

// --- New Guild Join Bouncer ---
client.on(Events.GuildCreate, async guild => {
  if (!isGuildWhitelisted(guild.id)) {
    console.log(`Unauthorized join attempt. Leaving server: ${guild.name} (${guild.id})`);
    
    try {
      const defaultChannel = guild.systemChannel || guild.channels.cache.find(c => 
        c.isTextBased() && c.permissionsFor(guild.members.me).has('SendMessages')
      );
      
      if (defaultChannel) {
        await defaultChannel.send('Cephalon Slowbot is currently whitelisted and not authorized for this server. Leaving now. 👋');
      }
      
      await guild.leave();
      console.log(`Successfully left unauthorized server: ${guild.id}`);
    } catch (error) {
      console.error(`Failed to leave unauthorized server ${guild.id}:`, error);
    }
  } else {
    console.log(`Successfully joined whitelisted server: ${guild.name} (${guild.id})`);
  }
});
// ------------------------------

// Client Error Handling
client.on(Events.Error, error => {
  console.error("Discord Client Error:", error);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      // Route slash commands to commands.mjs
      await handleInteraction(interaction, client);
    } else if (interaction.isButton() || interaction.isModalSubmit()) {
      // Route buttons and modals to post.mjs
      await handleBoardingInteractions(interaction, client);
    }
  } catch (error) {
    console.error("Error handling interaction:", error);
  }
});

// Start the bot
client.login(TOKEN);

// Error Logging and handling
const port = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Cephalon Slowbot is active.');
}).listen(port, () => {
  console.log(`Health check server listening on port ${port}`);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
});

const shutdown = () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Health check server closed.');
  });
  client.destroy();
  console.log('Discord client destroyed.');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
