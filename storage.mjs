import fs from 'fs';
import { promises as fsPromises } from 'fs';

const DATA_DIR = '.data';
const DATA_FILE = `${DATA_DIR}/data.json`;

// In-memory cache to lower resource intensiveness on Railway
let memoryCache = null;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadData() {
  // Use cached version if it's stored in RAM
  if (memoryCache !== null) {
    return memoryCache;
  }
  
  // Initial load from disk
  if (fs.existsSync(DATA_FILE)) {
    memoryCache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    
    // Safety check: migrating older data.json files to include the whitelist array
    if (!memoryCache.whitelistedServers) {
      memoryCache.whitelistedServers = [];
    }
  } else {
    // Include the array in the default schema
    memoryCache = { activeCascade: null, squads: [], servers: {}, whitelistedServers: [] };
  }
  
  return memoryCache;
}

export async function saveData(data) {
  memoryCache = data;

  // Prevent bot stutters on multiple simultaneously executed board commands
  try {
    await fsPromises.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error("Failed to write database to disk:", error);
  }
}

// --- Whitelist Database Methods ---

export function isGuildWhitelisted(guildId) {
  const data = loadData();
  return data.whitelistedServers.includes(guildId);
}

export async function addGuildToWhitelist(guildId) {
  const data = loadData();
  if (!data.whitelistedServers.includes(guildId)) {
    data.whitelistedServers.push(guildId);
    await saveData(data);
    return true; // Successfully added
  }
  return false; // Already in the list
}

export async function removeGuildFromWhitelist(guildId) {
  const data = loadData();
  const initialLength = data.whitelistedServers.length;
  
  data.whitelistedServers = data.whitelistedServers.filter(id => id !== guildId);
  
  if (data.whitelistedServers.length !== initialLength) {
    await saveData(data);
    return true; // Successfully removed
  }
  return false; // Was not in the list to begin with
}
