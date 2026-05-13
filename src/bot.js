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

// Keep track of user sessions
const userSessions = {};

// ============= PACKAGE DEFINITIONS =============
const PACKAGES = {
    package1: {
        id: 1,
        name: '📦 BASIC PACKAGE',
        amount: 1000,
        price: '1,000 ETB',
        description: '✨ Perfect for starters'
    },
    package2: {
        id: 2,
        name: '📦 STANDARD PACKAGE',
        amount: 2000,
        price: '2,000 ETB',
        description: '⭐ Most popular choice'
    },
    package3: {
        id: 3,
        name: '📦 PREMIUM PACKAGE',
        amount: 3000,
        price: '3,000 ETB',
        description: '💎 Best value'
    },
    package4: {
        id: 4,
        name: '📦 GOLD PACKAGE',
        amount: 5000,
        price: '5,000 ETB',
        description: '👑 Ultimate experience'
    }
};

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
    
    delete userSessions[user.id];
    
    const welcomeMessage = `
🎉 *WELCOME TO ETHIOPAY BOT!* 🎉

Hello ${user.first_name || 'Valued Customer'}! 

*Your Trusted Payment Platform for Ethiopia*

✅ *You have been successfully registered!*

━━━━━━━━━━━━━━━━━━━━━━
📌 *Available Packages:*
━━━━━━━━━━━━━━━━━━━━━━

📦 *BASIC* - 1,000 ETB
📦 *STANDARD* - 2,000 ETB  
📦 *PREMIUM* - 3,000 ETB
📦 *GOLD* - 5,000 ETB

━━━━━━━━━━━━━━━━━━━━━━
📌 *Quick Commands:*
━━━━━━━━━━━━━━━━━━━━━━

💳 */pay* - Choose a package
💰 */balance* - Check payment history
📱 */phone* - Update your phone number
❓ */help* - Get detailed instructions

*Type /pay to get started!* 💰
    `;
    
    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
    bot.sendMessage(ADMIN_ID, `👤 New user registered: ${user.first_name} @${user.username || 'N/A'} (${user.id})`);
});

