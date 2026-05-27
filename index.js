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
    let rawText = "";

    for (let i = 0; i < attachments.length; i++) {
      const url = attachments[i].url;
      const result = await scanImage(url);
      
      if (result) {
        rawText += result.rawText + "\n";
        playerName = result.name;
        combinedStats = mergeStats(combinedStats, result.stats);
      }
    }

    console.log("Raw text found:", rawText);

    if (playerName === "Unknown") {
      return message.reply("❌ Could not read player name!");
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
    console.log("🤖 Scanning:", imageUrl);
    const { data: { text } } = await Tesseract.recognize(imageUrl, 'eng');
    console.log("📝 Raw text:", text);
    return parseStats(text);
  } catch (err) {
    console.error("Scan error:", err);
    return null;
  }
}

function parseStats(text) {
  const lines = text.split('\n').filter(l => l.trim());
  let playerName = "Unknown";
  let stats = {};
  
  // Find player name (first non-number line)
  for (const line of lines.slice(0, 5)) {
    const clean = line.trim();
    if (clean.length > 2 && clean.length < 30 && !clean.match(/^\d/) && !clean.match(/[0-9]{4,}/)) {
      playerName = clean.replace(/[^a-zA-Z ]/g, '').trim();
      if (playerName.length > 1) break;
    }
  }
  
  // Look for stat patterns (letters followed by numbers)
  const allText = text.toUpperCase();
  
  // Passing stats
  if (allText.includes('PASSING') || allText.includes('CMP') || allText.includes('ATT')) {
    stats.Passing = {};
    const cmp = text.match(/CMP[\s:]*(\d+)/i) || text.match(/(\d+)\s*\/\s*\d+/i);
    const att = text.match(/ATT[\s:]*(\d+)/i);
    const yds = text.match(/YARDS?[\s:]*(\d+)/i) || text.match(/YDS[\s:]*(\d+)/i);
    const tds = text.match(/TD[S]?[\s:]*(\d+)/i);
    const ints = text.match(/INT[S]?[\s:]*(\d+)/i);
    
    if (cmp) stats.Passing.CMP = parseInt(cmp[1] || cmp[0]);
    if (att) stats.Passing.ATT = parseInt(att[1]);
    if (yds) stats.Passing.YARDS = parseInt(yds[1] || yds[0]);
    if (tds) stats.Passing.TDS = parseInt(tds[1] || tds[0]);
    if (ints) stats.Passing.INTS = parseInt(ints[1] || ints[0]);
  }
  
  // Receiving stats
  if (allText.includes('RECEIVING') || allText.includes('REC')) {
    stats.Receiving = {};
    const rec = text.match(/REC(?:S)?[\s:]*(\d+)/i);
    const yds = text.match(/YARDS?[\s:]*(\d+)/i);
    const tds = text.match(/TD[S]?[\s:]*(\d+)/i);
    
    if (rec) stats.Receiving.RECS = parseInt(rec[1] || rec[0]);
    if (yds) stats.Receiving.YARDS = parseInt(yds[1] || yds[0]);
    if (tds) stats.Receiving.TDS = parseInt(tds[1] || tds[0]);
  }
  
  // Rushing stats
  if (allText.includes('RUSHING')) {
    stats.Rushing = {};
    const att = text.match(/ATT[\s:]*(\d+)/i);
    const yds = text.match(/YARDS?[\s:]*(\d+)/i);
    const tds = text.match(/TD[S]?[\s:]*(\d+)/i);
    
    if (att) stats.Rushing.ATT = parseInt(att[1]);
    if (yds) stats.Rushing.YARDS = parseInt(yds[1] || yds[0]);
    if (tds) stats.Rushing.TDS = parseInt(tds[1] || tds[0]);
  }
  
  // Defense stats
  if (allText.includes('TACKLES') || allText.includes('SACKS')) {
    stats.Defense = {};
    const tk = text.match(/TACKLES?[\s:]*(\d+)/i);
    const sk = text.match(/SACKS?[\s:]*(\d+)/i);
    const ints = text.match(/INT[S]?[\s:]*(\d+)/i);
    
    if (tk) stats.Defense.TACKLES = parseInt(tk[1] || tk[0]);
    if (sk) stats.Defense.SACKS = parseInt(sk[1] || sk[0]);
    if (ints) stats.Defense.INT = parseInt(ints[1] || ints[0]);
  }
  
  console.log("Parsed stats:", JSON.stringify(stats));
  
  if (Object.keys(stats).length === 0) return null;
  
  return { name: playerName, stats: stats, rawText: text };
}

client.login(process.env.BOT_TOKEN);
