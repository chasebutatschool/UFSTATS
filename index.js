const { Client, GatewayIntentBits } = require("discord.js");
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
const FILE = "./stats.json";

if (fs.existsSync(FILE)) {
    stats = JSON.parse(fs.readFileSync(FILE));
}

function save() {
    fs.writeFileSync(FILE, JSON.stringify(stats, null, 2));
}

// 🧠 SIMPLE PARSER (you may adjust format later)
function parseStats(text) {
    // Example expected patterns:
    // "Jake 250 pass 2 TD 40 rush"
    const lines = text.split("\n");

    const results = [];

    for (let line of lines) {
        const match = line.match(/([a-zA-Z0-9_]+).*?(\d+)\s*pass.*?(\d+)\s*rush/i);

        if (match) {
            results.push({
                name: match[1],
                pass: parseInt(match[2]),
                rush: parseInt(match[3])
            });
        }
    }

    return results;
}

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // 📸 IMAGE UPLOAD COMMAND
    if (message.content.startsWith("!uploadgame")) {
        const attachment = message.attachments.first();

        if (!attachment) {
            return message.reply("Upload an image with the command.");
        }

        message.reply("Reading stats from image...");

        const result = await Tesseract.recognize(
            attachment.url,
            "eng"
        );

        const text = result.data.text;
        console.log("OCR TEXT:", text);

        const parsed = parseStats(text);

        if (parsed.length === 0) {
            return message.reply("Couldn't detect stats. Make sure image format is clear.");
        }

        for (const p of parsed) {
            if (!stats[p.name]) {
                stats[p.name] = { pass: 0, rush: 0 };
            }

            stats[p.name].pass += p.pass;
            stats[p.name].rush += p.rush;
        }

        save();

        message.reply("Game stats added successfully 🏈");
    }

    // 📊 CHECK STATS
    if (message.content.startsWith("!stats")) {
        const name = message.content.split(" ")[1];

        if (!stats[name]) return message.reply("No stats found.");

        message.reply(
            `${name}\nPass: ${stats[name].pass}\nRush: ${stats[name].rush}`
        );
    }
});

client.login(TOKEN);