// Pay command - Show packages first
bot.onText(/\/pay/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    console.log(`/pay command from user ${userId}`);
    
    delete userSessions[userId];
    
    const packageKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📦 BASIC - 1,000 ETB', callback_data: 'package_1' }],
                [{ text: '📦 STANDARD - 2,000 ETB', callback_data: 'package_2' }],
                [{ text: '📦 PREMIUM - 3,000 ETB', callback_data: 'package_3' }],
                [{ text: '📦 GOLD - 5,000 ETB', callback_data: 'package_4' }],
                [{ text: '❌ Cancel', callback_data: 'cancel_payment' }]
            ]
        }
    };
    
    bot.sendMessage(chatId, '💰 *SELECT YOUR PACKAGE*\n\nChoose a package to continue:', {
        parse_mode: 'Markdown',
        reply_markup: packageKeyboard.reply_markup
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
        historyMessage += `*Recent Payments:*\n`;
        payments.slice(0, 5).forEach(p => {
            const emoji = p.status === 'approved' ? '✅' : p.status === 'rejected' ? '❌' : '⏳';
            const packageName = p.packageName || p.provider;
            historyMessage += `${emoji} ${packageName} - ${p.amount} ETB (${p.status})\n`;
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

━━━━━━━━━━━━━━━━━━━━━━
📌 *STEPS TO PAY:*
━━━━━━━━━━━━━━━━━━━━━━

1️⃣ Type /pay
2️⃣ Choose your package (BASIC, STANDARD, PREMIUM, GOLD)
3️⃣ Select payment method (Mobile Money or Bank)
4️⃣ Send payment to provided account
5️⃣ Send screenshot receipt
6️⃣ Wait for verification (5-30 min)

━━━━━━━━━━━━━━━━━━━━━━
📌 *PACKAGES:*
━━━━━━━━━━━━━━━━━━━━━━

• BASIC (1,000 ETB) - Perfect for starters
• STANDARD (2,000 ETB) - Most popular
• PREMIUM (3,000 ETB) - Best value
• GOLD (5,000 ETB) - Ultimate experience

━━━━━━━━━━━━━━━━━━━━━━
📌 *COMMANDS:*
━━━━━━━━━━━━━━━━━━━━━━

/pay - Make payment
/balance - Check history
/phone - Update phone
/cancel - Cancel operation

*Type /pay to get started!* 💰
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
    
    // Handle cancel
    if (data === 'cancel_payment') {
        delete userSessions[userId];
        bot.editMessageText('❌ Payment cancelled. Type /pay to start over.', {
            chat_id: chatId,
            message_id: msg.message_id
        });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
    
    // Handle package selection
    if (data.startsWith('package_')) {
        const packageId = parseInt(data.replace('package_', ''));
        const selectedPackage = Object.values(PACKAGES).find(p => p.id === packageId);
        
        if (selectedPackage) {
            // Store package in session
            userSessions[userId] = {
                step: 'awaiting_payment_method',
                package: selectedPackage,
                amount: selectedPackage.amount
            };
            
            console.log(`Package selected for user ${userId}: ${selectedPackage.name} - ${selectedPackage.amount} ETB`);
            
            // Show payment method options
            const paymentMethodKeyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📱 MOBILE MONEY', callback_data: 'payment_cat_mobile' }],
                        [{ text: '🏦 BANK TRANSFER', callback_data: 'payment_cat_bank' }],
                        [{ text: '🔙 Back to Packages', callback_data: 'back_to_packages' }],
                        [{ text: '❌ Cancel', callback_data: 'cancel_payment' }]
                    ]
                }
            };
            
            const packageMessage = `
✅ *Package Selected: ${selectedPackage.name}*

💰 *Amount:* ${selectedPackage.price}
📝 *Description:* ${selectedPackage.description}

━━━━━━━━━━━━━━━━━━━━━━
*Now select your payment method:*
            `;
            
            bot.editMessageText(packageMessage, {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: paymentMethodKeyboard.reply_markup
            });
        }
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
    
    // Handle back to packages
    if (data === 'back_to_packages') {
        const packageKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📦 BASIC - 1,000 ETB', callback_data: 'package_1' }],
                    [{ text: '📦 STANDARD - 2,000 ETB', callback_data: 'package_2' }],
                    [{ text: '📦 PREMIUM - 3,000 ETB', callback_data: 'package_3' }],
                    [{ text: '📦 GOLD - 5,000 ETB', callback_data: 'package_4' }],
                    [{ text: '❌ Cancel', callback_data: 'cancel_payment' }]
                ]
            }
        };
        bot.editMessageText('💰 *SELECT YOUR PACKAGE*\n\nChoose a package to continue:', {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'Markdown',
            reply_markup: packageKeyboard.reply_markup
        });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
    
    // Handle payment method - MOBILE MONEY
    if (data === 'payment_cat_mobile') {
        const session = userSessions[userId];
        if (!session || session.step !== 'awaiting_payment_method') {
            bot.answerCallbackQuery(callbackQuery.id);
            return;
        }
        
        const mobileKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 Telebirr', callback_data: 'provider_telebirr' }],
                    [{ text: '📱 M-Pesa', callback_data: 'provider_mpesa' }],
                    [{ text: '📱 CBE Birr', callback_data: 'provider_cbe_birr' }],
                    [{ text: '🔙 Back to Payment Methods', callback_data: 'back_to_payment_methods' }],
                    [{ text: '❌ Cancel', callback_data: 'cancel_payment' }]
                ]
            }
        };
        
        bot.editMessageText('📱 *Select Mobile Money Service:*', {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'Markdown',
            reply_markup: mobileKeyboard.reply_markup
        });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
    
    // Handle payment method - BANK TRANSFER
    if (data === 'payment_cat_bank') {
        const session = userSessions[userId];
        if (!session || session.step !== 'awaiting_payment_method') {
            bot.answerCallbackQuery(callbackQuery.id);
            return;
        }
        
        const bankKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🏦 CBE', callback_data: 'provider_commercial_bank_of_ethiopia' }],
                    [{ text: '🏦 Dashen Bank', callback_data: 'provider_dashen_bank' }],
                    [{ text: '🏦 Awash Bank', callback_data: 'provider_awash_bank' }],
                    [{ text: '🏦 Abyssinia Bank', callback_data: 'provider_abyssinia_bank' }],
                    [{ text: '🏦 Hibret Bank', callback_data: 'provider_hibret_bank' }],
                    [{ text: '🏦 CBO', callback_data: 'provider_cooperative_bank' }],
                    [{ text: '🔙 Back to Payment Methods', callback_data: 'back_to_payment_methods' }],
                    [{ text: '❌ Cancel', callback_data: 'cancel_payment' }]
                ]
            }
        };
        
        bot.editMessageText('🏦 *Select Your Bank:*', {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'Markdown',
            reply_markup: bankKeyboard.reply_markup
        });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
    
    // Handle back to payment methods
    if (data === 'back_to_payment_methods') {
        const session = userSessions[userId];
        if (session && session.package) {
            const paymentMethodKeyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📱 MOBILE MONEY', callback_data: 'payment_cat_mobile' }],
                        [{ text: '🏦 BANK TRANSFER', callback_data: 'payment_cat_bank' }],
                        [{ text: '🔙 Back to Packages', callback_data: 'back_to_packages' }],
                        [{ text: '❌ Cancel', callback_data: 'cancel_payment' }]
                    ]
                }
            };
            
            bot.editMessageText(`✅ *Package: ${session.package.name}*\n💰 *Amount: ${session.package.price}*\n\nSelect your payment method:`, {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: paymentMethodKeyboard.reply_markup
            });
        }
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
    
    // Handle provider selection (Telebirr, M-Pesa, Bank)
    if (data.startsWith('provider_')) {
        const session = userSessions[userId];
        if (!session || !session.package) {
            bot.answerCallbackQuery(callbackQuery.id);
            return;
        }
        
        const providerKey = data.replace('provider_', '');
        let accountDetails = accounts.banks[providerKey] || accounts.wallets[providerKey];
        
        if (accountDetails) {
            // Create payment record
            const payment = db.createPayment(
                userId, 
                session.package.amount, 
                accountDetails.name,
                accountDetails
            );
            
            console.log(`Payment created: #${payment.id} for ${session.package.amount} ETB`);
            
            // Update session
            userSessions[userId] = {
                step: 'awaiting_receipt',
                paymentId: payment.id,
                amount: session.package.amount,
                package: session.package,
                provider: accountDetails.name,
                accountDetails: accountDetails
            };
            
            // Build payment instructions
            let instructions = `💳 *PAYMENT INSTRUCTIONS*\n\n`;
            instructions += `━━━━━━━━━━━━━━━━━━━━━━\n`;
            instructions += `📋 *Payment Details:*\n`;
            instructions += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            instructions += `📦 *Package:* ${session.package.name}\n`;
            instructions += `💰 *Amount:* ${session.package.price}\n`;
            instructions += `🆔 *Payment ID:* #${payment.id}\n`;
            instructions += `🏦 *Provider:* ${accountDetails.name}\n\n`;
            instructions += `━━━━━━━━━━━━━━━━━━━━━━\n`;
            instructions += `📌 *Send payment to:*\n`;
            instructions += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            
            if (accountDetails.accountNumber) {
                instructions += `📱 *Account Number:* ${accountDetails.accountNumber}\n`;
            }
            if (accountDetails.accountName) {
                instructions += `👤 *Account Name:* ${accountDetails.accountName}\n`;
            }
            if (accountDetails.branch) {
                instructions += `🏛️ *Branch:* ${accountDetails.branch}\n`;
            }
            if (accountDetails.instructions) {
                instructions += `\n📝 *Instructions:*\n${accountDetails.instructions}\n`;
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
            
            bot.editMessageText(instructions, {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown'
            });
        }
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
});

