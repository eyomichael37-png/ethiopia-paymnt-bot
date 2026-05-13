const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const dotenv = require('dotenv');
const db = require('./database/db');
const accounts = require('./config/accounts');
const { handleAdminCommand } = require('./admin/admin');

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_USER_ID);

if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is required!');
    process.exit(1);
}

// Create bot WITHOUT polling - for webhook mode
const bot = new TelegramBot(token);
const app = express();

// Parse JSON bodies
app.use(express.json());

// Keep track of user states - using simple object for better persistence
const userSessions = {};

// ============= BOT COMMANDS MENU =============
const botCommands = [
    { command: 'start', description: '🔄 Start the bot and register' },
    { command: 'pay', description: '💳 Make a payment' },
    { command: 'balance', description: '💰 Check your payment history' },
    { command: 'phone', description: '📱 Update your phone number' },
    { command: 'help', description: '❓ Get help and instructions' },
    { command: 'cancel', description: '❌ Cancel current operation' }
];

// Set commands menu
bot.setMyCommands(botCommands).catch(err => console.error('Error setting commands:', err.message));

// ============= WEBHOOK ENDPOINT =============
app.post(`/webhook/${token}`, (req, res) => {
    try {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    } catch (error) {
        console.error('Error processing update:', error);
        res.sendStatus(500);
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        webhook: 'active',
        activeSessions: Object.keys(userSessions).length
    });
});

// ============= COMMAND HANDLERS =============

// Start command
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    
    console.log(`/start command from user ${user.id}`);
    
    db.registerUser({
        id: user.id,
        username: user.username || '',
        first_name: user.first_name || '',
        last_name: user.last_name || ''
    });
    
    // Clear any existing session for this user
    delete userSessions[user.id];
    
    const welcomeMessage = `
🎉 *WELCOME TO ETHIOPAY BOT!* 🎉

Hello ${user.first_name || 'Valued Customer'}! 

*Your Trusted Payment Platform for Ethiopia*

✅ *You have been successfully registered!*

━━━━━━━━━━━━━━━━━━━━━━
📌 *Quick Commands:*
━━━━━━━━━━━━━━━━━━━━━━

💳 */pay* - Make a payment
💰 */balance* - Check payment history
📱 */phone* - Update your phone number
❓ */help* - Get detailed instructions

━━━━━━━━━━━━━━━━━━━━━━
🏦 *Payment Methods Accepted:*
━━━━━━━━━━━━━━━━━━━━━━

📱 *Mobile Money:* Telebirr, M-Pesa, CBE Birr
🏦 *Banks:* CBE, Dashen, Awash, Abyssinia, Hibret, CBO

*Type /pay to get started!* 💰
    `;
    
    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
    bot.sendMessage(ADMIN_ID, `👤 New user registered: ${user.first_name} @${user.username || 'N/A'} (${user.id})`);
});

// Pay command
bot.onText(/\/pay/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    console.log(`/pay command from user ${userId}`);
    
    // Clear any existing session
    delete userSessions[userId];
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📱 MOBILE MONEY', callback_data: 'cat_mobile' }],
                [{ text: '🏦 BANK TRANSFER', callback_data: 'cat_bank' }],
                [{ text: '❌ Cancel', callback_data: 'cancel_payment' }]
            ]
        }
    };
    
    bot.sendMessage(chatId, '💰 *Select payment method:*', {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
    });
});

// Balance command
bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const payments = db.getUserPayments(userId);
    const approvedTotal = payments
        .filter(p => p.status === 'approved')
        .reduce((sum, p) => sum + parseFloat(p.amount), 0);
    
    let historyMessage = `📊 *YOUR PAYMENT HISTORY*\n\n💰 Total Paid: ${approvedTotal.toLocaleString()} ETB\n📝 Transactions: ${payments.length}\n\n`;
    
    if (payments.length === 0) {
        historyMessage += `No payments yet. Use /pay to make a payment!`;
    } else {
        historyMessage += `*Recent:*\n`;
        payments.slice(0, 5).forEach(p => {
            const emoji = p.status === 'approved' ? '✅' : p.status === 'rejected' ? '❌' : '⏳';
            historyMessage += `${emoji} #${p.id} - ${p.amount} ETB (${p.status})\n`;
        });
    }
    
    bot.sendMessage(chatId, historyMessage, { parse_mode: 'Markdown' });
});

