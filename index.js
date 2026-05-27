const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs-extra');
const Tesseract = require('tesseract.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const DATA_FILE = './data/stats.json';

async function init() {
  await fs.ensureDir('./data');
  if (!await fs.pathExists(DATA_FILE)) await fs.writeJson(DATA_FILE, {});
  console.log('🤖 UF Stat Bot Ready!');
}
init();

client.once('clientReady', () => console.log(`Logged in as ${client.user.tag}`));

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content;
  const data = await fs.readJson(DATA_FILE);

  if (content === '!viewstats') {
    const players = Object.keys(data);
    if (!players.length) return message.reply("No players found!");
    
    const embed = new EmbedBuilder()
      .setTitle("📋 UF Players")
      .setDescription(players.map((p, i) => `${i+1}. ${p}`).join('\n'))
      .setColor(0x00ff00);
    message.reply({ embeds: [embed] });
  }

  if (content === '!leaderboard') {
    const leaders = Object.entries(data)
      .map(([name, stats]) => {
        let pts = 0;
        if (stats.Passing?.TDS) pts += stats.Passing.TDS * 6;
        if (stats.Receiving?.TDS) pts += stats.Receiving.TDS * 6;
        if (stats.Rushing?.TDS) pts += stats.Rushing.TDS * 6;
        if (stats.Defense?.SACKS) pts += stats.Defense.SACKS * 2;
        return { name, pts };
      })
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 10);

    const embed = new EmbedBuilder()
      .setTitle("🏆 UF Leaderboard")
      .setDescription(leaders.map((l, i) => `${i+1}. **${l.name}** - ${l.pts} pts`).join('\n'))
      .setColor(0xffd700);
    message.reply({ embeds: [embed] });
  }

  if (content.startsWith('!scan') && message.attachments.size > 0) {
    await message.reply("🤖 Scanning images... please wait...");
    
    const attachments = [...message.attachments.values()];
    let combinedStats = {};
    let playerName = "Unknown";

    for (let i = 0; i < attachments.length; i++) {
      const url = attachments[i].url;
      const result = await scanImage(url);
      
      if (result) {
        playerName = result.name;
        combinedStats = mergeStats(combinedStats, result.stats);
      }
    }

    if (playerName === "Unknown") {
      return message.reply("❌ Could not read stats from images!");
    }

    data[playerName] = mergeStats(data[playerName] || {}, combinedStats);
    await fs.writeJson(DATA_FILE, data);

    const embed = new EmbedBuilder()
      .setTitle(`✅ Scanned ${attachments.length} Images`)
      .setDescription(`**${playerName}** stats saved!`)
      .addFields(
        { name: 'Passing YDS', value: `${data[playerName].Passing?.YARDS || 0}`, inline: true },
        { name: 'TDS', value: `${(data[playerName].Passing?.TDS || 0) + (data[playerName].Receiving?.TDS || 0) + (data[playerName].Rushing?.TDS || 0)}`, inline: true }
      )
      .setColor(0x00ff00);
    message.reply({ embeds: [embed] });
  }
});

function mergeStats(existing, newStats) {
  for (const cat in newStats) {
    if (!existing[cat]) existing[cat] = {};
    for (const key in newStats[cat]) {
      existing[cat][key] = (existing[cat][key] || 0) + newStats[cat][key];
    }
  }
  return existing;
}

async function scanImage(imageUrl) {
  try {
    console.log("🤖 Scanning:", imageUrl);
    const { data: { text } } = await Tesseract.recognize(imageUrl, 'eng');
    console.log("📝 Found text:", text);
    
    return parseStats(text);
  } catch (err) {
    console.error("Scan error:", err);
    return null;
  }
}

function parseStats(text) {
  const lines = text.toLowerCase().split('\n').filter(l => l.trim());
  
  let playerName = "Unknown";
  let stats = {};
  
  // Look for player name (usually first line)
  for (const line of lines.slice(0, 3)) {
    if (!line.match(/\d/) && line.length > 2 && line.length < 30) {
      playerName = line.charAt(0).toUpperCase() + line.slice(1);
      break;
    }
  }
  
  // Parse numbers (key value pairs)
  const numbers = text.match(/([a-z]+)\s+(\d+)/gi) || [];
  
  for (const num of numbers) {
    const match = num.match(/([a-z]+)\s+(\d+)/i);
    if (match) {
      const key = match[1].toUpperCase();
      const val = parseInt(match[2]);
      
      if (['CMP', 'ATT', 'YARDS', 'TDS', 'INTS', 'FUMBLES', 'RECS', 'SACKS', 'TACKLES'].includes(key)) {
        if (!stats.Passing) stats.Passing = {};
        stats.Passing[key] = val;
      }
    }
  }
  
  if (Object.keys(stats).length === 0) return null;
  
  return { name: playerName, stats };
}

client.login(process.env.BOT_TOKEN);
