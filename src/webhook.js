const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token);
const app = express();

app.use(express.json());

// Webhook endpoint
app.post(`/webhook/${token}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Set webhook
const WEBHOOK_URL = `https://${process.env.RENDER_EXTERNAL_URL}/webhook/${token}`;
bot.setWebHook(WEBHOOK_URL);

app.listen(process.env.PORT || 3000, () => {
    console.log(`Webhook server running on port ${process.env.PORT}`);
});