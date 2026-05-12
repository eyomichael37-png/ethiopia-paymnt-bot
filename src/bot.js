const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
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

// Create bot with polling
const bot = new TelegramBot(token, { polling: true });
const app = express();

// Keep track of user states
const userStates = new Map();

// ============= SETUP BOT COMMANDS MENU =============
// This makes commands appear when user types "/" in Telegram

const botCommands = [
    { command: 'start', description: '🔄 Start the bot and register' },
    { command: 'pay', description: '💳 Make a payment' },
    { command: 'balance', description: '💰 Check your payment history' },
    { command: 'phone', description: '📱 Update your phone number' },
    { command: 'help', description: '❓ Get help and instructions' },
    { command: 'cancel', description: '❌ Cancel current operation' }
];

// Set commands menu
bot.setMyCommands(botCommands)
    .then(() => console.log('✅ Bot commands menu set'))
    .catch(err => console.error('Error setting commands:', err));

// ============= COMMAND HANDLERS =============

// Start command - Register user and show welcome
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    
    // Register user in database
    db.registerUser({
        id: user.id,
        username: user.username || '',
        first_name: user.first_name || '',
        last_name: user.last_name || ''
    });
    
    // Clear any existing state
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

📱 *Mobile Money:*
• Telebirr
• M-Pesa Ethiopia  
• CBE Birr

🏦 *Bank Transfer:*
• Commercial Bank of Ethiopia (CBE)
• Dashen Bank
• Awash Bank
• Abyssinia Bank
• Hibret Bank
• Cooperative Bank of Oromia

━━━━━━━━━━━━━━━━━━━━━━
⏱️ *Verification Time:* 5-30 minutes

*Need help?* Type /help or contact @support

*Let's get started! Type /pay now* 💰
    `;
    
    bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
            keyboard: [
                ['💳 Make Payment', '💰 My Balance'],
                ['📞 Update Phone', '❓ Help']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    });
    
    // Notify admin of new user
    const userInfo = `👤 *New User Registered!*\nName: ${user.first_name} ${user.last_name || ''}\nUsername: @${user.username || 'N/A'}\nID: ${user.id}`;
    bot.sendMessage(ADMIN_ID, userInfo, { parse_mode: 'Markdown' });
});

// Pay command - Start payment process
bot.onText(/\/pay|💳 Make Payment/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Clear any existing state
    userStates.delete(userId);
    
    const categoryMessage = `
💰 *PAYMENT OPTIONS*

Please select your preferred payment method:
    `;
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📱 MOBILE MONEY', callback_data: 'cat_mobile' }],
                [{ text: '🏦 BANK TRANSFER', callback_data: 'cat_bank' }],
                [{ text: '❌ Cancel', callback_data: 'cancel_payment' }]
            ]
        }
    };
    
    bot.sendMessage(chatId, categoryMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
    });
});

// Balance command - Show payment history
bot.onText(/\/balance|💰 My Balance/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const payments = db.getUserPayments(userId);
    const approvedTotal = payments
        .filter(p => p.status === 'approved')
        .reduce((sum, p) => sum + parseFloat(p.amount), 0);
    
    const pendingTotal = payments
        .filter(p => p.status === 'waiting_verification')
        .reduce((sum, p) => sum + parseFloat(p.amount), 0);
    
    let historyMessage = `
📊 *YOUR PAYMENT HISTORY*

━━━━━━━━━━━━━━━━━━━━━━
💰 *Total Paid:* ${approvedTotal.toLocaleString()} ETB
⏳ *Pending:* ${pendingTotal.toLocaleString()} ETB
📝 *Transactions:* ${payments.length}
━━━━━━━━━━━━━━━━━━━━━━

*Recent Transactions:*\n`;
    
    const recentPayments = payments.slice(0, 10);
    if (recentPayments.length === 0) {
        historyMessage += `\n📭 No payments yet.\n\nUse /pay to make your first payment! 💰`;
    } else {
        recentPayments.forEach(p => {
            const statusEmoji = p.status === 'approved' ? '✅' : p.status === 'rejected' ? '❌' : '⏳';
            const statusText = p.status === 'approved' ? 'Approved' : p.status === 'rejected' ? 'Rejected' : 'Pending';
            historyMessage += `\n${statusEmoji} *#${p.id}* - ${p.amount} ETB\n   📅 ${new Date(p.submittedAt).toLocaleDateString()}\n   📍 ${p.provider}\n   📌 ${statusText}\n`;
        });
    }
    
    bot.sendMessage(chatId, historyMessage, { parse_mode: 'Markdown' });
});

