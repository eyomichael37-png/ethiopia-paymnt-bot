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

const bot = new TelegramBot(token, { polling: true });
const app = express();

// Keep track of user states
const userStates = new Map(); // { userId: { step: 'awaiting_amount' or 'awaiting_receipt', provider: 'telebirr', accountDetails: {} } }

// ============= COMMANDS =============

// Start command - Register user
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;
  
  // Register user in database
  db.registerUser({
    id: user.id,
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name
  });
  
  const welcomeMessage = `
🎉 *Welcome to [Your Business Name] Payment Bot!*

Thank you for choosing our services.

✅ You have been successfully registered.

*Available Commands:*
/pay - Make a payment
/balance - Check your payment history
/help - Get help
/phone - Update your phone number

*How to Pay:*
1. Type /pay
2. Choose your payment method
3. Enter the amount
4. Send your payment receipt/screenshot
5. Wait for admin verification

You will be notified once your payment is confirmed.

For support: Contact @support_username
  `;
  
  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

// Pay command - Start payment process
bot.onText(/\/pay/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Clear any existing state
  userStates.delete(userId);
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📱 Mobile Money', callback_data: 'cat_mobile' }],
        [{ text: '🏦 Bank Transfer', callback_data: 'cat_bank' }]
      ]
    }
  };
  
  bot.sendMessage(chatId, 'Please select payment category:', keyboard);
});

// Balance command - Show payment history
bot.onText(/\/balance/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const payments = db.getUserPayments(userId);
  const approvedTotal = payments
    .filter(p => p.status === 'approved')
    .reduce((sum, p) => sum + parseFloat(p.amount), 0);
  
  let historyMessage = `📊 *Your Payment History*\n\n`;
  historyMessage += `💰 Total Paid: ${approvedTotal} ETB\n`;
  historyMessage += `📝 Total Transactions: ${payments.length}\n\n`;
  historyMessage += `*Recent Payments:*\n`;
  
  const recentPayments = payments.slice(0, 5);
  if (recentPayments.length === 0) {
    historyMessage += `No payments yet. Use /pay to make a payment.`;
  } else {
    recentPayments.forEach(p => {
      const statusEmoji = p.status === 'approved' ? '✅' : p.status === 'rejected' ? '❌' : '⏳';
      historyMessage += `\n${statusEmoji} #${p.id} - ${p.amount} ETB (${p.provider})\n`;
      historyMessage += `   Status: ${p.status} | ${new Date(p.submittedAt).toLocaleDateString()}\n`;
    });
  }
  
  bot.sendMessage(chatId, historyMessage, { parse_mode: 'Markdown' });
});

// Phone command - Update phone number
bot.onText(/\/phone/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  userStates.set(userId, { step: 'awaiting_phone' });
  bot.sendMessage(chatId, 'Please send your phone number (e.g., 0912345678):');
});

// Help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
❓ *Help Guide*

*Making a Payment:*
1. /pay - Start payment process
2. Choose payment method (Telebirr/M-Pesa or Bank)
3. Enter amount
4. Send screenshot of payment receipt

*Managing Your Account:*
• /phone - Update your phone number
• /balance - View payment history
• /start - Restart the bot

*Payment Methods Accepted:*
• Telebirr
• M-Pesa
• CBE Birr
• All Ethiopian Banks

*Verification Time:*
Payments are verified within 5-30 minutes during business hours.

*Need Help?*
Contact our support team at @support_username
  `;
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// ============= CALLBACK QUERIES (Button Responses) =============

bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const data = callbackQuery.data;
  
  // Handle category selection
  if (data === 'cat_mobile') {
    const mobileKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Telebirr', callback_data: 'provider_telebirr' }],
          [{ text: '📱 M-Pesa', callback_data: 'provider_mpesa' }],
          [{ text: '📱 CBE Birr', callback_data: 'provider_cbe_birr' }],
          [{ text: '🔙 Back', callback_data: 'back_to_categories' }]
        ]
      }
    };
    bot.editMessageText('Select mobile money service:', {
      chat_id: chatId,
      message_id: msg.message_id,
      reply_markup: mobileKeyboard.reply_markup
    });
  }
  else if (data === 'cat_bank') {
    const bankKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'CBE', callback_data: 'provider_commercial_bank_of_ethiopia' }],
          [{ text: 'Dashen Bank', callback_data: 'provider_dashen_bank' }],
          [{ text: 'Awash Bank', callback_data: 'provider_awash_bank' }],
          [{ text: 'Abyssinia', callback_data: 'provider_abyssinia_bank' }],
          [{ text: 'Hibret Bank', callback_data: 'provider_hibret_bank' }],
          [{ text: 'CBO', callback_data: 'provider_cooperative_bank' }],
          [{ text: '🔙 Back', callback_data: 'back_to_categories' }]
        ]
      }
    };
    bot.editMessageText('Select your bank:', {
      chat_id: chatId,
      message_id: msg.message_id,
      reply_markup: bankKeyboard.reply_markup
    });
  }
  else if (data === 'back_to_categories') {
    const categoryKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Mobile Money', callback_data: 'cat_mobile' }],
          [{ text: '🏦 Bank Transfer', callback_data: 'cat_bank' }]
        ]
      }
    };
    bot.editMessageText('Please select payment category:', {
      chat_id: chatId,
      message_id: msg.message_id,
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
💰 *Payment Details*

*Selected:* ${accountDetails.name}

Please enter the amount you want to pay (in ETB):

Example: 500 or 1,000
      `;
      bot.sendMessage(chatId, amountMessage, { parse_mode: 'Markdown' });
    }
  }
  
  bot.answerCallbackQuery(callbackQuery.id);
});

