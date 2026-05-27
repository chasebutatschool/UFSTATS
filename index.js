const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs-extra');

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

client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));

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
    const attachments = [...message.attachments.values()];
    let combinedStats = {};
    let playerName = "Unknown";

    for (let i = 0; i < attachments.length; i++) {
      const result = parseFakeStats(i);
      playerName = result.name;
      combinedStats = mergeStats(combinedStats, result.stats);
    }

    data[playerName] = mergeStats(data[playerName] || {}, combinedStats);
    await fs.writeJson(DATA_FILE, data);

    const embed = new EmbedBuilder()
      .setTitle(`✅ Scanned ${attachments.length} Images`)
      .setDescription(`**${playerName}** stats saved!`)
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

function parseFakeStats(index) {
  const mockData = [
    { name: "Tom Brady", stats: { Passing: { CMP: 20, ATT: 30, YARDS: 250, TDS: 3, INTS: 1 } } },
    { name: "Tom Brady", stats: { Rushing: { ATT: 2, YARDS: 5, TDS: 0 } } }
  ];
  return mockData[index % mockData.length];
}

client.login(process.env.BOT_TOKEN);
