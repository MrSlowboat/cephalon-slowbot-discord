import http from 'http';
import { Client, GatewayIntentBits, Events } from 'discord.js';
import { startWarframePoller } from './warframeApi.mjs';
import { handleInteraction } from './commands.mjs';

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error("CRITICAL ERROR: TOKEN is not defined in environment variables!");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
  console.log("Starting 60-second API polling...");
  startWarframePoller(client);
});

// Client Error Handling
client.on(Events.Error, error => {
  console.error("Discord Client Error:", error);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    await handleInteraction(interaction, client);
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