// Phone command - Update phone number
bot.onText(/\/phone|📞 Update Phone/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    userStates.set(userId, { step: 'awaiting_phone' });
    bot.sendMessage(chatId, '📱 *Please send your phone number*\n\nFormat: 0912345678\n\n_Example: 0911223344_', {
        parse_mode: 'Markdown',
        reply_markup: {
            keyboard: [['❌ Cancel']],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    });
});

// Cancel command - Cancel current operation
bot.onText(/\/cancel|❌ Cancel/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    userStates.delete(userId);
    bot.sendMessage(chatId, '❌ *Operation cancelled*\n\nType /pay to start a new payment.', {
        parse_mode: 'Markdown',
        reply_markup: {
            keyboard: [
                ['💳 Make Payment', '💰 My Balance'],
                ['📞 Update Phone', '❓ Help']
            ],
            resize_keyboard: true
        }
    });
});

// Help command - Show help information
bot.onText(/\/help|❓ Help/, (msg) => {
    const chatId = msg.chat.id;
    
    const helpMessage = `
❓ *HOW TO USE ETHIOPAY BOT*

━━━━━━━━━━━━━━━━━━━━━━
📌 *MAKING A PAYMENT*
━━━━━━━━━━━━━━━━━━━━━━

1️⃣ Type */pay* or tap "Make Payment"
2️⃣ Choose payment method (Mobile Money or Bank)
3️⃣ Select your provider (Telebirr, M-Pesa, CBE, etc.)
4️⃣ Enter the amount
5️⃣ Send payment to provided account
6️⃣ Send screenshot of receipt
7️⃣ Wait for verification (5-30 min)

━━━━━━━━━━━━━━━━━━━━━━
📌 *ACCOUNT MANAGEMENT*
━━━━━━━━━━━━━━━━━━━━━━

• */balance* - Check payment history
• */phone* - Add/update phone number
• */start* - Restart the bot

━━━━━━━━━━━━━━━━━━━━━━
📌 *PAYMENT METHODS*
━━━━━━━━━━━━━━━━━━━━━━

*Mobile Money:*
✅ Telebirr
✅ M-Pesa
✅ CBE Birr

*Banks:*
✅ CBE
✅ Dashen Bank
✅ Awash Bank
✅ Abyssinia Bank
✅ Hibret Bank
✅ Cooperative Bank of Oromia

━━━━━━━━━━━━━━━━━━━━━━
⏱️ *VERIFICATION TIME*
━━━━━━━━━━━━━━━━━━━━━━

• Business Hours: 5-15 minutes
• After Hours: Next business day

━━━━━━━━━━━━━━━━━━━━━━
📞 *CONTACT SUPPORT*
━━━━━━━━━━━━━━━━━━━━━━

For assistance, contact:
📧 Email: support@ethiopay.com
📱 Telegram: @support

*Type /pay to get started!* 💰
    `;
    
    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// ============= CALLBACK QUERIES =============

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const data = callbackQuery.data;
    
    // Handle cancel
    if (data === 'cancel_payment') {
        userStates.delete(userId);
        bot.editMessageText('❌ Payment cancelled.', {
            chat_id: chatId,
            message_id: msg.message_id
        });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
    
    // Handle category selection
    if (data === 'cat_mobile') {
        const mobileKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 Telebirr', callback_data: 'provider_telebirr' }],
                    [{ text: '📱 M-Pesa', callback_data: 'provider_mpesa' }],
                    [{ text: '📱 CBE Birr', callback_data: 'provider_cbe_birr' }],
                    [{ text: '🔙 Back', callback_data: 'back_to_categories' }],
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
    }
    else if (data === 'cat_bank') {
        const bankKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🏦 CBE', callback_data: 'provider_commercial_bank_of_ethiopia' }],
                    [{ text: '🏦 Dashen Bank', callback_data: 'provider_dashen_bank' }],
                    [{ text: '🏦 Awash Bank', callback_data: 'provider_awash_bank' }],
                    [{ text: '🏦 Abyssinia Bank', callback_data: 'provider_abyssinia_bank' }],
                    [{ text: '🏦 Hibret Bank', callback_data: 'provider_hibret_bank' }],
                    [{ text: '🏦 CBO', callback_data: 'provider_cooperative_bank' }],
                    [{ text: '🔙 Back', callback_data: 'back_to_categories' }],
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
    }
    else if (data === 'back_to_categories') {
        const categoryKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 MOBILE MONEY', callback_data: 'cat_mobile' }],
                    [{ text: '🏦 BANK TRANSFER', callback_data: 'cat_bank' }],
                    [{ text: '❌ Cancel', callback_data: 'cancel_payment' }]
                ]
            }
        };
        bot.editMessageText('💰 *Select Payment Method:*', {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'Markdown',
            reply_markup: categoryKeyboard.reply_markup
        });
    }
    else if (data.startsWith('provider_')) {
        const providerKey = data.replace('provider_', '');
        let accountDetails = null;
        
        // Check if it's a bank or wallet
        if (accounts.banks[providerKey]) {
            accountDetails = accounts.banks[providerKey];
        } else if (accounts.wallets[providerKey]) {
            accountDetails = accounts.wallets[providerKey];
        }
        
        if (accountDetails) {
            // Store provider in user state
            userStates.set(userId, { 
                step: 'awaiting_amount', 
                provider: accountDetails.name,
                providerKey: providerKey,
                accountDetails: accountDetails
            });
            
            const amountMessage = `
💰 *PAYMENT DETAILS*

📌 *Selected:* ${accountDetails.name}

💵 *Amount:* Enter amount in ETB

Example: 500 or 1,000

*Please enter the amount you want to pay:*
            `;
            bot.editMessageText(amountMessage, {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown'
            });
            
            // Show numeric keyboard for amount
            bot.sendMessage(chatId, '💵 *Enter amount:*', {
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [
                        ['100', '200', '500'],
                        ['1000', '2000', '5000'],
                        ['❌ Cancel']
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
        }
    }
    
    bot.answerCallbackQuery(callbackQuery.id);
});

// ============= TEXT MESSAGE HANDLING =============

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    // Ignore commands and button texts that are handled elsewhere
    if (!text || text.startsWith('/')) return;
    if (text === '💳 Make Payment' || text === '💰 My Balance' || text === '📞 Update Phone' || text === '❓ Help') return;
    
    const state = userStates.get(userId);
    
    // Handle phone number update
    if (state && state.step === 'awaiting_phone') {
        if (text === '❌ Cancel') {
            userStates.delete(userId);
            bot.sendMessage(chatId, '❌ Operation cancelled.', {
                reply_markup: {
                    keyboard: [
                        ['💳 Make Payment', '💰 My Balance'],
                        ['📞 Update Phone', '❓ Help']
                    ],
                    resize_keyboard: true
                }
            });
            return;
        }
        
        const phoneRegex = /^0[79][0-9]{8}$/;
        if (phoneRegex.test(text)) {
            db.updateUserPhone(userId, text);
            userStates.delete(userId);
            bot.sendMessage(chatId, `✅ *Phone number updated!*\n\nYour phone: ${text}\n\nUse /pay to make a payment.`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [
                        ['💳 Make Payment', '💰 My Balance'],
                        ['📞 Update Phone', '❓ Help']
                    ],
                    resize_keyboard: true
                }
            });
        } else {
            bot.sendMessage(chatId, '❌ *Invalid phone number*\n\nPlease send a valid Ethiopian phone number:\nFormat: 0912345678\n\nExample: 0911223344', {
                parse_mode: 'Markdown'
            });
        }
        return;
    }
    
    // Handle amount input
    if (state && state.step === 'awaiting_amount') {
        if (text === '❌ Cancel') {
            userStates.delete(userId);
            bot.sendMessage(chatId, '❌ Payment cancelled.', {
                reply_markup: {
                    keyboard: [
                        ['💳 Make Payment', '💰 My Balance'],
                        ['📞 Update Phone', '❓ Help']
                    ],
                    resize_keyboard: true
                }
            });
            return;
        }
        
        const amount = parseFloat(text.replace(/,/g, ''));
        
        if (isNaN(amount) || amount <= 0) {
            bot.sendMessage(chatId, '❌ Please enter a valid amount (positive number).');
            return;
        }
        
        if (amount < 10) {
            bot.sendMessage(chatId, '❌ Minimum payment amount is 10 ETB.');
            return;
        }
        
        // Create payment record
        const payment = db.createPayment(userId, amount, state.provider, state.accountDetails);
        
        // Store payment ID in user state
        userStates.set(userId, { 
            step: 'awaiting_receipt', 
            paymentId: payment.id,
            provider: state.provider,
            accountDetails: state.accountDetails,
            amount: amount
        });
        
        // Show account details
        let accountMessage = `
💳 *PAYMENT INSTRUCTIONS*

━━━━━━━━━━━━━━━━━━━━━━
📋 *Payment Details:*
━━━━━━━━━━━━━━━━━━━━━━

💰 *Amount:* ${amount.toLocaleString()} ETB
🏦 *Provider:* ${state.provider}
🆔 *Payment ID:* #${payment.id}

━━━━━━━━━━━━━━━━━━━━━━
📌 *Send payment to:*
━━━━━━━━━━━━━━━━━━━━━━

`;

        if (state.accountDetails.accountNumber) {
            accountMessage += `📌 *Account:* ${state.accountDetails.accountNumber}\n`;
        }
        if (state.accountDetails.accountName) {
            accountMessage += `📌 *Name:* ${state.accountDetails.accountName}\n`;
        }
        if (state.accountDetails.branch) {
            accountMessage += `📌 *Branch:* ${state.accountDetails.branch}\n`;
        }
        
        accountMessage += `
━━━━━━━━━━━━━━━━━━━━━━
✅ *Next Step:*
━━━━━━━━━━━━━━━━━━━━━━

After sending the payment:
1️⃣ Take a screenshot of the receipt
2️⃣ Send the screenshot here
3️⃣ Wait for verification (5-30 min)

⚠️ *Do not forget to send the receipt!*

*Send your receipt screenshot now:* 📸
        `;
        
        bot.sendMessage(chatId, accountMessage, { parse_mode: 'Markdown' });
        return;
    }
    
    // If no active state, show error with suggested actions
    if (text && !text.startsWith('/')) {
        bot.sendMessage(chatId, '❓ *I didn\'t understand that.*\n\nPlease use one of these commands:\n\n/pay - Make a payment\n/balance - Check balance\n/phone - Update phone\n/help - Get help', {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    ['💳 Make Payment', '💰 My Balance'],
                    ['📞 Update Phone', '❓ Help']
                ],
                resize_keyboard: true
            }
        });
    }
});

