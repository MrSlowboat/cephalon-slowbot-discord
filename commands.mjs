import { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { loadData, saveData } from './database.mjs';
import { simulateSquad, getBestHost } from './matchmaker.mjs';

const VALID_REGIONS = ['NA', 'EU', 'ASIA', 'OCE', 'SA', 'AF'];

// Text generation function
function generateBoardText(db) {
  let text = "Click **'Board'** below to register your IGN and Region in the cross-server LFG.\n\n";
  if (db.squads.length === 0) return text + "**Squad 1**\n*Empty*";
  
  db.squads.forEach((squad, index) => {
    text += `**Squad ${index + 1}**\n`;
    squad.forEach(member => { text += `• ${member.name} [${member.region}]\n`; });
    const emptySlots = 4 - squad.length;
    if (emptySlots > 0) text += `*...and ${emptySlots} open slot(s)*\n`;
    text += "\n";
  });
  return text;
}

// Sync function
async function syncGlobalMessages(client, db, interaction, text) {
  if (!db.activeCascade || !db.activeCascade.messages) return;

  const syncPromises = db.activeCascade.messages.map(async (msgData) => {
    if (msgData.messageId === interaction.message.id) return; 
    try {
      const channel = await client.channels.fetch(msgData.channelId).catch(() => null);
      if (channel) {
        const targetMsg = await channel.messages.fetch(msgData.messageId).catch(() => null);
        if (targetMsg) {
          const syncedEmbed = EmbedBuilder.from(targetMsg.embeds[0]).setDescription(text);
          await targetMsg.edit({ embeds: [syncedEmbed] });
        }
      }
    } catch (err) {}
  });

  await Promise.all(syncPromises);
}

export async function handleInteraction(interaction, client) {
  // Setup command
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
    if (!interaction.memberPermissions.has('ManageGuild')) {
      return interaction.reply({ content: "❌ You need 'Manage Server' permission.", ephemeral: true });
    }
    const targetChannel = interaction.options.getChannel('channel');
    const targetRole = interaction.options.getRole('role'); 
    const guildId = interaction.guild.id;

    if (!targetChannel.isTextBased()) return interaction.reply({ content: "❌ Select a valid text channel.", ephemeral: true });

    let db = loadData();
    if (!db.servers) db.servers = {}; 
    db.servers[guildId] = { channelId: targetChannel.id, roleId: targetRole ? targetRole.id : null };
    saveData(db);

    const rolePingText = targetRole ? `and pinging **@${targetRole.name}**` : `without any role pings`;
    await interaction.reply({ content: `**Setup Complete!**\nAlerts will be posted in <#${targetChannel.id}> ${rolePingText}.`, ephemeral: true });
    
    return;
  }

  // Board button
  if (interaction.isButton() && interaction.customId === 'board') {
    const userId = interaction.user.id;
    let db = loadData();

    let existingName = "";
    let existingRegion = "";
    for (const squad of db.squads) {
      const member = squad.find(m => m.id === userId);
      if (member) { existingName = member.name; existingRegion = member.region || ""; break; }
    }

    const modal = new ModalBuilder()
      .setCustomId('ign_modal')
      .setTitle(existingName ? 'Update Info' : 'Join the Global LFG');

    const ignInput = new TextInputBuilder()
      .setCustomId('ign_input')
      .setLabel("What is your Warframe IGN?")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(24) 
      .setRequired(true);

    const regionInput = new TextInputBuilder()
      .setCustomId('region_input')
      .setLabel("Region? (Strict)")
      .setPlaceholder("Must be: NA, EU, ASIA, OCE, SA, or AF")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(4) 
      .setRequired(true);

    if (existingName) {
      ignInput.setValue(existingName);
      if (existingRegion) regionInput.setValue(existingRegion);
    }

    modal.addComponents(
      new ActionRowBuilder().addComponents(ignInput), 
      new ActionRowBuilder().addComponents(regionInput)
    );
    await interaction.showModal(modal);

    return;
  }

  // Leave button
  if (interaction.isButton() && interaction.customId === 'leave') {
    const userId = interaction.user.id;
    let db = loadData();
    let removed = false;

    for (let i = 0; i < db.squads.length; i++) {
      const memberIndex = db.squads[i].findIndex(m => m.id === userId);
      if (memberIndex !== -1) {
        db.squads[i].splice(memberIndex, 1); 
        if (db.squads[i].length === 0) db.squads.splice(i, 1); 
        removed = true;
        break;
      }
    }
    if (!removed) return interaction.reply({ content: "You aren't currently in any squads!", ephemeral: true });

    saveData(db);
    const text = generateBoardText(db);
    const newEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setDescription(text);
    await interaction.update({ embeds: [newEmbed] });
    await syncGlobalMessages(client, db, interaction, text);

    return;
  }
  
  // Modals for board
  if (interaction.isModalSubmit() && interaction.customId === 'ign_modal') {
    const ign = interaction.fields.getTextInputValue('ign_input');
    const rawRegion = interaction.fields.getTextInputValue('region_input');
    const region = rawRegion.toUpperCase().trim(); 
    const userId = interaction.user.id;
    
    if (!VALID_REGIONS.includes(region)) {
      return interaction.reply({ 
        content: `❌ **Invalid Region.** You entered "${rawRegion}". Please click Board again and use exactly: **NA, EU, ASIA, OCE, SA, AF**.`, 
        ephemeral: true 
      });
    }
    
    let db = loadData();
    let userUpdated = false;
    let filledSquadIndex = -1; 

    for (let i = 0; i < db.squads.length; i++) {
      const memberIndex = db.squads[i].findIndex(m => m.id === userId);
      if (memberIndex !== -1) {
        db.squads[i][memberIndex].name = ign; 
        db.squads[i][memberIndex].region = region; 
        userUpdated = true;
        break;
      }
    }

    if (!userUpdated) {
      let placed = false;
      for (let i = 0; i < db.squads.length; i++) {
        if (db.squads[i].length < 4) { 
          const simulatedSquad = [...db.squads[i], { region: region }];
          
          if (simulateSquad(simulatedSquad)) {
            db.squads[i].push({ name: ign, id: userId, channelId: interaction.channelId, region: region }); 
            placed = true; 
            if (db.squads[i].length === 4) filledSquadIndex = i; 
            break; 
          }
        }
      }
      if (!placed) {
        db.squads.push([{ name: ign, id: userId, channelId: interaction.channelId, region: region }]); 
      }
      
      if (filledSquadIndex !== -1) {
        const fullSquad = db.squads[filledSquadIndex];
        const smartHost = getBestHost(fullSquad);
        
        const channelGroups = {};
        for (const member of fullSquad) {
          if (!channelGroups[member.channelId]) channelGroups[member.channelId] = [];
          channelGroups[member.channelId].push(member);
        }

        for (const [channelId, members] of Object.entries(channelGroups)) {
          try {
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (channel) {
              const pings = members.map(m => `<@${m.id}>`).join(' ');
              await channel.send(`**Squad Filled!**\n${pings}\n**${smartHost.name}** [${smartHost.region}] is the optimal host. Please expect an invite or \`/w\` them in-game.`);
            }
          } catch (err) {}
        }
      }
    }
    
    saveData(db);
    const text = generateBoardText(db);
    const newEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setDescription(text);
    await interaction.update({ embeds: [newEmbed] });
    await syncGlobalMessages(client, db, interaction, text);

    return;
  }

  // Guide Command
  if (interaction.isChatInputCommand() && interaction.commandName === 'guide') {
    const message1 = `**Cephalon Slowbot: Void Cascade LFG Guide**\nThanks for inviting Cephalon Slowbot into your server! If you'd like to make use of this cross-server LFG, please take note of these three requests.`;
    const message2 = `**1. Transparency:**If this is your first level cap, or you're unsure of how cascade works, please make sure your squadmates are aware of this. Our communities are built on helpfulness, not elitism. To an experienced cascader, teaching a person how to cascade is a pleasure! Conversely, nothing annoys an experienced cascader more than people being dishonest about their competence, only for the squad to find out about it once you hit exoliser 65 when the difficulty starts to ramp up. Ask questions! We're here to answer them! `;
    const message3 = `**2. Gearing:**Please don't register for a cascade if you aren't in a position to contribute to your team. Please make sure you have an amp good enough for cascade. Amp parts, arcanes, focus schools and tauron strikes, mods and arcanes can all make enormous difference to whether you're geared enough. It's a sliding scale, so if you don't know whether your operator's ready that's what the text channels in this discord are for. Again, ask questions! If you're not the social type (or even if you are), I highly recommend checking out [GreatBardini's Portal](<https://warframe.training/Level+Cap+Cascade/Level+Cap+Void+Cascade+(LCC)>), in which he breaks down the basics of a cascade and has extremely comfy builds you can try out if you're unsure about things like your frame and weapon choices. If you want to go way more in-depth than you'd need to, you can check out [MrSlowboat's Cascade Guide](<https://github.com/MrSlowboat/cephalon-slowbot-discord/blob/main/MrSlowboats_Cascade_Guide.pdf>).`;
    const message4 = `**3. Signing Up:**To sign up for a cascade, press the ⚔️ **Board** button, put in your IGN and region. Make sure you format the region exactly as 'NA' (North America), 'SA' (South America), 'EU' (Europe), 'ASIA', 'OCE' (Oceania), or 'AF' (Africa). The bot needs these written exactly as they are here for its matchmaking matrix to identify an ideal host based on global network topology. If you need to edit your IGN or region because of a typo, just press ⚔️ **Board** again. If you'd like to leave, well, there's the door (🚪). Please ensure that if you sign up for a cascade, you have at least an hour and a half of time to spare so you can get to level cap. IRL stuff can always come up and force you to leave early, but please don't take your squadmates' time for granted. In case a group forms too slowly and you have other commitments, make sure you exit the LFG.`;
    const message5 = `**The Open Source Project:** If you'd like to find out more about how the bot works, track its progress, contribute to it or create your own version, you can find out more about the project here: [GitHub Repository](<https://github.com/MrSlowboat/cephalon-slowbot-discord>)`;

    await interaction.reply({ content: "✅ Posting the guide to the channel...", ephemeral: true });

    try {
      const channel = interaction.channel;
      if (!channel) throw new Error("Channel not found.");

      await channel.send(message1);
      await channel.send(message2);
      await channel.send(message3);
      await channel.send(message4);
      await channel.send(message5);
    } catch (error) {
      console.error("Failed to send guide messages:", error);
      await interaction.followUp({ content: "❌ I couldn't post the guide. Please check my permissions in this channel!", ephemeral: true });
    }
    
    return;
  }
}