// Phone command
bot.onText(/\/phone/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    userSessions[userId] = { step: 'awaiting_phone' };
    bot.sendMessage(chatId, '📱 *Please send your phone number*\nFormat: 0912345678', { parse_mode: 'Markdown' });
});

// Help command
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    
    const helpMessage = `
❓ *HOW TO USE ETHIOPAY BOT*

1️⃣ Type /pay to start
2️⃣ Choose payment method
3️⃣ Enter amount
4️⃣ Send payment to provided account
5️⃣ Send screenshot receipt
6️⃣ Wait for verification (5-30 min)

*Commands:*
/pay - Make payment
/balance - Check history
/phone - Update phone
/cancel - Cancel operation

*Contact support* for assistance.
    `;
    
    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Cancel command
bot.onText(/\/cancel/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    delete userSessions[userId];
    bot.sendMessage(chatId, '❌ Operation cancelled. Type /pay to start over.');
});

// ============= CALLBACK QUERIES =============

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const data = callbackQuery.data;
    
    console.log(`Callback: ${data} from user ${userId}`);
    
    if (data === 'cancel_payment') {
        delete userSessions[userId];
        bot.editMessageText('❌ Payment cancelled.', {
            chat_id: chatId,
            message_id: msg.message_id
        });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
    
    if (data === 'cat_mobile') {
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 Telebirr', callback_data: 'provider_telebirr' }],
                    [{ text: '📱 M-Pesa', callback_data: 'provider_mpesa' }],
                    [{ text: '📱 CBE Birr', callback_data: 'provider_cbe_birr' }],
                    [{ text: '🔙 Back', callback_data: 'back_to_categories' }]
                ]
            }
        };
        bot.editMessageText('📱 *Select Mobile Money:*', {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup
        });
    }
    else if (data === 'cat_bank') {
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🏦 CBE', callback_data: 'provider_commercial_bank_of_ethiopia' }],
                    [{ text: '🏦 Dashen Bank', callback_data: 'provider_dashen_bank' }],
                    [{ text: '🏦 Awash Bank', callback_data: 'provider_awash_bank' }],
                    [{ text: '🏦 Abyssinia Bank', callback_data: 'provider_abyssinia_bank' }],
                    [{ text: '🏦 Hibret Bank', callback_data: 'provider_hibret_bank' }],
                    [{ text: '🏦 CBO', callback_data: 'provider_cooperative_bank' }],
                    [{ text: '🔙 Back', callback_data: 'back_to_categories' }]
                ]
            }
        };
        bot.editMessageText('🏦 *Select Bank:*', {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup
        });
    }
    else if (data === 'back_to_categories') {
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 MOBILE MONEY', callback_data: 'cat_mobile' }],
                    [{ text: '🏦 BANK TRANSFER', callback_data: 'cat_bank' }]
                ]
            }
        };
        bot.editMessageText('💰 *Select payment method:*', {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup
        });
    }
    else if (data.startsWith('provider_')) {
        const providerKey = data.replace('provider_', '');
        let accountDetails = accounts.banks[providerKey] || accounts.wallets[providerKey];
        
        if (accountDetails) {
            // Store session with the provider info
            userSessions[userId] = { 
                step: 'awaiting_amount', 
                provider: accountDetails.name,
                providerKey: providerKey,
                accountDetails: accountDetails
            };
            
            console.log(`Session saved for user ${userId}:`, userSessions[userId]);
            
            const amountMessage = `💰 *${accountDetails.name}*\n\nPlease enter the amount in ETB:\n\nExample: 500 or 1,000`;
            
            bot.editMessageText(amountMessage, {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown'
            });
        }
    }
    
    bot.answerCallbackQuery(callbackQuery.id);
});