// ============= PHOTO/RECEIPT HANDLING =============

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const photo = msg.photo[msg.photo.length - 1];
    const caption = msg.caption || '';
    
    const state = userStates.get(userId);
    
    if (state && state.step === 'awaiting_receipt') {
        const paymentId = state.paymentId;
        
        // Update payment with receipt
        db.updatePaymentReceipt(paymentId, photo.file_id, caption);
        
        // Clear user state
        userStates.delete(userId);
        
        // Notify user
        const receiptMessage = `
✅ *RECEIPT RECEIVED!*

━━━━━━━━━━━━━━━━━━━━━━
📋 *Payment Information:*
━━━━━━━━━━━━━━━━━━━━━━

🆔 *Payment ID:* #${paymentId}
💰 *Amount:* ${state.amount} ETB
🏦 *Provider:* ${state.provider}
⏱️ *Submitted:* ${new Date().toLocaleTimeString()}

━━━━━━━━━━━━━━━━━━━━━━
⏳ *Status:* PENDING VERIFICATION
━━━━━━━━━━━━━━━━━━━━━━

You will be notified once the admin verifies your payment.

⏱️ *Estimated time:* 5-30 minutes

*Thank you for your patience!* 🙏

Type /balance to check status anytime.
        `;
        
        bot.sendMessage(chatId, receiptMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    ['💳 Make Payment', '💰 My Balance'],
                    ['📞 Update Phone', '❓ Help']
                ],
                resize_keyboard: true
            }
        });
        
        // Notify admin
        const payment = db.getPayment(paymentId);
        const user = db.getUser(userId);
        
        const adminMessage = `
🔔 *NEW PAYMENT RECEIPT!*

━━━━━━━━━━━━━━━━━━━━━━
👤 *User Information:*
━━━━━━━━━━━━━━━━━━━━━━

Name: ${user.firstName} ${user.lastName || ''}
Username: @${user.username || 'N/A'}
User ID: ${userId}
Phone: ${user.phone || 'Not provided'}

━━━━━━━━━━━━━━━━━━━━━━
💳 *Payment Details:*
━━━━━━━━━━━━━━━━━━━━━━

Payment ID: #${payment.id}
Amount: ${payment.amount} ETB
Provider: ${payment.provider}
Time: ${new Date(payment.submittedAt).toLocaleString()}

Receipt Caption: ${caption || 'No caption'}

━━━━━━━━━━━━━━━━━━━━━━
⚡ *Quick Actions:*
━━━━━━━━━━━━━━━━━━━━━━

/approve ${payment.id} - ✅ Approve payment
/reject ${payment.id} [reason] - ❌ Reject payment
/view ${payment.id} - 👁️ View receipt
        `;
        
        bot.sendMessage(ADMIN_ID, adminMessage, { parse_mode: 'Markdown' });
        
    } else {
        bot.sendMessage(chatId, '❌ *Please start a payment first!*\n\nType /pay to make a payment before sending a receipt.', {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    ['💳 Make Payment', '💰 My Balance'],
                    ['📞 Update Phone', '❓ Help']
                ],
                resize_keyboard: true
            }
        });
    }
});

// ============= ADMIN COMMANDS =============

// Handle all admin commands
bot.onText(/^\/(approve|reject|payments|pending|view|stats)(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Only allow admin
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

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Start express server for health checks
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Health check server running on port ${PORT}`);
});

console.log('🤖 Ethiopia Payment Bot is running...');
console.log(`✅ Admin ID set to: ${ADMIN_ID}`);
console.log(`✅ Bot commands menu configured`);
console.log(`✅ Polling mode active`);