# Cephalon Slowboat (Discord): Structure

This document serves as the architectural map for the Cephalon Slowbot Discord project. 

## Project Overview

Cephalon Slowbot (Discord) is a cross-server Discord LFG and alert bot specifically designed for Warframe's Void Cascade level cap community. It automatically polls the Digital Extremes Warframe WorldState API for steel path cascade fissures. When an active cascade is found, it broadcasts an interactive LFG board to registered Discord servers, allowing players to join squads and mathematically determines the optimal host based on global ping matrices. 

## Tech Stack

- **Runtime:** Node.js (ES Modules `.mjs`)

- **Library:** `discord.js` (v14+ assumed, using `GatewayIntentBits.Guilds`)

- **Database:** Persistent Volume (cloud based)  (hosted on Railway/Koyeb) (`/app/.data/data.json`)

- **Deployment:** Railway or Koyeb 

- **External API:** DE Raw WorldState (`content.warframe.com/dynamic/worldState.php`)

---

## Code Map (Directory Structure)

### 1. Core Engine

- `bot.mjs` **(Entry Point)**
  
  - Initializes the Discord client and handles login via environment variables.
  
  - Starts the 60-second polling loop for the Warframe API.
  
  - Routes all Discord interactions (buttons, modals, commands) to the `handleInteraction` controller.
  
  - Runs a dummy HTTP server for Railway/Koyeb health checks.

- `database.mjs` **(State Manager)**
  
  - Handles reading and writing to the cloud hosted `/app/data/.data.json` file.
  
  - Tracks three main objects: `activeCascade` (current mission ID/expiry), `squads` (arrays of player objects), and `servers` (registered guild IDs and channel targets).

### 2. Discord Interface

- `register.mjs` **(Deployment Script)**
  
  - A standalone script used strictly for pushing slash commands (`/setup`, `/guide`) to the Discord API.

- `commands.mjs` **(Interaction Controller)**
  
  - Handles the logic for `/setup` (configuring broadcast channels) and `/guide` (sending the LFG ruleset).
  
  - Manages the UI lifecycle: 
    
    - Modal 1: Clicking the Board button prompts the user to enter their IGN and Region; Reclicking it allows them to: Edit IGN/Region  
    
    - Modal 2: 'Leave' button causes the user to exit the active LFG pool.
  
  - Responsible for synchronizing the generated LFG embed text across all registered servers simultaneously. 
  
  - Once a squad is full, pings the all members in exclusively the squad they boarded from notifying that their squad is ready and prompting them to communicate in-game.

### 3. Matchmaking & API Logic

- `matchmaker.mjs` **(The Matrix)**
  
  - Contains the `pingMatrix`, assigning a penalty score (0 to 5) between regions (NA, EU, ASIA, OCE, SA, AF). A score of '5' represents an unplayable connection.
  
  - `simulateSquad()`: Bouncer logic that prevents a player from joining a squad if their presence guarantees an unplayable hop, and instead places them in a new squad.
  
  - `getBestHost()`: Calculates the lowest total squad penalty to nominate the optimal network host.

- `warframeApi.mjs` **(The Poller)**
  
  - Fetches the DE WorldState API every 60 seconds looking for `MT_VOID_CASCADE` on `SolNode232` (Tuvul Commons) with `Hard` set to true.
  
  - If found, broadcasts the interactive LFG embed to all channels registered in the database.
  
  - Automatically cleans up and deletes old LFG messages across all servers once the mission timer expires to ensure a clean channel and that the guide is always visible.