// ============= MAIN MESSAGE HANDLER =============

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    console.log(`Message from ${userId}: "${text}" | Has photo: ${!!msg.photo}`);
    
    // Ignore commands
    if (text && text.startsWith('/')) {
        console.log(`Ignoring command: ${text}`);
        return;
    }
    
    // Check if user has an active session
    const session = userSessions[userId];
    console.log(`Session for ${userId}:`, session);
    
    // NO ACTIVE SESSION
    if (!session) {
        if (text) {
            bot.sendMessage(chatId, '❓ *I didn\'t understand that.*\n\nPlease use /pay to start a payment or /help for commands.', {
                parse_mode: 'Markdown'
            });
        }
        return;
    }
    
    // AWAITING PHONE NUMBER
    if (session.step === 'awaiting_phone') {
        const phoneRegex = /^0[79][0-9]{8}$/;
        if (phoneRegex.test(text)) {
            db.updateUserPhone(userId, text);
            delete userSessions[userId];
            bot.sendMessage(chatId, `✅ *Phone updated!*\n\nYour phone: ${text}\n\nUse /pay to make a payment.`, {
                parse_mode: 'Markdown'
            });
        } else {
            bot.sendMessage(chatId, '❌ *Invalid phone number*\n\nPlease use format: 0912345678\n\nExample: 0911223344', {
                parse_mode: 'Markdown'
            });
        }
        return;
    }
    
    // AWAITING AMOUNT - THIS IS THE KEY SECTION
    if (session.step === 'awaiting_amount') {
        console.log(`Processing amount: "${text}" for user ${userId}`);
        
        // Parse the amount
        const cleanAmount = text.replace(/,/g, '').trim();
        const amount = parseFloat(cleanAmount);
        
        if (isNaN(amount)) {
            bot.sendMessage(chatId, '❌ *Invalid amount*\n\nPlease enter a valid number.\n\nExample: 500 or 1000', {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        if (amount < 10) {
            bot.sendMessage(chatId, '❌ *Amount too low*\n\nMinimum payment is 10 ETB.', {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        if (amount > 100000) {
            bot.sendMessage(chatId, '❌ *Amount too high*\n\nMaximum payment is 100,000 ETB.', {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        // Create payment in database
        const payment = db.createPayment(userId, amount, session.provider, session.accountDetails);
        console.log(`Payment created: #${payment.id} for ${amount} ETB`);
        
        // Update session to awaiting receipt
        userSessions[userId] = {
            step: 'awaiting_receipt',
            paymentId: payment.id,
            amount: amount,
            provider: session.provider,
            accountDetails: session.accountDetails
        };
        
        // Build payment instructions message
        let instructions = `💳 *PAYMENT INSTRUCTIONS*\n\n`;
        instructions += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        instructions += `📋 *Payment Details:*\n`;
        instructions += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        instructions += `💰 *Amount:* ${amount.toLocaleString()} ETB\n`;
        instructions += `🆔 *Payment ID:* #${payment.id}\n`;
        instructions += `🏦 *Provider:* ${session.provider}\n\n`;
        instructions += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        instructions += `📌 *Send payment to:*\n`;
        instructions += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        if (session.accountDetails.accountNumber) {
            instructions += `📱 *Account Number:* ${session.accountDetails.accountNumber}\n`;
        }
        if (session.accountDetails.accountName) {
            instructions += `👤 *Account Name:* ${session.accountDetails.accountName}\n`;
        }
        if (session.accountDetails.branch) {
            instructions += `🏛️ *Branch:* ${session.accountDetails.branch}\n`;
        }
        
        instructions += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
        instructions += `✅ *Next Step:*\n`;
        instructions += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        instructions += `1️⃣ Make the payment to the above account\n`;
        instructions += `2️⃣ Take a screenshot of the receipt\n`;
        instructions += `3️⃣ Send the screenshot here\n`;
        instructions += `4️⃣ Wait for verification (5-30 min)\n\n`;
        instructions += `⚠️ *Important:* Your payment will only be processed after you send the receipt screenshot.\n\n`;
        instructions += `*Send your receipt screenshot now:* 📸`;
        
        bot.sendMessage(chatId, instructions, { parse_mode: 'Markdown' });
        return;
    }
    
    // AWAITING RECEIPT
    if (session.step === 'awaiting_receipt') {
        if (msg.photo) {
            const photo = msg.photo[msg.photo.length - 1];
            const paymentId = session.paymentId;
            
            console.log(`Receipt received for payment #${paymentId}`);
            
            db.updatePaymentReceipt(paymentId, photo.file_id, msg.caption || '');
            
            // Clear session
            delete userSessions[userId];
            
            bot.sendMessage(chatId, `✅ *RECEIPT SUBMITTED!*\n\n━━━━━━━━━━━━━━━━━━━━━━\n📋 Payment #${paymentId}\n💰 Amount: ${session.amount} ETB\n⏳ Status: PENDING VERIFICATION\n━━━━━━━━━━━━━━━━━━━━━━\n\nYou will be notified once the admin verifies your payment.\n\nEstimated time: 5-30 minutes\n\nType /balance to check status anytime.`, {
                parse_mode: 'Markdown'
            });
            
            // Notify admin
            const payment = db.getPayment(paymentId);
            const user = db.getUser(userId);
            
            bot.sendMessage(ADMIN_ID, `🔔 *NEW PAYMENT RECEIPT!*\n\n━━━━━━━━━━━━━━━━━━━━━━\n👤 User: ${user?.firstName || userId}\n🆔 Payment ID: #${payment.id}\n💰 Amount: ${payment.amount} ETB\n🏦 Provider: ${payment.provider}\n━━━━━━━━━━━━━━━━━━━━━━\n⚡ /approve ${payment.id} - ✅ Approve\n❌ /reject ${payment.id} [reason]`, {
                parse_mode: 'Markdown'
            });
        } else {
            bot.sendMessage(chatId, '❌ *Please send a screenshot of your payment receipt.*\n\nTake a photo/screenshot of the transaction confirmation and send it here.', {
                parse_mode: 'Markdown'
            });
        }
        return;
    }
});

// ============= ADMIN COMMANDS =============

bot.onText(/^\/(approve|reject|pending|view|stats)(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (userId !== ADMIN_ID) {
        bot.sendMessage(chatId, '⛔ *Unauthorized*', { parse_mode: 'Markdown' });
        return;
    }
    
    const command = match[1];
    const args = match[2] ? match[2].trim() : '';
    
    await handleAdminCommand(bot, command, args, chatId, db);
});

// ============= START SERVER =============

const PORT = process.env.PORT || 3000;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `https://ethiopia-paymnt-bot.onrender.com`;

app.listen(PORT, async () => {
    console.log(`🌐 Server running on port ${PORT}`);
    
    const webhookUrl = `${RENDER_URL}/webhook/${token}`;
    console.log(`🔗 Setting webhook to: ${webhookUrl}`);
    
    try {
        await bot.deleteWebHook();
        const result = await bot.setWebHook(webhookUrl);
        console.log(result ? '✅ Webhook set successfully!' : '❌ Failed to set webhook');
    } catch (error) {
        console.error('❌ Webhook error:', error.message);
    }
    
    console.log('🤖 Ethiopia Payment Bot is running');
    console.log(`✅ Admin ID: ${ADMIN_ID}`);
});