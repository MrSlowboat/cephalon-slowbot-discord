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
  } else {
    memoryCache = { activeCascade: null, squads: [], servers: {} };
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
