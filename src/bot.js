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

// Keep track of user states
const userStates = new Map();

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
        webhook: 'active'
    });
});

// ============= COMMAND HANDLERS =============

// Start command
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    
    db.registerUser({
        id: user.id,
        username: user.username || '',
        first_name: user.first_name || '',
        last_name: user.last_name || ''
    });
    
    userStates.delete(chatId);
    
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
    
    userStates.delete(userId);
    
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
    
    userStates.set(userId, { step: 'awaiting_phone' });
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
    
    userStates.delete(userId);
    bot.sendMessage(chatId, '❌ Operation cancelled. Type /pay to start over.');
});

// ============= CALLBACK QUERIES =============

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const data = callbackQuery.data;
    
    console.log(`Callback received: ${data} from user ${userId}`); // Debug log
    
    if (data === 'cancel_payment') {
        userStates.delete(userId);
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
            userStates.set(userId, { 
                step: 'awaiting_amount', 
                provider: accountDetails.name,
                accountDetails: accountDetails
            });
            
            console.log(`User ${userId} set to awaiting_amount for ${accountDetails.name}`); // Debug log
            
            bot.editMessageText(`💰 *${accountDetails.name}*\n\nPlease enter the amount in ETB:\n\nExample: 500 or 1,000`, {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown'
            });
        }
    }
    
    bot.answerCallbackQuery(callbackQuery.id);
});

// ============= MESSAGE HANDLER - THIS IS THE CRITICAL PART =============

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    console.log(`Message received: "${text}" from user ${userId}`); // Debug log
    
    // Ignore commands (messages starting with /)
    if (text && text.startsWith('/')) {
        console.log(`Ignoring command: ${text}`);
        return;
    }
    
    // Get user state
    const state = userStates.get(userId);
    console.log(`User state:`, state); // Debug log
    
    // CASE 1: No active state - user hasn't started a payment
    if (!state) {
        if (text && !text.startsWith('/')) {
            bot.sendMessage(chatId, '❓ *I didn\'t understand that.*\n\nPlease use one of these commands:\n/pay - Make a payment\n/balance - Check balance\n/phone - Update phone\n/help - Get help', {
                parse_mode: 'Markdown'
            });
        }
        return;
    }
    
    // CASE 2: Awaiting phone number
    if (state.step === 'awaiting_phone') {
        const phoneRegex = /^0[79][0-9]{8}$/;
        if (phoneRegex.test(text)) {
            db.updateUserPhone(userId, text);
            userStates.delete(userId);
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
    
    // CASE 3: Awaiting amount - THIS IS WHERE YOUR BOT WAS FAILING
    if (state.step === 'awaiting_amount') {
        console.log(`Processing amount input: "${text}"`);
        
        // Clean the amount (remove commas, spaces)
        const cleanAmount = text.replace(/,/g, '').trim();
        const amount = parseFloat(cleanAmount);
        
        console.log(`Parsed amount: ${amount}`);
        
        // Validate amount
        if (isNaN(amount)) {
            bot.sendMessage(chatId, '❌ *Invalid amount*\n\nPlease enter a valid number.\n\nExample: 500 or 1000', {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        if (amount < 10) {
            bot.sendMessage(chatId, '❌ *Amount too low*\n\nMinimum payment is 10 ETB.\n\nPlease enter a higher amount.', {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        if (amount > 100000) {
            bot.sendMessage(chatId, '❌ *Amount too high*\n\nMaximum payment is 100,000 ETB per transaction.\n\nPlease enter a lower amount.', {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        // Create payment record
        const payment = db.createPayment(userId, amount, state.provider, state.accountDetails);
        console.log(`Payment created: #${payment.id}`);
        
        // Update state to awaiting receipt
        userStates.set(userId, { 
            step: 'awaiting_receipt', 
            paymentId: payment.id,
            amount: amount,
            provider: state.provider,
            accountDetails: state.accountDetails
        });
        
        // Build payment instructions
        let instructions = `💳 *PAYMENT INSTRUCTIONS*\n\n`;
        instructions += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        instructions += `📋 *Payment Details:*\n`;
        instructions += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        instructions += `💰 *Amount:* ${amount.toLocaleString()} ETB\n`;
        instructions += `🆔 *Payment ID:* #${payment.id}\n`;
        instructions += `🏦 *Provider:* ${state.provider}\n\n`;
        instructions += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        instructions += `📌 *Send payment to:*\n`;
        instructions += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        if (state.accountDetails.accountNumber) {
            instructions += `📱 *Account Number:* ${state.accountDetails.accountNumber}\n`;
        }
        if (state.accountDetails.accountName) {
            instructions += `👤 *Account Name:* ${state.accountDetails.accountName}\n`;
        }
        if (state.accountDetails.branch) {
            instructions += `🏛️ *Branch:* ${state.accountDetails.branch}\n`;
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
    
    // CASE 4: Awaiting receipt with photo
    if (state.step === 'awaiting_receipt') {
        if (msg.photo) {
            const photo = msg.photo[msg.photo.length - 1];
            const paymentId = state.paymentId;
            
            console.log(`Receipt received for payment #${paymentId}`);
            
            db.updatePaymentReceipt(paymentId, photo.file_id, msg.caption || '');
            userStates.delete(userId);
            
            bot.sendMessage(chatId, `✅ *RECEIPT SUBMITTED!*\n\n━━━━━━━━━━━━━━━━━━━━━━\n📋 Payment #${paymentId}\n💰 Amount: ${state.amount} ETB\n⏳ Status: PENDING VERIFICATION\n━━━━━━━━━━━━━━━━━━━━━━\n\nYou will be notified once the admin verifies your payment.\n\nEstimated time: 5-30 minutes\n\nType /balance to check status anytime.`, {
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
        bot.sendMessage(chatId, '⛔ *Unauthorized*\n\nYou are not authorized to use admin commands.', {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    const command = match[1];
    const args = match[2] ? match[2].trim() : '';
    
    await handleAdminCommand(bot, command, args, chatId, db);
});

// ============= START SERVER & SET WEBHOOK =============

const PORT = process.env.PORT || 3000;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `https://ethiopia-paymnt-bot.onrender.com`;

app.listen(PORT, async () => {
    console.log(`🌐 Server running on port ${PORT}`);
    
    const webhookUrl = `${RENDER_URL}/webhook/${token}`;
    console.log(`🔗 Setting webhook to: ${webhookUrl}`);
    
    try {
        const result = await bot.setWebHook(webhookUrl);
        if (result) {
            console.log('✅ Webhook set successfully!');
        } else {
            console.log('❌ Failed to set webhook');
        }
    } catch (error) {
        console.error('❌ Webhook error:', error.message);
    }
    
    console.log('🤖 Ethiopia Payment Bot is running in WEBHOOK mode');
    console.log(`✅ Admin ID: ${ADMIN_ID}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await bot.deleteWebHook();
    process.exit(0);
});