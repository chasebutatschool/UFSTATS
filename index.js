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
      return message.reply("❌ Could not read player name!");
    }

    // Check if we got actual stats
    const totalVals = Object.values(combinedStats).reduce((acc, cat) => {
      return acc + Object.values(cat).reduce((a, v) => a + v, 0);
    }, 0);

    if (totalVals === 0) {
      return message.reply(`❌ Could not read stats numbers!\n\nPlayer found: **${playerName}**\nBut no stats detected.`);
    }

    data[playerName] = mergeStats(data[playerName] || {}, combinedStats);
    await fs.writeJson(DATA_FILE, data);

    const p = data[playerName];
    const totalTDs = (p.Passing?.TDS || 0) + (p.Receiving?.TDS || 0) + (p.Rushing?.TDS || 0);
    const totalYards = (p.Passing?.YARDS || 0) + (p.Receiving?.YARDS || 0) + (p.Rushing?.YARDS || 0);

    const embed = new EmbedBuilder()
      .setTitle(`✅ Scanned ${attachments.length} Images`)
      .setDescription(`**${playerName}** stats saved!`)
      .addFields(
        { name: 'Passing', value: `${p.Passing?.YARDS || 0} YDS / ${p.Passing?.TDS || 0} TDS`, inline: true },
        { name: 'Receiving', value: `${p.Receiving?.YARDS || 0} YDS / ${p.Receiving?.TDS || 0} TDS`, inline: true },
        { name: 'Rushing', value: `${p.Rushing?.YARDS || 0} YDS / ${p.Rushing?.TDS || 0} TDS`, inline: true },
        { name: 'TOTAL', value: `${totalYards} YDS / ${totalTDs} TDS`, inline: false }
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
    const { data: { text } } = await Tesseract.recognize(imageUrl, 'eng');
    console.log("RAW:", text);
    return parseSmart(text);
  } catch (err) {
    console.error("Scan error:", err);
    return null;
  }
}

function parseSmart(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  let playerName = "Unknown";
  let stats = {};
  let currentCategory = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = line.toUpperCase();
    
    // Detect category
    if (upper.includes('PASSING') && !upper.includes('PLAYER')) {
      currentCategory = 'Passing';
    } else if (upper.includes('RECEIVING')) {
      currentCategory = 'Receiving';
    } else if (upper.includes('RUSHING')) {
      currentCategory = 'Rushing';
    } else if (upper.includes('DEFENSE') || upper.includes('D-LINE') || upper.includes('CORNERBACK')) {
      currentCategory = 'Defense';
    }
    
    // Skip header lines
    if (upper.includes('PLAYER:') || upper.includes('CMP') || upper.includes('ATT') || upper.includes('YARDS')) {
      continue;
    }
    
    // Find data line: has letters AND numbers
    if (currentCategory && line.match(/[A-Za-z]/) && line.match(/\d\d+/)) {
      // Extract ALL numbers from this line
      const numbers = line.match(/\d+/g);
      
      if (numbers && numbers.length > 0) {
        // First try to find player name
        const words = line.split(/\s+/).filter(w => w.match(/[A-Za-z]/));
        for (const word of words) {
          if (!word.toUpperCase().includes('PLAYER') && word.length > 2) {
            playerName = word.replace(/[^a-zA-Z]/g, '');
            break;
          }
        }
        
        // Map numbers to stats based on category
        if (currentCategory === 'Passing' && numbers.length >= 2) {
          stats.Passing = {
            CMP: parseInt(numbers[0]) || 0,
            ATT: parseInt(numbers[1]) || 0,
            YARDS: parseInt(numbers[2]) || 0,
            TDS: parseInt(numbers[3]) || 0,
            INTS: parseInt(numbers[4]) || 0
          };
        }
        else if (currentCategory === 'Receiving' && numbers.length >= 1) {
          stats.Receiving = {
            RECS: parseInt(numbers[0]) || 0,
            YARDS: parseInt(numbers[1]) || 0,
            TDS: parseInt(numbers[2]) || 0
          };
        }
        else if (currentCategory === 'Rushing' && numbers.length >= 1) {
          stats.Rushing = {
            ATT: parseInt(numbers[0]) || 0,
            YARDS: parseInt(numbers[1]) || 0,
            TDS: parseInt(numbers[2]) || 0
          };
        }
        else if (currentCategory === 'Defense' && numbers.length >= 1) {
          stats.Defense = {
            TACKLES: parseInt(numbers[0]) || 0,
            SACKS: parseInt(numbers[1]) || 0,
            INT: parseInt(numbers[2]) || 0
          };
        }
      }
    }
  }
  
  console.log("Result:", playerName, stats);
  
  if (Object.keys(stats).length === 0) return null;
  
  return { name: playerName, stats: stats };
}

client.login(process.env.BOT_TOKEN);