// ============= TEXT MESSAGE HANDLING =============

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  
  // Ignore commands
  if (text && text.startsWith('/')) return;
  
  const state = userStates.get(userId);
  
  // Handle phone number update
  if (state && state.step === 'awaiting_phone') {
    const phoneRegex = /^0[79][0-9]{8}$/;
    if (phoneRegex.test(text)) {
      db.updateUserPhone(userId, text);
      userStates.delete(userId);
      bot.sendMessage(chatId, '✅ Phone number updated successfully!');
    } else {
      bot.sendMessage(chatId, '❌ Invalid phone number. Please send a valid Ethiopian phone number (e.g., 0912345678)');
    }
    return;
  }
  
  // Handle amount input
  if (state && state.step === 'awaiting_amount') {
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
💳 *Payment Instructions*

*Provider:* ${state.provider}
*Amount:* ${amount} ETB
*Payment ID:* #${payment.id}

*Send payment to:*

`;
    
    if (state.accountDetails.accountNumber) {
      accountMessage += `📌 Account: ${state.accountDetails.accountNumber}\n`;
    }
    if (state.accountDetails.accountName) {
      accountMessage += `📌 Name: ${state.accountDetails.accountName}\n`;
    }
    if (state.accountDetails.branch) {
      accountMessage += `📌 Branch: ${state.accountDetails.branch}\n`;
    }
    if (state.accountDetails.instructions) {
      accountMessage += `\n*Instructions:*\n${state.accountDetails.instructions}\n`;
    }
    
    accountMessage += `\n✅ After making the payment, please send a screenshot of the transaction receipt.`;
    
    bot.sendMessage(chatId, accountMessage, { parse_mode: 'Markdown' });
    return;
  }
  
  // If no active state, ask to start payment
  if (text && !text.startsWith('/')) {
    bot.sendMessage(chatId, '❌ Please use /pay to make a payment or /help for available commands.');
  }
});

// ============= PHOTO/RECEIPT HANDLING =============

bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const photo = msg.photo[msg.photo.length - 1]; // Get highest quality
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
✅ *Receipt Received!*

Your payment receipt for #${paymentId} has been submitted.

⏳ Status: *Pending Verification*

You will be notified once the admin verifies your payment.

This usually takes 5-30 minutes.

Thank you for your patience! 🙏
    `;
    bot.sendMessage(chatId, receiptMessage, { parse_mode: 'Markdown' });
    
    // Notify admin
    const payment = db.getPayment(paymentId);
    const user = db.getUser(userId);
    
    const adminMessage = `
🔔 *NEW PAYMENT RECEIPT AWAITING VERIFICATION*

*Payment ID:* #${payment.id}
*User:* ${user.firstName} ${user.lastName || ''} (@${user.username || 'No username'})
*User ID:* ${userId}
*Amount:* ${payment.amount} ETB
*Provider:* ${payment.provider}
*Submitted:* ${new Date(payment.submittedAt).toLocaleString()}

*Receipt Caption:* ${caption || 'No caption'}

Use these admin commands:
/approve ${payment.id} - Approve payment
/reject ${payment.id} [reason] - Reject payment
/view ${payment.id} - View receipt
    `;
    
    bot.sendMessage(ADMIN_ID, adminMessage, { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(chatId, '❌ Please start a payment first using /pay before sending a receipt.');
  }
});

// Handle document receipts (if user sends as file)
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const document = msg.document;
  const caption = msg.caption || '';
  
  // Check if it's an image
  if (document.mime_type && document.mime_type.startsWith('image/')) {
    const state = userStates.get(userId);
    
    if (state && state.step === 'awaiting_receipt') {
      const paymentId = state.paymentId;
      
      db.updatePaymentReceipt(paymentId, document.file_id, caption);
      userStates.delete(userId);
      
      bot.sendMessage(chatId, `✅ Receipt for #${paymentId} submitted! Waiting for verification.`);
      
      const payment = db.getPayment(paymentId);
      const user = db.getUser(userId);
      
      bot.sendMessage(ADMIN_ID, `🔔 New receipt from @${user.username || userId}\nPayment #${payment.id}\nAmount: ${payment.amount} ETB\n/approve ${payment.id} - /reject ${payment.id}`);
    } else {
      bot.sendMessage(chatId, '❌ Please use /pay first.');
    }
  }
});

// ============= ADMIN COMMANDS =============

// Handle all admin commands
bot.onText(/^\/(approve|reject|payments|pending|view|stats)(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Only allow admin
  if (userId !== ADMIN_ID) {
    bot.sendMessage(chatId, '⛔ You are not authorized to use admin commands.');
    return;
  }
  
  const command = match[1];
  const args = match[2] ? match[2].trim() : '';
  
  await handleAdminCommand(bot, command, args, chatId, db);
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start express server for health checks
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Health check server running on port ${PORT}`);
});

console.log('🤖 Payment bot is running...');
console.log(`✅ Admin ID set to: ${ADMIN_ID}`);