// ============= MESSAGE HANDLER =============

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
    
    const session = userSessions[userId];
    
    // Handle phone number update
    if (session && session.step === 'awaiting_phone') {
        const phoneRegex = /^0[79][0-9]{8}$/;
        if (phoneRegex.test(text)) {
            db.updateUserPhone(userId, text);
            delete userSessions[userId];
            bot.sendMessage(chatId, `✅ *Phone updated!*\n\nYour phone: ${text}\n\nUse /pay to make a payment.`, {
                parse_mode: 'Markdown'
            });
        } else {
            bot.sendMessage(chatId, '❌ *Invalid phone number*\n\nPlease use format: 0912345678', {
                parse_mode: 'Markdown'
            });
        }
        return;
    }
    
    // Handle receipt upload
    if (session && session.step === 'awaiting_receipt' && msg.photo) {
        const photo = msg.photo[msg.photo.length - 1];
        const paymentId = session.paymentId;
        
        console.log(`Receipt received for payment #${paymentId}`);
        
        db.updatePaymentReceipt(paymentId, photo.file_id, msg.caption || '');
        
        // Clear session
        delete userSessions[userId];
        
        bot.sendMessage(chatId, `✅ *RECEIPT SUBMITTED!*\n\n━━━━━━━━━━━━━━━━━━━━━━\n📋 Payment #${paymentId}\n📦 ${session.package.name}\n💰 ${session.package.price}\n⏳ Status: PENDING VERIFICATION\n━━━━━━━━━━━━━━━━━━━━━━\n\nYou will be notified once verified.\n\nType /balance to check status.`, {
            parse_mode: 'Markdown'
        });
        
        // Notify admin
        const payment = db.getPayment(paymentId);
        const user = db.getUser(userId);
        
        bot.sendMessage(ADMIN_ID, `🔔 *NEW PAYMENT RECEIPT!*\n\n━━━━━━━━━━━━━━━━━━━━━━\n👤 User: ${user?.firstName || userId}\n📦 Package: ${session.package.name}\n💰 Amount: ${session.package.price}\n🆔 Payment ID: #${payment.id}\n🏦 Provider: ${session.provider}\n━━━━━━━━━━━━━━━━━━━━━━\n⚡ /approve ${payment.id} - ✅ Approve\n❌ /reject ${payment.id} [reason]`, {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    // No active session or invalid input
    if (text && !text.startsWith('/')) {
        bot.sendMessage(chatId, '❓ *I didn\'t understand that.*\n\nPlease use /pay to choose a package and make a payment.', {
            parse_mode: 'Markdown'
        });
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
    
    console.log('🤖 Ethiopia Payment Bot is running with PACKAGE system');
    console.log(`✅ Admin ID: ${ADMIN_ID}`);
    console.log(`📦 Available packages: BASIC(1000), STANDARD(2000), PREMIUM(3000), GOLD(5000)`);
});