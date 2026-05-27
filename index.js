const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const Tesseract = require("tesseract.js");
const fs = require("fs");

const TOKEN = process.env.TOKEN;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let stats = {};
let games = [];

if (fs.existsSync("./stats.json")) stats = JSON.parse(fs.readFileSync("./stats.json"));
if (fs.existsSync("./games.json")) games = JSON.parse(fs.readFileSync("./games.json"));

function saveAll() {
    fs.writeFileSync("./stats.json", JSON.stringify(stats, null, 2));
    fs.writeFileSync("./games.json", JSON.stringify(games, null, 2));
}

function parseUF(text) {
    const lines = text.split("\n");
    const results = [];

    for (let line of lines) {
        line = line.replace(/\s+/g, " ").trim();

        const match = line.match(
            /([a-zA-Z0-9_]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/
        );

        if (match) {
            results.push({
                name: match[1],
                cmp: +match[2],
                att: +match[3],
                yards: +match[4],
                td: +match[5],
                int: +match[6]
            });
        }
    }

    return results;
}

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // 🏈 UPLOAD GAME IMAGE
    if (message.content.startsWith("!game")) {
        const img = message.attachments.first();
        if (!img) return message.reply("Upload a UF stat image.");

        const msg = await message.reply("Processing game stats... 🧠");

        const result = await Tesseract.recognize(img.url, "eng");
        const text = result.data.text;

        const parsed = parseUF(text);

        if (parsed.length === 0) {
            return msg.edit("❌ Could not read stats. Try clearer image.");
        }

        const gameID = `GAME-${Date.now()}`;

        let gameRecord = {
            id: gameID,
            players: parsed
        };

        games.push(gameRecord);

        for (const p of parsed) {
            if (!stats[p.name]) {
                stats[p.name] = {
                    passYards: 0,
                    completions: 0,
                    attempts: 0,
                    tds: 0,
                    ints: 0,
                    games: 0
                };
            }

            stats[p.name].passYards += p.yards;
            stats[p.name].completions += p.cmp;
            stats[p.name].attempts += p.att;
            stats[p.name].tds += p.td;
            stats[p.name].ints += p.int;
            stats[p.name].games += 1;
        }

        saveAll();

        msg.edit(`✅ Game saved as **${gameID}** with ${parsed.length} players.`);
    }

    // 📊 PLAYER STATS
    if (message.content.startsWith("!stats")) {
        const name = message.content.split(" ")[1];
        if (!stats[name]) return message.reply("No player found.");

        const s = stats[name];

        const embed = new EmbedBuilder()
            .setTitle(`🏈 ${name} Stats`)
            .addFields(
                { name: "Passing Yards", value: String(s.passYards) },
                { name: "TDs", value: String(s.tds) },
                { name: "INTs", value: String(s.ints) },
                { name: "Games", value: String(s.games) }
            );

        message.reply({ embeds: [embed] });
    }

    // 🏆 LEADERBOARD
    if (message.content.startsWith("!leaderboard")) {
        const top = Object.entries(stats)
            .sort((a, b) => b[1].passYards - a[1].passYards)
            .slice(0, 10);

        let text = "🏆 UF PRO LEADERS\n\n";

        for (let i = 0; i < top.length; i++) {
            text += `${i + 1}. ${top[i][0]} - ${top[i][1].passYards} YDS\n`;
        }

        message.reply(text);
    }

    // 📁 GAME HISTORY
    if (message.content.startsWith("!games")) {
        let text = "📁 RECENT GAMES\n\n";

        games.slice(-5).forEach(g => {
            text += `${g.id} - ${g.players.length} players\n`;
        });

        message.reply(text);
    }
});

client.login(TOKEN);
