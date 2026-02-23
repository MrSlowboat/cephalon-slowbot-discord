import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { loadData, saveData } from './database.mjs';

export function startWarframePoller(client) {
  // Initiates the recursive loop
  checkWarframeAPI(client); 
}

async function checkWarframeAPI(client) {
  console.log("=== CRON TOCK: Checking DE Raw API ===");
  let db = loadData();
  const nowSecs = Math.floor(Date.now() / 1000);
  
  // Polling interval
  let timeToWaitMs = 60000; 

  // Message cleanup
  const cleanupOldMessages = async (cascadeData) => {
    console.log("Cleaning up old cascade messages across all servers...");
    const cleanupPromises = cascadeData.messages.map(async (msgData) => {
      try {
        const channel = await client.channels.fetch(msgData.channelId).catch(() => null);
        if (channel) {
          const msg = await channel.messages.fetch(msgData.messageId).catch(() => null);
          if (msg) await msg.delete();
        }
      } catch (e) { 
        console.error(`Failed to delete message in channel ${msgData.channelId}`); 
      }
    });
    await Promise.all(cleanupPromises);
  };

  // Standard Cleanup
  if (db.activeCascade && db.activeCascade.expiry <= nowSecs) {
    await cleanupOldMessages(db.activeCascade);
    db.activeCascade = null;
    db.squads = []; 
    saveData(db);
  }

  // Fetch DE raw data
  try {
    const response = await fetch("https://content.warframe.com/dynamic/worldState.php", {
      headers: { "User-Agent": "Cephalon-Slowbot/6.0 (Modularized)" }
    });

    if (!response.ok) {
      console.error(`DE API Error: ${response.status}`);
      setTimeout(() => checkWarframeAPI(client), timeToWaitMs);
      return;
    }

    const worldState = await response.json();
    
    const rawTarget = worldState.ActiveMissions.find(m => 
      m.Node === "SolNode232" && 
      m.MissionType === "MT_VOID_CASCADE" &&
      m.Hard === true
    );

    if (rawTarget) {
      const targetId = rawTarget._id.$oid;
      const targetExpirySecs = Math.floor(parseInt(rawTarget.Expiry.$date.$numberLong) / 1000);
      const targetNode = "Tuvul Commons (Zariman)";

      // Hibernation during active cascades
      const msUntilExpiry = (targetExpirySecs - nowSecs) * 1000;
      const wakeUpBufferMs = 60000; // Wake up 60 seconds before expiry
      
      if (msUntilExpiry > wakeUpBufferMs * 2) {
        timeToWaitMs = msUntilExpiry - wakeUpBufferMs;
        console.log(`Zzz... Hibernating for ${Math.floor(timeToWaitMs / 60000)} minutes. Waking up 60s before expiry.`);
      }

      if ((targetExpirySecs - nowSecs) > 300) {
        if (!db.activeCascade || targetId !== db.activeCascade.id) {
          console.log("New Cascade detected!");
          
          // Ensure posts don't overlap
          if (db.activeCascade && targetId !== db.activeCascade.id) {
            await cleanupOldMessages(db.activeCascade);
          }
          
          const timeRemainingSecs = targetExpirySecs - nowSecs;
          const hours = Math.floor(timeRemainingSecs / 3600);
          const minutes = Math.floor((timeRemainingSecs % 3600) / 60);
          const exactRemaining = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                                      
          const broadcastPromises = Object.entries(db.servers).map(async ([guildId, serverConfig]) => {
            try {
              const channel = await client.channels.fetch(serverConfig.channelId).catch(() => null);
              if (!channel) return null;

              const embed = new EmbedBuilder()
                .setTitle(`Mission: ${targetNode}`)
                .setDescription("Click **'Board'** below to register your IGN and Region in the Global LFG.\n\n**Squad 1**\n*Empty*")
                .setColor(0x9b59b6)
                .setFooter({ text: "Global Cephalon Network" });

              const row = new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setCustomId('board')
                    .setLabel('Board')
                    .setEmoji('⚔️')
                    .setStyle(ButtonStyle.Success),
                  new ButtonBuilder()
                    .setCustomId('leave')
                    .setLabel('Leave')
                    .setEmoji('🚪')
                    .setStyle(ButtonStyle.Danger),
                );

              const pingText = serverConfig.roleId ? `<@&${serverConfig.roleId}> ` : "";
              
              const msg = await channel.send({
                content: `${pingText}**Void Contamination is getting out of control!**\nEnds At: <t:${targetExpirySecs}:t> (Local Time) • Remaining: **${exactRemaining}** (<t:${targetExpirySecs}:R>)`,
                embeds: [embed],
                components: [row]
              });

              return { guildId, channelId: serverConfig.channelId, messageId: msg.id };
            } catch (err) {
              console.error(`Failed to post to guild ${guildId}:`, err);
              return null;
            }
          });

          const results = await Promise.all(broadcastPromises);
          const postedMessages = results.filter(result => result !== null);

          db.activeCascade = {
            id: targetId,
            expiry: targetExpirySecs,
            messages: postedMessages
          };
          db.squads = [];
          saveData(db);
        }
      }
    } else {
      console.log("❌ No active SP Tuvul Commons cascades. Hunting...");
    }
  } catch (e) {
    console.error("Critical Fetch Error:", e);
  }

  // Recursive Scheduling
  setTimeout(() => checkWarframeAPI(client), timeToWaitMs);
}
